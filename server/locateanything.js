"use strict";

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { materializeImage } = require("./local-ocr");

const REQUIRED_LICENSE_ACK = "research-evaluation";
const clients = new Map();

async function runLocateAnythingHealth(serverConfig) {
  const licenseAck = hasLocateAnythingLicenseAck(serverConfig);
  const cudaAvailable = checkLocateAnythingCudaAvailable(serverConfig);
  const base = {
    ok: licenseAck && cudaAvailable,
    provider: "locateanything",
    model: serverConfig.locateAnythingModel || "nvidia/LocateAnything-3B",
    device: serverConfig.locateAnythingDevice || "cuda",
    cudaAvailable,
    licenseAck,
    warnings: []
  };
  if (!licenseAck) {
    base.warnings.push("CHATIMAGE_LOCATEANYTHING_LICENSE_ACK=research-evaluation is required for non-commercial research/evaluation use.");
  }
  if (!cudaAvailable) {
    base.warnings.push("LocateAnything CUDA runtime is not available in the configured Python environment.");
  }
  if (!licenseAck) return base;
  try {
    const response = await getLocateAnythingClient(serverConfig).request({ type: "health" }, getTimeoutMs(serverConfig));
    return {
      ...base,
      ...response,
      ok: Boolean(response.ok && licenseAck),
      licenseAck,
      warnings: [...base.warnings, ...normalizeWarnings(response.warnings)]
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      warnings: [...base.warnings, error.message || String(error)]
    };
  }
}

async function runLocateAnythingPreload(serverConfig) {
  requireLocateAnythingLicenseAck(serverConfig);
  return getLocateAnythingClient(serverConfig).request({ type: "preload" }, getTimeoutMs(serverConfig));
}

async function runLocateAnythingAlignment(serverConfig, { imageUrl, imageWidth, imageHeight, modules, purpose }) {
  requireLocateAnythingLicenseAck(serverConfig);
  const normalizedModules = normalizeModules(modules);
  const tempDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "chatimage-locateanything-"));
  try {
    const image = await materializeImage(serverConfig, imageUrl, tempDir);
    const response = await getLocateAnythingClient(serverConfig).request(
      {
        type: "align",
        imagePath: image.filePath,
        imageWidth,
        imageHeight,
        modules: normalizedModules,
        purpose: purpose || "locateanything_align"
      },
      getTimeoutMs(serverConfig)
    );
    return normalizeLocateAnythingOutput(response, normalizedModules);
  } finally {
    fs.rm(tempDir, { recursive: true, force: true }, () => {});
  }
}

async function runLocateAnythingAlignmentWithFallback(serverConfig, request, helpers) {
  const providerChain = ["locateanything"];
  const warnings = [];
  let locateParsed = {
    modules: [],
    rejectedModules: [],
    warnings: [],
    raw: null
  };

  try {
    locateParsed = await runLocateAnythingAlignment(serverConfig, request);
    warnings.push(...locateParsed.warnings);
  } catch (error) {
    warnings.push(error.message || String(error));
  }

  const modules = normalizeModules(request.modules);
  const byId = new Map();
  const acceptedLocateAnythingModules = [];
  const acceptedLocalOcrModules = [];
  const rejectedModules = [...(locateParsed.rejectedModules || [])];
  for (const item of locateParsed.modules || []) {
    byId.set(item.moduleId, { ...item, source: "locateanything" });
    acceptedLocateAnythingModules.push(item.moduleId);
  }

  const missingAfterLocate = modules.filter((module) => !byId.has(module.moduleId));
  if (missingAfterLocate.length && helpers && typeof helpers.runLocalOcrAlignment === "function") {
    providerChain.push("local-ocr");
    try {
      const local = await helpers.runLocalOcrAlignment(serverConfig, request);
      for (const item of local.modules || []) {
        if (!byId.has(item.moduleId)) {
          byId.set(item.moduleId, { ...item, source: "local-ocr" });
          acceptedLocalOcrModules.push(item.moduleId);
        }
      }
      warnings.push(...normalizeWarnings(local.warnings));
    } catch (error) {
      warnings.push(`local-ocr fallback failed: ${error.message || String(error)}`);
    }
  }

  const fallbackModules = [];
  for (const module of modules) {
    if (byId.has(module.moduleId)) continue;
    if (module.plannedBounds) {
      providerChain.push("planned");
      fallbackModules.push(module.moduleId);
      byId.set(module.moduleId, {
        moduleId: module.moduleId,
        label: module.label,
        matchedText: "planned fallback",
        bounds: module.plannedBounds,
        confidence: 0.5,
        source: "planned"
      });
      continue;
    }
    rejectedModules.push({
      moduleId: module.moduleId,
      label: module.label,
      reason: "missing locateanything/local-ocr result and missing plannedBounds"
    });
  }

  const finalModules = modules.map((module) => byId.get(module.moduleId)).filter(Boolean);
  if (finalModules.length !== modules.length) {
    const missing = modules.filter((module) => !byId.has(module.moduleId)).map((module) => module.moduleId);
    const error = new Error(`LocateAnything alignment missing modules: ${missing.join(", ")}`);
    error.statusCode = 502;
    throw error;
  }

  return {
    provider: "locateanything",
    effectiveProvider: acceptedLocateAnythingModules.length
      ? "locateanything"
      : acceptedLocalOcrModules.length
      ? "local-ocr"
      : "planned",
    providerChain: Array.from(new Set(providerChain)),
    modules: finalModules,
    locateAnythingRaw: locateParsed.raw || null,
    acceptedModules: acceptedLocateAnythingModules,
    acceptedLocateAnythingModules,
    acceptedLocalOcrModules,
    rejectedModules,
    fallbackModules,
    sourceCounts: countModuleSources(finalModules),
    warnings
  };
}

function createLocateAnythingConfig(serverConfig) {
  return {
    locateAnythingConfigured: Boolean(
      serverConfig.locateAnythingPython &&
        serverConfig.locateAnythingWorkerPath &&
        serverConfig.locateAnythingModel &&
        hasLocateAnythingLicenseAck(serverConfig)
    ),
    locateAnythingModel: serverConfig.locateAnythingModel || "nvidia/LocateAnything-3B",
    locateAnythingLicenseAck: hasLocateAnythingLicenseAck(serverConfig),
    locateAnythingCudaAvailable: checkLocateAnythingCudaAvailable(serverConfig)
  };
}

function hasLocateAnythingLicenseAck(serverConfig) {
  return String(serverConfig.locateAnythingLicenseAck || "").trim() === REQUIRED_LICENSE_ACK;
}

function requireLocateAnythingLicenseAck(serverConfig) {
  if (hasLocateAnythingLicenseAck(serverConfig)) return;
  const error = new Error("CHATIMAGE_LOCATEANYTHING_LICENSE_ACK=research-evaluation is required before loading LocateAnything.");
  error.statusCode = 503;
  throw error;
}

function checkLocateAnythingCudaAvailable(serverConfig) {
  const python = serverConfig.locateAnythingPython || "python";
  const result = spawnSync(
    python,
    [
      "-c",
      "import json\ntry:\n import torch\n print(json.dumps({'cuda': bool(torch.cuda.is_available())}))\nexcept Exception as e:\n print(json.dumps({'cuda': False, 'error': str(e)}))"
    ],
    { encoding: "utf8", timeout: 6000, windowsHide: true }
  );
  if (result.error || result.status !== 0) return false;
  try {
    const parsed = JSON.parse(String(result.stdout || "").trim().split(/\r?\n/).pop() || "{}");
    return parsed.cuda === true;
  } catch {
    return false;
  }
}

function getLocateAnythingClient(serverConfig) {
  const workerPath = serverConfig.locateAnythingWorkerPath || "";
  let workerMtime = "";
  try {
    workerMtime = workerPath ? String(fs.statSync(workerPath).mtimeMs) : "";
  } catch {}
  const key = [
    serverConfig.locateAnythingPython || "python",
    workerPath,
    workerMtime,
    serverConfig.locateAnythingModel || "",
    serverConfig.locateAnythingDevice || "cuda",
    serverConfig.locateAnythingGenerationMode || "hybrid",
    serverConfig.locateAnythingMaxNewTokens || "",
    serverConfig.locateAnythingMaxImageSide || 960,
    process.env.CHATIMAGE_FAKE_LOCATE_MODE || ""
  ].join("|");
  if (!clients.has(key)) {
    clients.set(key, new LocateAnythingJsonlClient(serverConfig));
  }
  return clients.get(key);
}

function countModuleSources(modules) {
  const counts = {};
  for (const module of modules || []) {
    const source = String(module && module.source ? module.source : "unknown");
    counts[source] = (counts[source] || 0) + 1;
  }
  return counts;
}

class LocateAnythingJsonlClient {
  constructor(serverConfig) {
    this.serverConfig = serverConfig;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";
    this.child = null;
  }

  request(payload, timeoutMs) {
    this.ensureStarted();
    const id = `req_${this.nextId++}`;
    const message = { ...payload, id };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.stopChild();
        reject(new Error(`LocateAnything worker timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify(message)}\n`);
    });
  }

  ensureStarted() {
    if (this.child && !this.child.killed && this.child.exitCode === null && !this.child.stdin.destroyed) return;
    const workerPath = this.serverConfig.locateAnythingWorkerPath;
    if (!workerPath || !fs.existsSync(workerPath)) {
      const error = new Error(`LocateAnything worker not found: ${workerPath || "(empty)"}`);
      error.statusCode = 503;
      throw error;
    }
    const python = this.serverConfig.locateAnythingPython || "python";
    const args = [
      workerPath,
      "--model",
      this.serverConfig.locateAnythingModel || "nvidia/LocateAnything-3B",
      "--device",
      this.serverConfig.locateAnythingDevice || "cuda",
      "--generation-mode",
      this.serverConfig.locateAnythingGenerationMode || "hybrid",
      "--max-image-side",
      String(this.serverConfig.locateAnythingMaxImageSide || 960)
    ];
    if (Number.isFinite(Number(this.serverConfig.locateAnythingMaxNewTokens)) && Number(this.serverConfig.locateAnythingMaxNewTokens) > 0) {
      args.push("--max-new-tokens", String(this.serverConfig.locateAnythingMaxNewTokens));
    }
    this.child = spawn(python, args, { windowsHide: true });
    this.child.stdout.on("data", (chunk) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk) => {
      this.lastStderr = `${this.lastStderr || ""}${chunk.toString()}`;
    });
    this.child.on("error", (error) => this.rejectAll(`LocateAnything worker failed to start: ${error.message}`));
    this.child.on("close", (code) => {
      this.child = null;
      this.rejectAll(`LocateAnything worker exited with code ${code}: ${this.lastStderr || "no stderr"}`);
    });
    this.child.unref();
    if (this.child.stdin && typeof this.child.stdin.unref === "function") this.child.stdin.unref();
    if (this.child.stdout && typeof this.child.stdout.unref === "function") this.child.stdout.unref();
    if (this.child.stderr && typeof this.child.stderr.unref === "function") this.child.stderr.unref();
  }

  onStdout(chunk) {
    this.buffer += chunk.toString();
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const pending = this.pending.get(parsed.id);
      if (!pending) continue;
      this.pending.delete(parsed.id);
      clearTimeout(pending.timer);
      if (parsed.error) {
        pending.reject(new Error(parsed.error));
      } else {
        pending.resolve(parsed.result || {});
      }
    }
  }

  rejectAll(message) {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
      this.pending.delete(id);
    }
  }

  stopChild() {
    if (!this.child) return;
    try {
      this.child.kill("SIGKILL");
    } catch {}
    this.child = null;
  }
}

function normalizeLocateAnythingOutput(value, requestedModules) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const error = new Error("LocateAnything worker output must be a JSON object");
    error.statusCode = 502;
    throw error;
  }
  const requestedIds = new Set(requestedModules.map((module) => module.moduleId));
  const modules = Array.isArray(value.modules) ? value.modules : [];
  const normalizedModules = [];
  const rejectedModules = Array.isArray(value.rejectedModules) ? value.rejectedModules : [];
  for (const [index, item] of modules.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throwLocateOutputError(`LocateAnything modules[${index}] must be an object`);
    }
    const moduleId = String(item.moduleId || item.id || "").trim();
    if (!requestedIds.has(moduleId)) {
      throwLocateOutputError(`LocateAnything returned unknown moduleId: ${moduleId || "(empty)"}`);
    }
    normalizedModules.push({
      moduleId,
      label: String(item.label || ""),
      matchedText: String(item.matchedText || ""),
      bounds: normalizeBounds(item.bounds, moduleId),
      confidence: normalizeConfidence(item.confidence, moduleId),
      source: "locateanything",
      answer: String(item.answer || "")
    });
  }
  return {
    modules: normalizedModules,
    rejectedModules,
    warnings: normalizeWarnings(value.warnings),
    raw: value
  };
}

function normalizeModules(modules) {
  if (!Array.isArray(modules) || modules.length === 0) {
    const error = new Error("LocateAnything alignment requires a non-empty modules array");
    error.statusCode = 400;
    throw error;
  }
  return modules.map((module, index) => {
    const moduleId = String(module.moduleId || module.id || "").trim();
    const label = String(module.label || module.title || "").trim();
    if (!moduleId || !label) {
      const error = new Error(`LocateAnything module ${index + 1} requires moduleId and label`);
      error.statusCode = 400;
      throw error;
    }
    const text = String(module.text || module.imageText || "");
    const regionPrompt = String(module.regionPrompt || module.visualPrompt || label);
    return {
      moduleId,
      label,
      order: Number(module.order || index + 1),
      text,
      regionKind: String(module.regionKind || "card"),
      regionPrompt,
      semanticHint: buildSemanticHint({ ...module, label, text, regionPrompt }),
      plannedBounds: module.plannedBounds ? normalizeBounds(module.plannedBounds, moduleId) : null
    };
  });
}

function buildSemanticHint(module) {
  const primaryRaw = [module.regionPrompt, module.label].map((value) => String(value || "")).join(" ");
  const raw = [primaryRaw, module.text, module.regionKind].map((value) => String(value || "")).join(" ");
  const keywordMap = [
    [/\u5c4f\u5e55|\u663e\u793a|\u89e6\u63a7|OLED|AMOLED|LTPO/i, "display screen touch panel"],
    [/\u7535\u6c60|\u7eed\u822a|\u5145\u7535|\u9502|BMS/i, "battery pack power cell"],
    [/\u4f20\u611f|\u5fc3\u7387|\u8840\u6c27|PPG|\u5065\u5eb7|\u6e29\u5ea6/i, "health sensor optical sensor"],
    [/\u5916\u58f3|\u4e2d\u6846|\u9632\u62a4|\u949b|\u4e0d\u9508\u94a2|\u8868\u58f3/i, "protective watch case metal frame"],
    [/\u8868\u5e26|\u8155\u5e26|\u5feb\u62c6|NFC/i, "watch strap band"],
    [/\u82af\u7247|\u5904\u7406\u5668|\u4e3b\u677f|PCB|\u7535\u8def/i, "chip mainboard circuit board"],
    [/\u6444\u50cf|\u955c\u5934|\u76f8\u673a/i, "camera lens optical module"],
    [/\u897f\u6e56|\u6e56\u6c34|\u6e56\u9762|\u6c34\u57df|\u6e38\u8239/i, "lake water area boats"],
    [/\u767d\u5824|\u65ad\u6865|\u6865|\u5824/i, "causeway bridge route"],
    [/\u82cf\u5824|\u957f\u5824|\u8def\u7ebf|\u6b65\u9053/i, "long causeway walking route"],
    [/\u4e09\u6f6d\u5370\u6708|\u6e56\u5fc3|\u5c9b|\u77f3\u5854/i, "lake island stone pagodas"],
    [/\u96f7\u5cf0\u5854|\u5854|\u5efa\u7b51/i, "pagoda landmark building"],
    [/\u8377\u82b1|\u690d\u7269|\u8fdc\u5c71|\u5c71|\u81ea\u7136|\u5cb8/i, "lotus plants mountains shoreline"],
    [/\u5c55\u54c1|\u5c55\u89c8|\u88c5\u7f6e|\u827a\u672f\u54c1/i, "museum exhibit installation"],
    [/\u89c2\u4f17|\u4eba\u7269|\u6e38\u5ba2|\u5c45\u6c11|\u4eba\u7fa4/i, "people visitors residents"],
    [/\u673a\u5668\u4eba|\u5bfc\u89c8|\u52a9\u624b/i, "guide robot assistant"],
    [/\u7a7a\u95f4|\u7ed3\u6784|\u573a\u9986/i, "spatial structure architecture"],
    [/\u516c\u4ea4|\u4ea4\u901a|\u5730\u94c1|\u81ea\u884c\u8f66/i, "public transport mobility"],
    [/\u80fd\u6e90|\u592a\u9633\u80fd|\u98ce\u80fd|\u7535\u7f51/i, "clean energy infrastructure"]
  ];
  const parts = [];
  for (const [pattern, phrase] of keywordMap) {
    if (pattern.test(primaryRaw)) parts.push(phrase);
  }
  if (!parts.length) {
    for (const [pattern, phrase] of keywordMap) {
      if (pattern.test(raw)) parts.push(phrase);
    }
  }
  const asciiText = raw.replace(/[^A-Za-z0-9,.;:()/%+\- ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!parts.length && isUsefulAsciiHint(asciiText)) parts.push(asciiText);
  if (!parts.length) parts.push("the described visual element or separated region");
  return Array.from(new Set(parts)).join("; ").slice(0, 180);
}

function isUsefulAsciiHint(text) {
  const value = String(text || "").trim();
  if (value.length < 4) return false;
  const words = value.match(/[A-Za-z][A-Za-z0-9+\-/%]{2,}/g) || [];
  if (!words.length) return false;
  const weak = new Set(["area", "frame", "oled", "nfc", "pcb", "bms", "ltpo", "amoled"]);
  const strongWords = words.filter((word) => !weak.has(word.toLowerCase()));
  return strongWords.length >= 2 || (strongWords.length === 1 && strongWords[0].length >= 6);
}

function normalizeBounds(bounds, moduleId) {
  if (!bounds || typeof bounds !== "object" || Array.isArray(bounds)) {
    throwLocateOutputError(`LocateAnything ${moduleId} missing bounds`);
  }
  const normalized = {
    x: Number(bounds.x),
    y: Number(bounds.y),
    width: Number(bounds.width ?? bounds.w),
    height: Number(bounds.height ?? bounds.h)
  };
  for (const [key, value] of Object.entries(normalized)) {
    if (!Number.isFinite(value)) {
      throwLocateOutputError(`LocateAnything ${moduleId} bounds.${key} is invalid`);
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
    throwLocateOutputError(`LocateAnything ${moduleId} bounds are outside normalized image bounds`);
  }
  return normalized;
}

function normalizeConfidence(value, moduleId) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throwLocateOutputError(`LocateAnything ${moduleId} confidence must be between 0 and 1`);
  }
  return confidence;
}

function normalizeWarnings(warnings) {
  return Array.isArray(warnings) ? warnings.map((item) => String(item)) : [];
}

function getTimeoutMs(serverConfig) {
  return Number(serverConfig.locateAnythingTimeoutMs || 120_000);
}

function throwLocateOutputError(message) {
  const error = new Error(message);
  error.statusCode = 502;
  throw error;
}

module.exports = {
  REQUIRED_LICENSE_ACK,
  buildSemanticHint,
  checkLocateAnythingCudaAvailable,
  createLocateAnythingConfig,
  hasLocateAnythingLicenseAck,
  normalizeLocateAnythingOutput,
  normalizeModules,
  runLocateAnythingAlignment,
  runLocateAnythingAlignmentWithFallback,
  runLocateAnythingHealth,
  runLocateAnythingPreload
};
