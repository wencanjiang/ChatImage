"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createServer } = require("../server");
const { createHttpError, describeError } = require("./real-diagnostics");

async function main() {
  const apiKey = process.env.CHATIMAGE_API_KEY || process.env.WUYIN_API_KEY;
  if (!apiKey) {
    console.log("real-browser-instance.js skipped: CHATIMAGE_API_KEY is not set");
    return;
  }

  const artifactDir = path.join(process.cwd(), "tmp", "test-artifacts");
  fs.mkdirSync(artifactDir, { recursive: true });

  const browserPath = findBrowser();
  if (!browserPath) {
    console.log("real-browser-instance.js skipped: Chrome or Edge was not found");
    return;
  }

  const app = createServer(createRealInstanceServerConfig(apiKey, process.env));
  await listen(app);

  let browser = null;
  let profileDir = "";
  let stderr = "";

  try {
    const appBase = `http://127.0.0.1:${app.address().port}`;
    await assertRealInstanceReadiness(appBase, artifactDir);
    const debugPort = await getFreePort();
    profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-real-browser-"));
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
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false
    });
    await cdp.send("Page.navigate", { url: `${appBase}/?provider=api` });
    await cdp.waitFor("Page.loadEventFired", 10000);
    await cdp.evaluate(`
      document.querySelector("#questionInput").value = "介绍一下浙江大学校长";
      document.querySelector("#questionForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    `);

    try {
      await cdp.waitForFunction(
        `(
          document.querySelectorAll("[data-hotspot-id]").length >= 3 &&
          document.querySelectorAll(".module-label").length === 0 &&
          document.querySelector(".image-stage img")
        ) || (
          document.querySelector(".empty-state h1") &&
          document.querySelector(".empty-state h1").textContent.includes("生成失败")
        )`,
        getRealInstanceWaitMs(process.env)
      );
      const completed = await cdp.evaluate(`
        Boolean(
          document.querySelectorAll("[data-hotspot-id]").length >= 3 &&
          document.querySelectorAll(".module-label").length === 0 &&
          document.querySelector(".image-stage img")
        )
      `);
      if (!completed) {
        await saveScreenshot(cdp, path.join(artifactDir, "real-zju-president-failure.png"));
        const bodyText = await cdp.evaluate(`document.body.innerText`);
        throw new Error(`Real instance did not complete\nPage text:\n${String(bodyText).slice(0, 2000)}`);
      }
    } catch (error) {
      await saveScreenshot(cdp, path.join(artifactDir, "real-zju-president-failure.png"));
      const bodyText = await cdp.evaluate(`document.body.innerText`);
      throw new Error(`${error.message}\nPage text:\n${String(bodyText).slice(0, 2000)}`);
    }
    await cdp.waitForFunction(`document.querySelector(".image-stage img").complete`, 30000);
    const pageText = await cdp.evaluate(`document.body.innerText`);
    assert.doesNotMatch(pageText, /目标识别/);
    assert.doesNotMatch(pageText, /已核验时效信息/);
    const hotspotVisualState = await cdp.evaluate(`
      Array.from(document.querySelectorAll("[data-hotspot-id]")).map((node) => {
        const style = getComputedStyle(node);
        return {
          borderWidth: style.borderTopWidth,
          background: style.backgroundColor,
          pseudoContent: getComputedStyle(node, "::after").content
        };
      })
    `);
    assert.ok(hotspotVisualState.length >= 3);
    for (const item of hotspotVisualState) {
      assert.strictEqual(item.borderWidth, "0px");
      assert.strictEqual(item.background, "rgba(0, 0, 0, 0)");
      assert.strictEqual(item.pseudoContent, "none");
    }
    const stageImageDelta = await cdp.evaluate(`
      const stageNode = document.querySelector(".image-stage");
      const stage = stageNode.getBoundingClientRect();
      const image = document.querySelector(".image-stage img").getBoundingClientRect();
      ({
        width: Math.abs(stageNode.clientWidth - image.width),
        height: Math.abs(stageNode.clientHeight - image.height),
        left: Math.abs(stage.left + stageNode.clientLeft - image.left),
        top: Math.abs(stage.top + stageNode.clientTop - image.top)
      })
    `);
    assert.ok(stageImageDelta.width < 1);
    assert.ok(stageImageDelta.height < 1);
    assert.ok(stageImageDelta.left < 1);
    assert.ok(stageImageDelta.top < 1);
    const hotspotRectDelta = await cdp.evaluate(`
      (() => {
        const stageNode = document.querySelector(".image-stage");
        const stage = stageNode.getBoundingClientRect();
        const originLeft = stage.left + stageNode.clientLeft;
        const originTop = stage.top + stageNode.clientTop;
        return Math.max(
          ...Array.from(document.querySelectorAll(".image-stage > [data-hotspot-id]")).flatMap((node) => {
            const rect = node.getBoundingClientRect();
            const left = parseFloat(node.style.left) / 100;
            const top = parseFloat(node.style.top) / 100;
            const width = parseFloat(node.style.width) / 100;
            const height = parseFloat(node.style.height) / 100;
            return [
              Math.abs(rect.left - (originLeft + left * stageNode.clientWidth)),
              Math.abs(rect.top - (originTop + top * stageNode.clientHeight)),
              Math.abs(rect.width - width * stageNode.clientWidth),
              Math.abs(rect.height - height * stageNode.clientHeight)
            ];
          })
        );
      })()
    `);
    assert.ok(hotspotRectDelta < 1, `hotspot rects drifted from normalized bounds by ${hotspotRectDelta}px`);
    await saveScreenshot(cdp, path.join(artifactDir, "real-zju-president.png"));
    await cdp.close();
  } finally {
    if (browser) await stopProcess(browser);
    await close(app);
    if (profileDir) await rmWithRetry(profileDir);
  }

  console.log("real-browser-instance.js passed");
}

function getRealInstanceWaitMs(env = process.env) {
  if (String(env.CHATIMAGE_REAL_INSTANCE_WAIT_MS || "").trim()) {
    return Number(env.CHATIMAGE_REAL_INSTANCE_WAIT_MS);
  }
  return String(env.CHATIMAGE_VISION_MODE || "").trim() === "locateanything" ? 300000 : 90000;
}

async function assertRealInstanceReadiness(appBase, artifactDir) {
  const config = await fetchJson(`${appBase}/api/config`);
  const diagnostic = {
    checkedAt: new Date().toISOString(),
    realApiAvailable: Boolean(config.realApiAvailable),
    visionApiAvailable: Boolean(config.visionApiAvailable),
    imageApiAvailable: Boolean(config.imageApiAvailable),
    textModel: config.textModel || "",
    imageModel: config.imageModel || "",
    visionMode: config.visionMode || "",
    visionModel: config.visionModel || "",
    visionRequestFormat: config.visionRequestFormat || ""
  };
  if (!config.realApiAvailable) {
    writeDiagnostic(artifactDir, {
      ...diagnostic,
      status: "fail",
      reason: "missing_real_api",
      reasons: ["missing_real_api"]
    });
    throw new Error("Real instance requires CHATIMAGE_API_KEY before running browser generation.");
  }

  diagnostic.textHealth = await checkTextHealth(appBase, config.textModel || "gemini-3.1-pro");
  const reasons = [];
  if (!config.visionApiAvailable) reasons.push("missing_vision_api");
  if (!diagnostic.textHealth.ok) reasons.push("text_health_failed");

  if (reasons.length) {
    writeDiagnostic(artifactDir, {
      ...diagnostic,
      status: "fail",
      reason: reasons[0],
      reasons,
      requiredEnv: ["CHATIMAGE_API_KEY", "optional CHATIMAGE_VISION_ENDPOINT for non-default vision providers"],
      contractDoc: "docs/vision-endpoint-contract.md",
      nextChecks: [
        "Confirm CHATIMAGE_API_KEY can call the text endpoint.",
        "If local OCR is unavailable, install PaddleOCR/OpenCV or configure a remote CHATIMAGE_VISION_ENDPOINT.",
        "Run: $env:CHATIMAGE_TEST_VISION=\"1\"; npm.cmd run test:api",
        "Run: npm.cmd run test:real-instance"
      ]
    });
    throw new Error(
      `Real instance readiness failed before browser generation: ${reasons.join(", ")}.`
    );
  }

  try {
    const health = await postJson(`${appBase}/api/vision/health`, {
      purpose: "real_instance_preflight",
      responseFormat: "json"
    });
    writeDiagnostic(artifactDir, {
      ...diagnostic,
      status: "ok",
      visionHealth: {
        ok: Boolean(health.ok),
        parsed: health.parsed || null
      }
    });
  } catch (error) {
    const details = describeError(error);
    writeDiagnostic(artifactDir, {
      ...diagnostic,
      status: "fail",
      reason: "vision_health_failed",
      error: details.message,
      payload: details.payload
    });
    throw new Error(`Real instance vision preflight failed: ${details.message}`);
  }
}

async function checkTextHealth(appBase, textModel) {
  try {
    const result = await postJson(`${appBase}/api/llm/health`, {
      purpose: "real_instance_text_preflight",
      content: "Reply with OK for ChatImage real instance preflight.",
      model: textModel
    });
    return {
      ok: Boolean(result.ok),
      contentLength: String(result.content || "").trim().length,
      preview: String(result.content || "").slice(0, 120)
    };
  } catch (error) {
    const details = describeError(error);
    return {
      ok: false,
      error: details.message,
      payload: details.payload
    };
  }
}

function writeDiagnostic(artifactDir, value) {
  fs.writeFileSync(
    path.join(artifactDir, "real-instance-diagnostic.json"),
    JSON.stringify(value, null, 2)
  );
}

function findBrowser() {
  return [
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ].find((candidate) => fs.existsSync(candidate));
}

function createRealInstanceServerConfig(apiKey, env = process.env) {
  const textBaseUrl = String(env.CHATIMAGE_TEXT_BASE_URL || "").trim().replace(/\/+$/, "");
  const defaultLocateAnythingPython = env.USERPROFILE
    ? path.join(env.USERPROFILE, "miniconda3", "envs", "chatimage", "python.exe")
    : "python";
  return {
    port: 0,
    apiKey,
    textApiKey: env.CHATIMAGE_TEXT_API_KEY || apiKey,
    textModel: env.CHATIMAGE_TEXT_MODEL || "mimo-v2.5-pro",
    imageModel: env.CHATIMAGE_IMAGE_MODEL || "GPT-Image-2",
    textEndpoint:
      env.CHATIMAGE_TEXT_ENDPOINT ||
      (textBaseUrl ? `${textBaseUrl}/chat/completions` : "https://api.xiaomimimo.com/v1/chat/completions"),
    textRequestFormat: env.CHATIMAGE_TEXT_REQUEST_FORMAT || "openai-chat",
    textSystemPrompt: env.CHATIMAGE_TEXT_SYSTEM_PROMPT || "",
    textThinkingType: env.CHATIMAGE_TEXT_THINKING_TYPE || "disabled",
    imageEndpoint: "https://api.wuyinkeji.com/api/async/image_gpt",
    imageDetailEndpoint: "https://api.wuyinkeji.com/api/async/detail",
    visionMode: env.CHATIMAGE_VISION_MODE || "local-ocr",
    visionEndpoint: env.CHATIMAGE_VISION_ENDPOINT || "",
    visionApiKey: env.CHATIMAGE_VISION_API_KEY || "",
    visionModel: env.CHATIMAGE_VISION_MODEL || "",
    visionAuthMode: env.CHATIMAGE_VISION_AUTH_MODE || "bearer",
    visionRequestFormat: env.CHATIMAGE_VISION_REQUEST_FORMAT || "openai-chat",
    localOcrPython: env.CHATIMAGE_LOCAL_OCR_PYTHON || "python",
    localOcrWorkerPath: env.CHATIMAGE_LOCAL_OCR_WORKER || path.join(process.cwd(), "scripts", "local_ocr_worker.py"),
    localOcrTimeoutMs: Number(env.CHATIMAGE_LOCAL_OCR_TIMEOUT_MS || 30_000),
    localOcrMaxImageBytes: Number(env.CHATIMAGE_LOCAL_OCR_MAX_IMAGE_BYTES || 8 * 1024 * 1024),
    locateAnythingPython: env.CHATIMAGE_LOCATEANYTHING_PYTHON || defaultLocateAnythingPython,
    locateAnythingWorkerPath: env.CHATIMAGE_LOCATEANYTHING_WORKER || path.join(process.cwd(), "scripts", "locateanything_worker.py"),
    locateAnythingModel: env.CHATIMAGE_LOCATEANYTHING_MODEL || "nvidia/LocateAnything-3B",
    locateAnythingDevice: env.CHATIMAGE_LOCATEANYTHING_DEVICE || "cuda",
    locateAnythingTimeoutMs: Number(env.CHATIMAGE_LOCATEANYTHING_TIMEOUT_MS || 120_000),
    locateAnythingMaxNewTokens: parseOptionalPositiveInteger(env.CHATIMAGE_LOCATEANYTHING_MAX_NEW_TOKENS),
    locateAnythingMaxImageSide: Number(env.CHATIMAGE_LOCATEANYTHING_MAX_IMAGE_SIDE || 960),
    locateAnythingGenerationMode: env.CHATIMAGE_LOCATEANYTHING_GENERATION_MODE || "hybrid",
    locateAnythingLicenseAck: env.CHATIMAGE_LOCATEANYTHING_LICENSE_ACK || "",
    apiRequestTimeoutMs: Number(env.CHATIMAGE_API_REQUEST_TIMEOUT_MS || 120_000),
    imagePollAttempts: Number(env.CHATIMAGE_IMAGE_POLL_ATTEMPTS || 90),
    imagePollInitialDelayMs: Number(env.CHATIMAGE_IMAGE_POLL_INITIAL_DELAY_MS || 1200),
    imagePollDelayMs: Number(env.CHATIMAGE_IMAGE_POLL_DELAY_MS || 2000)
  };
}

function parseOptionalPositiveInteger(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    if (!server || !server.listening) {
      resolve();
      return;
    }
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

async function waitForWebSocketUrl(port, getDebugOutput) {
  const listUrl = `http://127.0.0.1:${port}/json/list`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    try {
      const response = await fetch(listUrl);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl;
      }
    } catch {
      // Browser is still starting.
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

async function fetchJson(url) {
  const response = await fetch(url);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw createHttpError(json, `GET ${url} failed with ${response.status}`);
  return json;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw createHttpError(json, `POST ${url} failed with ${response.status}`);
  return json;
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

module.exports = {
  createRealInstanceServerConfig
};
