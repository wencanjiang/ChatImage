"use strict";

const assert = require("assert");
const { Readable } = require("stream");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { createStore, ensureHotspotThreadsSchema } = require("../server/store");
const { createConcurrencyGate } = require("../server/concurrency");
const {
  assertSameOriginRequest,
  getStaticCacheControl,
  loadEnvFile,
  readJson,
  requireApiKey,
  sendJson,
  serveStatic
} = require("../server/http");
const {
  extractImageDimensions,
  extractImageUrl,
  extractTaskId,
  extractTextContent,
  formatApiError,
  isApiErrorPayload,
  parseImageBufferDimensions,
  parseImageSize
} = require("../server/providers");

async function main() {
  await testHttpHelpers();
  await testConcurrencyGate();
  testProviderHelpers();
  testHotspotThreadSchemaRepair();
  testStoreModule();
  console.log("server-modules.test.js passed");
}

async function testConcurrencyGate() {
  const gate = createConcurrencyGate(1, "Test upstream");
  let release;
  const first = gate.run(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  assert.strictEqual(gate.getActiveCount(), 1);
  await assert.rejects(() => gate.run(async () => "second"), /Test upstream concurrency limit reached/);
  release("first");
  assert.strictEqual(await first, "first");
  assert.strictEqual(gate.getActiveCount(), 0);
  assert.strictEqual(await gate.run(async () => "third"), "third");
}

async function testHttpHelpers() {
  const req = Readable.from([JSON.stringify({ ok: true })]);
  req.headers = {};
  const parsed = await readJson(req);
  assert.deepStrictEqual(parsed, { ok: true });

  await assert.rejects(async () => {
    const invalid = Readable.from(["{bad"]);
    invalid.headers = {};
    await readJson(invalid);
  }, SyntaxError);

  assert.throws(() => requireApiKey({ apiKey: "" }), /CHATIMAGE_API_KEY/);
  assert.doesNotThrow(() => requireApiKey({ apiKey: "key" }));

  const jsonResponse = createMockResponse();
  sendJson(jsonResponse, 201, { ok: true });
  assert.strictEqual(jsonResponse.status, 201);
  assert.strictEqual(jsonResponse.headers["Content-Type"], "application/json; charset=utf-8");
  assert.strictEqual(jsonResponse.body, '{"ok":true}');

  const forbidden = createMockResponse();
  serveStatic("/%2e%2e%2fserver.js", forbidden, process.cwd());
  assert.strictEqual(forbidden.status, 403);

  const missing = createMockResponse();
  serveStatic("/missing.file", missing, process.cwd());
  assert.strictEqual(missing.status, 404);

  const envKey = "CHATIMAGE_TEST_ENV_HELPER";
  const oldValue = process.env[envKey];
  delete process.env[envKey];
  loadEnvFile("tests/fixtures/missing.env");
  assert.strictEqual(process.env[envKey], undefined);
  const envDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-env-"));
  const envFile = path.join(envDir, ".env");
  const localEnvFile = path.join(envDir, ".env.local");
  fs.writeFileSync(envFile, `${envKey}=from_env\n`);
  fs.writeFileSync(localEnvFile, `${envKey}=from_local\n`);
  loadEnvFile(envFile);
  loadEnvFile(localEnvFile, { overwrite: true });
  assert.strictEqual(process.env[envKey], "from_local");
  process.env[envKey] = "from_shell";
  loadEnvFile(localEnvFile, { overwrite: true, preserveKeys: new Set([envKey]) });
  assert.strictEqual(process.env[envKey], "from_shell");
  assert.strictEqual(getStaticCacheControl(".html"), "no-cache");
  assert.strictEqual(getStaticCacheControl(".css"), "no-cache");
  assert.match(getStaticCacheControl(".png"), /max-age/);
  assert.doesNotThrow(() => assertSameOriginRequest({ method: "POST", url: "/api/llm", headers: { host: "127.0.0.1:5178", origin: "http://127.0.0.1:5178" } }));
  assert.doesNotThrow(() => assertSameOriginRequest({ method: "POST", url: "/api/llm", headers: { host: "127.0.0.1:5178" } }));
  assert.throws(
    () => assertSameOriginRequest({ method: "POST", url: "/api/llm", headers: { host: "127.0.0.1:5178", origin: "https://evil.example" } }),
    /Cross-origin/
  );
  if (oldValue === undefined) {
    delete process.env[envKey];
  } else {
    process.env[envKey] = oldValue;
  }
}

function testProviderHelpers() {
  assert.strictEqual(extractTextContent({ data: { choices: [{ message: { content: "nested" } }] } }), "nested");
  assert.strictEqual(extractTextContent([{ text: "" }, { content: "array content" }]), "array content");
  assert.strictEqual(extractTaskId({ result: { task_id: "task_1" } }), "task_1");
  assert.strictEqual(extractImageUrl({ data: { url: "https://cdn.example.com/image.png" } }), "https://cdn.example.com/image.png");
  assert.strictEqual(extractImageUrl("https://example.com/page"), "");
  assert.deepStrictEqual(parseImageSize("1024x768"), { width: 1024, height: 768 });
  assert.deepStrictEqual(parseImageSize("1024 X 768"), { width: 1024, height: 768 });
  assert.deepStrictEqual(parseImageSize("1024 × 768"), { width: 1024, height: 768 });
  assert.deepStrictEqual(parseImageSize("bad-size"), { width: 1600, height: 900 });
  assert.deepStrictEqual(extractImageDimensions({ data: { width: 1200, height: 800 } }, "1600x900"), {
    width: 1200,
    height: 800
  });
  assert.deepStrictEqual(extractImageDimensions({ result: { image_width: "900", image_height: "1200" } }, "1600x900"), {
    width: 900,
    height: 1200
  });
  assert.deepStrictEqual(extractImageDimensions({ data: { width: 0.3, height: 0.4 } }, "800x600"), {
    width: 800,
    height: 600
  });
  assert.deepStrictEqual(parseImageBufferDimensions(createPngHeader(1358, 1159)), {
    width: 1358,
    height: 1159
  });
  assert.strictEqual(isApiErrorPayload({ code: 500 }), true);
  assert.strictEqual(isApiErrorPayload({ code: 0 }), false);
  assert.strictEqual(formatApiError({ msg: "bad" }), "bad");
}

function createPngHeader(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, 4, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function testHotspotThreadSchemaRepair() {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      pragma foreign_keys = off;
      create table chat_images (id text primary key);
      create table hotspots (
        storage_id text primary key,
        id text not null,
        chat_image_id text not null references chat_images(id) on delete cascade,
        label text not null,
        short_text text not null,
        detail text not null,
        source_excerpt text not null,
        icon_hint text not null,
        bounds_json text not null,
        unique (chat_image_id, id)
      );
      create table hotspot_threads (
        id text primary key,
        chat_image_id text not null references chat_images(id) on delete cascade,
        hotspot_id text not null references "hotspots_legacy"(id) on delete cascade,
        created_at text not null,
        updated_at text not null,
        unique (chat_image_id, hotspot_id)
      );
      create table hotspot_messages (
        id text primary key,
        thread_id text not null references hotspot_threads(id) on delete cascade,
        role text not null,
        content text not null,
        created_at text not null
      );
      insert into hotspot_threads (id, chat_image_id, hotspot_id, created_at, updated_at)
      values ('thread_migrate', 'ci_migrate', 'module_1', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');
      insert into hotspot_messages (id, thread_id, role, content, created_at)
      values ('msg_migrate', 'thread_migrate', 'user', 'hello', '2026-06-01T00:00:01.000Z');
      pragma foreign_keys = on;
    `);
    ensureHotspotThreadsSchema(db);
    const threadSql = db
      .prepare("select sql from sqlite_master where type = 'table' and name = 'hotspot_threads'")
      .get().sql;
    assert.doesNotMatch(threadSql, /hotspots_legacy/);
    assert.doesNotMatch(threadSql, /hotspot_id\s+text\s+not\s+null\s+references/i);
    assert.strictEqual(db.prepare("select hotspot_id from hotspot_threads").get().hotspot_id, "module_1");
    assert.strictEqual(db.prepare("select content from hotspot_messages").get().content, "hello");
  } finally {
    db.close();
  }
}

function testStoreModule() {
  const store = createStore(":memory:");
  try {
    const result = {
      id: "ci_store",
      question: "问题",
      rawAnswer: "回答",
      title: "标题",
      summary: "摘要",
      structuredSpec: {
        title: "标题",
        summary: "摘要",
        relationType: "grid",
        modules: [{ id: "module_1", title: "模块一", imageText: "短文本" }]
      },
      layout: { family: "grid" },
      imageUrl: "data:image/svg+xml,test",
      imageWidth: 1600,
      imageHeight: 900,
      imagePrompt: "Prompt",
      providerRaw: { provider: "test" },
      alignmentRaw: { provider: "align-test" },
      hotspots: [
        {
          id: "module_1",
          label: "模块一",
          shortText: "短文本",
          detail: "详情",
          sourceExcerpt: "片段",
          iconHint: "idea",
          textBudget: createTextBudget(),
          x: 0.1,
          y: 0.2,
          width: 0.3,
          height: 0.4
        }
      ]
    };
    store.saveChatImage(result);
    assert.strictEqual(store.listChatImages()[0].id, "ci_store");
    assert.strictEqual(store.listChatImages()[0].pinnedAt, null);
    const loaded = store.getChatImage("ci_store").result;
    assert.strictEqual(loaded.structuredSpec.modules[0].title, "模块一");
    assert.strictEqual(loaded.alignmentRaw.provider, "align-test");
    assert.strictEqual(loaded.imagePrompt, "Prompt");
    assert.strictEqual(loaded.hotspots[0].width, 0.3);
    assert.deepStrictEqual(loaded.hotspots[0].textBudget, createTextBudget());
    assert.strictEqual(store.getChatImage("missing").result, null);

    const thread = {
      id: "thread_store",
      chatImageId: "ci_store",
      hotspotId: "module_1",
      messages: [{ id: "msg_store", role: "user", content: "追问", createdAt: "2026-05-31T00:00:00.000Z" }],
      createdAt: "2026-05-31T00:00:00.000Z",
      updatedAt: "2026-05-31T00:00:00.000Z"
    };
    const saved = store.saveThread("ci_store", "module_1", thread);
    assert.strictEqual(saved.thread.messages[0].content, "追问");
    assert.strictEqual(store.getChatImage("ci_store").result.threads[0].messages[0].content, "追问");
    assert.throws(
      () =>
        store.saveThread("ci_store", "module_1", {
          ...thread,
          messages: [
            { id: "msg_duplicate", role: "user", content: "bad 1", createdAt: "2026-05-31T00:00:01.000Z" },
            { id: "msg_duplicate", role: "assistant", content: "bad 2", createdAt: "2026-05-31T00:00:02.000Z" }
          ]
        }),
      /constraint|unique/i
    );
    assert.strictEqual(store.getThread("ci_store", "module_1").thread.messages[0].id, "msg_store");
    const replacementThread = {
      id: "thread_store_replacement",
      chatImageId: "ci_store",
      hotspotId: "module_1",
      messages: [
        { id: "msg_store_replacement", role: "user", content: "替换追问", createdAt: "2026-05-31T00:00:02.000Z" }
      ],
      createdAt: "2026-05-31T00:00:02.000Z",
      updatedAt: "2026-05-31T00:00:02.000Z"
    };
    store.saveThread("ci_store", "module_1", replacementThread);
    const replaced = store.getChatImage("ci_store").result.threads;
    assert.strictEqual(replaced.length, 1);
    assert.strictEqual(replaced[0].id, "thread_store_replacement");
    assert.deepStrictEqual(
      replaced[0].messages.map((message) => message.content),
      ["替换追问"]
    );
    store.saveChatImage({
      ...result,
      hotspots: [
        {
          id: "module_2",
          label: "模块二",
          shortText: "新短文本",
          detail: "新详情",
          sourceExcerpt: "新片段",
          iconHint: "step",
          x: 0.5,
          y: 0.2,
          width: 0.3,
          height: 0.4
        }
      ]
    });
    const afterHotspotReplacement = store.getChatImage("ci_store").result;
    assert.deepStrictEqual(
      afterHotspotReplacement.hotspots.map((hotspot) => hotspot.id),
      ["module_2"]
    );
    assert.deepStrictEqual(afterHotspotReplacement.threads, []);
    assert.strictEqual(store.getThread("ci_store", "module_1").thread, null);
    const renamed = store.updateChatImageMeta("ci_store", { title: "新标题", pinned: true }).item;
    assert.strictEqual(renamed.title, "新标题");
    assert.ok(renamed.pinnedAt);
    assert.strictEqual(store.listChatImages()[0].id, "ci_store");
    assert.strictEqual(store.deleteChatImage("ci_store").deleted, true);
    assert.strictEqual(store.getChatImage("ci_store").result, null);
    assert.strictEqual(store.deleteChatImage("ci_store").deleted, false);
    assert.throws(() => store.saveThread("ci_store", "missing", thread), /hotspot does not belong/);
  } finally {
    store.close();
  }
}

function createTextBudget() {
  return {
    titleLineChars: 6,
    titleMaxLines: 1,
    titleMaxChars: 6,
    imageTextLineChars: 8,
    imageTextMaxLines: 1,
    imageTextMaxChars: 8
  };
}

function createMockResponse() {
  return {
    body: "",
    headers: null,
    status: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    }
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
