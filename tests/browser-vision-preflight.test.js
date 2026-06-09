"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createServer, createStore } = require("../server");
const {
  close,
  connectCdp,
  findChrome,
  getFreePort,
  listen,
  rmWithRetry,
  stopProcess,
  waitForWebSocketUrl
} = require("./browser.test");

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.log("browser-vision-preflight.test.js skipped: Chrome or Edge was not found");
    return;
  }

  const upstreamState = { imageHits: 0 };
  const upstream = createFakeUpstream(upstreamState);
  await listen(upstream);
  const upstreamBase = `http://127.0.0.1:${upstream.address().port}`;
  const store = createStore(":memory:");
  const app = createServer({
    port: 0,
    apiKey: "preflight-key",
    textModel: "gpt-5.5",
    imageModel: "GPT-Image-2",
    textEndpoint: `${upstreamBase}/chat`,
    textRequestFormat: "wuyin-form",
    imageEndpoint: `${upstreamBase}/image`,
    imageDetailEndpoint: `${upstreamBase}/detail`,
    visionMode: "remote",
    visionEndpoint: "",
    store
  });
  await listen(app);
  const baseUrl = `http://127.0.0.1:${app.address().port}`;
  const debugPort = await getFreePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-vision-preflight-"));
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--disable-features=VizDisplayCompositor",
    "--disable-extensions",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${debugPort}`,
    "about:blank"
  ]);
  let chromeStderr = "";
  chrome.stderr.on("data", (chunk) => {
    chromeStderr += chunk.toString();
  });

  try {
    const wsUrl = await waitForWebSocketUrl(debugPort, () => chromeStderr);
    const cdp = await connectCdp(wsUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await cdp.send("Page.navigate", { url: `${baseUrl}/?provider=api` });
    await cdp.waitFor("Page.loadEventFired", 10000);
    await cdp.waitForFunction(`document.querySelector("#statusPill").textContent.includes("未配置视觉对齐")`, 5000);
    await cdp.evaluate(`
      document.querySelector("#questionInput").value = "测试缺少视觉接口时是否阻止生图";
      document.querySelector("#questionForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    `);
    await cdp.waitForFunction(
      `document.querySelector(".empty-state h1") &&
       document.querySelector(".empty-state h1").textContent.includes("生成失败")`,
      10000
    );
    const bodyText = await cdp.evaluate(`document.body.innerText`);
    assert.match(bodyText, /provider|CHATIMAGE_VISION_ENDPOINT/);
    assert.strictEqual(upstreamState.imageHits, 0);
    await cdp.close();
  } finally {
    await stopProcess(chrome);
    await close(app);
    await close(upstream);
    store.close();
    await rmWithRetry(profileDir);
  }

  console.log("browser-vision-preflight.test.js passed");
}

function createFakeUpstream(state) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/chat" && req.method === "POST") {
      const body = new URLSearchParams(await readBody(req));
      if (body.get("purpose") === "answer_structure") {
        return sendJson(res, 200, {
          data: {
            content: JSON.stringify({
              rawAnswer: "Raw answer for vision preflight test.",
              visualSpec: createVisualSpec()
            })
          }
        });
      }
      if (body.get("purpose") === "structure") {
        return sendJson(res, 200, {
          data: {
            content: JSON.stringify({
              title: "视觉预检测试",
              summary: "缺少视觉接口时不应调用生图。",
              relationType: "grid",
              modules: [
                { title: "预检", imageText: "先检查视觉接口", detail: "真实生图前必须确认可对齐。", iconHint: "target" },
                { title: "阻止", imageText: "阻止生图请求", detail: "缺少视觉接口时不能消耗生图额度。", iconHint: "risk" },
                { title: "提示", imageText: "显示明确错误", detail: "页面应提示配置 CHATIMAGE_VISION_ENDPOINT。", iconHint: "idea" }
              ]
            })
          }
        });
      }
      return sendJson(res, 200, { data: { content: "Raw answer for vision preflight test." } });
    }

    if (url.pathname === "/image" && req.method === "POST") {
      state.imageHits += 1;
      return sendJson(res, 200, { data: { imageUrl: "https://cdn.example.com/should-not-be-called.png" } });
    }

    return sendJson(res, 404, { error: "not found" });
  });
}

function createVisualSpec() {
  return {
    title: "Vision Preflight Test",
    summary: "Missing vision endpoint must block image generation.",
    relationType: "grid",
    modules: [
      { title: "Preflight", imageText: "Check vision", detail: "Real image generation must confirm alignment first.", iconHint: "target" },
      { title: "Block", imageText: "Stop image", detail: "Missing vision endpoint must not consume image quota.", iconHint: "risk" },
      { title: "Hint", imageText: "Show error", detail: "Page should mention CHATIMAGE_VISION_ENDPOINT.", iconHint: "idea" }
    ]
  };
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
