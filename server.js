"use strict";

const http = require("http");
const path = require("path");
const { handleChatImagesRoute } = require("./server/routes/chatimages");
const { handleConfigRoute } = require("./server/routes/config");
const { handleImageRoute } = require("./server/routes/image");
const { handleLlmRoute } = require("./server/routes/llm");
const { handleVisionRoute } = require("./server/routes/vision");
const { createConcurrencyGate } = require("./server/concurrency");
const { runLocalOcrAlignment, runLocalOcrHealth } = require("./server/local-ocr");
const {
  runLocateAnythingAlignmentWithFallback,
  runLocateAnythingHealth,
  runLocateAnythingPreload
} = require("./server/locateanything");
const {
  loadEnvFile,
  readJson,
  requireApiKey,
  sendJson,
  serveStatic
} = require("./server/http");
const {
  callImageApi,
  callTextApi,
  callVisionApi,
  extractImageUrl,
  extractTaskId,
  extractTextContent,
  formatApiError,
  isApiErrorPayload,
  parseImageBufferDimensions
} = require("./server/providers");
const { createStore } = require("./server/store");

const rootDir = __dirname;
loadEnvFile(path.join(rootDir, ".env"));
loadEnvFile(path.join(rootDir, ".env.local"));
const WUYIN_TEXT_ENDPOINT = "https://api.wuyinkeji.com/api/chat/index";
const MIMO_TEXT_ENDPOINT = "https://api.xiaomimimo.com/v1/chat/completions";
const DEFAULT_TEXT_SYSTEM_PROMPT =
  "你是 ChatImage 的文本与结构化生成引擎。直接输出最终结果，不要展示推理过程、分析草稿或思考步骤；当用户要求 JSON 时，只输出可解析 JSON。";
const WUYIN_IMAGE_ENDPOINT = "https://api.wuyinkeji.com/api/async/image_gpt";
const WUYIN_IMAGE_DETAIL_ENDPOINT = "https://api.wuyinkeji.com/api/async/detail";

const config = createConfig();

function createConfig(overrides = {}) {
  const textBaseUrl = process.env.CHATIMAGE_TEXT_BASE_URL || "";
  const defaultLocateAnythingPython = process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, "miniconda3", "envs", "chatimage", "python.exe")
    : "python";
  return {
    port: Number(process.env.CHATIMAGE_PORT || process.env.PORT || 5178),
    apiKey: process.env.CHATIMAGE_API_KEY || process.env.WUYIN_API_KEY || "",
    textApiKey: process.env.CHATIMAGE_TEXT_API_KEY || process.env.CHATIMAGE_API_KEY || process.env.WUYIN_API_KEY || "",
    textModel: process.env.CHATIMAGE_TEXT_MODEL || "mimo-v2.5-pro",
    textEndpoint: process.env.CHATIMAGE_TEXT_ENDPOINT || buildOpenAiChatEndpoint(textBaseUrl) || MIMO_TEXT_ENDPOINT,
    textRequestFormat:
      process.env.CHATIMAGE_TEXT_REQUEST_FORMAT ||
      resolveDefaultTextRequestFormat(process.env.CHATIMAGE_TEXT_ENDPOINT || textBaseUrl || MIMO_TEXT_ENDPOINT),
    textSystemPrompt: process.env.CHATIMAGE_TEXT_SYSTEM_PROMPT || DEFAULT_TEXT_SYSTEM_PROMPT,
    textMaxCompletionTokens: Number(process.env.CHATIMAGE_TEXT_MAX_COMPLETION_TOKENS || 4096),
    textTemperature: Number(process.env.CHATIMAGE_TEXT_TEMPERATURE || 1.0),
    textTopP: Number(process.env.CHATIMAGE_TEXT_TOP_P || 0.95),
    textJsonResponseFormat: process.env.CHATIMAGE_TEXT_JSON_RESPONSE_FORMAT || "prompt",
    textThinkingType: process.env.CHATIMAGE_TEXT_THINKING_TYPE || "disabled",
    imageModel: process.env.CHATIMAGE_IMAGE_MODEL || "GPT-Image-2",
    visionModel: process.env.CHATIMAGE_VISION_MODEL || "",
    visionEndpoint: process.env.CHATIMAGE_VISION_ENDPOINT || WUYIN_TEXT_ENDPOINT,
    visionApiKey: process.env.CHATIMAGE_VISION_API_KEY || "",
    visionAuthMode: process.env.CHATIMAGE_VISION_AUTH_MODE || "bearer",
    visionMode: process.env.CHATIMAGE_VISION_MODE || "local-ocr",
    visionRequestFormat: process.env.CHATIMAGE_VISION_REQUEST_FORMAT || "openai-chat",
    localOcrPython: process.env.CHATIMAGE_LOCAL_OCR_PYTHON || "python",
    localOcrWorkerPath: process.env.CHATIMAGE_LOCAL_OCR_WORKER || path.join(rootDir, "scripts", "local_ocr_worker.py"),
    localOcrTimeoutMs: Number(process.env.CHATIMAGE_LOCAL_OCR_TIMEOUT_MS || 30_000),
    localOcrMaxImageBytes: Number(process.env.CHATIMAGE_LOCAL_OCR_MAX_IMAGE_BYTES || 8 * 1024 * 1024),
    locateAnythingPython: process.env.CHATIMAGE_LOCATEANYTHING_PYTHON || defaultLocateAnythingPython,
    locateAnythingWorkerPath:
      process.env.CHATIMAGE_LOCATEANYTHING_WORKER || path.join(rootDir, "scripts", "locateanything_worker.py"),
    locateAnythingModel: process.env.CHATIMAGE_LOCATEANYTHING_MODEL || "nvidia/LocateAnything-3B",
    locateAnythingDevice: process.env.CHATIMAGE_LOCATEANYTHING_DEVICE || "cuda",
    locateAnythingTimeoutMs: Number(process.env.CHATIMAGE_LOCATEANYTHING_TIMEOUT_MS || 120_000),
    locateAnythingMaxNewTokens: parseOptionalPositiveInteger(process.env.CHATIMAGE_LOCATEANYTHING_MAX_NEW_TOKENS),
    locateAnythingMaxImageSide: Number(process.env.CHATIMAGE_LOCATEANYTHING_MAX_IMAGE_SIDE || 960),
    locateAnythingGenerationMode: process.env.CHATIMAGE_LOCATEANYTHING_GENERATION_MODE || "hybrid",
    locateAnythingLicenseAck: process.env.CHATIMAGE_LOCATEANYTHING_LICENSE_ACK || "",
    databasePath: process.env.CHATIMAGE_DATABASE_PATH || path.join(rootDir, "tmp", "chatimage.sqlite"),
    staticDir: process.env.CHATIMAGE_STATIC_DIR || rootDir,
    apiRequestTimeoutMs: Number(process.env.CHATIMAGE_API_REQUEST_TIMEOUT_MS || 120_000),
    imagePollAttempts: Number(process.env.CHATIMAGE_IMAGE_POLL_ATTEMPTS || 90),
    imagePollInitialDelayMs: Number(process.env.CHATIMAGE_IMAGE_POLL_INITIAL_DELAY_MS || 1200),
    imagePollDelayMs: Number(process.env.CHATIMAGE_IMAGE_POLL_DELAY_MS || 2000),
    maxUpstreamRequests: Number(process.env.CHATIMAGE_MAX_UPSTREAM_REQUESTS || 4),
    imageEndpoint: WUYIN_IMAGE_ENDPOINT,
    imageDetailEndpoint: WUYIN_IMAGE_DETAIL_ENDPOINT,
    ...overrides
  };
}

function parseOptionalPositiveInteger(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildOpenAiChatEndpoint(baseUrl) {
  const source = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!source) return "";
  if (/\/chat\/completions$/i.test(source)) return source;
  return `${source}/chat/completions`;
}

function resolveDefaultTextRequestFormat(source) {
  const value = String(source || "").trim().toLowerCase();
  if (!value || value.includes("api.wuyinkeji.com/api/chat/index")) return "wuyin-form";
  return "openai-chat";
}

function createServer(serverConfig = config) {
  const store = serverConfig.store || createStore(serverConfig.databasePath || config.databasePath);
  const upstreamGate = createConcurrencyGate(serverConfig.maxUpstreamRequests, "Upstream API");
  const helpers = {
    callImageApi: (...args) => upstreamGate.run(() => callImageApi(...args)),
    callTextApi: (...args) => upstreamGate.run(() => callTextApi(...args)),
    callVisionApi: (...args) => upstreamGate.run(() => callVisionApi(...args)),
    runLocalOcrAlignment,
    runLocalOcrHealth,
    runLocateAnythingAlignment: (...args) => runLocateAnythingAlignmentWithFallback(...args, helpers),
    runLocateAnythingHealth,
    runLocateAnythingPreload,
    readJson,
    requireApiKey,
    sendJson
  };
  const routes = [handleConfigRoute, handleLlmRoute, handleImageRoute, handleVisionRoute, handleChatImagesRoute];
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      for (const route of routes) {
        if (await route({ url, req, res, serverConfig, store, helpers })) return;
      }

      return serveStatic(url.pathname, res, serverConfig.staticDir || rootDir);
    } catch (error) {
      const status = error.statusCode || 500;
      return sendJson(res, status, {
        error: error.message || "Internal Server Error"
      });
    }
  });
}

if (require.main === module) {
  const server = createServer(config);
  server.listen(config.port, "127.0.0.1", () => {
    console.log(`ChatImage server running at http://127.0.0.1:${config.port}`);
    console.log(`API mode: ${config.apiKey ? "enabled" : "mock fallback (missing CHATIMAGE_API_KEY)"}`);
    preloadLocateAnythingOnStartup(config);
  });
}

function preloadLocateAnythingOnStartup(serverConfig) {
  if (String(serverConfig.visionMode || "").toLowerCase() !== "locateanything") return;
  runLocateAnythingPreload(serverConfig)
    .then((result) => {
      console.log(
        `LocateAnything resident model loaded: ${result.model || serverConfig.locateAnythingModel} (${result.loadSeconds || 0}s)`
      );
    })
    .catch((error) => {
      console.warn(`LocateAnything preload failed: ${error.message || error}`);
    });
}

module.exports = {
  buildOpenAiChatEndpoint,
  callImageApi,
  callTextApi,
  callVisionApi,
  createConcurrencyGate,
  resolveDefaultTextRequestFormat,
  createConfig,
  createServer,
  createStore,
  extractImageUrl,
  extractTaskId,
  extractTextContent,
  formatApiError,
  isApiErrorPayload,
  MIMO_TEXT_ENDPOINT,
  parseImageBufferDimensions,
  preloadLocateAnythingOnStartup
};
