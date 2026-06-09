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
    console.log("browser-api-alignment.test.js skipped: Chrome or Edge was not found");
    return;
  }

  const upstreamState = { visionPayload: null };
  const upstream = createFakeUpstream(upstreamState);
  await listen(upstream);
  const upstreamBase = `http://127.0.0.1:${upstream.address().port}`;
  const store = createStore(":memory:");
  const app = createServer({
    port: 0,
    apiKey: "alignment-key",
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

  const debugPort = await getFreePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-api-alignment-"));
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
      document.querySelector("#questionInput").value = "Test visual alignment";
      document.querySelector("#questionForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    `);
    await cdp.waitForFunction(
      `document.querySelectorAll("[data-hotspot-id]").length === 3 &&
       document.querySelector(".image-stage img") &&
       document.querySelector(".debug-panel").innerText.includes("vision-api-align")`,
      10000
    );

    const result = await cdp.evaluate(`
      (() => {
        const stageNode = document.querySelector(".image-stage");
        const stage = stageNode.getBoundingClientRect();
        const hotspots = Array.from(document.querySelectorAll(".image-stage > [data-hotspot-id]")).map((node) => {
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return {
            id: node.getAttribute("data-hotspot-id"),
            inlineStyle: node.getAttribute("style"),
            borderWidth: style.borderTopWidth,
            background: style.backgroundColor,
            pseudoContent: getComputedStyle(node, "::after").content,
            rect: {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height
            }
          };
        });
        return {
          stageWidth: stageNode.clientWidth,
          stageHeight: stageNode.clientHeight,
          stageLeft: stage.left + stageNode.clientLeft,
          stageTop: stage.top + stageNode.clientTop,
          hotspots,
          debugText: document.querySelector(".debug-panel").innerText
        };
      })()
    `);

    assert.strictEqual(result.hotspots.length, 3);
    assert.match(result.hotspots[0].inlineStyle, /left:3\.5000000000000004%;top:20%;width:24%;height:22%/);
    assert.match(result.hotspots[1].inlineStyle, /left:38%;top:52%;width:24%;height:18%/);
    assert.match(result.hotspots[2].inlineStyle, /left:71%;top:18%;width:22%;height:30%/);
    assert.match(result.debugText, /vision-api-align/);
    assert.match(result.debugText, /"provider": "vision"/);
    for (const hotspot of result.hotspots) {
      assert.strictEqual(hotspot.borderWidth, "0px");
      assert.strictEqual(hotspot.background, "rgba(0, 0, 0, 0)");
      assert.strictEqual(hotspot.pseudoContent, "none");
    }

    const maxRectDelta = Math.max(
      ...result.hotspots.flatMap((hotspot) => {
        const left = parseFloat(hotspot.inlineStyle.match(/left:([0-9.]+)%/)?.[1]) / 100;
        const top = parseFloat(hotspot.inlineStyle.match(/top:([0-9.]+)%/)?.[1]) / 100;
        const width = parseFloat(hotspot.inlineStyle.match(/width:([0-9.]+)%/)?.[1]) / 100;
        const height = parseFloat(hotspot.inlineStyle.match(/height:([0-9.]+)%/)?.[1]) / 100;
        return [
          Math.abs(hotspot.rect.left - (result.stageLeft + left * result.stageWidth)),
          Math.abs(hotspot.rect.top - (result.stageTop + top * result.stageHeight)),
          Math.abs(hotspot.rect.width - width * result.stageWidth),
          Math.abs(hotspot.rect.height - height * result.stageHeight)
        ];
      })
    );
    assert.ok(maxRectDelta < 1, `aligned hotspot DOM rect drifted by ${maxRectDelta}px`);

    assert.ok(upstreamState.visionPayload, "vision upstream was not called");
    assert.strictEqual(upstreamState.visionPayload.purpose, "vision_align");
    assert.strictEqual(upstreamState.visionPayload.model, "fake-vision");
    assert.strictEqual(upstreamState.visionPayload.messages[0].content[1].image_url.url.startsWith("data:image/svg+xml"), true);

    await cdp.evaluate(`document.querySelector("[data-hotspot-id='module_2']").click()`);
    await cdp.waitForFunction(`!document.querySelector("#detailPanel").hidden && document.querySelector(".detail-content h2")`, 3000);
    const detailState = await cdp.evaluate(`({
      hidden: document.querySelector("#detailPanel").hidden,
      title: document.querySelector(".detail-content h2").textContent,
      hotspotIds: Array.from(document.querySelectorAll("[data-hotspot-id]")).map((node) => node.dataset.hotspotId)
    })`);
    assert.strictEqual(detailState.hidden, false);
    assert.strictEqual(detailState.title, "Middle");
    await cdp.close();
  } finally {
    await stopProcess(chrome);
    await close(app);
    await close(upstream);
    store.close();
    await rmWithRetry(profileDir);
  }

  console.log("browser-api-alignment.test.js passed");
}

function createFakeUpstream(state) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/chat" && req.method === "POST") {
      const body = new URLSearchParams(await readBody(req));
      const purpose = body.get("purpose");
      if (purpose === "answer_structure") {
        return sendJson(res, 200, {
          data: {
            content: JSON.stringify({
              rawAnswer: "Raw answer for alignment success test.",
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
      return sendJson(res, 200, { data: { content: "Raw answer for alignment success test." } });
    }

    if (url.pathname === "/image" && req.method === "POST") {
      return sendJson(res, 200, {
        data: {
          imageUrl:
            "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221600%22%20height%3D%22900%22%3E%3Crect%20width%3D%221600%22%20height%3D%22900%22%20fill%3D%22white%22%2F%3E%3Crect%20x%3D%2296%22%20y%3D%22180%22%20width%3D%22288%22%20height%3D%22198%22%20fill%3D%22%23edf7ff%22%2F%3E%3Crect%20x%3D%22608%22%20y%3D%22468%22%20width%3D%22384%22%20height%3D%22162%22%20fill%3D%22%23f7f0ff%22%2F%3E%3Crect%20x%3D%221184%22%20y%3D%22162%22%20width%3D%22256%22%20height%3D%22270%22%20fill%3D%22%23eef9f0%22%2F%3E%3C%2Fsvg%3E"
        }
      });
    }

    if (url.pathname === "/vision" && req.method === "POST") {
      state.visionPayload = JSON.parse(await readBody(req));
      return sendJson(res, 200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                modules: [
                  { moduleId: "module_1", label: "Left", bounds: { x: 0.06, y: 0.2, width: 0.18, height: 0.22 }, confidence: 0.93 },
                  { moduleId: "module_2", label: "Middle", bounds: { x: 0.38, y: 0.52, width: 0.24, height: 0.18 }, confidence: 0.94 },
                  { moduleId: "module_3", label: "Right", bounds: { x: 0.74, y: 0.18, width: 0.16, height: 0.3 }, confidence: 0.95 }
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
    title: "Alignment Success Test",
    summary: "The vision pass should replace layout bounds.",
    relationType: "grid",
    modules: [
      {
        title: "Left",
        imageText: "Left card",
        detail: "The first card uses vision coordinates.",
        sourceExcerpt: "left",
        iconHint: "target"
      },
      {
        title: "Middle",
        imageText: "Middle card",
        detail: "The second card is clicked after alignment.",
        sourceExcerpt: "middle",
        iconHint: "layout"
      },
      {
        title: "Right",
        imageText: "Right card",
        detail: "The third card is also aligned by vision.",
        sourceExcerpt: "right",
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
