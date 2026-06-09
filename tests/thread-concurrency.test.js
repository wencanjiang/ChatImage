"use strict";

const assert = require("assert");
const { createServer, createStore } = require("../server");

async function main() {
  const store = createStore(":memory:");
  const server = createServer({
    port: 0,
    apiKey: "",
    textModel: "gpt-5.5",
    imageModel: "GPT-Image-2",
    store
  });
  await listen(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await postJson(`${baseUrl}/api/chatimages`, buildResult());
    await Promise.all([
      postJson(`${baseUrl}/api/chatimages/ci_threads/hotspots/module_1/messages`, {
        thread: buildThread("thread_1", "module_1", "第一个热点的问题")
      }),
      postJson(`${baseUrl}/api/chatimages/ci_threads/hotspots/module_2/messages`, {
        thread: buildThread("thread_2", "module_2", "第二个热点的问题")
      })
    ]);

    const first = await getJson(`${baseUrl}/api/chatimages/ci_threads/hotspots/module_1/thread`);
    const second = await getJson(`${baseUrl}/api/chatimages/ci_threads/hotspots/module_2/thread`);
    assert.strictEqual(first.thread.id, "thread_1");
    assert.strictEqual(second.thread.id, "thread_2");
    assert.strictEqual(first.thread.messages[0].content, "第一个热点的问题");
    assert.strictEqual(second.thread.messages[0].content, "第二个热点的问题");

    await postJson(`${baseUrl}/api/chatimages/ci_threads/hotspots/module_1/messages`, {
      thread: buildThread("thread_1_replacement", "module_1", "第一个热点的新问题")
    });
    const replaced = await getJson(`${baseUrl}/api/chatimages/ci_threads`);
    const firstThread = replaced.result.threads.find((thread) => thread.hotspotId === "module_1");
    const secondThread = replaced.result.threads.find((thread) => thread.hotspotId === "module_2");
    assert.strictEqual(firstThread.id, "thread_1_replacement");
    assert.deepStrictEqual(
      firstThread.messages.map((message) => message.content),
      ["第一个热点的新问题"]
    );
    assert.strictEqual(secondThread.messages[0].content, "第二个热点的问题");

    const resultWithOneHotspot = {
      ...buildResult(),
      hotspots: [buildHotspot("module_2", 0.5)]
    };
    resultWithOneHotspot.layout = {
      family: "grid",
      regions: resultWithOneHotspot.hotspots.map(buildRegion)
    };
    await postJson(`${baseUrl}/api/chatimages`, resultWithOneHotspot);
    const afterHotspotRemoval = await getJson(`${baseUrl}/api/chatimages/ci_threads`);
    assert.deepStrictEqual(
      afterHotspotRemoval.result.hotspots.map((hotspot) => hotspot.id),
      ["module_2"]
    );
    assert.deepStrictEqual(
      afterHotspotRemoval.result.threads.map((thread) => thread.hotspotId),
      ["module_2"]
    );
    const removedThread = await getJson(`${baseUrl}/api/chatimages/ci_threads/hotspots/module_1/thread`);
    assert.strictEqual(removedThread.thread, null);
  } finally {
    await close(server);
    store.close();
  }

  console.log("thread-concurrency.test.js passed");
}

function buildResult() {
  const result = {
    id: "ci_threads",
    question: "并发测试",
    rawAnswer: "原始回答",
    title: "并发测试",
    summary: "两个热点同时追问",
    hotspots: [
      buildHotspot("module_1", 0.1),
      buildHotspot("module_2", 0.5)
    ],
    imageUrl: "data:image/svg+xml,test",
    imageWidth: 1600,
    imageHeight: 900,
    providerRaw: null,
    createdAt: "2026-05-30T00:00:00.000Z"
  };
  result.layout = { family: "grid", regions: result.hotspots.map(buildRegion) };
  return result;
}

function buildHotspot(id, x) {
  return {
    id,
    label: id,
    shortText: "短文本",
    detail: "详情",
    sourceExcerpt: "",
    iconHint: "idea",
    x,
    y: 0.2,
    width: 0.3,
    height: 0.4
  };
}

function buildRegion(hotspot) {
  return {
    id: `region_${hotspot.id}`,
    hotspotId: hotspot.id,
    role: "module",
    bounds: {
      x: hotspot.x,
      y: hotspot.y,
      width: hotspot.width,
      height: hotspot.height
    }
  };
}

function buildThread(id, hotspotId, content) {
  return {
    id,
    chatImageId: "ci_threads",
    hotspotId,
    messages: [{ id: `${id}_msg`, role: "user", content, createdAt: "2026-05-30T00:00:01.000Z" }],
    createdAt: "2026-05-30T00:00:01.000Z",
    updatedAt: "2026-05-30T00:00:01.000Z"
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

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await response.json().catch(() => ({}));
  assert.strictEqual(response.status, 200, JSON.stringify(json));
  return json;
}

async function getJson(url) {
  const response = await fetch(url);
  const json = await response.json();
  assert.strictEqual(response.status, 200, JSON.stringify(json));
  return json;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
