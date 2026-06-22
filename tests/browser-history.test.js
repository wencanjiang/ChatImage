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
    console.log("browser-history.test.js skipped: Chrome or Edge was not found");
    return;
  }

  const upstream = createFakeUpstream();
  await listen(upstream);
  const upstreamBase = `http://127.0.0.1:${upstream.address().port}`;
  const store = createStore(":memory:");
  const app = createServer({
    port: 0,
    apiKey: "history-key",
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
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-history-browser-"));
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
      document.querySelector("#questionInput").value = "保存后能否恢复 ChatImage";
      document.querySelector("#questionForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    `);
    await cdp.waitForFunction(`document.querySelectorAll("[data-hotspot-id]").length === 3`, 10000);
    const alignedHotspotStyle = await cdp.evaluate(`document.querySelector("[data-hotspot-id='module_1']").getAttribute("style")`);
    const alignedBounds = parseInlineStyleBounds(alignedHotspotStyle);
    assert.ok(alignedBounds.width > 26);
    assert.ok(alignedBounds.height > 25);
    assert.ok(Math.abs(alignedBounds.left + alignedBounds.width / 2 - 20) < 0.5);
    assert.ok(Math.abs(alignedBounds.top + alignedBounds.height / 2 - 42.5) < 0.5);
    await cdp.evaluate(`
      const input = document.querySelector("[data-calibration-input]");
      const data = JSON.parse(input.value);
      data[0].bounds.x = 0.12;
      data[0].bounds.width = 0.2;
      input.value = JSON.stringify(data, null, 2);
      document.querySelector("[data-apply-hotspot-calibration]").click();
    `);
    await cdp.waitForFunction(
      `document.querySelector("#statusPill").textContent === "热点已校准" &&
       document.querySelector("[data-hotspot-id='module_1']").getAttribute("style").includes("left:12%")`,
      5000
    );
    await cdp.evaluate(`document.querySelector("[data-hotspot-id]").click()`);
    await cdp.waitForFunction(`!document.querySelector("#detailPanel").hidden`, 3000);
    await cdp.evaluate(`
      document.querySelector("#followupInput").value = "恢复后还能看到这条追问吗？";
      document.querySelector("#followupForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    `);
    await cdp.waitForFunction(`document.querySelector(".message.user")`, 5000);

    await cdp.send("Page.navigate", { url: `${baseUrl}/?provider=api` });
    await cdp.waitFor("Page.loadEventFired", 10000);
    await cdp.waitForFunction(`document.querySelectorAll("[data-history-id]").length === 1`, 5000);
    const sidebarState = await cdp.evaluate(`({
      hasProfile: Boolean(document.querySelector(".sidebar-profile")),
      hasSearchToggle: Boolean(document.querySelector("#historySearchToggle")),
      hasLibraryText: document.body.innerText.includes("ChatImage 库")
    })`);
    assert.strictEqual(sidebarState.hasProfile, false);
    assert.strictEqual(sidebarState.hasSearchToggle, true);
    assert.strictEqual(sidebarState.hasLibraryText, false);
    const historyTitle = await cdp.evaluate(`document.querySelector("[data-history-id] .history-item-title").textContent`);
    assert.strictEqual(historyTitle, "历史恢复测试");
    await cdp.evaluate(`{
      document.querySelector("#historySearchToggle").click();
      const input = document.querySelector("#historySearchInput");
      input.value = "no matching chat";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }`);
    await cdp.waitForFunction(`document.querySelectorAll("[data-history-id]").length === 0`, 3000);
    const emptySearchText = await cdp.evaluate(`document.querySelector("#historyList").textContent`);
    assert.match(emptySearchText, /没有匹配的对话/);
    await cdp.evaluate(`{
      document.querySelector("#historySearchClear").click();
      const input = document.querySelector("#historySearchInput");
      input.value = ${JSON.stringify(historyTitle.slice(0, 2))};
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }`);
    await cdp.waitForFunction(`document.querySelectorAll("[data-history-id]").length === 1`, 3000);
    await cdp.evaluate(`
      const button = document.querySelector("[data-history-pin]");
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    `);
    await cdp.waitForFunction(
      `document.querySelector("[data-history-pin]") &&
       document.querySelector("[data-history-pin]").dataset.historyPinned === "true"`,
      5000
    );
    const pinState = await cdp.evaluate(`({
      hasError: Boolean(document.querySelector("[data-history-error]")),
      pinned: document.querySelector("[data-history-pin]").dataset.historyPinned,
      activeTitle: document.querySelector(".result-header h2") && document.querySelector(".result-header h2").textContent
    })`);
    assert.strictEqual(pinState.hasError, false);
    assert.strictEqual(pinState.pinned, "true");
    await cdp.evaluate(`document.querySelector("[data-history-id]").click()`);
    await cdp.waitForFunction(`document.querySelectorAll("[data-hotspot-id]").length === 3`, 5000);
    const restoredHotspotStyle = await cdp.evaluate(`document.querySelector("[data-hotspot-id='module_1']").getAttribute("style")`);
    const restoredBounds = parseInlineStyleBounds(restoredHotspotStyle);
    assert.strictEqual(restoredBounds.left, 12);
    assert.strictEqual(restoredBounds.width, 20);
    assert.ok(restoredBounds.height >= 25);
    assert.ok(Math.abs(restoredBounds.top + restoredBounds.height / 2 - 42.5) < 0.5);
    const restoredTitle = await cdp.evaluate(`document.querySelector(".result-header h2").textContent`);
    assert.strictEqual(restoredTitle, "历史恢复测试");
    const restoredDebug = await cdp.evaluate(`document.querySelector(".debug-panel").innerText`);
    assert.match(restoredDebug, /生图提示词/);
    assert.match(restoredDebug, /质量检查/);
    assert.match(restoredDebug, /6 项检查全部通过/);
    assert.match(restoredDebug, /视觉对齐/);
    assert.match(restoredDebug, /manual-calibration/);
    const qualityRetryExists = await cdp.evaluate(`Boolean(document.querySelector("[data-retry-quality]"))`);
    assert.strictEqual(qualityRetryExists, false);

    await cdp.evaluate(`document.querySelector("[data-hotspot-id]").click()`);
    await cdp.waitForFunction(
      `document.querySelector(".message.user") && document.querySelector(".message.user").textContent.includes("恢复后还能看到")`,
      5000
    );
    await cdp.evaluate(`document.querySelector("#newConversationButton").click()`);
    await cdp.waitForFunction(
      `document.querySelector(".empty-state") &&
       document.querySelectorAll("[data-hotspot-id]").length === 0 &&
       document.querySelectorAll("[data-history-id]").length === 1`,
      5000
    );
    const newConversationState = await cdp.evaluate(`({
      activeHistoryCount: document.querySelectorAll(".history-item.is-active").length,
      focused: document.activeElement && document.activeElement.id,
      status: document.querySelector("#statusPill").textContent,
      inputValue: document.querySelector("#questionInput").value
    })`);
    assert.strictEqual(newConversationState.activeHistoryCount, 0);
    assert.strictEqual(newConversationState.focused, "questionInput");
    assert.strictEqual(newConversationState.status, "新对话");
    assert.strictEqual(newConversationState.inputValue, "");
    await cdp.close();
  } finally {
    await stopProcess(chrome);
    await close(app);
    await close(upstream);
    store.close();
    await rmWithRetry(profileDir);
  }

  console.log("browser-history.test.js passed");
}

function createFakeUpstream() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/chat" && req.method === "POST") {
      const body = new URLSearchParams(await readBody(req));
      const purpose = body.get("purpose");
      if (purpose === "answer_structure") {
        return sendJson(res, 200, {
          data: {
            content: JSON.stringify({
              rawAnswer:
                "\u4fdd\u5b58\u540e\u7684 ChatImage \u7ed3\u679c\u9700\u8981\u80fd\u5b8c\u6574\u6062\u590d\uff1a\u9996\u5148\u4fdd\u7559\u539f\u59cb\u56de\u7b54\u3001\u7ed3\u6784\u5316\u6a21\u5757\u3001\u56fe\u7247\u5730\u5740\u3001\u5e03\u5c40\u533a\u57df\u548c\u70ed\u70b9\u5750\u6807\uff0c\u8fd9\u6837\u5386\u53f2\u6253\u5f00\u65f6\u624d\u80fd\u91cd\u5efa\u4ea4\u4e92\u56fe\u7247\u3002\u5176\u6b21\u8981\u4fdd\u7559\u6bcf\u4e2a\u70ed\u70b9\u7684\u8be6\u60c5\u6587\u672c\u548c\u5df2\u6709\u8ffd\u95ee thread\uff0c\u5426\u5219\u7528\u6237\u70b9\u51fb\u5386\u53f2\u533a\u57df\u540e\u53ea\u80fd\u770b\u56fe\uff0c\u4e0d\u80fd\u7ee7\u7eed\u67e5\u770b\u4e0a\u4e0b\u6587\u3002\u6700\u540e\uff0c\u6062\u590d\u540e\u7684\u70ed\u70b9\u5e94\u8be5\u4fdd\u6301\u900f\u660e\u3001\u53ef\u70b9\u51fb\u3001\u53ef\u6821\u51c6\uff0c\u5e76\u4e14\u4e0e\u4fdd\u5b58\u524d\u7684\u5750\u6807\u4fdd\u6301\u4e00\u81f4\u3002\u8fd9\u4e2a\u6d4b\u8bd5\u8fd8\u8981\u9a8c\u8bc1\u641c\u7d22\u5386\u53f2\u3001\u65b0\u5bf9\u8bdd\u548c\u8ffd\u95ee\u4fdd\u5b58\u90fd\u4e0d\u4f1a\u7834\u574f\u5df2\u751f\u6210\u7684\u4ea4\u4e92\u56fe\u3002",
              visualSpec: createVisualSpec()
            })
          }
        });
      }
      if (purpose === "structure") {
        return sendJson(res, 200, {
          data: {
            content: JSON.stringify({
              title: "历史恢复测试",
              summary: "验证保存后的 ChatImage 能恢复交互。",
              relationType: "grid",
              modules: [
                {
                  title: "保存结果",
                  imageText: "完整保存图片数据",
                  detail: "保存原始回答、布局、热点和生图提示词。",
                  sourceExcerpt: "保存原始回答",
                  iconHint: "data"
                },
                {
                  title: "恢复热点",
                  imageText: "点击历史恢复热点",
                  detail: "恢复后热点区域仍然可以打开详情抽屉。",
                  sourceExcerpt: "恢复热点",
                  iconHint: "target"
                },
                {
                  title: "保留追问",
                  imageText: "保留区域追问消息",
                  detail: "热点 thread 会随历史结果一起返回。",
                  sourceExcerpt: "保留追问",
                  iconHint: "thread"
                }
              ]
            })
          }
        });
      }
      if (purpose === "hotspot_followup") {
        return sendJson(res, 200, { data: { content: "这条回答来自 fake upstream，并会被保存到 hotspot thread。" } });
      }
      return sendJson(res, 200, { data: { content: "这是一段用于历史恢复测试的原始回答。" } });
    }

    if (url.pathname === "/vision" && req.method === "POST") {
      return sendJson(res, 200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                modules: [
                  { moduleId: "module_1", label: "保存结果", bounds: { x: 0.1, y: 0.3, width: 0.2, height: 0.25 }, confidence: 0.9 },
                  { moduleId: "module_2", label: "恢复热点", bounds: { x: 0.4, y: 0.3, width: 0.2, height: 0.25 }, confidence: 0.9 },
                  { moduleId: "module_3", label: "保留追问", bounds: { x: 0.7, y: 0.3, width: 0.2, height: 0.25 }, confidence: 0.9 }
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
            "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221600%22%20height%3D%22900%22%3E%3Crect%20width%3D%221600%22%20height%3D%22900%22%20fill%3D%22white%22%2F%3E%3Ctext%20x%3D%22100%22%20y%3D%22100%22%3EHistory%3C%2Ftext%3E%3C%2Fsvg%3E"
        }
      });
    }

    return sendJson(res, 404, { error: "not found" });
  });
}

function createVisualSpec() {
  return {
    title: "历史恢复测试",
    summary: "Saved ChatImage results should restore interactive hotspots.",
    relationType: "grid",
    modules: [
      {
        title: "保存结果",
        imageText: "Save result",
        detail:
          "The saved result keeps the raw answer, structured visual spec, layout regions, hotspot bounds, image URL, and image prompt together so the browser can rebuild the exact interactive image after a reload.",
        sourceExcerpt: "save result",
        iconHint: "data"
      },
      {
        title: "恢复热点",
        imageText: "Restore hotspots",
        detail:
          "Restored hotspots must remain clickable and transparent, and clicking one should reopen the same detail panel content that was available before the result was saved to history.",
        sourceExcerpt: "restore hotspots",
        iconHint: "target"
      },
      {
        title: "保留追问",
        imageText: "Keep thread",
        detail:
          "Hotspot follow-up threads are restored with the saved result, so user and assistant messages remain attached to the correct region instead of being lost or mixed with another hotspot.",
        sourceExcerpt: "keep thread",
        iconHint: "thread"
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

function parseInlineStyleBounds(value) {
  const map = {};
  String(value || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const [key, raw] = item.split(":");
      map[key] = Number.parseFloat(raw);
    });
  return {
    left: map.left,
    top: map.top,
    width: map.width,
    height: map.height
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
