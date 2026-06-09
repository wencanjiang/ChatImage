"use strict";

const core = require("../src/core");

const THREAD_ROLES = new Set(["user", "assistant"]);
const EPSILON = 0.000001;

function validateChatImagePayload(result) {
  assertPlainObject(result, "ChatImage payload");
  requireString(result.id, "id");
  requireString(result.question, "question");
  requireString(result.rawAnswer, "rawAnswer");
  requireString(result.title, "title");
  requireString(result.summary, "summary");
  optionalPlainObject(result.structuredSpec, "structuredSpec");
  requireString(result.imageUrl, "imageUrl");
  validateImageUrl(result.imageUrl);
  requirePositiveNumber(result.imageWidth, "imageWidth");
  requirePositiveNumber(result.imageHeight, "imageHeight");
  assertPlainObject(result.layout, "layout");
  validateHotspots(result.hotspots);
  validateLayoutRegions(result.layout.regions);
  validateLayoutQuality(result.layout.regions);
  validateHotspotRegionBindings(result.hotspots, result.layout.regions);
  optionalString(result.imagePrompt, "imagePrompt");
  optionalPlainObject(result.alignmentRaw, "alignmentRaw");
  optionalString(result.createdAt, "createdAt");
  optionalString(result.updatedAt, "updatedAt");
  return result;
}

function validateLayoutQuality(regions) {
  const validation = core.validateLayoutRegions(regions);
  if (!validation.valid) {
    badRequest(`layout quality check failed: ${validation.errors.join("; ")}`);
  }
}

function validateThreadPayload(thread, chatImageId, hotspotId) {
  assertPlainObject(thread, "thread");
  requireString(thread.id, "thread.id");
  if (thread.chatImageId !== undefined && thread.chatImageId !== chatImageId) {
    badRequest("thread.chatImageId does not match route chatImageId");
  }
  if (thread.hotspotId !== undefined && thread.hotspotId !== hotspotId) {
    badRequest("thread.hotspotId does not match route hotspotId");
  }
  if (!Array.isArray(thread.messages)) {
    badRequest("thread.messages must be an array");
  }
  const messageIds = new Set();
  for (const [index, message] of thread.messages.entries()) {
    assertPlainObject(message, `thread.messages[${index}]`);
    requireString(message.id, `thread.messages[${index}].id`);
    if (messageIds.has(message.id)) {
      badRequest(`duplicate message id: ${message.id}`);
    }
    messageIds.add(message.id);
    if (!THREAD_ROLES.has(message.role)) {
      badRequest(`thread.messages[${index}].role must be user or assistant`);
    }
    if (typeof message.content !== "string") {
      badRequest(`thread.messages[${index}].content must be a string`);
    }
    optionalString(message.createdAt, `thread.messages[${index}].createdAt`);
  }
  optionalString(thread.createdAt, "thread.createdAt");
  optionalString(thread.updatedAt, "thread.updatedAt");
  return thread;
}

function validateHotspots(hotspots) {
  if (!Array.isArray(hotspots) || hotspots.length === 0) {
    badRequest("hotspots must be a non-empty array");
  }
  const hotspotIds = new Set();
  for (const [index, hotspot] of hotspots.entries()) {
    assertPlainObject(hotspot, `hotspots[${index}]`);
    requireString(hotspot.id, `hotspots[${index}].id`);
    if (hotspotIds.has(hotspot.id)) {
      badRequest(`duplicate hotspot id: ${hotspot.id}`);
    }
    hotspotIds.add(hotspot.id);
    requireString(hotspot.label, `hotspots[${index}].label`);
    requireString(hotspot.shortText, `hotspots[${index}].shortText`);
    requireString(hotspot.detail, `hotspots[${index}].detail`);
    optionalString(hotspot.sourceExcerpt, `hotspots[${index}].sourceExcerpt`);
    optionalString(hotspot.iconHint, `hotspots[${index}].iconHint`);
    if (hotspot.textBudget !== undefined) {
      validateTextBudget(hotspot.textBudget, `hotspots[${index}].textBudget`);
      validateHotspotTextWithinBudget(hotspot, `hotspots[${index}]`);
    }
    validateBounds(hotspot, `hotspots[${index}]`);
  }
}

function validateTextBudget(textBudget, path) {
  assertPlainObject(textBudget, path);
  const fields = [
    "titleLineChars",
    "titleMaxLines",
    "titleMaxChars",
    "imageTextLineChars",
    "imageTextMaxLines",
    "imageTextMaxChars"
  ];
  for (const field of fields) {
    requirePositiveNumber(textBudget[field], `${path}.${field}`);
  }
}

function validateHotspotTextWithinBudget(hotspot, path) {
  if (textLength(hotspot.label) > hotspot.textBudget.titleMaxChars) {
    badRequest(`${path}.label exceeds textBudget.titleMaxChars`);
  }
  if (textLength(hotspot.shortText) > hotspot.textBudget.imageTextMaxChars) {
    badRequest(`${path}.shortText exceeds textBudget.imageTextMaxChars`);
  }
}

function textLength(value) {
  return Array.from(String(value || "")).length;
}

function validateLayoutRegions(regions) {
  if (!Array.isArray(regions) || regions.length === 0) {
    badRequest("layout.regions must be a non-empty array");
  }
  const regionIds = new Set();
  for (const [index, region] of regions.entries()) {
    assertPlainObject(region, `layout.regions[${index}]`);
    requireString(region.id, `layout.regions[${index}].id`);
    if (regionIds.has(region.id)) {
      badRequest(`duplicate layout region id: ${region.id}`);
    }
    regionIds.add(region.id);
    assertPlainObject(region.bounds, `layout.regions[${index}].bounds`);
    validateBounds(region.bounds, `layout.regions[${index}].bounds`);
  }
}

function validateHotspotRegionBindings(hotspots, regions) {
  const hotspotsById = new Map(hotspots.map((hotspot) => [hotspot.id, hotspot]));
  const moduleRegions = regions.filter((region) => region.role === "module" || region.hotspotId);
  if (moduleRegions.length === 0) {
    badRequest("layout.regions must include module regions bound to hotspots");
  }

  const boundHotspotIds = new Set();
  for (const region of moduleRegions) {
    requireString(region.hotspotId, `layout.regions.${region.id}.hotspotId`);
    if (!hotspotsById.has(region.hotspotId)) {
      badRequest(`layout region ${region.id} references missing hotspot: ${region.hotspotId}`);
    }
    if (boundHotspotIds.has(region.hotspotId)) {
      badRequest(`duplicate layout binding for hotspot: ${region.hotspotId}`);
    }
    boundHotspotIds.add(region.hotspotId);

    const hotspot = hotspotsById.get(region.hotspotId);
    if (!boundsMatch(hotspot, region.bounds)) {
      badRequest(`layout region ${region.id} bounds do not match hotspot ${hotspot.id}`);
    }
  }

  for (const hotspot of hotspots) {
    if (!boundHotspotIds.has(hotspot.id)) {
      badRequest(`hotspot ${hotspot.id} is not bound to a layout region`);
    }
  }
}

function boundsMatch(hotspot, bounds) {
  return (
    Math.abs(hotspot.x - bounds.x) <= EPSILON &&
    Math.abs(hotspot.y - bounds.y) <= EPSILON &&
    Math.abs(hotspot.width - bounds.width) <= EPSILON &&
    Math.abs(hotspot.height - bounds.height) <= EPSILON
  );
}

function validateBounds(bounds, path) {
  requireFiniteNumber(bounds.x, `${path}.x`);
  requireFiniteNumber(bounds.y, `${path}.y`);
  requireFiniteNumber(bounds.width, `${path}.width`);
  requireFiniteNumber(bounds.height, `${path}.height`);
  if (bounds.x < 0 || bounds.y < 0) {
    badRequest(`${path} must start inside the image`);
  }
  if (bounds.width <= 0 || bounds.height <= 0) {
    badRequest(`${path} must have positive width and height`);
  }
  if (bounds.x + bounds.width > 1 + EPSILON || bounds.y + bounds.height > 1 + EPSILON) {
    badRequest(`${path} must stay inside normalized image bounds`);
  }
}

function validateImageUrl(imageUrl) {
  if (typeof imageUrl !== "string") {
    badRequest("imageUrl must be an http(s) URL or data:image URL");
  }
  const value = imageUrl.trim();
  if (/^data:image\/[a-z0-9.+-]+[;,]/i.test(value)) return;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return;
  } catch {
    // Fall through to the shared 400 path.
  }
  badRequest("imageUrl must be an http(s) URL or data:image URL");
}

function validateExternalImageUrl(imageUrl) {
  validateImageUrl(imageUrl);
  const value = imageUrl.trim();
  if (/^data:image\/[a-z0-9.+-]+[;,]/i.test(value)) return;
  const url = new URL(value);
  if (isPrivateHost(url.hostname)) {
    badRequest("imageUrl for vision proxy must be a public http(s) URL or data:image URL");
  }
}

function validateVisionImageDimensions(body) {
  assertPlainObject(body, "vision alignment payload");
  requirePositiveInteger(body.imageWidth, "imageWidth");
  requirePositiveInteger(body.imageHeight, "imageHeight");
  return {
    imageWidth: body.imageWidth,
    imageHeight: body.imageHeight
  };
}

function isPrivateHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.includes(":")) {
    if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
    if (/^(fc|fd)[0-9a-f]{0,2}:/i.test(host) || /^fe80:/i.test(host)) return true;
    return false;
  }
  const octets = host.split(".");
  if (octets.length !== 4 || octets.some((item) => !/^\d+$/.test(item))) return false;
  const numbers = octets.map(Number);
  if (numbers.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) return false;
  const [a, b] = numbers;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    badRequest(`${label} must be an object`);
  }
}

function optionalPlainObject(value, label) {
  if (value !== undefined) {
    assertPlainObject(value, label);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    badRequest(`${label} must be a non-empty string`);
  }
}

function optionalString(value, label) {
  if (value !== undefined && typeof value !== "string") {
    badRequest(`${label} must be a string`);
  }
}

function requirePositiveNumber(value, label) {
  requireFiniteNumber(value, label);
  if (value <= 0) {
    badRequest(`${label} must be positive`);
  }
}

function requirePositiveInteger(value, label) {
  requireFiniteNumber(value, label);
  if (!Number.isInteger(value) || value < 16) {
    badRequest(`${label} must be an integer >= 16`);
  }
}

function requireFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    badRequest(`${label} must be a finite number`);
  }
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

module.exports = {
  validateChatImagePayload,
  validateExternalImageUrl,
  validateImageUrl,
  validateVisionImageDimensions,
  validateThreadPayload
};
