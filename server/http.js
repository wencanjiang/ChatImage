"use strict";

const fs = require("fs");
const path = require("path");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function loadEnvFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) return;
  const overwrite = Boolean(options.overwrite);
  const preserveKeys = options.preserveKeys instanceof Set ? options.preserveKeys : new Set();
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined || (overwrite && !preserveKeys.has(key))) process.env[key] = value;
  }
}

function assertSameOriginRequest(req, serverConfig = {}) {
  if (!isUnsafeMethod(req.method)) return;
  const url = String(req.url || "");
  if (!url.startsWith("/api/")) return;
  const source = req.headers.origin || req.headers.referer || "";
  if (!source) {
    // No Origin/Referer header: this is a non-browser client (curl, local tooling,
    // or the in-process Node test client). Those cannot be CSRF-forged, so allow.
    // But still defend against a real browser that suppressed Origin/Referer: a
    // cross-origin browser request always carries Sec-Fetch-Site: cross-site.
    const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
    if (fetchSite === "cross-site") rejectCrossOrigin("cross-site (no origin header)");
    return;
  }
  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    return rejectCrossOrigin(source);
  }
  const expectedHost = String(req.headers.host || "").toLowerCase();
  const allowedOrigins = new Set(
    [serverConfig.publicOrigin, `http://${expectedHost}`, `https://${expectedHost}`]
      .filter(Boolean)
      .map((value) => String(value).replace(/\/+$/, "").toLowerCase())
  );
  const actualOrigin = parsed.origin.replace(/\/+$/, "").toLowerCase();
  if (!allowedOrigins.has(actualOrigin)) rejectCrossOrigin(source);
}

function isUnsafeMethod(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(String(method || "").toUpperCase());
}

function rejectCrossOrigin(source) {
  const error = new Error(`Cross-origin API request rejected: ${source}`);
  error.statusCode = 403;
  throw error;
}

function requireApiKey(serverConfig) {
  if (serverConfig.apiKey) return;
  const error = new Error("Missing CHATIMAGE_API_KEY. Create .env.local or set the environment variable.");
  error.statusCode = 503;
  throw error;
}

const DEFAULT_MAX_JSON_BODY_BYTES = 32 * 1024 * 1024;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let receivedBytes = 0;
    let settled = false;
    const maxBytes = getMaxJsonBodyBytes();
    const fail = (error) => {
      if (settled) return;
      settled = true;
      raw = "";
      reject(error);
    };
    req.on("data", (chunk) => {
      if (settled) return;
      receivedBytes += Buffer.byteLength(chunk);
      if (receivedBytes > maxBytes) {
        const error = new Error("Request body too large");
        error.statusCode = 413;
        fail(error);
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        error.statusCode = 400;
        raw = "";
        reject(error);
      }
    });
    req.on("error", fail);
  });
}

function getMaxJsonBodyBytes() {
  const configured = Number(process.env.CHATIMAGE_MAX_JSON_BODY_BYTES || "");
  if (Number.isFinite(configured) && configured >= 1024 * 1024) return configured;
  return DEFAULT_MAX_JSON_BODY_BYTES;
}

function sendJson(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(value));
}

function serveStatic(urlPath, res, staticDir) {
  const baseDir = path.resolve(staticDir);
  const normalizedPath = decodeURIComponent(urlPath === "/" ? "/index.html" : urlPath);
  const filePath = path.normalize(path.join(baseDir, normalizedPath));
  const relativePath = path.relative(baseDir, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return sendJson(res, 404, { error: "Not found" });
  }
  const ext = path.extname(filePath);
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": getStaticCacheControl(ext, relativePath)
  });
  fs.createReadStream(filePath).pipe(res);
}

function getStaticCacheControl(ext, relativePath = "") {
  if (ext === ".html" || ext === ".json") return "no-cache";
  // dist/ assets are emitted with content-hash filenames (e.g. app.a1b2c3d4.js),
  // so they are safe to cache long-term and immutable.
  const normalized = String(relativePath).replace(/\\/g, "/");
  const basename = path.basename(normalized);
  const isHashedDistAsset =
    /^dist\//i.test(normalized) &&
    !/\.map$/i.test(normalized) &&
    /\.[a-f0-9]{8,}\./i.test(basename) &&
    [".js", ".css", ".png", ".jpg", ".jpeg", ".svg", ".ttf", ".otf", ".woff", ".woff2"].includes(ext);
  if (isHashedDistAsset) return "public, max-age=31536000, immutable";
  if ([".png", ".jpg", ".jpeg", ".svg", ".ttf", ".otf", ".woff", ".woff2"].includes(ext)) {
    return "public, max-age=86400";
  }
  return "no-cache";
}

module.exports = {
  assertSameOriginRequest,
  getStaticCacheControl,
  loadEnvFile,
  mimeTypes,
  readJson,
  requireApiKey,
  sendJson,
  serveStatic
};
