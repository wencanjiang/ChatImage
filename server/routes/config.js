"use strict";

const { createLocateAnythingConfig } = require("../locateanything");
const { createSam3Config } = require("../sam3");

async function handleConfigRoute({ url, req, res, serverConfig, helpers }) {
  if (url.pathname !== "/api/config" || req.method !== "GET") return false;
  const locateAnything = createLocateAnythingConfig(serverConfig);
  const sam3 = createSam3Config(serverConfig);
  helpers.sendJson(res, 200, {
    realApiAvailable: Boolean(
      (serverConfig.textApiKey || serverConfig.apiKey) &&
        serverConfig.textEndpoint &&
        serverConfig.apiKey &&
        serverConfig.imageEndpoint
    ),
    imageApiAvailable: Boolean(serverConfig.apiKey && serverConfig.imageEndpoint),
    textApiAvailable: Boolean((serverConfig.textApiKey || serverConfig.apiKey) && serverConfig.textEndpoint),
    textModel: serverConfig.textModel,
    textFallbackModel: serverConfig.textFallbackModel || "",
    textFallbackEnabled: Boolean(serverConfig.textFallbackOn5xx && serverConfig.textFallbackModel),
    visualQaMode: serverConfig.visualQaMode || "",
    textRequestFormat: serverConfig.textRequestFormat || "",
    imageModel: serverConfig.imageModel,
    imageApiSize: serverConfig.imageApiSize || "",
    visionMode: serverConfig.visionMode || "remote",
    visionApiAvailable:
      serverConfig.visionMode === "locateanything"
        ? locateAnything.locateAnythingConfigured
        : serverConfig.visionMode === "local-ocr"
        ? Boolean(serverConfig.localOcrPython && serverConfig.localOcrWorkerPath)
        : Boolean(
            serverConfig.visionEndpoint &&
              (serverConfig.visionApiKey ||
                (serverConfig.visionMode === "mimo-vision" ? serverConfig.textApiKey : "") ||
                (serverConfig.visionFallbackMode === "mimo-vision" ? serverConfig.textApiKey : "") ||
                serverConfig.apiKey)
          ),
    visionModel: serverConfig.visionModel,
    visionFallbackMode: serverConfig.visionFallbackMode || "",
    visionAuthMode: serverConfig.visionAuthMode || "bearer",
    visionRequestFormat: serverConfig.visionRequestFormat || "",
    localOcrConfigured: Boolean(serverConfig.localOcrPython && serverConfig.localOcrWorkerPath),
    ...locateAnything,
    ...sam3
  });
  return true;
}

module.exports = { handleConfigRoute };
