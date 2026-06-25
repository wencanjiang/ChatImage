"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const EXTENSION_BY_MIME = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg"
};

const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];

function isRemoteHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function guessExtensionFromUrl(imageUrl) {
  try {
    const ext = path.extname(new URL(imageUrl).pathname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) return ext === ".jpeg" ? ".jpg" : ext;
  } catch {
    // ignore malformed URLs; the caller falls back to a default extension
  }
  return "";
}

// Downloads a remote image once and stores it under cacheDir, keyed by content
// hash so identical images de-duplicate and the local URL stays stable across
// reloads. Returns { localUrl, filePath, bytes, contentType } or null when the
// URL is not a cacheable remote image, the response is not an image, or any
// network/IO error occurs. Caching is best-effort: a null result means the
// caller should keep using the original remote URL.
async function cacheRemoteImage(imageUrl, options = {}) {
  const cacheDir = options.cacheDir;
  const urlPrefix = options.urlPrefix || "/image-cache/";
  if (!cacheDir || !isRemoteHttpUrl(imageUrl)) return null;

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") return null;

  const timeoutMs = Number(options.timeoutMs || 20000);
  const maxBytes = Number(options.maxBytes || 16 * 1024 * 1024);

  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  const parentSignal = options.signal;
  if (parentSignal) {
    if (parentSignal.aborted) return null;
    parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // SSRF guard: reject private/loopback/link-local hosts before fetching.
  try {
    const _u = new URL(imageUrl);
    const _h = _u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (_h === "localhost" || _h.endsWith(".localhost") || _h === "::1" || _h === "::") return null;
    const _m = _h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (_m) {
      const [a, b] = [Number(_m[1]), Number(_m[2])];
      if (a === 0 || a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) ||
          (a === 192 && b === 168) || (a === 169 && b === 254) || a >= 224) return null;
    }
  } catch {}

  try {
    const response = await fetchImpl(imageUrl, { signal: controller.signal });
    if (!response || !response.ok) return null;

    const contentType = String(response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!contentType.startsWith("image/")) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > maxBytes) return null;

    const ext = EXTENSION_BY_MIME[contentType] || guessExtensionFromUrl(imageUrl) || ".png";
    const hash = crypto.createHash("sha1").update(buffer).digest("hex").slice(0, 32);
    const filename = `${hash}${ext}`;
    const filePath = path.join(cacheDir, filename);

    await fsp.mkdir(cacheDir, { recursive: true });
    if (!fs.existsSync(filePath)) {
      // Write to a unique temp file then atomically rename so concurrent
      // requests never observe a half-written image.
      const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      await fsp.writeFile(tempPath, buffer);
      try {
        await fsp.rename(tempPath, filePath);
      } catch (renameError) {
        await fsp.rm(tempPath, { force: true }).catch(() => {});
        if (!fs.existsSync(filePath)) throw renameError;
      }
    }

    return {
      localUrl: urlPrefix + filename,
      filePath,
      bytes: buffer.length,
      contentType
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort);
  }
}

module.exports = { cacheRemoteImage, isRemoteHttpUrl, guessExtensionFromUrl };
