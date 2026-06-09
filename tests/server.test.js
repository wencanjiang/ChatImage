"use strict";

const assert = require("assert");
const {
  createStore,
  createServer,
  extractImageUrl,
  extractTaskId,
  extractTextContent
} = require("../server");

async function main() {
  const server = createServer({
    port: 0,
    apiKey: "",
    textModel: "gpt-5.5",
    imageModel: "GPT-Image-2",
    textEndpoint: "https://api.wuyinkeji.com/api/chat/index",
    imageEndpoint: "https://api.wuyinkeji.com/api/async/image_gpt",
    imageDetailEndpoint: "https://api.wuyinkeji.com/api/async/detail"
  });

  await listen(server);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const config = await getJson(`${baseUrl}/api/config`);
    assert.strictEqual(config.realApiAvailable, false);
    assert.strictEqual(config.imageApiAvailable, false);
    assert.strictEqual(config.textApiAvailable, false);
    assert.strictEqual(config.visionApiAvailable, false);
    assert.strictEqual(config.textModel, "gpt-5.5");
    assert.strictEqual(config.imageModel, "GPT-Image-2");
    assert.strictEqual(config.textRequestFormat, "");

    const index = await fetch(`${baseUrl}/`);
    assert.strictEqual(index.status, 200);
    const html = await index.text();
    assert.match(html, /src\/app\.js/);
    assert.match(html, /styles\.css/);

    const css = await fetch(`${baseUrl}/styles.css`);
    assert.strictEqual(css.headers.get("content-type"), "text/css; charset=utf-8");

    const missingKey = await fetch(`${baseUrl}/api/llm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "test" })
    });
    assert.strictEqual(missingKey.status, 503);
    const missingKeyJson = await missingKey.json();
    assert.match(missingKeyJson.error, /CHATIMAGE_TEXT_API_KEY|CHATIMAGE_API_KEY/);

    assert.strictEqual(extractTextContent({ data: { content: "hello" } }), "hello");
    assert.strictEqual(extractTextContent({ data: { choices: [{ message: { content: "nested" } }] } }), "nested");
    assert.strictEqual(extractTextContent({ choices: [{ message: { content: "choice" } }] }), "choice");
    assert.strictEqual(extractTaskId({ data: { task_id: "task_123" } }), "task_123");
    assert.strictEqual(extractImageUrl({ data: { imageUrl: "https://cdn.example.com/a.png" } }), "https://cdn.example.com/a.png");
  } finally {
    await close(server);
  }

  await testPersistence();
  console.log("server.test.js passed");
}

async function testPersistence() {
  const store = createStore(":memory:");
  const server = createServer({
    port: 0,
    apiKey: "",
    textModel: "gpt-5.5",
    imageModel: "GPT-Image-2",
    store
  });
  await listen(server);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const result = {
      id: "ci_test",
      question: "测试问题",
      rawAnswer: "原始回答",
      title: "测试标题",
      summary: "测试摘要",
      structuredSpec: {
        title: "测试标题",
        summary: "测试摘要",
        relationType: "grid",
        modules: [{ id: "module_1", title: "模块一", imageText: "短文本" }]
      },
      layout: {
        family: "grid",
        regions: [
          {
            id: "region_1",
            hotspotId: "module_1",
            role: "module",
            bounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
          }
        ]
      },
      hotspots: [
        {
          id: "module_1",
          label: "模块一",
          shortText: "短文本",
          detail: "详情",
          sourceExcerpt: "",
          iconHint: "idea",
          textBudget: createTextBudget(),
          x: 0.1,
          y: 0.2,
          width: 0.3,
          height: 0.4
        }
      ],
      imageUrl: "data:image/svg+xml,test",
      imageWidth: 1600,
      imageHeight: 900,
      providerRaw: null,
      alignmentRaw: { provider: "align-test" },
      imagePrompt: "测试生图提示词",
      createdAt: "2026-05-30T00:00:00.000Z"
    };
    const saveResponse = await fetch(`${baseUrl}/api/chatimages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result)
    });
    assert.strictEqual(saveResponse.status, 200);
    const secondSaveResponse = await fetch(`${baseUrl}/api/chatimages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...result,
        id: "ci_test_2",
        question: "第二个测试问题",
        title: "第二个测试标题"
      })
    });
    assert.strictEqual(secondSaveResponse.status, 200);
    const history = await getJson(`${baseUrl}/api/chatimages`);
    assert.strictEqual(history.items.length, 2);
    assert.strictEqual(history.items[0].pinnedAt, null);
    const loaded = await getJson(`${baseUrl}/api/chatimages/ci_test`);
    assert.strictEqual(loaded.result.id, "ci_test");
    assert.strictEqual(loaded.result.rawAnswer, "原始回答");
    assert.strictEqual(loaded.result.structuredSpec.modules[0].title, "模块一");
    assert.strictEqual(loaded.result.alignmentRaw.provider, "align-test");
    assert.strictEqual(loaded.result.hotspots[0].x, 0.1);
    assert.deepStrictEqual(loaded.result.hotspots[0].textBudget, createTextBudget());
    assert.strictEqual(loaded.result.imagePrompt, "测试生图提示词");

    const thread = {
      id: "thread_1",
      chatImageId: "ci_test",
      hotspotId: "module_1",
      messages: [{ id: "msg_1", role: "user", content: "追问", createdAt: "2026-05-30T00:00:01.000Z" }],
      createdAt: "2026-05-30T00:00:01.000Z",
      updatedAt: "2026-05-30T00:00:01.000Z"
    };
    const threadResponse = await fetch(`${baseUrl}/api/chatimages/ci_test/hotspots/module_1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread })
    });
    assert.strictEqual(threadResponse.status, 200);
    const savedThread = await getJson(`${baseUrl}/api/chatimages/ci_test/hotspots/module_1/thread`);
    assert.strictEqual(savedThread.thread.messages[0].content, "追问");
    const loadedWithThread = await getJson(`${baseUrl}/api/chatimages/ci_test`);
    assert.strictEqual(loadedWithThread.result.threads[0].messages[0].content, "追问");

    const renameResponse = await fetch(`${baseUrl}/api/chatimages/ci_test`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "重命名标题" })
    });
    assert.strictEqual(renameResponse.status, 200);
    const renamed = await renameResponse.json();
    assert.strictEqual(renamed.item.title, "重命名标题");

    await new Promise((resolve) => setTimeout(resolve, 10));
    const pinResponse = await fetch(`${baseUrl}/api/chatimages/ci_test`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: true })
    });
    assert.strictEqual(pinResponse.status, 200);
    const pinned = await pinResponse.json();
    assert.ok(pinned.item.pinnedAt);
    assert.strictEqual(pinned.item.updatedAt, renamed.item.updatedAt);
    const pinnedHistory = await getJson(`${baseUrl}/api/chatimages`);
    assert.strictEqual(pinnedHistory.items[0].id, "ci_test");

    const invalidPatch = await fetch(`${baseUrl}/api/chatimages/ci_test`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" })
    });
    assert.strictEqual(invalidPatch.status, 400);

    const deleteResponse = await fetch(`${baseUrl}/api/chatimages/ci_test_2`, { method: "DELETE" });
    assert.strictEqual(deleteResponse.status, 200);
    const afterDelete = await getJson(`${baseUrl}/api/chatimages`);
    assert.strictEqual(afterDelete.items.some((item) => item.id === "ci_test_2"), false);
    const missing = await fetch(`${baseUrl}/api/chatimages/missing`);
    assert.strictEqual(missing.status, 404);
    const missingDelete = await fetch(`${baseUrl}/api/chatimages/missing`, { method: "DELETE" });
    assert.strictEqual(missingDelete.status, 404);
  } finally {
    await close(server);
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

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function getJson(url) {
  const response = await fetch(url);
  assert.strictEqual(response.status, 200);
  return response.json();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
