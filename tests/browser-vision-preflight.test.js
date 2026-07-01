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
      document.querySelector("#questionInput").value = "Vision preflight provider configuration";
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
              rawAnswer:
                "When the vision endpoint is missing, the application should stop before image generation. The vision preflight checks provider configuration first, blocks the image request, preserves image quota, and shows a clear setup hint for the missing vision endpoint.",
              visualSpec: createVisualSpec()
            })
          }
        });
      }
      if (body.get("purpose") === "answer_structure_repair") {
        return sendJson(res, 200, {
          data: {
            content: JSON.stringify({
              rawAnswer:
                "A missing vision endpoint is a provider readiness problem. The service should verify provider configuration before starting image generation, stop the request when alignment cannot run, avoid spending image quota, and show a clear setup message so the user can fix the endpoint before retrying.",
              visualSpec: createRepairedVisualSpec()
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
      return sendJson(res, 200, {
        data: {
          content:
            "When the vision endpoint is missing, the application should stop before image generation. The vision preflight checks provider configuration first, blocks the image request, preserves image quota, and shows a clear setup hint for the missing vision endpoint."
        }
      });
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
    title: "Vision Preflight Guard",
    summary: "Missing vision endpoint configuration must block image generation.",
    relationType: "grid",
    modules: [
      {
        title: "Preflight",
        imageText: "Check vision provider",
        detail:
          "Before real image generation starts, the system checks whether the vision provider endpoint is configured. This preflight is required because hotspot alignment depends on a working vision endpoint.",
        sourceExcerpt: "The vision preflight checks provider configuration first.",
        iconHint: "target"
      },
      {
        title: "Block",
        imageText: "Stop image request",
        detail:
          "If the vision endpoint is missing, the service must stop before calling the image provider. That prevents image quota from being consumed by a result that cannot be aligned.",
        sourceExcerpt: "Missing vision endpoint configuration must block image generation.",
        iconHint: "risk"
      },
      {
        title: "Hint",
        imageText: "Show setup error",
        detail:
          "The page should surface a clear provider configuration message so the user knows to set the vision endpoint before retrying real image generation.",
        sourceExcerpt: "The page should mention the missing vision endpoint.",
        iconHint: "idea"
      }
    ]
  };
}

function createRepairedVisualSpec() {
  return {
    title: "Endpoint Readiness Check",
    summary: "Provider readiness must be confirmed before requesting an image.",
    relationType: "grid",
    modules: [
      {
        title: "Readiness",
        imageText: "Verify provider setup",
        detail:
          "The first step is checking whether the required vision provider endpoint is configured. Without that endpoint, later alignment work cannot inspect the generated image or place reliable regions.",
        sourceExcerpt: "A missing vision endpoint is a provider readiness problem.",
        iconHint: "target"
      },
      {
        title: "Stop",
        imageText: "Block image call",
        detail:
          "When provider readiness fails, the request should stop before image generation begins. This keeps quota from being spent on an image that the system already knows it cannot align.",
        sourceExcerpt: "The service should verify provider configuration before starting image generation.",
        iconHint: "risk"
      },
      {
        title: "Recover",
        imageText: "Show setup hint",
        detail:
          "The user-facing failure should explain that provider configuration is incomplete and that the missing endpoint must be supplied before retrying real image generation.",
        sourceExcerpt: "Show a clear setup message so the user can fix the endpoint before retrying.",
        iconHint: "idea"
      }
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
