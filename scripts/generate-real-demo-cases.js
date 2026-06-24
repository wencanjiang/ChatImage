"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createConfig, createServer } = require("../server");
const {
  connectCdp,
  findChrome,
  getFreePort,
  rmWithRetry,
  saveScreenshot,
  stopProcess,
  waitForWebSocketUrl
} = require("../tests/browser.test");

const CASES = [
  {
    id: "west-lake-tour-map",
    category: "map",
    extraInstruction:
      "Do not draw numeric markers, numbered pins, circled callout numbers, a right-side scenic spot list, a legend column, a sidebar panel, or a ranked landscape arrangement. Keep the map as one coherent hand-drawn landscape artwork.",
    question:
      "手绘一张西湖游览导览图，画在一张完整旅游地图上，不要流程图，不要给每块区域画分割边框。图中自然呈现湖面、白堤断桥、苏堤春晓、三潭印月、雷峰塔、孤山、宝石山、曲院风荷、柳浪闻莺，点击不同地理区域后解释风貌和游览价值。"
  },
  {
    id: "campus-handdrawn-map",
    category: "map",
    question:
      "手绘一张大学校园导览地图，画在一张完整校园地图上，不要流程图，不要把每块区域预先分割出来。图中自然包含教学楼、图书馆、食堂、宿舍区、操场、校门和主路线，点击区域后解释用途、位置关系和校园风貌。"
  },
  {
    id: "future-museum-scene",
    category: "scene",
    question:
      "画一个未来博物馆的沉浸式插画场景，不要卡片式流程图，不要区域分割边框。用户可以点击核心展品、观众动线、导览机器人和沉浸式屏幕来了解细节；导览机器人旁边保留一个短标签“AI 个性化导览”。"
  },
  {
    id: "boutique-coffee-scene",
    category: "scene",
    question:
      "画一个精品咖啡店的温暖插画场景，不要流程图，不要预先分割区域。画面中自然呈现吧台、手冲区、烘豆机、点单顾客、靠窗座位和甜品展示柜，点击不同对象后解释它们在空间体验和运营中的作用。"
  },
  {
    id: "smart-home-living-room",
    category: "scene",
    question:
      "画一个智能家居客厅的插画场景，不要流程图，不要区域分割边框。画面中自然呈现智能音箱、灯光系统、窗帘、电视中控、安防摄像头和空气传感器，点击不同设备后解释功能和交互关系。"
  },
  {
    id: "oauth2-flow",
    category: "technical",
    question:
      "解释 OAuth 2.0 授权码登录流程，覆盖用户、客户端应用、授权服务器、资源服务器、授权码、Access Token、Refresh Token 和 scope。生成清晰的技术流程图，点击每个环节后解释它的职责和安全边界。"
  },
  {
    id: "ecommerce-funnel",
    category: "business",
    question:
      "为电商网站设计转化漏斗分析图，覆盖流量来源、商品详情页、加购、结算、支付成功和复购。生成清晰商业分析图，点击每个阶段后解释关键指标、流失原因和优化动作。"
  }
];

async function main() {
  const chromePath = findChrome();
  if (!chromePath) throw new Error("Chrome or Edge was not found");

  const outputDir = process.env.CHATIMAGE_REAL_DEMO_RUN_DIR || path.join(process.cwd(), "tmp", "real-demo-run");
  fs.mkdirSync(outputDir, { recursive: true });

  const serverConfig = createConfig({
    port: 0,
    apiRequestTimeoutMs: Number(process.env.CHATIMAGE_API_REQUEST_TIMEOUT_MS || 180000),
    imagePollAttempts: Number(process.env.CHATIMAGE_IMAGE_POLL_ATTEMPTS || 240),
    imagePollInitialDelayMs: Number(process.env.CHATIMAGE_IMAGE_POLL_INITIAL_DELAY_MS || 1200),
    imagePollDelayMs: Number(process.env.CHATIMAGE_IMAGE_POLL_DELAY_MS || 2000)
  });
  const server = createServer(serverConfig);
  await listen(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const browser = await launchBrowser(chromePath);
  const report = {
    createdAt: new Date().toISOString(),
    baseUrl,
    outputDir,
    config: {
      visionMode: serverConfig.visionMode,
      visionFallbackMode: serverConfig.visionFallbackMode,
      sam3Enabled: serverConfig.sam3Enabled,
      imageModel: serverConfig.imageModel,
      textModel: serverConfig.textModel
    },
    cases: []
  };

  try {
    const cdp = await connectBrowser(browser);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 980,
      deviceScaleFactor: 1,
      mobile: false
    });

    for (const testCase of selectCases()) {
      let caseReport;
      try {
        caseReport = await runCase(cdp, baseUrl, outputDir, testCase);
      } catch (error) {
        const caseDir = path.join(outputDir, testCase.id);
        fs.mkdirSync(caseDir, { recursive: true });
        const failureScreenshot = path.join(caseDir, "failure.png");
        await saveScreenshot(cdp, failureScreenshot).catch(() => {});
        caseReport = {
          id: testCase.id,
          category: testCase.category,
          question: testCase.question,
          status: "failed",
          error: error.message || String(error),
          screenshot: failureScreenshot
        };
      }
      report.cases.push(caseReport);
      fs.writeFileSync(path.join(outputDir, "real-demo-run-report.json"), JSON.stringify(report, null, 2), "utf8");
      console.log(`${testCase.id}: ${caseReport.status} ${caseReport.title} ${caseReport.chatImageId}`);
    }

    await cdp.close();
  } finally {
    await stopProcess(browser.process);
    await rmWithRetry(browser.profileDir);
    await close(server);
  }

  report.summary = summarize(report.cases);
  fs.writeFileSync(path.join(outputDir, "real-demo-run-report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(`Wrote ${path.relative(process.cwd(), path.join(outputDir, "real-demo-run-report.json"))}`);
}

function selectCases() {
  const selected = String(process.env.CHATIMAGE_REAL_DEMO_CASES || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!selected.length) return CASES;
  const selectedSet = new Set(selected);
  return CASES.filter((testCase) => selectedSet.has(testCase.id));
}

async function runCase(cdp, baseUrl, outputDir, testCase) {
  const caseDir = path.join(outputDir, testCase.id);
  fs.mkdirSync(caseDir, { recursive: true });
  const startedAt = Date.now();
  const question = [testCase.question, testCase.extraInstruction].filter(Boolean).join("\n\n");
  await cdp.send("Page.navigate", { url: `${baseUrl}/?provider=api&realDemoCase=${encodeURIComponent(testCase.id)}` });
  await cdp.waitFor("Page.loadEventFired", 10000);
  await cdp.evaluate(`
    (() => {
      const input = document.querySelector("#questionInput");
      input.value = ${JSON.stringify(question)};
      input.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector("#questionForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    })()
  `);
  await waitForResult(cdp, testCase.id);
  await cdp.waitForFunction(`document.querySelector(".image-stage img") && document.querySelector(".image-stage img").complete`, 30000);
  await saveScreenshot(cdp, path.join(caseDir, "page.png"));
  const state = await collectState(cdp);
  if (!state.chatImageId) {
    state.chatImageId = await findSavedResultId(baseUrl, question, startedAt);
  }
  fs.writeFileSync(path.join(caseDir, "page-state.json"), JSON.stringify(state, null, 2), "utf8");
  const result = await loadSavedResult(baseUrl, state.chatImageId);
  fs.writeFileSync(path.join(caseDir, "result.json"), JSON.stringify(result, null, 2), "utf8");

  return {
    id: testCase.id,
    category: testCase.category,
    question,
    status: state.failure ? "failed" : "generated",
    chatImageId: state.chatImageId,
    title: state.title,
    imageUrl: state.imageUrl,
    imageWidth: state.imageNaturalWidth,
    imageHeight: state.imageNaturalHeight,
    hotspotCount: state.hotspots.length,
    alignmentProvider: state.alignmentRaw.provider || "",
    sourceCounts: state.alignmentRaw.sourceCounts || {},
    screenshot: path.join(caseDir, "page.png"),
    resultPath: path.join(caseDir, "result.json")
  };
}

async function waitForResult(cdp, caseId) {
  await cdp.waitForFunction(
    `(() => {
      const image = document.querySelector(".image-stage img");
      const hotspots = document.querySelectorAll(".image-stage > [data-hotspot-id]");
      const failed = document.querySelector("#retryButton") || document.querySelector(".image-load-error");
      return Boolean(failed || (image && image.complete && image.naturalWidth > 0 && hotspots.length >= 3));
    })()`,
    Number(process.env.CHATIMAGE_REAL_DEMO_WAIT_MS || 480000)
  );
  const failure = await cdp.evaluate(`
    (() => {
      const failed = document.querySelector("#retryButton") || document.querySelector(".image-load-error");
      return failed ? document.body.innerText.slice(0, 3000) : "";
    })()
  `);
  if (failure) throw new Error(`${caseId} generation failed:\n${failure}`);
}

async function collectState(cdp) {
  return cdp.evaluate(`
    (() => {
      const pres = Array.from(document.querySelectorAll(".debug-grid pre")).map((node) => node.textContent || "");
      let layout = {};
      let alignmentRaw = {};
      try { layout = JSON.parse(pres[2] || "{}"); } catch {}
      try { alignmentRaw = JSON.parse(pres[5] || "{}"); } catch {}
      const imageNode = document.querySelector(".image-stage img");
      const hotspots = Array.from(document.querySelectorAll(".image-stage > [data-hotspot-id]")).map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          id: node.getAttribute("data-hotspot-id") || "",
          label: node.getAttribute("aria-label") || "",
          style: node.getAttribute("style") || "",
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        };
      });
      return {
        chatImageId: "",
        title: document.querySelector(".result-header h2")?.textContent || "",
        summary: document.querySelector(".result-header p")?.textContent || "",
        imageUrl: imageNode ? imageNode.src : "",
        imageNaturalWidth: imageNode ? imageNode.naturalWidth : 0,
        imageNaturalHeight: imageNode ? imageNode.naturalHeight : 0,
        layout,
        alignmentRaw,
        hotspots,
        failure: Boolean(document.querySelector("#retryButton") || document.querySelector(".image-load-error"))
      };
    })()
  `);
}

async function loadSavedResult(baseUrl, chatImageId) {
  if (!chatImageId) return null;
  const response = await fetch(`${baseUrl}/api/chatimages/${encodeURIComponent(chatImageId)}`);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `failed to load ${chatImageId}`);
  return json.result;
}

async function findSavedResultId(baseUrl, question, startedAt) {
  const response = await fetch(`${baseUrl}/api/chatimages`, { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || "failed to list saved chat images");
  const items = Array.isArray(json.items) ? json.items : [];
  const exact = items.find((item) => String(item.question || "").trim() === String(question || "").trim());
  if (exact && Date.parse(exact.updatedAt || exact.createdAt || "") >= startedAt - 5000) return exact.id;
  const recent = items.find((item) => Date.parse(item.updatedAt || item.createdAt || "") >= startedAt - 5000);
  if (recent) return recent.id;
  throw new Error("could not match generated ChatImage in history");
}

async function launchBrowser(chromePath) {
  const debugPort = await getFreePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-real-demo-"));
  const browserProcess = spawn(chromePath, [
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
  let stderr = "";
  browserProcess.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  return { process: browserProcess, profileDir, debugPort, getStderr: () => stderr };
}

async function connectBrowser(browser) {
  const wsUrl = await waitForWebSocketUrl(browser.debugPort, browser.getStderr);
  return connectCdp(wsUrl);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    if (!server || !server.listening) return resolve();
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function summarize(cases) {
  return {
    count: cases.length,
    generated: cases.filter((item) => item.status === "generated").length,
    failed: cases.filter((item) => item.status !== "generated").length,
    hotspotTotal: cases.reduce((sum, item) => sum + Number(item.hotspotCount || 0), 0)
  };
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
