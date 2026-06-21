"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { fetchWithTimeout } = require("./providers");

const HEALTH_FIXTURE_BASE64 =
  "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";

function createHealthFixtureDataUrl() {
  return `data:image/x-portable-pixmap;base64,${createHealthFixturePpm().toString("base64")}`;
}

function createHealthModules() {
  return [
    { moduleId: "module_1", label: "Input", order: 1, text: "Ask" },
    { moduleId: "module_2", label: "Layout", order: 2, text: "Plan" },
    { moduleId: "module_3", label: "Thread", order: 3, text: "Follow" }
  ];
}

async function runLocalOcrHealth(serverConfig) {
  const fixtureDataUrl =
    serverConfig.localOcrHealthFixtureDataUrl || (await createOcrHealthFixtureDataUrl(serverConfig));
  const parsed = await runLocalOcrAlignment(serverConfig, {
    imageUrl: fixtureDataUrl,
    imageWidth: 900,
    imageHeight: 500,
    modules: createHealthModules(),
    purpose: "local_ocr_health"
  });
  if (parsed.modules.length !== 3) {
    const error = new Error("Local OCR health check did not return all fixture modules");
    error.statusCode = 502;
    throw error;
  }
  return parsed;
}

async function createOcrHealthFixtureDataUrl(serverConfig) {
  const python = serverConfig.localOcrPython || "python";
  const scriptPath = serverConfig.localOcrHealthFixtureScriptPath || path.join(__dirname, "..", "scripts", "create_ocr_health_fixture.py");
  const timeoutMs = Number(serverConfig.localOcrTimeoutMs || 30_000);
  const bytes = await runBinaryPythonScript(python, [scriptPath], timeoutMs, "Local OCR health fixture");
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function runLocalOcrAlignment(serverConfig, { imageUrl, imageWidth, imageHeight, modules, purpose }) {
  const normalizedModules = normalizeModules(modules);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-local-ocr-"));
  try {
    const image = await materializeImage(serverConfig, imageUrl, tempDir);
    const modulesPath = path.join(tempDir, "modules.json");
    fs.writeFileSync(modulesPath, JSON.stringify(normalizedModules, null, 2));
    const output = await runWorker(serverConfig, {
      imagePath: image.filePath,
      modulesPath,
      imageWidth,
      imageHeight,
      purpose
    });
    return normalizeWorkerOutput(output, normalizedModules);
  } finally {
    // Always remove the temp dir even on failure; never let it leak.
    fs.rm(tempDir, { recursive: true, force: true }, (rmError) => {
      if (rmError) {
        // Don't throw from the callback — just log; the worker may briefly hold
        // the file open on Windows. The OS will reclaim it on next restart.
        console.warn(`[local-ocr] could not remove temp dir ${tempDir}: ${rmError.message}`);
      }
    });
  }
}

function normalizeModules(modules) {
  if (!Array.isArray(modules) || modules.length === 0) {
    const error = new Error("Local OCR alignment requires a non-empty modules array");
    error.statusCode = 400;
    throw error;
  }
  return modules.map((module, index) => {
    const moduleId = String(module.moduleId || module.id || "").trim();
    const label = String(module.label || module.title || "").trim();
    if (!moduleId || !label) {
      const error = new Error(`Local OCR module ${index + 1} requires moduleId and label`);
      error.statusCode = 400;
      throw error;
    }
    return {
      moduleId,
      label,
      order: Number(module.order || index + 1),
      text: String(module.text || module.imageText || ""),
      regionKind: String(module.regionKind || "card"),
      regionPrompt: String(module.regionPrompt || module.visualPrompt || label)
    };
  });
}

async function materializeImage(serverConfig, imageUrl, tempDir) {
  const maxBytes = Number(serverConfig.localOcrMaxImageBytes || 8 * 1024 * 1024);
  const source = String(imageUrl || "").trim();
  if (/^data:image\//i.test(source)) {
    return writeDataImage(source, tempDir, maxBytes);
  }
  const response = await fetchWithTimeout(
    source,
    {},
    {
      label: "Local OCR image download",
      timeoutMs: serverConfig.apiRequestTimeoutMs || 45_000,
      retryAttempts: serverConfig.apiFetchRetryAttempts,
      retryDelayMs: serverConfig.apiFetchRetryDelayMs
    }
  );
  if (!response.ok) {
    const error = new Error(`Local OCR image download failed (${response.status})`);
    error.statusCode = 502;
    throw error;
  }
  const contentType = response.headers.get("content-type") || "";
  if (!/^image\//i.test(contentType)) {
    const error = new Error(`Local OCR image download returned non-image content-type: ${contentType || "unknown"}`);
    error.statusCode = 400;
    throw error;
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxBytes) {
    const error = new Error(`Local OCR image exceeds ${maxBytes} bytes`);
    error.statusCode = 413;
    throw error;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) {
    const error = new Error(`Local OCR image exceeds ${maxBytes} bytes`);
    error.statusCode = 413;
    throw error;
  }
  return writeImageBytes(bytes, contentType, tempDir);
}

function writeDataImage(dataUrl, tempDir, maxBytes) {
  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+)(;base64)?,([\s\S]*)$/i);
  if (!match) {
    const error = new Error("Local OCR data:image URL is invalid");
    error.statusCode = 400;
    throw error;
  }
  const contentType = match[1].toLowerCase();
  const encoded = match[3] || "";
  const bytes = match[2] ? Buffer.from(encoded, "base64") : Buffer.from(decodeURIComponent(encoded), "utf8");
  if (bytes.length > maxBytes) {
    const error = new Error(`Local OCR image exceeds ${maxBytes} bytes`);
    error.statusCode = 413;
    throw error;
  }
  return writeImageBytes(bytes, contentType, tempDir);
}

function writeImageBytes(bytes, contentType, tempDir) {
  if (!bytes.length) {
    const error = new Error("Local OCR image is empty");
    error.statusCode = 400;
    throw error;
  }
  const ext = extensionForContentType(contentType);
  const filePath = path.join(tempDir, `image.${ext}`);
  fs.writeFileSync(filePath, bytes);
  return { filePath, byteLength: bytes.length, contentType };
}

function extensionForContentType(contentType) {
  if (/portable-pixmap|x-portable-pixmap|x-portable-anymap|ppm/i.test(contentType)) return "ppm";
  if (/jpeg|jpg/i.test(contentType)) return "jpg";
  if (/webp/i.test(contentType)) return "webp";
  if (/svg/i.test(contentType)) return "svg";
  return "png";
}

function createHealthFixturePpm() {
  const width = 640;
  const height = 360;
  const pixels = Buffer.alloc(width * height * 3, 255);
  const cards = [
    { x: 40, y: 86, w: 170, h: 128, text: "01 INPUT" },
    { x: 240, y: 86, w: 170, h: 128, text: "02 LAYOUT" },
    { x: 440, y: 86, w: 170, h: 128, text: "03 THREAD" }
  ];
  drawText(pixels, width, 44, 28, "CHATIMAGE OCR HEALTH", 3);
  for (const card of cards) {
    drawRect(pixels, width, height, card.x, card.y, card.w, card.h, [242, 248, 255]);
    drawBorder(pixels, width, height, card.x, card.y, card.w, card.h, [20, 90, 140], 4);
    drawText(pixels, width, card.x + 18, card.y + 44, card.text, 4);
  }
  return Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`, "ascii"), pixels]);
}

const FONT_5X7 = {
  "0": ["111", "101", "101", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "010", "010", "111"],
  "2": ["111", "001", "001", "111", "100", "100", "111"],
  "3": ["111", "001", "001", "111", "001", "001", "111"],
  A: ["010", "101", "101", "111", "101", "101", "101"],
  C: ["111", "100", "100", "100", "100", "100", "111"],
  D: ["110", "101", "101", "101", "101", "101", "110"],
  E: ["111", "100", "100", "111", "100", "100", "111"],
  G: ["111", "100", "100", "101", "101", "101", "111"],
  H: ["101", "101", "101", "111", "101", "101", "101"],
  I: ["111", "010", "010", "010", "010", "010", "111"],
  L: ["100", "100", "100", "100", "100", "100", "111"],
  M: ["101", "111", "111", "101", "101", "101", "101"],
  N: ["101", "111", "111", "111", "101", "101", "101"],
  O: ["111", "101", "101", "101", "101", "101", "111"],
  P: ["111", "101", "101", "111", "100", "100", "100"],
  R: ["110", "101", "101", "110", "101", "101", "101"],
  T: ["111", "010", "010", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "101", "101", "111"],
  Y: ["101", "101", "101", "010", "010", "010", "010"],
  " ": ["0", "0", "0", "0", "0", "0", "0"]
};

function drawText(pixels, width, x, y, text, scale) {
  let cursor = x;
  for (const char of String(text || "").toUpperCase()) {
    const glyph = FONT_5X7[char] || FONT_5X7[" "];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] !== "1") continue;
        fillRect(pixels, width, cursor + col * scale, y + row * scale, scale, scale, [0, 0, 0]);
      }
    }
    cursor += (glyph[0].length + 1) * scale;
  }
}

function drawRect(pixels, width, height, x, y, w, h, color) {
  fillRect(pixels, width, x, y, Math.min(w, width - x), Math.min(h, height - y), color);
}

function drawBorder(pixels, width, height, x, y, w, h, color, size) {
  fillRect(pixels, width, x, y, w, size, color);
  fillRect(pixels, width, x, y + h - size, w, size, color);
  fillRect(pixels, width, x, y, size, h, color);
  fillRect(pixels, width, x + w - size, y, size, h, color);
}

function fillRect(pixels, width, x, y, w, h, color) {
  for (let yy = Math.max(0, y); yy < y + h; yy += 1) {
    for (let xx = Math.max(0, x); xx < x + w; xx += 1) {
      const offset = (yy * width + xx) * 3;
      if (offset < 0 || offset + 2 >= pixels.length) continue;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
    }
  }
}

function runWorker(serverConfig, { imagePath, modulesPath, imageWidth, imageHeight, purpose }) {
  const python = serverConfig.localOcrPython || "python";
  const workerPath = serverConfig.localOcrWorkerPath;
  const timeoutMs = Number(serverConfig.localOcrTimeoutMs || 30_000);
  if (!workerPath || !fs.existsSync(workerPath)) {
    const error = new Error(`Local OCR worker not found: ${workerPath || "(empty)"}`);
    error.statusCode = 503;
    throw error;
  }
  const args = [
    workerPath,
    "--image",
    imagePath,
    "--modules",
    modulesPath,
    "--image-width",
    String(imageWidth),
    "--image-height",
    String(imageHeight),
    "--purpose",
    purpose || "local_ocr_align"
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(python, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill("SIGKILL");
      const error = new Error(`Local OCR worker timed out after ${timeoutMs}ms`);
      error.statusCode = 504;
      reject(error);
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (spawnError) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const error = new Error(`Local OCR worker failed to start: ${spawnError.message}`);
      error.statusCode = 503;
      reject(error);
    });
    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (code !== 0) {
        const error = new Error(`Local OCR worker exited with code ${code}: ${stderr.trim() || stdout.trim()}`);
        error.statusCode = 502;
        reject(error);
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (parseError) {
        const error = new Error(`Local OCR worker returned non-JSON output: ${parseError.message}`);
        error.statusCode = 502;
        reject(error);
      }
    });
  });
}

function runBinaryPythonScript(python, args, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, args, { windowsHide: true });
    const chunks = [];
    let stderr = "";
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill("SIGKILL");
      const error = new Error(`${label} timed out after ${timeoutMs}ms`);
      error.statusCode = 504;
      reject(error);
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (spawnError) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const error = new Error(`${label} failed to start: ${spawnError.message}`);
      error.statusCode = 503;
      reject(error);
    });
    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (code !== 0) {
        const error = new Error(`${label} exited with code ${code}: ${stderr.trim() || "no stderr"}`);
        error.statusCode = 502;
        reject(error);
        return;
      }
      const bytes = Buffer.concat(chunks);
      if (!bytes.length) {
        const error = new Error(`${label} produced an empty image`);
        error.statusCode = 502;
        reject(error);
        return;
      }
      resolve(bytes);
    });
  });
}

function normalizeWorkerOutput(value, requestedModules) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const error = new Error("Local OCR worker output must be a JSON object");
    error.statusCode = 502;
    throw error;
  }
  const modules = Array.isArray(value.modules) ? value.modules : null;
  if (!modules) {
    const error = new Error("Local OCR worker output missing modules array");
    error.statusCode = 502;
    throw error;
  }
  const requestedIds = new Set(requestedModules.map((module) => module.moduleId));
  const normalizedModules = modules.map((module, index) => {
    if (!module || typeof module !== "object" || Array.isArray(module)) {
      throwLocalOutputError(`Local OCR modules[${index}] must be an object`);
    }
    const moduleId = String(module.moduleId || module.id || "").trim();
    if (!requestedIds.has(moduleId)) {
      throwLocalOutputError(`Local OCR returned unknown moduleId: ${moduleId || "(empty)"}`);
    }
    return {
      moduleId,
      label: String(module.label || ""),
      matchedText: String(module.matchedText || ""),
      bounds: normalizeBounds(module.bounds, moduleId),
      confidence: normalizeConfidence(module.confidence, moduleId)
    };
  });
  return {
    modules: normalizedModules,
    ocrRaw: Array.isArray(value.ocrRaw) ? value.ocrRaw : [],
    warnings: Array.isArray(value.warnings) ? value.warnings.map((item) => String(item)) : []
  };
}

function normalizeBounds(bounds, moduleId) {
  if (!bounds || typeof bounds !== "object" || Array.isArray(bounds)) {
    throwLocalOutputError(`Local OCR ${moduleId} missing bounds`);
  }
  const normalized = {
    x: Number(bounds.x),
    y: Number(bounds.y),
    width: Number(bounds.width ?? bounds.w),
    height: Number(bounds.height ?? bounds.h)
  };
  for (const [key, value] of Object.entries(normalized)) {
    if (!Number.isFinite(value)) {
      throwLocalOutputError(`Local OCR ${moduleId} bounds.${key} is invalid`);
    }
  }
  if (
    normalized.x < 0 ||
    normalized.y < 0 ||
    normalized.width <= 0 ||
    normalized.height <= 0 ||
    normalized.x + normalized.width > 1 ||
    normalized.y + normalized.height > 1
  ) {
    throwLocalOutputError(`Local OCR ${moduleId} bounds are outside normalized image bounds`);
  }
  return normalized;
}

function normalizeConfidence(value, moduleId) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throwLocalOutputError(`Local OCR ${moduleId} confidence must be between 0 and 1`);
  }
  return confidence;
}

function throwLocalOutputError(message) {
  const error = new Error(message);
  error.statusCode = 502;
  throw error;
}

module.exports = {
  createHealthFixtureDataUrl,
  createHealthModules,
  materializeImage,
  normalizeWorkerOutput,
  runLocalOcrAlignment,
  runLocalOcrHealth
};
