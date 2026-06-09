"use strict";

async function handleLlmRoute({ url, req, res, serverConfig, helpers }) {
  if (url.pathname === "/api/llm/health") {
    requireTextApiKey(serverConfig);
    if (req.method === "GET") {
      helpers.sendJson(res, 200, createLlmHealthConfig(serverConfig));
      return true;
    }
    if (req.method === "POST") {
      const body = await helpers.readJson(req);
      const answer = await helpers.callTextApi(serverConfig, {
        content: body.content || createLlmHealthPrompt(),
        model: body.model || serverConfig.textModel,
        purpose: body.purpose || "llm_health",
        responseFormat: body.responseFormat || "text"
      });
      helpers.sendJson(res, 200, {
        ...createLlmHealthConfig(serverConfig),
        ok: true,
        content: answer
      });
      return true;
    }
    return false;
  }

  if (url.pathname !== "/api/llm" || req.method !== "POST") return false;
  requireTextApiKey(serverConfig);
  const body = await helpers.readJson(req);
  const answer = await helpers.callTextApi(serverConfig, {
    content: body.content || "",
    model: body.model || serverConfig.textModel,
    purpose: body.purpose || "answer",
    responseFormat: body.responseFormat || "text"
  });
  helpers.sendJson(res, 200, { content: answer });
  return true;
}

function createLlmHealthConfig(serverConfig) {
  return {
    configured: Boolean((serverConfig.textApiKey || serverConfig.apiKey) && serverConfig.textEndpoint),
    endpointConfigured: Boolean(serverConfig.textEndpoint),
    keyConfigured: Boolean(serverConfig.textApiKey || serverConfig.apiKey),
    textModel: serverConfig.textModel || "",
    textRequestFormat: serverConfig.textRequestFormat || ""
  };
}

function createLlmHealthPrompt() {
  return "Reply with OK for ChatImage text health check.";
}

function requireTextApiKey(serverConfig) {
  if (serverConfig.textApiKey || serverConfig.apiKey) return;
  const error = new Error("Missing CHATIMAGE_TEXT_API_KEY or CHATIMAGE_API_KEY. Create .env.local or set the environment variable.");
  error.statusCode = 503;
  throw error;
}

module.exports = { createLlmHealthConfig, createLlmHealthPrompt, handleLlmRoute, requireTextApiKey };
