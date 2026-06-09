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
    console.log("browser-followup-error.test.js skipped: Chrome or Edge was not found");
    return;
  }

  const upstream = createFakeUpstream();
  await listen(upstream);
  const upstreamBase = `http://127.0.0.1:${upstream.address().port}`;
  const store = createStore(":memory:");
  const app = createServer({
    port: 0,
    apiKey: "followup-key",
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
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-followup-error-browser-"));
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
      document.querySelector("#questionInput").value = "Test followup error handling";
      document.querySelector("#questionForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    `);
    await cdp.waitForFunction(`document.querySelectorAll("[data-hotspot-id]").length === 3`, 10000);
    await cdp.evaluate(`document.querySelector("[data-hotspot-id]").click()`);
    await cdp.waitForFunction(`!document.querySelector("#detailPanel").hidden`, 3000);

    await cdp.evaluate(`
      document.querySelector("#followupInput").value = "Why did this area fail?";
      document.querySelector("#followupForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    `);
    await cdp.waitForFunction(`document.querySelector(".followup-error") && document.querySelector("#retryFollowupButton")`, 5000);
    const failureState = await cdp.evaluate(`({
      errorText: document.querySelector(".followup-error").textContent,
      retryValue: document.querySelector("#followupInput").value,
      userMessages: document.querySelectorAll(".message.user").length
    })`);
    assert.match(failureState.errorText, /followup broken|API request failed/);
    assert.strictEqual(failureState.retryValue, "Why did this area fail?");
    assert.strictEqual(failureState.userMessages, 0);

    await cdp.evaluate(`document.querySelector("#retryFollowupButton").click()`);
    await cdp.waitForFunction(`document.querySelectorAll(".message.user").length === 1`, 5000);
    await cdp.waitForFunction(`document.querySelector(".message.assistant").textContent.includes("Recovered followup answer")`, 5000);
    const errorCleared = await cdp.evaluate(`!document.querySelector(".followup-error")`);
    assert.strictEqual(errorCleared, true);

    await cdp.close();
  } finally {
    await stopProcess(chrome);
    await close(app);
    await close(upstream);
    store.close();
    await rmWithRetry(profileDir);
  }

  console.log("browser-followup-error.test.js passed");
}

function createFakeUpstream() {
  let followupAttempts = 0;
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/chat" && req.method === "POST") {
      const body = new URLSearchParams(await readBody(req));
      const purpose = body.get("purpose");
      if (purpose === "answer_structure") {
        return sendJson(res, 200, {
          data: {
            content: JSON.stringify({
              rawAnswer: "Raw answer for followup error handling.",
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
      if (purpose === "hotspot_followup") {
        followupAttempts += 1;
        if (followupAttempts === 1) {
          return sendJson(res, 500, { error: "followup broken" });
        }
        return sendJson(res, 200, { data: { content: "Recovered followup answer." } });
      }
      return sendJson(res, 200, { data: { content: "Raw answer for followup error handling." } });
    }

    if (url.pathname === "/vision" && req.method === "POST") {
      return sendJson(res, 200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                modules: [
                  { moduleId: "module_1", label: "First Area", bounds: { x: 0.1, y: 0.3, width: 0.2, height: 0.25 }, confidence: 0.9 },
                  { moduleId: "module_2", label: "Second Area", bounds: { x: 0.4, y: 0.3, width: 0.2, height: 0.25 }, confidence: 0.9 },
                  { moduleId: "module_3", label: "Retry Path", bounds: { x: 0.7, y: 0.3, width: 0.2, height: 0.25 }, confidence: 0.9 }
                ]
              })
            }
          }
        ]
      });
    }

    if (url.pathname === "/image" && req.method === "POST") {
      return sendJson(res, 200, {
        data: {
          imageUrl:
            "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221600%22%20height%3D%22900%22%3E%3Crect%20width%3D%221600%22%20height%3D%22900%22%20fill%3D%22white%22%2F%3E%3Ctext%20x%3D%22100%22%20y%3D%22100%22%3EFollowup%3C%2Ftext%3E%3C%2Fsvg%3E"
        }
      });
    }

    return sendJson(res, 404, { error: "not found" });
  });
}

function createVisualSpec() {
  return {
    title: "Followup Error Test",
    summary: "Checks failed area followup recovery.",
    relationType: "grid",
    modules: [
      {
        title: "First Area",
        imageText: "Click and ask.",
        detail: "The first area is used for a failed followup request.",
        sourceExcerpt: "first area",
        iconHint: "target"
      },
      {
        title: "Second Area",
        imageText: "Separate context.",
        detail: "The second area is not used in this test.",
        sourceExcerpt: "second area",
        iconHint: "thread"
      },
      {
        title: "Retry Path",
        imageText: "Retry succeeds.",
        detail: "The retry request should clear the error state.",
        sourceExcerpt: "retry path",
        iconHint: "risk"
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
