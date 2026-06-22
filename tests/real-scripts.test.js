"use strict";

const assert = require("assert");
const { createRealInstanceServerConfig } = require("./real-browser-instance");

function main() {
  const config = createRealInstanceServerConfig("api-key", {
    CHATIMAGE_TEXT_API_KEY: "text-key",
    CHATIMAGE_TEXT_BASE_URL: "https://text.example.com/v1",
    CHATIMAGE_TEXT_MODEL: "custom-text-model",
    CHATIMAGE_TEXT_REQUEST_FORMAT: "openai-chat",
    CHATIMAGE_TEXT_SYSTEM_PROMPT: "system prompt",
    CHATIMAGE_TEXT_THINKING_TYPE: "enabled",
    CHATIMAGE_IMAGE_MODEL: "custom-image-model",
    CHATIMAGE_IMAGE_API_SIZE: "1024x1024",
    CHATIMAGE_VISION_ENDPOINT: "https://vision.example.com/v1/chat/completions",
    CHATIMAGE_VISION_API_KEY: "vision-key",
    CHATIMAGE_VISION_MODEL: "custom-vision-model",
    CHATIMAGE_VISION_AUTH_MODE: "api-key",
    CHATIMAGE_VISION_REQUEST_FORMAT: "openai-chat",
    CHATIMAGE_VISION_MODE: "remote",
    CHATIMAGE_LOCAL_OCR_PYTHON: "python-custom",
    CHATIMAGE_LOCAL_OCR_WORKER: "worker-custom.py",
    CHATIMAGE_LOCAL_OCR_TIMEOUT_MS: "789",
    CHATIMAGE_LOCATEANYTHING_PYTHON: "locate-python",
    CHATIMAGE_LOCATEANYTHING_WORKER: "locate-worker.py",
    CHATIMAGE_LOCATEANYTHING_MODEL: "locate-model",
    CHATIMAGE_LOCATEANYTHING_DEVICE: "cuda:0",
    CHATIMAGE_LOCATEANYTHING_TIMEOUT_MS: "9876",
    CHATIMAGE_LOCATEANYTHING_MAX_NEW_TOKENS: "321",
    CHATIMAGE_LOCATEANYTHING_MAX_IMAGE_SIDE: "777",
    CHATIMAGE_LOCATEANYTHING_GENERATION_MODE: "direct",
    CHATIMAGE_LOCATEANYTHING_LICENSE_ACK: "research-evaluation",
    CHATIMAGE_SAM3_ENABLED: "1",
    CHATIMAGE_SAM3_PYTHON: "sam3-python",
    CHATIMAGE_SAM3_WORKER: "sam3-worker.py",
    CHATIMAGE_SAM3_CHECKPOINT: "sam3.pt",
    CHATIMAGE_SAM3_DEVICE: "cuda:0",
    CHATIMAGE_SAM3_TIMEOUT_MS: "6543",
    CHATIMAGE_SAM3_LICENSE_ACK: "research-evaluation",
    CHATIMAGE_API_REQUEST_TIMEOUT_MS: "4567",
    CHATIMAGE_API_FETCH_RETRY_ATTEMPTS: "3",
    CHATIMAGE_API_FETCH_RETRY_DELAY_MS: "123",
    CHATIMAGE_IMAGE_POLL_ATTEMPTS: "12",
    CHATIMAGE_IMAGE_POLL_INITIAL_DELAY_MS: "34",
    CHATIMAGE_IMAGE_POLL_DELAY_MS: "56"
  });

  assert.strictEqual(config.apiKey, "api-key");
  assert.strictEqual(config.textApiKey, "text-key");
  assert.strictEqual(config.textModel, "custom-text-model");
  assert.strictEqual(config.textEndpoint, "https://text.example.com/v1/chat/completions");
  assert.strictEqual(config.textRequestFormat, "openai-chat");
  assert.strictEqual(config.textSystemPrompt, "system prompt");
  assert.strictEqual(config.textThinkingType, "enabled");
  assert.strictEqual(config.imageModel, "custom-image-model");
  assert.strictEqual(config.imageApiSize, "1024x1024");
  assert.strictEqual(config.visionEndpoint, "https://vision.example.com/v1/chat/completions");
  assert.strictEqual(config.visionApiKey, "vision-key");
  assert.strictEqual(config.visionModel, "custom-vision-model");
  assert.strictEqual(config.visionMode, "remote");
  assert.strictEqual(config.visionAuthMode, "api-key");
  assert.strictEqual(config.visionRequestFormat, "openai-chat");
  assert.strictEqual(config.localOcrPython, "python-custom");
  assert.strictEqual(config.localOcrWorkerPath, "worker-custom.py");
  assert.strictEqual(config.localOcrTimeoutMs, 789);
  assert.strictEqual(config.locateAnythingPython, "locate-python");
  assert.strictEqual(config.locateAnythingWorkerPath, "locate-worker.py");
  assert.strictEqual(config.locateAnythingModel, "locate-model");
  assert.strictEqual(config.locateAnythingDevice, "cuda:0");
  assert.strictEqual(config.locateAnythingTimeoutMs, 9876);
  assert.strictEqual(config.locateAnythingMaxNewTokens, 321);
  assert.strictEqual(config.locateAnythingMaxImageSide, 777);
  assert.strictEqual(config.locateAnythingGenerationMode, "direct");
  assert.strictEqual(config.locateAnythingLicenseAck, "research-evaluation");
  assert.strictEqual(config.sam3Enabled, "1");
  assert.strictEqual(config.sam3Python, "sam3-python");
  assert.strictEqual(config.sam3WorkerPath, "sam3-worker.py");
  assert.strictEqual(config.sam3Checkpoint, "sam3.pt");
  assert.strictEqual(config.sam3Device, "cuda:0");
  assert.strictEqual(config.sam3TimeoutMs, 6543);
  assert.strictEqual(config.sam3LicenseAck, "research-evaluation");
  assert.strictEqual(config.apiRequestTimeoutMs, 4567);
  assert.strictEqual(config.apiFetchRetryAttempts, 3);
  assert.strictEqual(config.apiFetchRetryDelayMs, 123);
  assert.strictEqual(config.imagePollAttempts, 12);
  assert.strictEqual(config.imagePollInitialDelayMs, 34);
  assert.strictEqual(config.imagePollDelayMs, 56);

  const defaults = createRealInstanceServerConfig("api-key", {});
  assert.strictEqual(defaults.textApiKey, "api-key");
  assert.strictEqual(defaults.textModel, "mimo-v2.5-pro");
  assert.strictEqual(defaults.textEndpoint, "https://api.xiaomimimo.com/v1/chat/completions");
  assert.strictEqual(defaults.textRequestFormat, "openai-chat");
  assert.strictEqual(defaults.textThinkingType, "disabled");
  assert.strictEqual(defaults.imageModel, "GPT-Image-2");
  assert.strictEqual(defaults.imageApiSize, "1024x1024");
  assert.strictEqual(defaults.visionMode, "local-ocr");
  assert.strictEqual(defaults.visionEndpoint, "");
  assert.strictEqual(defaults.visionModel, "");
  assert.strictEqual(defaults.visionAuthMode, "bearer");
  assert.strictEqual(defaults.visionRequestFormat, "openai-chat");
  const mimoVisionDefaults = createRealInstanceServerConfig("api-key", {
    CHATIMAGE_TEXT_API_KEY: "text-key",
    CHATIMAGE_TEXT_BASE_URL: "https://api.xiaomimimo.com/v1",
    CHATIMAGE_VISION_MODE: "mimo-vision"
  });
  assert.strictEqual(mimoVisionDefaults.visionMode, "mimo-vision");
  assert.strictEqual(mimoVisionDefaults.visionEndpoint, "https://api.xiaomimimo.com/v1/chat/completions");
  assert.strictEqual(mimoVisionDefaults.visionModel, "mimo-v2.5");
  assert.strictEqual(mimoVisionDefaults.textApiKey, "text-key");
  const locateWithMimoFallback = createRealInstanceServerConfig("api-key", {
    CHATIMAGE_TEXT_API_KEY: "text-key",
    CHATIMAGE_TEXT_BASE_URL: "https://api.xiaomimimo.com/v1",
    CHATIMAGE_VISION_MODE: "locateanything",
    CHATIMAGE_VISION_FALLBACK_MODE: "mimo-vision"
  });
  assert.strictEqual(locateWithMimoFallback.visionMode, "locateanything");
  assert.strictEqual(locateWithMimoFallback.visionFallbackMode, "mimo-vision");
  assert.strictEqual(locateWithMimoFallback.visionEndpoint, "https://api.xiaomimimo.com/v1/chat/completions");
  assert.strictEqual(locateWithMimoFallback.visionModel, "mimo-v2.5");
  assert.strictEqual(defaults.locateAnythingModel, "nvidia/LocateAnything-3B");
  assert.strictEqual(defaults.locateAnythingDevice, "cuda");
  assert.strictEqual(defaults.locateAnythingMaxNewTokens, null);
  assert.strictEqual(defaults.locateAnythingMaxImageSide, 960);
  assert.strictEqual(defaults.locateAnythingLicenseAck, "");
  assert.strictEqual(defaults.sam3Enabled, "");
  assert.strictEqual(defaults.sam3Device, "cuda");
  assert.strictEqual(defaults.sam3TimeoutMs, 120000);
  assert.strictEqual(defaults.sam3LicenseAck, "");
  assert.strictEqual(defaults.apiRequestTimeoutMs, 120000);
  assert.strictEqual(defaults.apiFetchRetryAttempts, 2);
  assert.strictEqual(defaults.apiFetchRetryDelayMs, 800);
  assert.strictEqual(defaults.imagePollAttempts, 180);

  console.log("real-scripts.test.js passed");
}

main();
