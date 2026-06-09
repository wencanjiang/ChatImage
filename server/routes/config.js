"use strict";

const { createLocateAnythingConfig } = require("../locateanything");

async function handleConfigRoute({ url, req, res, serverConfig, helpers }) {
  if (url.pathname !== "/api/config" || req.method !== "GET") return false;
  const locateAnything = createLocateAnythingConfig(serverConfig);
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
    textRequestFormat: serverConfig.textRequestFormat || "",
    imageModel: serverConfig.imageModel,
    visionMode: serverConfig.visionMode || "remote",
    visionApiAvailable:
      serverConfig.visionMode === "locateanything"
        ? locateAnything.locateAnythingConfigured
        : serverConfig.visionMode === "local-ocr"
        ? Boolean(serverConfig.localOcrPython && serverConfig.localOcrWorkerPath)
        : Boolean(serverConfig.visionEndpoint && (serverConfig.visionApiKey || serverConfig.apiKey)),
    visionModel: serverConfig.visionModel,
    visionAuthMode: serverConfig.visionAuthMode || "bearer",
    visionRequestFormat: serverConfig.visionRequestFormat || "",
    localOcrConfigured: Boolean(serverConfig.localOcrPython && serverConfig.localOcrWorkerPath),
    ...locateAnything
  });
  return true;
}

module.exports = { handleConfigRoute };
