"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createServer } = require("../server");
const { createHttpError, describeError } = require("./real-diagnostics");

async function main() {
  const options = createRealApiSmokeOptions(process.env);
  const { includeImage, includeText, includeVision } = options;
  const apiKey = process.env.CHATIMAGE_API_KEY || process.env.WUYIN_API_KEY || "";
  const textApiKey = process.env.CHATIMAGE_TEXT_API_KEY || apiKey;
  if ((includeImage || includeVision) && !apiKey) {
    console.log("real-api-smoke.js skipped: CHATIMAGE_API_KEY is not set for image/vision probing");
    return;
  }
  if (includeText && !textApiKey) {
    console.log("real-api-smoke.js skipped: CHATIMAGE_TEXT_API_KEY or CHATIMAGE_API_KEY is not set");
    return;
  }

  const artifactDir = path.join(process.cwd(), "tmp", "test-artifacts");
  fs.mkdirSync(artifactDir, { recursive: true });
  const diagnostic = {
    checkedAt: new Date().toISOString(),
    includeText,
    includeImage,
    includeVision,
    pollConfig: {
      attempts: Number(process.env.CHATIMAGE_IMAGE_POLL_ATTEMPTS || 90),
      initialDelayMs: Number(process.env.CHATIMAGE_IMAGE_POLL_INITIAL_DELAY_MS || 1200),
      delayMs: Number(process.env.CHATIMAGE_IMAGE_POLL_DELAY_MS || 2000)
    },
    text: null,
    image: null,
    vision: null,
    error: null
  };
  const server = createServer({
    port: 0,
    apiKey,
    textApiKey,
    textModel: process.env.CHATIMAGE_TEXT_MODEL || "mimo-v2.5-pro",
    imageModel: process.env.CHATIMAGE_IMAGE_MODEL || "GPT-Image-2",
    textEndpoint: resolveTextEndpoint(process.env),
    textRequestFormat: process.env.CHATIMAGE_TEXT_REQUEST_FORMAT || "openai-chat",
    textSystemPrompt: process.env.CHATIMAGE_TEXT_SYSTEM_PROMPT || "",
    textThinkingType: process.env.CHATIMAGE_TEXT_THINKING_TYPE || "disabled",
    imageEndpoint: "https://api.wuyinkeji.com/api/async/image_gpt",
    imageDetailEndpoint: "https://api.wuyinkeji.com/api/async/detail",
    visionMode: process.env.CHATIMAGE_VISION_MODE || "local-ocr",
    visionEndpoint: process.env.CHATIMAGE_VISION_ENDPOINT || "",
    visionApiKey: process.env.CHATIMAGE_VISION_API_KEY || "",
    visionModel: process.env.CHATIMAGE_VISION_MODEL || "",
    visionAuthMode: process.env.CHATIMAGE_VISION_AUTH_MODE || "bearer",
    visionRequestFormat: process.env.CHATIMAGE_VISION_REQUEST_FORMAT || "openai-chat",
    localOcrPython: process.env.CHATIMAGE_LOCAL_OCR_PYTHON || "python",
    localOcrWorkerPath: process.env.CHATIMAGE_LOCAL_OCR_WORKER || path.join(process.cwd(), "scripts", "local_ocr_worker.py"),
    localOcrTimeoutMs: Number(process.env.CHATIMAGE_LOCAL_OCR_TIMEOUT_MS || 30_000),
    localOcrMaxImageBytes: Number(process.env.CHATIMAGE_LOCAL_OCR_MAX_IMAGE_BYTES || 8 * 1024 * 1024),
    apiRequestTimeoutMs: Number(process.env.CHATIMAGE_API_REQUEST_TIMEOUT_MS || 45_000),
    imagePollAttempts: diagnostic.pollConfig.attempts,
    imagePollInitialDelayMs: diagnostic.pollConfig.initialDelayMs,
    imagePollDelayMs: diagnostic.pollConfig.delayMs
  });

  await listen(server);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const config = await fetchJson(`${baseUrl}/api/config`);
    assert.strictEqual(config.realApiAvailable, true);
    diagnostic.config = {
      realApiAvailable: Boolean(config.realApiAvailable),
      imageApiAvailable: Boolean(config.imageApiAvailable),
      visionApiAvailable: Boolean(config.visionApiAvailable),
      textModel: config.textModel || "",
      imageModel: config.imageModel || "",
      visionMode: config.visionMode || "",
      visionModel: config.visionModel || "",
      visionRequestFormat: config.visionRequestFormat || ""
    };
    console.log(`Vision API ${config.visionApiAvailable ? "configured" : "not configured"}`);

    if (includeText) {
      const textResult = await postJson(`${baseUrl}/api/llm`, {
        purpose: "smoke_test",
        content: "请用一句中文回复：ChatImage API 文本接口连通。",
        model: process.env.CHATIMAGE_TEXT_MODEL || "mimo-v2.5-pro"
      });
      assert.strictEqual(typeof textResult.content, "string");
      assert.ok(textResult.content.trim().length > 0);
      diagnostic.text = {
        ok: true,
        contentLength: textResult.content.trim().length,
        preview: textResult.content.slice(0, 80)
      };
      console.log(`Text API ok: ${textResult.content.slice(0, 80)}`);
    } else {
      diagnostic.text = { ok: false, skipped: true };
      console.log("Text API skipped. Set CHATIMAGE_TEST_TEXT=1 or omit CHATIMAGE_TEST_TEXT to include text probing.");
    }

    if (includeImage) {
      const imageResult = await postJson(`${baseUrl}/api/image`, {
        prompt: "生成一张简洁的信息图，标题为 ChatImage API Smoke Test，包含三个中文模块：文本、布局、热点。",
        size: "1600x900",
        model: null
      });
      assert.ok(imageResult.imageUrl);
      const imageArtifact = await downloadImageArtifact(imageResult.imageUrl, artifactDir);
      assert.deepStrictEqual(
        { width: imageResult.width, height: imageResult.height },
        imageArtifact.dimensions,
        "API image dimensions must match the downloaded image header"
      );
      diagnostic.image = {
        ok: true,
        imageUrl: imageResult.imageUrl,
        width: imageResult.width || null,
        height: imageResult.height || null,
        artifactPath: imageArtifact.filePath,
        byteLength: imageArtifact.byteLength,
        contentType: imageArtifact.contentType,
        detectedDimensions: imageArtifact.dimensions
      };
      console.log(`Image API ok: ${imageResult.imageUrl.slice(0, 120)}`);
      console.log(`Image artifact saved: ${imageArtifact.filePath} (${imageArtifact.byteLength} bytes)`);
    } else {
      diagnostic.image = { ok: false, skipped: true };
      console.log("Image API skipped. Set CHATIMAGE_TEST_IMAGE=1 to include image generation.");
    }

    if (includeVision) {
      const visionResult = await postJson(`${baseUrl}/api/vision/health`, {
        purpose: "vision_health_smoke",
        responseFormat: "json",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Fronalpstock_big.jpg/640px-Fronalpstock_big.jpg"
      });
      assert.strictEqual(visionResult.ok, true);
      assert.strictEqual(visionResult.parsed && visionResult.parsed.ok, true);
      assert.strictEqual(visionResult.parsed && visionResult.parsed.imageVisible, true);
      diagnostic.vision = {
        ok: true,
        parsed: visionResult.parsed,
        contentLength: String(visionResult.content || "").trim().length,
        preview: String(visionResult.content || "").slice(0, 120)
      };
      console.log(`Vision API health ok: ${String(visionResult.content || "").slice(0, 120)}`);
    } else {
      diagnostic.vision = { ok: false, skipped: true };
      console.log("Vision API skipped. Set CHATIMAGE_TEST_VISION=1 to include visual alignment probing.");
    }
    writeDiagnostic(artifactDir, diagnostic);
  } catch (error) {
    const details = describeError(error);
    diagnostic.error = {
      message: details.message,
      payload: details.payload,
      stage: inferFailureStage(diagnostic)
    };
    writeDiagnostic(artifactDir, diagnostic);
    throw error;
  } finally {
    await close(server);
  }
}

function resolveTextEndpoint(env = process.env) {
  if (env.CHATIMAGE_TEXT_ENDPOINT) return env.CHATIMAGE_TEXT_ENDPOINT;
  const baseUrl = String(env.CHATIMAGE_TEXT_BASE_URL || "https://api.xiaomimimo.com/v1").trim().replace(/\/+$/, "");
  return /\/chat\/completions$/i.test(baseUrl) ? baseUrl : `${baseUrl}/chat/completions`;
}

function inferFailureStage(diagnostic) {
  if (diagnostic.includeText !== false && (!diagnostic.text || diagnostic.text.ok !== true)) return "text";
  if (diagnostic.includeImage && (!diagnostic.image || diagnostic.image.ok !== true)) return "image";
  if (diagnostic.includeVision && (!diagnostic.vision || diagnostic.vision.ok !== true)) return "vision";
  return "unknown";
}

function createRealApiSmokeOptions(env = process.env) {
  return {
    includeText: env.CHATIMAGE_TEST_TEXT !== "0",
    includeImage: env.CHATIMAGE_TEST_IMAGE === "1",
    includeVision: env.CHATIMAGE_TEST_VISION === "1"
  };
}

async function downloadImageArtifact(imageUrl, artifactDir) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Image artifact download failed (${response.status}): ${imageUrl}`);
  }
  const contentType = response.headers.get("content-type") || "";
  assert.match(contentType, /^image\//i);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length > 10_000, `Image artifact is too small: ${bytes.length} bytes`);
  const extension = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "png";
  const filePath = path.join(artifactDir, `real-api-smoke-image.${extension}`);
  fs.writeFileSync(filePath, bytes);
  return {
    filePath,
    byteLength: bytes.length,
    contentType,
    dimensions: extension === "png" ? getPngDimensions(bytes) : null
  };
}

function getPngDimensions(bytes) {
  if (bytes.length < 24) return null;
  const signature = bytes.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") return null;
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

function writeDiagnostic(artifactDir, diagnostic) {
  fs.writeFileSync(
    path.join(artifactDir, "real-api-smoke-diagnostic.json"),
    JSON.stringify(diagnostic, null, 2)
  );
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

async function fetchJson(url) {
  const response = await fetch(url);
  const json = await response.json();
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

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  createRealApiSmokeOptions,
  inferFailureStage,
  resolveTextEndpoint
};
