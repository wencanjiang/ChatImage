"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createServer } = require("../server");
const { createRealInstanceServerConfig } = require("./real-browser-instance");

const DEFAULT_QUESTIONS = [
  "解释一下大模型 Agent 的工作流程，重点说明感知、规划、记忆、工具调用和反馈迭代之间的关系。",
  "对比 REST 和 GraphQL 的设计差异、优缺点和适用场景。",
  "梳理一次 HTTP 请求从输入网址到页面渲染的完整过程。"
];

async function main() {
  const provider = process.env.CHATIMAGE_QUALITY_PROVIDER || "api";
  const apiKey = process.env.CHATIMAGE_API_KEY || process.env.WUYIN_API_KEY;
  if (provider !== "mock" && !apiKey) {
    console.log("real-quality-samples.js skipped: CHATIMAGE_API_KEY is not set");
    return;
  }

  const browserPath = findBrowser();
  if (!browserPath) {
    console.log("real-quality-samples.js skipped: Chrome or Edge was not found");
    return;
  }

  const questions = selectQuestions(process.env);
  const artifactDir = path.join(process.cwd(), "tmp", "quality-samples");
  fs.mkdirSync(artifactDir, { recursive: true });

  const app = createServer(createRealInstanceServerConfig(apiKey || "", process.env));
  await listen(app);

  let browser = null;
  let profileDir = "";
  let stderr = "";
  const samples = [];

  try {
    const appBase = `http://127.0.0.1:${app.address().port}`;
    const config = await fetchJson(`${appBase}/api/config`);
    if (provider !== "mock") {
      assert.strictEqual(config.realApiAvailable, true);
    }

    const debugPort = await getFreePort();
    profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-quality-"));
    browser = spawn(browserPath, [
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
    browser.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const wsUrl = await waitForWebSocketUrl(debugPort, () => stderr);
    const cdp = await connectCdp(wsUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 980,
      deviceScaleFactor: 1,
      mobile: false
    });

    for (const [index, question] of questions.entries()) {
      const sampleId = `sample-${String(index + 1).padStart(2, "0")}`;
      await cdp.send("Page.navigate", { url: `${appBase}/?provider=${encodeURIComponent(provider)}` });
      await cdp.waitFor("Page.loadEventFired", 10000);
      await cdp.evaluate(`
        document.querySelector("#questionInput").value = ${JSON.stringify(question)};
        document.querySelector("#questionForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      `);
      await cdp.waitForFunction(
        `(
          document.querySelectorAll("[data-hotspot-id]").length >= 3 &&
          document.querySelector(".image-stage img") &&
          document.querySelector(".image-stage img").complete
        ) || (
          document.querySelector(".empty-state h1") &&
          document.querySelector(".empty-state h1").textContent.includes("生成失败")
        )`,
        getQualitySampleWaitMs(process.env)
      );

      const pageState = await cdp.evaluate(`
        (() => {
          const failed = Boolean(document.querySelector(".empty-state h1") && document.querySelector(".empty-state h1").textContent.includes("生成失败"));
          const img = document.querySelector(".image-stage img");
          const structuredText = Array.from(document.querySelectorAll(".debug-grid section")).find((section) => section.querySelector("h3") && section.querySelector("h3").textContent.includes("结构化"))?.querySelector("pre")?.textContent || "";
          const promptText = Array.from(document.querySelectorAll(".debug-grid section")).find((section) => section.querySelector("h3") && section.querySelector("h3").textContent.includes("生图提示词"))?.querySelector("pre")?.textContent || "";
          let structured = null;
          try { structured = JSON.parse(structuredText); } catch {}
          return {
            failed,
            title: document.querySelector(".result-header h2")?.textContent || "",
            summary: document.querySelector(".result-header p")?.textContent || "",
            hotspotCount: document.querySelectorAll("[data-hotspot-id]").length,
            imageComplete: Boolean(img && img.complete),
            naturalWidth: img ? img.naturalWidth : 0,
            naturalHeight: img ? img.naturalHeight : 0,
            visualComposition: structured && structured.visualComposition ? structured.visualComposition : null,
            imagePromptPreview: promptText.slice(0, 1800),
            pageText: document.body.innerText.slice(0, 1600)
          };
        })()
      `);

      const screenshotPath = path.join(artifactDir, `${sampleId}.png`);
      await saveScreenshot(cdp, screenshotPath);
      samples.push({
        id: sampleId,
        question,
        screenshotPath,
        ...pageState
      });
      console.log(`${sampleId}: ${pageState.failed ? "failed" : "ok"} / hotspots=${pageState.hotspotCount} / ${pageState.naturalWidth}x${pageState.naturalHeight}`);
    }

    await cdp.close();
  } finally {
    if (browser) await stopProcess(browser);
    await close(app);
    if (profileDir) await rmWithRetry(profileDir);
  }

  const reportPath = path.join(artifactDir, "quality-samples-report.json");
  fs.writeFileSync(reportPath, JSON.stringify({ createdAt: new Date().toISOString(), samples }, null, 2));
  console.log(`Quality sample report saved: ${reportPath}`);
}

function selectQuestions(env = process.env) {
  const requestedIndex = Number(env.CHATIMAGE_QUALITY_SAMPLE_INDEX || 0);
  if (Number.isInteger(requestedIndex) && requestedIndex >= 1 && requestedIndex <= DEFAULT_QUESTIONS.length) {
    return [DEFAULT_QUESTIONS[requestedIndex - 1]];
  }
  const limit = Math.max(1, Math.min(Number(env.CHATIMAGE_QUALITY_SAMPLE_LIMIT || 3), DEFAULT_QUESTIONS.length));
  return DEFAULT_QUESTIONS.slice(0, limit);
}

function findBrowser() {
  return [
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ].find((candidate) => fs.existsSync(candidate));
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

async function getFreePort() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const server = require("net").createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    if (!UNSAFE_FETCH_PORTS.has(port)) return port;
  }
  throw new Error("Could not allocate a browser-safe local port");
}

const UNSAFE_FETCH_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
  101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161,
  179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563,
  587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061,
  6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697, 10080
]);

async function fetchJson(url) {
  const response = await fetch(url);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `GET ${url} failed with ${response.status}`);
  return json;
}

async function waitForWebSocketUrl(port, getDebugOutput) {
  const listUrl = `http://127.0.0.1:${port}/json/list`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    try {
      const response = await fetch(listUrl);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl;
      }
    } catch {
      // Browser still starting.
    }
    if (Date.now() - startedAt > 2500) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
        if (response.ok) {
          const page = await response.json();
          if (page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
        }
      } catch {
        // Target creation endpoint is not always ready immediately.
      }
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for browser DevTools endpoint\n${getDebugOutput()}`);
}

function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let nextId = 1;
    const callbacks = new Map();
    const waiters = new Map();
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((methodResolve, methodReject) => {
            callbacks.set(id, { resolve: methodResolve, reject: methodReject });
          });
        },
        evaluate(expression) {
          return this.send("Runtime.evaluate", {
            expression,
            awaitPromise: true,
            returnByValue: true
          }).then((result) => {
            if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
            return result.result.value;
          });
        },
        waitFor(eventName, timeoutMs) {
          return waitForEvent(waiters, eventName, timeoutMs);
        },
        waitForFunction(expression, timeoutMs) {
          return waitForPredicate(this, expression, timeoutMs);
        },
        close() {
          socket.close();
        }
      });
    });
    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (payload.id && callbacks.has(payload.id)) {
        const callback = callbacks.get(payload.id);
        callbacks.delete(payload.id);
        if (payload.error) callback.reject(new Error(JSON.stringify(payload.error)));
        else callback.resolve(payload.result || {});
        return;
      }
      if (payload.method && waiters.has(payload.method)) {
        for (const waiter of waiters.get(payload.method)) waiter.resolve(payload.params || {});
        waiters.delete(payload.method);
      }
    });
    socket.addEventListener("error", reject);
  });
}

function waitForEvent(waiters, eventName, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${eventName}`)), timeoutMs);
    const list = waiters.get(eventName) || [];
    list.push({
      resolve(value) {
        clearTimeout(timeout);
        resolve(value);
      }
    });
    waiters.set(eventName, list);
  });
}

async function waitForPredicate(cdp, expression, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await cdp.evaluate(`Boolean(${expression})`);
    if (value) return;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for predicate: ${expression}`);
}

async function saveScreenshot(cdp, filePath) {
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true
  });
  fs.writeFileSync(filePath, Buffer.from(result.data, "base64"));
}

function getQualitySampleWaitMs(env = process.env) {
  if (String(env.CHATIMAGE_QUALITY_WAIT_MS || "").trim()) {
    return Number(env.CHATIMAGE_QUALITY_WAIT_MS);
  }
  return String(env.CHATIMAGE_VISION_MODE || "").trim() === "locateanything" ? 300000 : 120000;
}

function stopProcess(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", resolve);
    child.kill();
    setTimeout(resolve, 2000);
  });
}

async function rmWithRetry(targetPath) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 7) throw error;
      await sleep(250);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
