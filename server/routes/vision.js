"use strict";

const { validateExternalImageUrl, validateVisionImageDimensions } = require("../validation");
const { createLocateAnythingConfig } = require("../locateanything");
const { createSam3Config } = require("../sam3");

async function handleVisionRoute({ url, req, res, serverConfig, helpers }) {
  if (url.pathname === "/api/vision/health") {
    helpers.requireApiKey(serverConfig);
    if (req.method === "GET") {
      helpers.sendJson(res, 200, createVisionHealthConfig(serverConfig));
      return true;
    }
    if (req.method === "POST") {
      if (serverConfig.visionMode === "local-ocr") {
        const parsed = await helpers.runLocalOcrHealth(serverConfig);
        helpers.sendJson(res, 200, {
          ...createVisionHealthConfig(serverConfig),
          ok: true,
          content: JSON.stringify({
            ok: true,
            imageVisible: true,
            provider: "local-ocr",
            modules: parsed.modules,
            warnings: parsed.warnings
          }),
          parsed: {
            ok: true,
            imageVisible: true,
            provider: "local-ocr",
            modules: parsed.modules,
            warnings: parsed.warnings
          }
        });
        return true;
      }
      if (serverConfig.visionMode === "locateanything") {
        const parsed = await helpers.runLocateAnythingHealth(serverConfig);
        const sam3 = createSam3Config(serverConfig);
        if (sam3.sam3Enabled && helpers.runSam3Health) {
          parsed.sam3 = await helpers.runSam3Health(serverConfig);
        }
        helpers.sendJson(res, parsed.ok ? 200 : 503, {
          ...createVisionHealthConfig(serverConfig),
          ok: parsed.ok,
          content: JSON.stringify(parsed),
          parsed
        });
        return true;
      }
      const body = await helpers.readJson(req);
      const imageUrl =
        body.imageUrl ||
        "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Fronalpstock_big.jpg/640px-Fronalpstock_big.jpg";
      validateExternalImageUrl(imageUrl);
      const content = body.content || createVisionHealthPrompt();
      const answer = await helpers.callVisionApi(serverConfig, {
        content,
        imageUrl,
        model: body.model || serverConfig.visionModel,
        purpose: body.purpose || "vision_health",
        responseFormat: "json"
      });
      const parsed = parseJsonFromText(answer);
      validateVisionHealthParsed(parsed);
      helpers.sendJson(res, 200, {
        ...createVisionHealthConfig(serverConfig),
        ok: true,
        content: answer,
        parsed
      });
      return true;
    }
    return false;
  }

  if (url.pathname !== "/api/vision" || req.method !== "POST") return false;
  helpers.requireApiKey(serverConfig);
  const body = await helpers.readJson(req);
  validateExternalImageUrl(body.imageUrl || "");
  validateVisionImageDimensions(body);
  if (serverConfig.visionMode === "local-ocr") {
    const parsed = await helpers.runLocalOcrAlignment(serverConfig, {
      imageUrl: body.imageUrl || "",
      imageWidth: body.imageWidth,
      imageHeight: body.imageHeight,
      visualMode: body.visualMode || "",
      modules: body.modules,
      purpose: body.purpose || "vision_align"
    });
    helpers.sendJson(res, 200, { content: JSON.stringify(parsed) });
    return true;
  }
  if (serverConfig.visionMode === "locateanything") {
    const parsed = await helpers.runLocateAnythingAlignment(serverConfig, {
      imageUrl: body.imageUrl || "",
      imageWidth: body.imageWidth,
      imageHeight: body.imageHeight,
      visualMode: body.visualMode || "",
      modules: body.modules,
      purpose: body.purpose || "vision_align"
    });
    helpers.sendJson(res, 200, { content: JSON.stringify(parsed) });
    return true;
  }
  const answer = await helpers.callVisionApi(serverConfig, {
    content: body.content || "",
    imageUrl: body.imageUrl || "",
    model: body.model || serverConfig.visionModel,
    purpose: body.purpose || "vision_align",
    responseFormat: body.responseFormat || "json"
  });
  helpers.sendJson(res, 200, { content: answer });
  return true;
}

function createVisionHealthConfig(serverConfig) {
  const localMode = serverConfig.visionMode === "local-ocr";
  const locateMode = serverConfig.visionMode === "locateanything";
  const locateAnything = createLocateAnythingConfig(serverConfig);
  const sam3 = createSam3Config(serverConfig);
  return {
    configured: locateMode
      ? locateAnything.locateAnythingConfigured
      : localMode
      ? Boolean(serverConfig.localOcrPython && serverConfig.localOcrWorkerPath)
      : Boolean(
          serverConfig.visionEndpoint &&
            (serverConfig.visionApiKey ||
              (serverConfig.visionMode === "mimo-vision" ? serverConfig.textApiKey : "") ||
              (serverConfig.visionFallbackMode === "mimo-vision" ? serverConfig.textApiKey : "") ||
              serverConfig.apiKey)
        ),
    endpointConfigured: Boolean(serverConfig.visionEndpoint),
    keyConfigured: Boolean(
      serverConfig.visionApiKey ||
        (serverConfig.visionMode === "mimo-vision" ? serverConfig.textApiKey : "") ||
        (serverConfig.visionFallbackMode === "mimo-vision" ? serverConfig.textApiKey : "") ||
        serverConfig.apiKey
    ),
    visionMode: serverConfig.visionMode || "remote",
    visionFallbackMode: serverConfig.visionFallbackMode || "",
    visionModel: serverConfig.visionModel || "",
    localOcrConfigured: Boolean(serverConfig.localOcrPython && serverConfig.localOcrWorkerPath),
    ...locateAnything,
    ...sam3
  };
}

function createVisionHealthPrompt() {
  return [
    "Inspect the image and return only JSON. Do not include Markdown or extra explanation.",
    'Return exactly this shape: {"ok":true,"imageVisible":true,"description":"short description of the image"}',
    "Set imageVisible to true only if you can actually see the image content."
  ].join("\n");
}

function parseJsonFromText(content) {
  const text = String(content || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    const error = new Error("Vision health check returned non-JSON content");
    error.statusCode = 502;
    throw error;
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (parseError) {
    const error = new Error(`Vision health check returned invalid JSON: ${parseError.message}`);
    error.statusCode = 502;
    throw error;
  }
}

function validateVisionHealthParsed(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const error = new Error("Vision health check returned invalid JSON object");
    error.statusCode = 502;
    throw error;
  }
  if (parsed.ok !== true) {
    const error = new Error("Vision health check did not confirm ok=true");
    error.statusCode = 502;
    throw error;
  }
  if (parsed.imageVisible !== true) {
    const error = new Error("Vision health check did not confirm imageVisible=true");
    error.statusCode = 502;
    throw error;
  }
  return parsed;
}

module.exports = {
  createVisionHealthConfig,
  createVisionHealthPrompt,
  handleVisionRoute,
  parseJsonFromText,
  validateVisionHealthParsed
};
