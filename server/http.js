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
  if (!source) return;
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

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        const error = new Error("Request body too large");
        error.statusCode = 413;
        req.destroy();
        reject(error);
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        error.statusCode = 400;
        reject(error);
      }
    });
    req.on("error", reject);
  });
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
    "Cache-Control": getStaticCacheControl(ext)
  });
  fs.createReadStream(filePath).pipe(res);
}

function getStaticCacheControl(ext) {
  if (ext === ".html" || ext === ".json") return "no-cache";
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
