"use strict";

const assert = require("assert");
const http = require("http");
const { createServer } = require("../server");

async function main() {
  const upstreamState = {
    textBody: "",
    imageBody: "",
    visionBody: "",
    detailCalls: 0
  };

  const upstream = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/chat" && req.method === "POST") {
      upstreamState.textBody = await readBody(req);
      assert.strictEqual(req.headers.authorization, "proxy-key");
      return sendJson(res, 200, { data: { content: "代理文本返回" } });
    }

    if (url.pathname === "/image" && req.method === "POST") {
      upstreamState.imageBody = await readBody(req);
      assert.strictEqual(url.searchParams.get("key"), "proxy-key");
      assert.strictEqual(req.headers.authorization, "proxy-key");
      return sendJson(res, 200, { data: { task_id: "task_456" } });
    }

    if (url.pathname === "/vision" && req.method === "POST") {
      upstreamState.visionBody = await readBody(req);
      assert.strictEqual(req.headers.authorization, "Bearer vision-key");
      const purpose = JSON.parse(upstreamState.visionBody).purpose;
      const content =
        purpose === "vision_health"
          ? "{\"ok\":true,\"imageVisible\":true,\"description\":\"visible\"}"
          : "{\"ok\":true,\"modules\":[]}";
      return sendJson(res, 200, { choices: [{ message: { content } }] });
    }

    if (url.pathname === "/detail" && req.method === "GET") {
      upstreamState.detailCalls += 1;
      assert.strictEqual(url.searchParams.get("key"), "proxy-key");
      assert.strictEqual(url.searchParams.get("id"), "task_456");
      assert.strictEqual(req.headers.authorization, "proxy-key");
      return sendJson(res, 200, { data: { status: "done", url: "https://cdn.example.com/proxy.png", width: 1280, height: 720 } });
    }

    return sendJson(res, 404, { error: "not found" });
  });

  await listen(upstream);
  const upstreamBase = `http://127.0.0.1:${upstream.address().port}`;

  const app = createServer({
    port: 0,
    apiKey: "proxy-key",
    textModel: "gpt-5.5",
    imageModel: "GPT-Image-2",
    textEndpoint: `${upstreamBase}/chat`,
    textRequestFormat: "wuyin-form",
    imageEndpoint: `${upstreamBase}/image`,
    imageDetailEndpoint: `${upstreamBase}/detail`,
    visionEndpoint: `${upstreamBase}/vision`,
    visionApiKey: "vision-key",
    visionModel: "fake-vision",
    imagePollAttempts: 2,
    imagePollInitialDelayMs: 0,
    imagePollDelayMs: 0
  });

  await listen(app);
  const appBase = `http://127.0.0.1:${app.address().port}`;

  try {
    const llm = await postJson(`${appBase}/api/llm`, {
      content: "代理文本测试",
      model: "gpt-5.5",
      responseFormat: "json"
    });
    assert.strictEqual(llm.content, "代理文本返回");
    assert.match(upstreamState.textBody, /content=/);
    assert.match(upstreamState.textBody, /model=gpt-5.5/);
    assert.match(upstreamState.textBody, /key=proxy-key/);

    const llmHealth = await postJson(`${appBase}/api/llm/health`, {
      purpose: "proxy_text_health",
      model: "gpt-5.5"
    });
    assert.strictEqual(llmHealth.ok, true);
    assert.strictEqual(llmHealth.content, llm.content);
    const healthTextBody = decodeURIComponent(upstreamState.textBody);
    assert.match(healthTextBody, /purpose=proxy_text_health/);
    assert.match(healthTextBody, /ChatImage\+text\+health\+check/);

    await postJson(`${appBase}/api/llm`, {
      content: "介绍一下浙江大学校长",
      model: "gpt-5.5"
    });
    const forwardedTextBody = decodeURIComponent(upstreamState.textBody);
    assert.match(forwardedTextBody, /介绍一下浙江大学校长/);
    assert.doesNotMatch(forwardedTextBody, /已核验时效信息/);

    const image = await postJson(`${appBase}/api/image`, {
      prompt: "代理生图测试",
      size: "1600x900",
      model: "GPT-Image-2"
    });
    assert.strictEqual(image.imageUrl, "https://cdn.example.com/proxy.png");
    assert.strictEqual(image.width, 1280);
    assert.strictEqual(image.height, 720);
    assert.strictEqual(upstreamState.detailCalls, 1);
    assert.deepStrictEqual(JSON.parse(upstreamState.imageBody), {
      prompt: "代理生图测试",
      size: "1600x900",
      model: "GPT-Image-2"
    });

    const vision = await postJson(`${appBase}/api/vision`, {
      content: "代理视觉测试",
      imageUrl: "https://cdn.example.com/proxy.png",
      imageWidth: 1280,
      imageHeight: 720
    });
    assert.strictEqual(vision.content, "{\"ok\":true,\"modules\":[]}");
    const visionBody = JSON.parse(upstreamState.visionBody);
    assert.strictEqual(visionBody.model, "fake-vision");
    assert.strictEqual(visionBody.messages[0].content[0].text, "代理视觉测试");
    assert.strictEqual(visionBody.messages[0].content[1].image_url.url, "https://cdn.example.com/proxy.png");

    const health = await postJson(`${appBase}/api/vision/health`, {
      content: "代理视觉健康检查",
      imageUrl: "https://cdn.example.com/health.png"
    });
    assert.strictEqual(health.ok, true);
    assert.deepStrictEqual(health.parsed, { ok: true, imageVisible: true, description: "visible" });
    const healthBody = JSON.parse(upstreamState.visionBody);
    assert.strictEqual(healthBody.purpose, "vision_health");
    assert.strictEqual(healthBody.messages[0].content[1].image_url.url, "https://cdn.example.com/health.png");
  } finally {
    await close(app);
    await close(upstream);
  }

  await testUpstreamConcurrencyLimit();
  console.log("proxy-integration.test.js passed");
}

async function testUpstreamConcurrencyLimit() {
  const slow = createDeferred();
  let upstreamHits = 0;
  const upstream = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/chat" && req.method === "POST") {
      upstreamHits += 1;
      slow.resolve();
      await slow.done;
      return sendJson(res, 200, { data: { content: "slow response" } });
    }
    return sendJson(res, 404, { error: "not found" });
  });
  await listen(upstream);

  const app = createServer({
    port: 0,
    apiKey: "limit-key",
    textModel: "gpt-5.5",
    imageModel: "GPT-Image-2",
    textEndpoint: `http://127.0.0.1:${upstream.address().port}/chat`,
    textRequestFormat: "wuyin-form",
    maxUpstreamRequests: 1
  });
  await listen(app);
  const appBase = `http://127.0.0.1:${app.address().port}`;

  try {
    const first = postRaw(`${appBase}/api/llm`, { content: "first" });
    await slow.started;
    const second = await postRaw(`${appBase}/api/llm`, { content: "second" });
    assert.strictEqual(second.status, 429);
    assert.match(second.body.error, /concurrency limit/);
    slow.finish();
    const firstResponse = await first;
    assert.strictEqual(firstResponse.status, 200);
    assert.strictEqual(firstResponse.body.content, "slow response");
    assert.strictEqual(upstreamHits, 1);
  } finally {
    slow.finish();
    await close(app);
    await close(upstream);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function sendJson(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

function listen(server) {
  return listenOnFetchSafePort(server);
}

async function listenOnFetchSafePort(server) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address();
    if (!isFetchBlockedPort(port)) return;
    await close(server);
  }
  throw new Error("Could not allocate a fetch-safe local port");
}

function isFetchBlockedPort(port) {
  return new Set([
    1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
    101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161,
    179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563,
    587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061,
    6000, 6566, 6697, 10080
  ]).has(Number(port)) || (Number(port) >= 6665 && Number(port) <= 6669);
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function postJson(url, body) {
  const response = await postRaw(url, body);
  if (response.status < 200 || response.status >= 300) throw new Error(JSON.stringify(response.body));
  return response.body;
}

async function postRaw(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, body: json };
}

function createDeferred() {
  let resolveStarted;
  let resolveDone;
  const started = new Promise((resolve) => {
    resolveStarted = resolve;
  });
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });
  return {
    done,
    started,
    finish: resolveDone,
    resolve: resolveStarted
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
