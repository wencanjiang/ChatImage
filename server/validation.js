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
  validateLayoutQuality(result.layout.regions, result);
  validateHotspotRegionBindings(result.hotspots, result.layout.regions);
  optionalString(result.imagePrompt, "imagePrompt");
  optionalPlainObject(result.alignmentRaw, "alignmentRaw");
  optionalString(result.createdAt, "createdAt");
  optionalString(result.updatedAt, "updatedAt");
  return result;
}

function validateLayoutQuality(regions, result) {
  const validation = core.validateLayoutRegions(regions);
  if (validation.valid) return;
  if (allowsSemanticOverlap(result)) {
    const nonOverlapErrors = validation.errors.filter((error) => !/\boverlaps\b/.test(String(error)));
    if (!nonOverlapErrors.length) return;
    badRequest(`layout quality check failed: ${nonOverlapErrors.join("; ")}`);
  }
  badRequest(`layout quality check failed: ${validation.errors.join("; ")}`);
}

function allowsSemanticOverlap(result) {
  const visualMode = String(result && result.structuredSpec && result.structuredSpec.visualMode ? result.structuredSpec.visualMode : "").toLowerCase();
  const layoutVariant = String(result && result.layout && (result.layout.layoutVariant || result.layout.variant) ? result.layout.layoutVariant || result.layout.variant : "").toLowerCase();
  const family = String(result && result.layout && result.layout.family ? result.layout.family : "").toLowerCase();
  const clickBoundsSource = String(result && result.layout && result.layout.clickBoundsSource ? result.layout.clickBoundsSource : "").toLowerCase();
  const alignmentProvider = String(result && result.alignmentRaw && result.alignmentRaw.provider ? result.alignmentRaw.provider : "").toLowerCase();
  const hitTestOk = Boolean(result && result.alignmentRaw && result.alignmentRaw.hitTest && result.alignmentRaw.hitTest.ok);
  return (
    /^(map|scene|poster)$/.test(visualMode) ||
    /^(map|scene|poster|organic-map|illustrated-scene)$/.test(layoutVariant) ||
    /^(map|scene|poster)$/.test(family) ||
    (clickBoundsSource === "hotspot-derived" && hitTestOk) ||
    (clickBoundsSource === "manual-calibration" && alignmentProvider === "manual-calibration")
  );
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
    optionalString(hotspot.imageTitle, `hotspots[${index}].imageTitle`);
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
  if (hotspot.imageTitle !== undefined && textLength(hotspot.imageTitle) > hotspot.textBudget.titleMaxChars) {
    badRequest(`${path}.imageTitle exceeds textBudget.titleMaxChars`);
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
  // Locally cached images persist as a same-origin relative path (e.g.
  // /image-cache/<hash>.png) so history replays survive the upstream CDN URL
  // expiring. Accept that exact shape without slashes/traversal in the filename.
  if (/^\/image-cache\/[A-Za-z0-9._-]+$/.test(value)) return;
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
  // The local image-cache relative path is same-origin, not publicly fetchable
  // by the upstream vision model, so reject it here (validateImageUrl allows it
  // only for history persistence).
  if (/^\/image-cache\//.test(value)) {
    badRequest("imageUrl for vision proxy must be a public http(s) URL or data:image URL");
  }
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
    // IPv6
    if (host === "::" || host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
    if (/^(fc|fd)[0-9a-f]{0,2}:/i.test(host) || /^fe80:/i.test(host)) return true;
    // IPv4-mapped IPv6 — both dotted form (::ffff:127.0.0.1) and the WHATWG-
    // URL-normalized hex form (::ffff:7f00:1) must be reduced to IPv4 and
    // re-checked, otherwise an attacker can wrap a private address in IPv6
    // syntax to bypass the allowlist.
    const dotted = host.match(/^::ffff:([0-9.]+)$/i);
    if (dotted) return isPrivateHost(dotted[1]);
    const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hex) {
      const high = parseInt(hex[1], 16);
      const low = parseInt(hex[2], 16);
      if (Number.isFinite(high) && Number.isFinite(low)) {
        const ipv4 = `${(high >>> 8) & 0xff}.${high & 0xff}.${(low >>> 8) & 0xff}.${low & 0xff}`;
        return isPrivateHost(ipv4);
      }
    }
    return false;
  }
  const numeric = parseNumericIPv4(host);
  if (numeric) {
    const [a, b] = numeric;
    return (
      a === 0 ||                                // 0.0.0.0/8
      a === 10 ||                               // 10.0.0.0/8
      a === 127 ||                              // 127.0.0.0/8 loopback
      (a === 100 && b >= 64 && b <= 127) ||     // 100.64.0.0/10 CGNAT
      (a === 169 && b === 254) ||               // 169.254.0.0/16 link-local
      (a === 172 && b >= 16 && b <= 31) ||      // 172.16.0.0/12
      (a === 192 && b === 0 && numeric[2] === 0) || // 192.0.0.0/24
      (a === 192 && b === 0 && numeric[2] === 2) || // 192.0.2.0/24 TEST-NET-1
      (a === 192 && b === 168) ||               // 192.168.0.0/16
      (a === 198 && (b === 18 || b === 19)) ||  // 198.18.0.0/15 benchmark
      (a === 198 && b === 51 && numeric[2] === 100) || // TEST-NET-2
      (a === 203 && b === 0 && numeric[2] === 113) ||  // TEST-NET-3
      a >= 224 ||                               // 224.0.0.0/4 multicast + reserved
      false
    );
  }
  // Non-numeric hostname: leave to higher-layer DNS resolution / fetch.
  return false;
}

// Parse IPv4 in any of the forms accepted by getaddrinfo on most platforms:
// "127.0.0.1", "0177.0.0.1" (octal), "0x7f.0.0.1" (hex), "2130706433" (decimal),
// or 2- and 3-part shortened forms ("127.1", "127.0.1"). Returns 4 octets in
// big-endian order, or null when the string is clearly not an IPv4 literal.
function parseNumericIPv4(host) {
  if (!host) return null;
  const parts = host.split(".");
  if (parts.length === 0 || parts.length > 4) return null;
  const parsed = [];
  for (const part of parts) {
    if (part === "") return null;
    let value;
    if (/^0x[0-9a-f]+$/i.test(part)) value = parseInt(part, 16);
    else if (/^0[0-7]+$/.test(part)) value = parseInt(part, 8);
    else if (/^\d+$/.test(part)) value = parseInt(part, 10);
    else return null;
    if (!Number.isFinite(value) || value < 0) return null;
    parsed.push(value);
  }
  // Expand short forms per inet_aton: last component fills remaining octets.
  if (parsed.length === 1) {
    const n = parsed[0];
    if (n > 0xffffffff) return null;
    return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  }
  if (parsed.length === 2) {
    if (parsed[0] > 255 || parsed[1] > 0xffffff) return null;
    const n = parsed[1];
    return [parsed[0], (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  }
  if (parsed.length === 3) {
    if (parsed[0] > 255 || parsed[1] > 255 || parsed[2] > 0xffff) return null;
    const n = parsed[2];
    return [parsed[0], parsed[1], (n >>> 8) & 0xff, n & 0xff];
  }
  if (parsed.some((value) => value > 255)) return null;
  return parsed;
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
