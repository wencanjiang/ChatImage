(function initDownload(global) {
  "use strict";

  const EXTENSIONS = new Set(["svg", "png", "jpg", "jpeg", "webp", "gif"]);

  function buildImageDownloadName(result) {
    const extension = inferImageExtension(result && result.imageUrl);
    const baseName = sanitizeFilename((result && result.title) || "chatimage");
    return `${stripImageExtension(baseName) || "chatimage"}.${extension}`;
  }

  function inferImageExtension(imageUrl) {
    const value = String(imageUrl || "");
    const dataMatch = value.match(/^data:image\/([^;,]+)/i);
    if (dataMatch) return normalizeExtension(dataMatch[1]);

    const path = getUrlPath(value);
    const extensionMatch = path.match(/\.([a-z0-9]+)$/i);
    if (extensionMatch) return normalizeExtension(extensionMatch[1]);

    return "png";
  }

  function sanitizeFilename(value) {
    const sanitized = String(value || "")
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .slice(0, 80);
    return sanitized || "chatimage";
  }

  function stripImageExtension(value) {
    return value.replace(/\.(svg|png|jpe?g|webp|gif)$/i, "");
  }

  function normalizeExtension(value) {
    const extension = String(value || "").toLowerCase();
    if (extension === "svg+xml") return "svg";
    if (extension === "jpeg") return "jpg";
    if (EXTENSIONS.has(extension)) return extension;
    return "png";
  }

  function getUrlPath(value) {
    try {
      return new URL(value, "http://chatimage.local").pathname;
    } catch {
      return value.split(/[?#]/)[0];
    }
  }

  const api = {
    buildImageDownloadName,
    inferImageExtension,
    sanitizeFilename
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ChatImageDownload = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
