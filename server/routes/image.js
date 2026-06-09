"use strict";

async function handleImageRoute({ url, req, res, serverConfig, helpers }) {
  if (url.pathname !== "/api/image" || req.method !== "POST") return false;
  helpers.requireApiKey(serverConfig);
  const body = await helpers.readJson(req);
  const image = await helpers.callImageApi(serverConfig, {
    prompt: body.prompt || "",
    size: body.size || "1600x900",
    model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : null
  });
  helpers.sendJson(res, 200, image);
  return true;
}

module.exports = { handleImageRoute };
