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
const { enforceStrictVisualAlignment, refineAlignmentWithSam3, runSam3Health, runSam3Preload } = require("./server/sam3");
const { cacheRemoteImage } = require("./server/image-cache");
const {
  loadEnvFile,
  assertSameOriginRequest,
  readJson,
  requireApiKey,
  sendJson,
  serveStatic
} = require("./server/http");
const {
  callImageApi,
  callTextApi,
  callTextApiDetailed,
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
const initialEnvKeys = new Set(Object.keys(process.env));
loadEnvFile(path.join(rootDir, ".env"), { preserveKeys: initialEnvKeys });
loadEnvFile(path.join(rootDir, ".env.local"), { overwrite: true, preserveKeys: initialEnvKeys });
const WUYIN_TEXT_ENDPOINT = "https://api.wuyinkeji.com/api/chat/index";
const MIMO_TEXT_ENDPOINT = "https://api.xiaomimimo.com/v1/chat/completions";
const MIMO_BASE_URL = "https://api.xiaomimimo.com/v1";
const DEFAULT_TEXT_SYSTEM_PROMPT =
  "你是 ChatImage 的文本与结构化生成引擎。直接输出最终结果，不要展示推理过程、分析草稿或思考步骤；当用户要求 JSON 时，只输出可解析 JSON。";
const WUYIN_IMAGE_ENDPOINT = "https://api.wuyinkeji.com/api/async/image_gpt";
const WUYIN_IMAGE_DETAIL_ENDPOINT = "https://api.wuyinkeji.com/api/async/detail";

const config = createConfig();

function createConfig(overrides = {}) {
  const textBaseUrl = process.env.CHATIMAGE_TEXT_BASE_URL || "";
  const visionMode = process.env.CHATIMAGE_VISION_MODE || "local-ocr";
  const visionFallbackMode = process.env.CHATIMAGE_VISION_FALLBACK_MODE || "";
  const visionUsesMimo = visionMode === "mimo-vision" || visionFallbackMode === "mimo-vision";
  const visionBaseUrl = process.env.CHATIMAGE_VISION_BASE_URL || textBaseUrl || MIMO_BASE_URL;
  const defaultLocateAnythingPython = process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, "miniconda3", "envs", "chatimage", "python.exe")
    : "python";
  const defaultSam3Python = process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, "miniconda3", "envs", "sam3", "python.exe")
    : "python";
  const defaultSam3Checkpoint = process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, ".cache", "modelscope", "hub", "models", "facebook", "sam3", "sam3.pt")
    : "";
  return {
    port: Number(process.env.CHATIMAGE_PORT || process.env.PORT || 5178),
    apiKey: process.env.CHATIMAGE_API_KEY || process.env.WUYIN_API_KEY || "",
    textApiKey: process.env.CHATIMAGE_TEXT_API_KEY || process.env.CHATIMAGE_API_KEY || process.env.WUYIN_API_KEY || "",
    textModel: process.env.CHATIMAGE_TEXT_MODEL || "mimo-v2.5-pro",
    textFallbackModel: process.env.CHATIMAGE_TEXT_FALLBACK_MODEL || "mimo-v2.5",
    textFallbackOn5xx: parseEnvBoolean(process.env.CHATIMAGE_TEXT_FALLBACK_ON_5XX, true),
    textEndpoint: process.env.CHATIMAGE_TEXT_ENDPOINT || buildOpenAiChatEndpoint(textBaseUrl) || MIMO_TEXT_ENDPOINT,
    textRequestFormat:
      process.env.CHATIMAGE_TEXT_REQUEST_FORMAT ||
      resolveDefaultTextRequestFormat(process.env.CHATIMAGE_TEXT_ENDPOINT || textBaseUrl || MIMO_TEXT_ENDPOINT),
    textSystemPrompt: process.env.CHATIMAGE_TEXT_SYSTEM_PROMPT || DEFAULT_TEXT_SYSTEM_PROMPT,
    textMaxCompletionTokens: parseOptionalPositiveInteger(process.env.CHATIMAGE_TEXT_MAX_COMPLETION_TOKENS),
    textTemperature: Number(process.env.CHATIMAGE_TEXT_TEMPERATURE || 1.0),
    textTopP: Number(process.env.CHATIMAGE_TEXT_TOP_P || 0.95),
    textJsonResponseFormat: process.env.CHATIMAGE_TEXT_JSON_RESPONSE_FORMAT || "prompt",
    textThinkingType: process.env.CHATIMAGE_TEXT_THINKING_TYPE || "disabled",
    visualQaMode: process.env.CHATIMAGE_VISUAL_QA_MODE || "limited",
    visualQaMaxRetries: Number(process.env.CHATIMAGE_VISUAL_QA_MAX_RETRIES || 1),
    imageModel: process.env.CHATIMAGE_IMAGE_MODEL || "GPT-Image-2",
    visionModel: process.env.CHATIMAGE_VISION_MODEL || (visionUsesMimo ? "mimo-v2.5" : ""),
    visionEndpoint:
      process.env.CHATIMAGE_VISION_ENDPOINT ||
      (visionUsesMimo ? buildOpenAiChatEndpoint(visionBaseUrl) : WUYIN_TEXT_ENDPOINT),
    visionApiKey: process.env.CHATIMAGE_VISION_API_KEY || "",
    visionAuthMode: process.env.CHATIMAGE_VISION_AUTH_MODE || "bearer",
    visionMode,
    visionFallbackMode,
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
    // Cap generation length by default. LocateAnything emits a short box answer
    // (~50 tokens), but with no cap its hybrid mode keeps rambling on hard
    // targets (landmark/building/map regions) for 16-31s per call instead of
    // ~3s, which makes multi-region align blow past the worker timeout and
    // degrade grounding to planned fallbacks. 256 is ample headroom for the box.
    locateAnythingMaxNewTokens: parseOptionalPositiveInteger(process.env.CHATIMAGE_LOCATEANYTHING_MAX_NEW_TOKENS) || 256,
    locateAnythingMaxImageSide: Number(process.env.CHATIMAGE_LOCATEANYTHING_MAX_IMAGE_SIDE || 960),
    locateAnythingGenerationMode: process.env.CHATIMAGE_LOCATEANYTHING_GENERATION_MODE || "hybrid",
    locateAnythingLicenseAck: process.env.CHATIMAGE_LOCATEANYTHING_LICENSE_ACK || "",
    sam3Enabled: process.env.CHATIMAGE_SAM3_ENABLED || "",
    sam3Python: process.env.CHATIMAGE_SAM3_PYTHON || defaultSam3Python,
    sam3WorkerPath: process.env.CHATIMAGE_SAM3_WORKER || path.join(rootDir, "scripts", "sam3_worker.py"),
    sam3Checkpoint: process.env.CHATIMAGE_SAM3_CHECKPOINT || defaultSam3Checkpoint,
    sam3Device: process.env.CHATIMAGE_SAM3_DEVICE || "cuda",
    sam3TimeoutMs: Number(process.env.CHATIMAGE_SAM3_TIMEOUT_MS || 120_000),
    sam3LicenseAck: process.env.CHATIMAGE_SAM3_LICENSE_ACK || "",
    strictVisualAlignment: parseEnvBoolean(process.env.CHATIMAGE_STRICT_VISUAL_ALIGNMENT, true),
    databasePath: process.env.CHATIMAGE_DATABASE_PATH || path.join(rootDir, "tmp", "chatimage.sqlite"),
    staticDir: process.env.CHATIMAGE_STATIC_DIR || rootDir,
    imageCacheEnabled: parseEnvBoolean(process.env.CHATIMAGE_IMAGE_CACHE_ENABLED, true),
    imageCacheDir: process.env.CHATIMAGE_IMAGE_CACHE_DIR || path.join(rootDir, "tmp", "image-cache"),
    imageCacheUrlPrefix: "/image-cache/",
    imageCacheTimeoutMs: Number(process.env.CHATIMAGE_IMAGE_CACHE_TIMEOUT_MS || 20_000),
    imageCacheMaxBytes: Number(process.env.CHATIMAGE_IMAGE_CACHE_MAX_BYTES || 16 * 1024 * 1024),
    apiRequestTimeoutMs: Number(process.env.CHATIMAGE_API_REQUEST_TIMEOUT_MS || 120_000),
    apiFetchRetryAttempts: Number(process.env.CHATIMAGE_API_FETCH_RETRY_ATTEMPTS || 2),
    apiFetchRetryDelayMs: Number(process.env.CHATIMAGE_API_FETCH_RETRY_DELAY_MS || 800),
    imagePollAttempts: Number(process.env.CHATIMAGE_IMAGE_POLL_ATTEMPTS || 180),
    imagePollInitialDelayMs: Number(process.env.CHATIMAGE_IMAGE_POLL_INITIAL_DELAY_MS || 1200),
    imagePollDelayMs: Number(process.env.CHATIMAGE_IMAGE_POLL_DELAY_MS || 2000),
    imageApiSize: process.env.CHATIMAGE_IMAGE_API_SIZE || "1024x1024",
    maxUpstreamRequests: Number(process.env.CHATIMAGE_MAX_UPSTREAM_REQUESTS || 4),
    imageEndpoint: WUYIN_IMAGE_ENDPOINT,
    imageDetailEndpoint: WUYIN_IMAGE_DETAIL_ENDPOINT,
    // By default the API key is sent only via the Authorization header.
    // Set CHATIMAGE_IMAGE_KEY_IN_QUERY=1 only if the upstream image API rejects header auth.
    imageKeyInQuery: parseEnvBoolean(process.env.CHATIMAGE_IMAGE_KEY_IN_QUERY, false),
    ...overrides
  };
}

function parseOptionalPositiveInteger(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseEnvBoolean(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
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
    callTextApiDetailed: (...args) => upstreamGate.run(() => callTextApiDetailed(...args)),
    callVisionApi: (...args) => upstreamGate.run(() => callVisionApi(...args)),
    runLocalOcrAlignment,
    runLocalOcrHealth,
    runLocateAnythingAlignment: (...args) =>
      runLocateAnythingAlignmentWithFallback(...args, helpers).then((alignment) =>
        refineAlignmentWithSam3(serverConfig, alignment, args[1] || args[0] || {})
      ).then((alignment) => enforceStrictVisualAlignment(serverConfig, alignment)),
    runLocateAnythingHealth,
    runLocateAnythingPreload,
    runSam3Health,
    runSam3Preload,
    cacheImage: (imageUrl, opts = {}) =>
      cacheRemoteImage(imageUrl, {
        cacheDir: serverConfig.imageCacheDir,
        urlPrefix: serverConfig.imageCacheUrlPrefix,
        timeoutMs: serverConfig.imageCacheTimeoutMs,
        maxBytes: serverConfig.imageCacheMaxBytes,
        ...opts
      }),
    readJson,
    requireApiKey,
    sendJson
  };
  const routes = [handleConfigRoute, handleLlmRoute, handleImageRoute, handleVisionRoute, handleChatImagesRoute];
  const server = http.createServer(async (req, res) => {
    try {
      assertSameOriginRequest(req, serverConfig);
      const url = new URL(req.url, `http://${req.headers.host}`);
      const cachePrefix = serverConfig.imageCacheUrlPrefix || "/image-cache/";
      if (serverConfig.imageCacheDir && url.pathname.startsWith(cachePrefix)) {
        // Serve locally cached images out of the dedicated cache dir; serveStatic
        // performs the path-traversal check against that base directory.
        return serveStatic(`/${url.pathname.slice(cachePrefix.length)}`, res, serverConfig.imageCacheDir);
      }
      for (const route of routes) {
        if (await route({ url, req, res, serverConfig, store, helpers })) return;
      }

      return serveStatic(url.pathname, res, serverConfig.staticDir || rootDir);
    } catch (error) {
      const status = error.statusCode || 500;
      logRequestError(error, req, status);
      return sendJson(res, status, {
        error: error.message || "Internal Server Error"
      });
    }
  });
  server.chatImageStore = store;
  return server;
}

if (require.main === module) {
  setupGlobalErrorLogging();
  const server = createServer(config);
  setupGracefulShutdown(server);
  server.listen(config.port, "127.0.0.1", () => {
    console.log(`ChatImage server running at http://127.0.0.1:${config.port}`);
    console.log(`API mode: ${config.apiKey ? "enabled" : "mock fallback (missing CHATIMAGE_API_KEY)"}`);
    preloadLocateAnythingOnStartup(config);
    preloadSam3OnStartup(config);
  });
}

function logRequestError(error, req, status) {
  const method = req && req.method ? req.method : "UNKNOWN";
  const url = req && req.url ? req.url : "/";
  const message = error && error.message ? error.message : String(error);
  if (status >= 500) {
    const stack = error && error.stack ? error.stack : message;
    console.error(`[${new Date().toISOString()}] ${method} ${url} -> ${status}\n${stack}`);
    return;
  }
  console.warn(`[${new Date().toISOString()}] ${method} ${url} -> ${status}: ${message}`);
}

function setupGracefulShutdown(server) {
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down ChatImage server...`);
    const forceCloseTimer = setTimeout(() => {
      server.closeAllConnections?.();
    }, 1000);
    forceCloseTimer.unref?.();
    server.closeIdleConnections?.();
    server.close((error) => {
      clearTimeout(forceCloseTimer);
      if (error) {
        console.error(`HTTP server shutdown failed: ${error.stack || error.message || error}`);
        process.exitCode = 1;
      }
      try {
        if (server.chatImageStore && typeof server.chatImageStore.close === "function") {
          server.chatImageStore.close();
        }
      } catch (storeError) {
        console.error(`Store shutdown failed: ${storeError.stack || storeError.message || storeError}`);
        process.exitCode = 1;
      }
      process.exit();
    });
    setTimeout(() => {
      console.error("Graceful shutdown timed out; forcing exit.");
      process.exit(1);
    }, 5000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

function setupGlobalErrorLogging() {
  if (setupGlobalErrorLogging.installed) return;
  setupGlobalErrorLogging.installed = true;
  process.on("unhandledRejection", (reason) => {
    console.error(`[${new Date().toISOString()}] Unhandled promise rejection\n${formatProcessError(reason)}`);
  });
  process.on("uncaughtException", (error) => {
    console.error(`[${new Date().toISOString()}] Uncaught exception\n${formatProcessError(error)}`);
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 10).unref();
  });
}

function formatProcessError(error) {
  if (error && error.stack) return error.stack;
  if (error && error.message) return error.message;
  return String(error);
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

function preloadSam3OnStartup(serverConfig) {
  if (!["1", "true", "yes", "sam3"].includes(String(serverConfig.sam3Enabled || "").toLowerCase())) return;
  runSam3Preload(serverConfig)
    .then((result) => {
      console.log(`SAM3 resident model loaded: ${result.checkpoint || serverConfig.sam3Checkpoint} (${result.loadSeconds || 0}s)`);
    })
    .catch((error) => {
      console.warn(`SAM3 preload failed: ${error.message || error}`);
    });
}

module.exports = {
  buildOpenAiChatEndpoint,
  callImageApi,
  callTextApi,
  callTextApiDetailed,
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
  logRequestError,
  MIMO_TEXT_ENDPOINT,
  parseImageBufferDimensions,
  preloadLocateAnythingOnStartup,
  preloadSam3OnStartup,
  setupGlobalErrorLogging,
  setupGracefulShutdown
};
