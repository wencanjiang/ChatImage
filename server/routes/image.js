"use strict";

async function handleImageRoute({ url, req, res, serverConfig, helpers }) {
  if (url.pathname !== "/api/image" || req.method !== "POST") return false;
  helpers.requireApiKey(serverConfig);
  const body = await helpers.readJson(req);
  // Surface client disconnects so callImageApi can stop polling the upstream
  // image-detail endpoint instead of holding an upstreamGate slot for minutes
  // after the user navigated away.
  const abortController = new AbortController();
  const onClose = () => abortController.abort();
  req.on("close", onClose);
  try {
    const image = await helpers.callImageApi(serverConfig, {
      prompt: body.prompt || "",
      size: serverConfig.imageApiSize || body.size || "1024x1024",
      model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : null,
      signal: abortController.signal
    });
    helpers.sendJson(res, 200, image);
  } finally {
    req.off("close", onClose);
  }
  return true;
}

module.exports = { handleImageRoute };
