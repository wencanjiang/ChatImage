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
    console.log("browser-image-error.test.js skipped: Chrome or Edge was not found");
    return;
  }

  const upstream = createFakeUpstream();
  await listen(upstream);
  const upstreamBase = `http://127.0.0.1:${upstream.address().port}`;
  const store = createStore(":memory:");
  const app = createServer({
    port: 0,
    apiKey: "image-error-key",
    textModel: "gpt-5.5",
    imageModel: "GPT-Image-2",
    textEndpoint: `${upstreamBase}/chat`,
    textRequestFormat: "wuyin-form",
    imageEndpoint: `${upstreamBase}/image`,
    imageDetailEndpoint: `${upstreamBase}/detail`,
    visionEndpoint: `${upstreamBase}/vision`,
    visionModel: "fake-vision",
    store
  });
  await listen(app);
  const baseUrl = `http://127.0.0.1:${app.address().port}`;
  const debugPort = await getFreePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-image-error-browser-"));
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
    await cdp.evaluate(`
      document.querySelector("#questionInput").value = "Test broken generated image";
      document.querySelector("#questionForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    `);
    await cdp.waitForFunction(`document.querySelector(".image-load-error") && document.querySelector("[data-retry-image]")`, 10000);
    const firstState = await cdp.evaluate(`({
      errorText: document.querySelector(".image-load-error").textContent,
      hotspotCount: document.querySelectorAll("[data-hotspot-id]").length
    })`);
    assert.match(firstState.errorText, /图片加载失败|重试生成/);
    assert.strictEqual(firstState.hotspotCount, 3);

    await cdp.evaluate(`document.querySelector("[data-retry-image]").click()`);
    await cdp.waitForFunction(`document.querySelectorAll("[data-hotspot-id]").length === 3 && !document.querySelector(".image-load-error")`, 10000);
    const retryState = await cdp.evaluate(`({
      title: document.querySelector(".result-header h2").textContent,
      imageSrc: document.querySelector(".image-stage img").getAttribute("src")
    })`);
    assert.strictEqual(retryState.title, "Image Error Test");
    assert.ok(retryState.imageSrc.startsWith("data:image/svg+xml"));

    await cdp.close();
  } finally {
    await stopProcess(chrome);
    await close(app);
    await close(upstream);
    store.close();
    await rmWithRetry(profileDir);
  }

  console.log("browser-image-error.test.js passed");
}

function createFakeUpstream() {
  let imageAttempts = 0;
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/chat" && req.method === "POST") {
      const body = new URLSearchParams(await readBody(req));
      const purpose = body.get("purpose");
      if (purpose === "answer_structure") {
        return sendJson(res, 200, {
          data: {
            content: JSON.stringify({
              rawAnswer: "Raw answer for broken image recovery.",
              visualSpec: createVisualSpec()
            })
          }
        });
      }
      if (purpose === "structure") {
        return sendJson(res, 200, {
          data: {
            content: JSON.stringify(createVisualSpec())
          }
        });
      }
      return sendJson(res, 200, { data: { content: "Raw answer for broken image recovery." } });
    }

    if (url.pathname === "/vision" && req.method === "POST") {
      return sendJson(res, 200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                modules: [
                  { moduleId: "module_1", label: "Broken URL", bounds: { x: 0.1, y: 0.3, width: 0.2, height: 0.25 }, confidence: 0.9 },
                  { moduleId: "module_2", label: "Retry", bounds: { x: 0.4, y: 0.3, width: 0.2, height: 0.25 }, confidence: 0.9 },
                  { moduleId: "module_3", label: "Recovered", bounds: { x: 0.7, y: 0.3, width: 0.2, height: 0.25 }, confidence: 0.9 }
                ]
              })
            }
          }
        ]
      });
    }

    if (url.pathname === "/image" && req.method === "POST") {
      imageAttempts += 1;
      if (imageAttempts === 1) {
        return sendJson(res, 200, { data: { imageUrl: "https://example.com/missing-image.png", width: 1600, height: 900 } });
      }
      return sendJson(res, 200, {
        data: {
          imageUrl:
            "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221600%22%20height%3D%22900%22%3E%3Crect%20width%3D%221600%22%20height%3D%22900%22%20fill%3D%22white%22%2F%3E%3Ctext%20x%3D%22100%22%20y%3D%22100%22%3ERecovered%3C%2Ftext%3E%3C%2Fsvg%3E"
        }
      });
    }

    return sendJson(res, 404, { error: "not found" });
  });
}

function createVisualSpec() {
  return {
    title: "Image Error Test",
    summary: "Checks broken generated image recovery.",
    relationType: "grid",
    modules: [
      {
        title: "Broken URL",
        imageText: "First image fails.",
        detail: "The first generated image URL is intentionally broken.",
        sourceExcerpt: "broken url",
        iconHint: "risk"
      },
      {
        title: "Retry",
        imageText: "Retry regenerates.",
        detail: "The retry button regenerates from the same question.",
        sourceExcerpt: "retry",
        iconHint: "step"
      },
      {
        title: "Recovered",
        imageText: "Second image works.",
        detail: "The second generated image is a valid data URL.",
        sourceExcerpt: "recovered",
        iconHint: "image"
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
