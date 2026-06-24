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
    // Persist the generated image locally so history replays don't depend on the
    // upstream CDN URL, which expires. The remote imageUrl is intentionally left
    // untouched: alignment (vision / LocateAnything / SAM3) runs against it during
    // generation while the URL is still valid, and vision in particular needs a
    // public URL the upstream model can fetch. cachedImageUrl is the local copy
    // the frontend persists and displays for history replays. Best-effort: any
    // failure simply omits cachedImageUrl.
    if (serverConfig.imageCacheEnabled && typeof helpers.cacheImage === "function" && image && image.imageUrl) {
      try {
        const cached = await helpers.cacheImage(image.imageUrl, { signal: abortController.signal });
        if (cached && cached.localUrl) {
          image.cachedImageUrl = cached.localUrl;
        }
      } catch {
        // Caching is best-effort; the frontend falls back to the remote URL.
      }
    }
    helpers.sendJson(res, 200, image);
  } finally {
    req.off("close", onClose);
  }
  return true;
}

module.exports = { handleImageRoute };
