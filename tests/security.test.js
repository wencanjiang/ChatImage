"use strict";

const assert = require("assert");
const http = require("http");
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
    await testSqlInjectionPayload(baseUrl);
    await testInvalidPersistencePayloads(baseUrl);
    await testLargeRequestRejected(server.address().port);
  } finally {
    await close(server);
    store.close();
  }

  console.log("security.test.js passed");
}

async function testSqlInjectionPayload(baseUrl) {
  const maliciousId = "ci_sql'); drop table chat_images; --";
  const response = await fetch(`${baseUrl}/api/chatimages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: maliciousId,
      question: "'; drop table hotspots; --",
      rawAnswer: "<script>window.__xss=1</script>",
      title: "<img src=x onerror=window.__xss=1>",
      summary: "安全测试",
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
          label: "<script>alert(1)</script>",
          shortText: "短文本",
          detail: "详情",
          sourceExcerpt: "",
          iconHint: "idea",
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
      createdAt: "2026-05-30T00:00:00.000Z"
    })
  });
  assert.strictEqual(response.status, 200);

  const list = await fetch(`${baseUrl}/api/chatimages`).then((item) => item.json());
  assert.strictEqual(list.items[0].id, maliciousId);
}

async function testLargeRequestRejected(port) {
  const payload = JSON.stringify({ content: "x".repeat(2 * 1024 * 1024 + 1) });
  const outcome = await new Promise((resolve) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/chatimages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ statusCode: res.statusCode }));
      }
    );
    req.on("error", (error) => resolve({ error }));
    req.end(payload);
  });

  if (outcome.error) {
    assert.match(outcome.error.message, /socket hang up|ECONNRESET|write/i);
  } else {
    assert.ok(outcome.statusCode >= 400);
  }
}

async function testInvalidPersistencePayloads(baseUrl) {
  const invalidHotspot = await fetch(`${baseUrl}/api/chatimages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...createValidPayload("ci_invalid_bounds"),
      hotspots: [{ ...createValidPayload("ci_invalid_bounds").hotspots[0], x: -0.1 }]
    })
  });
  assert.strictEqual(invalidHotspot.status, 400);
  assert.match(await invalidHotspot.text(), /inside the image/);

  const mismatchedRegion = await fetch(`${baseUrl}/api/chatimages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...createValidPayload("ci_invalid_binding"),
      layout: {
        family: "grid",
        regions: [
          {
            id: "region_1",
            hotspotId: "module_1",
            role: "module",
            bounds: { x: 0.2, y: 0.2, width: 0.3, height: 0.4 }
          }
        ]
      }
    })
  });
  assert.strictEqual(mismatchedRegion.status, 400);
  assert.match(await mismatchedRegion.text(), /bounds do not match hotspot/);

  const tinyHotspot = createValidPayload("ci_tiny_hotspot");
  tinyHotspot.hotspots[0].width = 0.08;
  tinyHotspot.layout.regions[0].bounds.width = 0.08;
  const tinyHotspotResponse = await fetch(`${baseUrl}/api/chatimages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tinyHotspot)
  });
  assert.strictEqual(tinyHotspotResponse.status, 400);
  assert.match(await tinyHotspotResponse.text(), /layout quality check failed.*minimum click area/);

  const maliciousImageUrl = await fetch(`${baseUrl}/api/chatimages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...createValidPayload("ci_bad_image_url"),
      imageUrl: "javascript:alert(1)"
    })
  });
  assert.strictEqual(maliciousImageUrl.status, 400);
  assert.match(await maliciousImageUrl.text(), /imageUrl must be an http\(s\) URL or data:image URL/);

  const overflowingText = await fetch(`${baseUrl}/api/chatimages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...createValidPayload("ci_text_overflow"),
      hotspots: [
        {
          ...createValidPayload("ci_text_overflow").hotspots[0],
          shortText: "This text is too long for the saved budget.",
          textBudget: createTextBudget({ imageTextMaxChars: 8 })
        }
      ]
    })
  });
  assert.strictEqual(overflowingText.status, 400);
  assert.match(await overflowingText.text(), /shortText exceeds textBudget/);

  const validPayload = createValidPayload("ci_thread_validation");
  const saved = await fetch(`${baseUrl}/api/chatimages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validPayload)
  });
  assert.strictEqual(saved.status, 200);

  const mismatchedThread = await fetch(`${baseUrl}/api/chatimages/ci_thread_validation/hotspots/module_1/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread: {
        id: "thread_bad_owner",
        chatImageId: "ci_thread_validation",
        hotspotId: "module_2",
        messages: []
      }
    })
  });
  assert.strictEqual(mismatchedThread.status, 400);
  assert.match(await mismatchedThread.text(), /hotspotId does not match/);

  const invalidRole = await fetch(`${baseUrl}/api/chatimages/ci_thread_validation/hotspots/module_1/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread: {
        id: "thread_bad_role",
        chatImageId: "ci_thread_validation",
        hotspotId: "module_1",
        messages: [{ id: "msg_bad", role: "system", content: "bad" }]
      }
    })
  });
  assert.strictEqual(invalidRole.status, 400);
  assert.match(await invalidRole.text(), /role must be user or assistant/);
}

function createTextBudget(overrides = {}) {
  return {
    titleLineChars: 20,
    titleMaxLines: 1,
    titleMaxChars: 20,
    imageTextLineChars: 40,
    imageTextMaxLines: 1,
    imageTextMaxChars: 40,
    ...overrides
  };
}

function createValidPayload(id) {
  return {
    id,
    question: "Explain ChatImage.",
    rawAnswer: "ChatImage converts long text answers into clickable visual modules.",
    title: "ChatImage",
    summary: "Clickable visual answers.",
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
        label: "Value",
        shortText: "Fast scanning",
        detail: "The region can be opened and followed up.",
        sourceExcerpt: "",
        iconHint: "idea",
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
    imagePrompt: "Prompt",
    createdAt: "2026-05-31T00:00:00.000Z"
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
