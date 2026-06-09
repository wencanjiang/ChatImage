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
    console.log("browser-api-alignment-error.test.js skipped: Chrome or Edge was not found");
    return;
  }

  const upstreamState = { imageHits: 0, visionHits: 0 };
  const upstream = createFakeUpstream(upstreamState);
  await listen(upstream);
  const upstreamBase = `http://127.0.0.1:${upstream.address().port}`;
  const store = createStore(":memory:");
  const app = createServer({
    port: 0,
    apiKey: "alignment-error-key",
    textModel: "gpt-5.5",
    imageModel: "GPT-Image-2",
    textEndpoint: `${upstreamBase}/chat`,
    textRequestFormat: "wuyin-form",
    imageEndpoint: `${upstreamBase}/image`,
    imageDetailEndpoint: `${upstreamBase}/detail`,
    visionMode: "remote",
    visionEndpoint: `${upstreamBase}/vision`,
    visionModel: "fake-vision",
    store
  });
  await listen(app);

  const debugPort = await getFreePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-api-alignment-error-"));
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

    const baseUrl = `http://127.0.0.1:${app.address().port}`;
    await cdp.send("Page.navigate", { url: `${baseUrl}/?provider=api` });
    await cdp.waitFor("Page.loadEventFired", 10000);
    await cdp.evaluate(`
      document.querySelector("#questionInput").value = "Test visual alignment failure";
      document.querySelector("#questionForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    `);
    await cdp.waitForFunction(
      `document.querySelectorAll("[data-hotspot-id]").length === 3 &&
       document.querySelector(".image-stage img") &&
       document.querySelectorAll("[data-history-id]").length === 1 &&
       document.body.innerText.includes("alignment-fallback")`,
      10000
    );

    const pageState = await cdp.evaluate(`({
      hotspotCount: document.querySelectorAll("[data-hotspot-id]").length,
      historyCount: document.querySelectorAll("[data-history-id]").length,
      detailHidden: document.querySelector("#detailPanel").hidden,
      hasRetry: Boolean(document.querySelector("#retryButton")),
      bodyText: document.body.innerText
    })`);
    assert.strictEqual(pageState.hotspotCount, 3);
    assert.strictEqual(pageState.historyCount, 1);
    assert.strictEqual(pageState.detailHidden, true);
    assert.strictEqual(pageState.hasRetry, false);
    assert.match(pageState.bodyText, /alignment-fallback/);
    assert.match(pageState.bodyText, /Right/);

    assert.strictEqual(upstreamState.imageHits, 1);
    assert.strictEqual(upstreamState.visionHits, 1);
    assert.strictEqual(store.listChatImages().length, 1);

    await cdp.close();
  } finally {
    await stopProcess(chrome);
    await close(app);
    await close(upstream);
    store.close();
    await rmWithRetry(profileDir);
  }

  console.log("browser-api-alignment-error.test.js passed");
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
              rawAnswer: "Raw answer for alignment failure test.",
              visualSpec: createVisualSpec()
            })
          }
        });
      }
      if (body.get("purpose") === "structure") {
        return sendJson(res, 200, {
          data: {
            content: JSON.stringify(createVisualSpec())
          }
        });
      }
      return sendJson(res, 200, { data: { content: "Raw answer for alignment failure test." } });
    }

    if (url.pathname === "/image" && req.method === "POST") {
      state.imageHits += 1;
      return sendJson(res, 200, {
        data: {
          imageUrl:
            "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221600%22%20height%3D%22900%22%3E%3Crect%20width%3D%221600%22%20height%3D%22900%22%20fill%3D%22white%22%2F%3E%3Ctext%20x%3D%22100%22%20y%3D%22100%22%3EAlignment%20error%3C%2Ftext%3E%3C%2Fsvg%3E"
        }
      });
    }

    if (url.pathname === "/vision" && req.method === "POST") {
      state.visionHits += 1;
      await readBody(req);
      return sendJson(res, 200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                modules: [
                  { moduleId: "module_1", label: "Left", bounds: { x: 0.06, y: 0.2, width: 0.18, height: 0.22 }, confidence: 0.93 },
                  { moduleId: "module_2", label: "Middle", bounds: { x: 0.38, y: 0.52, width: 0.24, height: 0.18 }, confidence: 0.94 }
                ]
              })
            }
          }
        ]
      });
    }

    return sendJson(res, 404, { error: "not found" });
  });
}

function createVisualSpec() {
  return {
    title: "Alignment Error Test",
    summary: "The vision pass intentionally misses a module.",
    relationType: "grid",
    modules: [
      { title: "Left", imageText: "Left card", detail: "Left detail.", iconHint: "target" },
      { title: "Middle", imageText: "Middle card", detail: "Middle detail.", iconHint: "layout" },
      { title: "Right", imageText: "Right card", detail: "Right detail.", iconHint: "image" }
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
