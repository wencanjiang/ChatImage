"use strict";

const {
  validateChatImagePayload,
  validateThreadPayload
} = require("../validation");

async function handleChatImagesRoute({ url, req, res, store, helpers }) {
  if (url.pathname === "/api/chatimages" && req.method === "POST") {
    const body = await helpers.readJson(req);
    validateChatImagePayload(body);
    helpers.sendJson(res, 200, store.saveChatImage(body));
    return true;
  }

  if (url.pathname === "/api/chatimages" && req.method === "GET") {
    helpers.sendJson(res, 200, { items: store.listChatImages() });
    return true;
  }

  const resultMatch = url.pathname.match(/^\/api\/chatimages\/([^/]+)$/);
  if (resultMatch && req.method === "GET") {
    const [, chatImageId] = resultMatch.map(decodeURIComponent);
    const payload = store.getChatImage(chatImageId);
    helpers.sendJson(res, payload.result ? 200 : 404, payload.result ? payload : { error: "ChatImage not found" });
    return true;
  }

  if (resultMatch && req.method === "PATCH") {
    const [, chatImageId] = resultMatch.map(decodeURIComponent);
    const body = await helpers.readJson(req);
    const patch = validateChatImageMetaPatch(body);
    const payload = store.updateChatImageMeta(chatImageId, patch);
    helpers.sendJson(res, payload.item ? 200 : 404, payload.item ? payload : { error: "ChatImage not found" });
    return true;
  }

  if (resultMatch && req.method === "DELETE") {
    const [, chatImageId] = resultMatch.map(decodeURIComponent);
    const payload = store.deleteChatImage(chatImageId);
    helpers.sendJson(res, payload.deleted ? 200 : 404, payload.deleted ? payload : { error: "ChatImage not found" });
    return true;
  }

  const threadMatch = url.pathname.match(/^\/api\/chatimages\/([^/]+)\/hotspots\/([^/]+)\/thread$/);
  if (threadMatch && req.method === "GET") {
    const [, chatImageId, hotspotId] = threadMatch.map(decodeURIComponent);
    helpers.sendJson(res, 200, store.getThread(chatImageId, hotspotId));
    return true;
  }

  const messagesMatch = url.pathname.match(/^\/api\/chatimages\/([^/]+)\/hotspots\/([^/]+)\/messages$/);
  if (messagesMatch && req.method === "POST") {
    const [, chatImageId, hotspotId] = messagesMatch.map(decodeURIComponent);
    const body = await helpers.readJson(req);
    validateThreadPayload(body.thread, chatImageId, hotspotId);
    helpers.sendJson(res, 200, store.saveThread(chatImageId, hotspotId, body.thread));
    return true;
  }

  return false;
}

function validateChatImageMetaPatch(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    const error = new Error("metadata patch must be an object");
    error.statusCode = 400;
    throw error;
  }
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body, "title")) {
    const title = String(body.title || "").trim();
    if (!title || title.length > 80) {
      const error = new Error("title must be 1 to 80 characters");
      error.statusCode = 400;
      throw error;
    }
    patch.title = title;
  }
  if (Object.prototype.hasOwnProperty.call(body, "pinned")) {
    patch.pinned = Boolean(body.pinned);
  }
  if (!Object.keys(patch).length) {
    const error = new Error("metadata patch must include title or pinned");
    error.statusCode = 400;
    throw error;
  }
  return patch;
}

module.exports = { handleChatImagesRoute };
