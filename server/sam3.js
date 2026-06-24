"use strict";

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { normalizeModules } = require("./locateanything");
const { materializeImage } = require("./local-ocr");

const REQUIRED_LICENSE_ACK = "research-evaluation";
const ROUTE_CORRIDOR_FORCE_FALLBACK_SCORE = 0.7;
const clients = new Map();

async function runSam3Health(serverConfig) {
  const enabled = isSam3Enabled(serverConfig);
  const licenseAck = hasSam3LicenseAck(serverConfig);
  const cudaAvailable = checkSam3CudaAvailable(serverConfig);
  const checkpointExists = Boolean(serverConfig.sam3Checkpoint && fs.existsSync(serverConfig.sam3Checkpoint));
  const base = {
    ok: enabled && licenseAck && cudaAvailable && checkpointExists,
    provider: "sam3",
    enabled,
    checkpoint: serverConfig.sam3Checkpoint || "",
    device: serverConfig.sam3Device || "cuda",
    cudaAvailable,
    licenseAck,
    checkpointExists,
    loaded: false,
    warnings: []
  };
  if (!enabled) base.warnings.push("CHATIMAGE_SAM3_ENABLED=1 is required before loading SAM3.");
  if (!licenseAck) base.warnings.push("CHATIMAGE_SAM3_LICENSE_ACK=research-evaluation is required before loading SAM3.");
  if (!checkpointExists) base.warnings.push(`SAM3 checkpoint not found: ${serverConfig.sam3Checkpoint || "(empty)"}`);
  if (!cudaAvailable) base.warnings.push("SAM3 CUDA runtime is not available in the configured Python environment.");
  if (!base.ok) return base;
  try {
    const response = await getSam3Client(serverConfig).request({ type: "health" }, getTimeoutMs(serverConfig));
    return {
      ...base,
      ...response,
      ok: Boolean(response.ok),
      enabled,
      licenseAck,
      checkpointExists,
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

async function runSam3Preload(serverConfig) {
  requireSam3Ready(serverConfig);
  return getSam3Client(serverConfig).request({ type: "preload" }, getTimeoutMs(serverConfig));
}

async function runSam3Segmentation(serverConfig, { imageUrl, imageWidth, imageHeight, modules, purpose }) {
  requireSam3Ready(serverConfig);
  const normalizedModules = normalizeModules(modules).filter((module) => module.plannedBounds);
  if (!normalizedModules.length) {
    return { provider: "sam3", modules: [], rejectedModules: [], warnings: ["no modules with bounds for SAM3"] };
  }
  const tempDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "chatimage-sam3-"));
  try {
    const image = await materializeImage(serverConfig, imageUrl, tempDir);
    const response = await getSam3Client(serverConfig).request(
      {
        type: "segment",
        imagePath: image.filePath,
        imageWidth,
        imageHeight,
        modules: normalizedModules.map((module) => ({
          moduleId: module.moduleId,
          label: module.label,
          bounds: module.plannedBounds,
          regionKind: module.regionKind || "",
          maskPolicy: module.maskPolicy || "",
          targetDescription: module.targetDescription || "",
          components: buildSam3Components(module)
        })),
        purpose: purpose || "sam3_segment"
      },
      getTimeoutMs(serverConfig)
    );
    return normalizeSam3Output(response, normalizedModules);
  } finally {
    fs.rm(tempDir, { recursive: true, force: true }, () => {});
  }
}

async function refineAlignmentWithSam3(serverConfig, alignmentResult, request) {
  if (!isSam3Enabled(serverConfig)) return alignmentResult;
  const warnings = [...normalizeWarnings(alignmentResult && alignmentResult.warnings)];
  let sam3Parsed = null;
  try {
    const modules = (alignmentResult.modules || []).map((module) => {
      const expandedBounds = expandBoundsForSam3(module.bounds, module);
      return {
        moduleId: module.moduleId,
        label: module.label,
        regionKind: module.regionKind || "",
        maskPolicy: module.maskPolicy || "",
        targetDescription: module.targetDescription || "",
        plannedBounds: expandedBounds,
        components: buildSam3Components({
          ...module,
          bounds: expandedBounds,
          plannedBounds: expandedBounds,
          components: expandComponentsForSam3(module.components, module)
        })
      };
    });
    sam3Parsed = await runSam3Segmentation(serverConfig, {
      imageUrl: request.imageUrl,
      imageWidth: request.imageWidth,
      imageHeight: request.imageHeight,
      modules,
      purpose: "sam3_refine_alignment"
    });
    warnings.push(...normalizeWarnings(sam3Parsed.warnings));
  } catch (error) {
    warnings.push(`sam3 refine failed: ${error.message || String(error)}`);
  }
  if (!sam3Parsed) {
    return {
      ...alignmentResult,
      providerChain: addUnique(alignmentResult.providerChain, "sam3"),
      warnings
    };
  }
  const maskById = new Map((sam3Parsed.modules || []).map((module) => [module.moduleId, module]));
  const sam3PromotedModules = [];
  const refinedModules = (alignmentResult.modules || []).map((module) => {
    const mask = maskById.get(module.moduleId);
    if (!mask) return module;
    const refinedMask = refineMaskForInteraction(mask, module);
    const promoted = promotePlannedBoundsWithSam3(module, refinedMask);
    if (promoted) sam3PromotedModules.push(module.moduleId);
    return {
      ...module,
      ...(promoted
        ? {
            bounds: promoted.bounds,
            rawBounds: module.bounds,
            confidence: promoted.confidence,
            source: "sam3-refined-planned",
            sam3BoundsPromotion: promoted.diagnostics
          }
        : {}),
      mask: {
        provider: "sam3",
        score: refinedMask.score,
        bounds: refinedMask.maskBounds,
        inputBounds: refinedMask.inputBounds,
        image: refinedMask.maskImage || "",
        cutoutImage: refinedMask.cutoutImage || "",
        organicImage: refinedMask.organicImage || "",
        organicBounds: refinedMask.organicBounds || null,
        organicAspectRatio: refinedMask.organicAspectRatio || null,
        maskPixels: refinedMask.maskPixels,
        polygon: refinedMask.polygon || [],
        strategy: refinedMask.strategy || "sam3-mask"
      }
    };
  });
  const sourceCounts = countModuleSources(refinedModules);
  return {
    ...alignmentResult,
    providerChain: addUnique(alignmentResult.providerChain, "sam3"),
    modules: refinedModules,
    sourceCounts,
    effectiveProvider: chooseEffectiveProvider(sourceCounts),
    fallbackModules: refinedModules.filter((module) => String(module.source || "") === "planned").map((module) => module.moduleId),
    sam3Raw: sam3Parsed.raw || sam3Parsed,
    acceptedSam3Modules: (sam3Parsed.modules || []).map((module) => module.moduleId),
    sam3PromotedModules,
    rejectedSam3Modules: sam3Parsed.rejectedModules || [],
    warnings
  };
}

function promotePlannedBoundsWithSam3(module, refinedMask) {
  if (String(module && module.source || "").toLowerCase() !== "planned") return null;
  const planned = normalizeLooseBounds(module && module.bounds);
  const maskBounds = normalizeLooseBounds(refinedMask && refinedMask.maskBounds);
  if (!planned || !maskBounds) return null;
  const plannedArea = boundsArea(planned);
  const maskArea = boundsArea(maskBounds);
  if (!plannedArea || !maskArea) return null;
  const score = Number(refinedMask && refinedMask.score);
  const maskPixels = Number(refinedMask && refinedMask.maskPixels);
  if (Number.isFinite(score) && score < 0.24) return null;
  if (Number.isFinite(maskPixels) && maskPixels <= 0) return null;
  if (maskArea < plannedArea * 0.035) return null;
  const overlap = normalizedOverlapRatio(planned, maskBounds);
  const distance = normalizedCenterDistance(planned, maskBounds);
  if (overlap < 0.04 && distance > 0.32) return null;
  const union = unionBounds(planned, maskBounds);
  const unionArea = boundsArea(union);
  if (unionArea > Math.max(plannedArea * 4.2, 0.42)) return null;
  const confidence = Math.max(Number(module.confidence || 0), Number.isFinite(score) ? Math.min(0.86, Math.max(0.58, score)) : 0.62);
  return {
    bounds: union,
    confidence,
    diagnostics: {
      reason: "planned fallback refined by SAM3 mask bounds",
      planned,
      maskBounds,
      overlap: roundBounds(overlap),
      centerDistance: roundBounds(distance)
    }
  };
}

function countModuleSources(modules) {
  const counts = {};
  for (const module of modules || []) {
    const source = String((module && module.source) || "unknown").trim() || "unknown";
    counts[source] = (counts[source] || 0) + 1;
  }
  return counts;
}

function chooseEffectiveProvider(sourceCounts) {
  const counts = sourceCounts || {};
  const candidates = ["locateanything", "mimo-vision", "local-ocr", "sam3-refined-planned", "vision-low-confidence"];
  let best = "";
  let bestCount = 0;
  for (const source of candidates) {
    const count = Number(counts[source] || 0);
    if (count > bestCount) {
      best = source;
      bestCount = count;
    }
  }
  return best || (Number(counts.planned || 0) ? "planned" : "unknown");
}

function unionBounds(a, b) {
  const left = Math.min(Number(a.x || 0), Number(b.x || 0));
  const top = Math.min(Number(a.y || 0), Number(b.y || 0));
  const right = Math.max(Number(a.x || 0) + Number(a.width || 0), Number(b.x || 0) + Number(b.width || 0));
  const bottom = Math.max(Number(a.y || 0) + Number(a.height || 0), Number(b.y || 0) + Number(b.height || 0));
  return clampBounds({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  });
}

function normalizedOverlapRatio(a, b) {
  const areaA = boundsArea(a);
  const areaB = boundsArea(b);
  if (!areaA || !areaB) return 0;
  const left = Math.max(Number(a.x || 0), Number(b.x || 0));
  const top = Math.max(Number(a.y || 0), Number(b.y || 0));
  const right = Math.min(Number(a.x || 0) + Number(a.width || 0), Number(b.x || 0) + Number(b.width || 0));
  const bottom = Math.min(Number(a.y || 0) + Number(a.height || 0), Number(b.y || 0) + Number(b.height || 0));
  const overlap = Math.max(0, right - left) * Math.max(0, bottom - top);
  return overlap / Math.min(areaA, areaB);
}

function boundsArea(bounds) {
  return Math.max(0, Number(bounds && bounds.width) || 0) * Math.max(0, Number(bounds && bounds.height) || 0);
}

function normalizedCenterDistance(a, b) {
  if (!a || !b) return 1;
  const ax = Number(a.x || 0) + Number(a.width || 0) / 2;
  const ay = Number(a.y || 0) + Number(a.height || 0) / 2;
  const bx = Number(b.x || 0) + Number(b.width || 0) / 2;
  const by = Number(b.y || 0) + Number(b.height || 0) / 2;
  return Math.hypot(ax - bx, ay - by);
}

function roundBounds(value) {
  return Number(Number(value || 0).toFixed(6));
}

function refineMaskForInteraction(mask, alignmentModule) {
  if (shouldUseLodgingObjectFallback(mask, alignmentModule)) {
    return buildSemanticBoundsMask(mask, alignmentModule, "semantic-bounds-fallback");
  }
  if (!shouldUseRouteCorridor(mask, alignmentModule)) return mask;
  if (isVeryLowConfidenceMask(mask)) {
    return buildSemanticBoundsMask(mask, alignmentModule, "route-corridor-fallback");
  }
  if (hasUsefulRoutePolygon(mask)) {
    return {
      ...mask,
      strategy: mask.strategy || "sam3-route-polygon"
    };
  }
  return buildSemanticBoundsMask(mask, alignmentModule, "route-corridor-fallback");
}

function buildSemanticBoundsMask(mask, alignmentModule, strategy) {
  const inputBounds = mask.inputBounds || alignmentModule.bounds;
  const polygon = buildCorridorPolygon(inputBounds);
  return {
    ...mask,
    maskBounds: inputBounds,
    maskImage: "",
    polygon,
    strategy
  };
}

function isVeryLowConfidenceMask(mask) {
  const score = Number(mask && mask.score);
  return Number.isFinite(score) && score < ROUTE_CORRIDOR_FORCE_FALLBACK_SCORE;
}

function shouldUseLodgingObjectFallback(mask, alignmentModule) {
  const score = Number(mask && mask.score);
  if (!Number.isFinite(score) || score >= 0.55) return false;
  const text = [
    alignmentModule && alignmentModule.regionKind,
    alignmentModule && alignmentModule.maskPolicy,
    alignmentModule && alignmentModule.label,
    extractVisualTarget(alignmentModule && alignmentModule.targetDescription)
  ]
    .map((value) => String(value || ""))
    .join(" ");
  if (!/object-with-label|subject-with-label/i.test(text)) return false;
  return /住宿|宾馆|酒店|山庄|房屋|床位|lodging|hotel|accommodation/i.test(text);
}

function hasUsefulRoutePolygon(mask) {
  const polygon = Array.isArray(mask && mask.polygon) ? mask.polygon : [];
  if (polygon.length < 6) return false;
  if (!mask.maskImage) return false;
  const bounds = mask.maskBounds || mask.inputBounds;
  if (!bounds) return false;
  const width = Number(bounds.width || 0);
  const height = Number(bounds.height || 0);
  return width > 0 && height > 0;
}

function shouldUseRouteCorridor(mask, alignmentModule) {
  const kind = String((alignmentModule && alignmentModule.regionKind) || "").toLowerCase();
  const policy = String((alignmentModule && alignmentModule.maskPolicy) || "").toLowerCase();
  if (!["route", "axis"].includes(kind) && policy !== "route") return false;
  const text = [
    kind,
    policy,
    alignmentModule && alignmentModule.label,
    extractVisualTarget(alignmentModule && alignmentModule.targetDescription)
  ]
    .map((value) => String(value || ""))
    .join(" ");
  if (!/route|bridge|causeway|axis|sightline|relationship|\u5824|\u6865|\u8def|\u957f\u5824|\u767d\u5824|\u82cf\u5824|\u5bf9\u666f|\u8f74\u7ebf|\u89c6\u7ebf|\u76f8\u671b|\u9694\u6e56\u76f8\u671b/i.test(text)) return false;
  const score = Number(mask && mask.score);
  if (Number.isFinite(score) && score >= 0.65) return false;
  const bounds = mask && (mask.inputBounds || mask.maskBounds);
  if (!bounds) return false;
  const width = Number(bounds.width || 0);
  const height = Number(bounds.height || 0);
  return width > 0 && height > 0 && Math.max(width / height, height / width) >= 1.7;
}

function extractVisualTarget(targetDescription) {
  const text = String(targetDescription || "");
  const match = text.match(/visual target:\s*([^\n]+)/i);
  return match ? match[1] : text.slice(0, 160);
}

function buildCorridorPolygon(bounds) {
  const x = Number(bounds.x);
  const y = Number(bounds.y);
  const width = Number(bounds.width);
  const height = Number(bounds.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return [];
  }
  const insetRatio = Math.max(0.08, Math.min(0.2, Math.min(width, height) / Math.max(width, height)));
  const dx = width > height ? 0 : width * insetRatio;
  const dy = width > height ? height * insetRatio : 0;
  return [
    { x: roundCoord(x + dx), y: roundCoord(y + dy) },
    { x: roundCoord(x + width - dx), y: roundCoord(y + dy) },
    { x: roundCoord(x + width - dx), y: roundCoord(y + height - dy) },
    { x: roundCoord(x + dx), y: roundCoord(y + height - dy) }
  ];
}

function normalizeMaskComponents(components) {
  if (!Array.isArray(components)) return [];
  return components
    .map((component) => {
      const bounds = component && (component.bounds || component.box);
      if (!bounds) return null;
      const normalized = {
        x: Number(bounds.x),
        y: Number(bounds.y),
        width: Number(bounds.width),
        height: Number(bounds.height)
      };
      if (
        !Number.isFinite(normalized.x) ||
        !Number.isFinite(normalized.y) ||
        !Number.isFinite(normalized.width) ||
        !Number.isFinite(normalized.height) ||
        normalized.width <= 0 ||
        normalized.height <= 0 ||
        normalized.x < 0 ||
        normalized.y < 0 ||
        normalized.x + normalized.width > 1 ||
        normalized.y + normalized.height > 1
      ) {
        return null;
      }
      return {
        kind: String(component.kind || component.type || "component"),
        label: String(component.label || component.text || ""),
        bounds: normalized
      };
    })
    .filter(Boolean)
    .slice(0, 4);
}

function expandComponentsForSam3(components, module) {
  if (!Array.isArray(components)) return [];
  return components
    .map((component) => {
      const bounds = component && (component.bounds || component.box);
      const expanded = expandBoundsForSam3(bounds, {
        ...module,
        regionKind: component && (component.kind || component.type) ? component.kind || component.type : module && module.regionKind,
        maskPolicy: component && /label|badge|tag|text/i.test(String(component.kind || component.type || component.label || component.text || ""))
          ? "subject-with-label"
          : module && module.maskPolicy
      });
      if (!expanded) return null;
      return {
        ...component,
        bounds: expanded
      };
    })
    .filter(Boolean)
    .slice(0, 4);
}

function expandBoundsForSam3(bounds, module) {
  const normalized = normalizeLooseBounds(bounds);
  if (!normalized) return null;
  const kind = String((module && module.regionKind) || "").toLowerCase();
  const policy = String((module && module.maskPolicy) || "").toLowerCase();
  const text = [
    kind,
    policy,
    module && module.label,
    extractVisualTarget(module && module.targetDescription)
  ]
    .map((value) => String(value || ""))
    .join(" ");

  let padX = 0.08;
  let padY = 0.08;
  if (kind === "route" || kind === "axis" || policy === "route") {
    padX = 0.16;
    padY = 0.22;
  } else if (kind === "object-with-label" || policy === "subject-with-label") {
    padX = 0.2;
    padY = 0.16;
  } else if (["object", "person", "product"].includes(kind) || policy === "subject") {
    padX = 0.14;
    padY = 0.14;
  } else if (["landmark", "building", "mountain", "water", "area", "district", "panel"].includes(kind) || policy === "full-region") {
    padX = 0.2;
    padY = 0.2;
  } else if (kind === "legend" || policy === "legend") {
    padX = 0.1;
    padY = 0.1;
  }

  if (/label|badge|tag|text|标签|短标签|标牌|导览|说明|文字|ai/i.test(text)) {
    padX = Math.max(padX, 0.18);
    padY = Math.max(padY, 0.14);
    // 长标签（尤其中文目标名，如「阳光海岸栈道」「应急出口指示牌」）需要更多横向
    // 空间。固定 padX 会让 SAM 输入框裁掉标签尾部，使 mask 只盖住主体而漏掉附带
    // 文字。按标签字符数自适应放宽横向 pad（只增不减，封顶 0.34）。
    const labelChars = Array.from(String((module && module.label) || "")).length;
    if (labelChars > 6) {
      padX = Math.max(padX, Math.min(0.34, 0.18 + (labelChars - 6) * 0.015));
    }
  }

  const minPad = Math.min(0.028, Math.max(0.008, Math.min(normalized.width, normalized.height) * 0.28));
  const extraX = Math.max(minPad, normalized.width * padX);
  const extraY = Math.max(minPad, normalized.height * padY);
  return clampBounds({
    x: normalized.x - extraX,
    y: normalized.y - extraY,
    width: normalized.width + extraX * 2,
    height: normalized.height + extraY * 2
  });
}

function buildSam3Components(module) {
  const explicit = normalizeMaskComponents(module && module.components);
  if (!isSubjectWithLabelModule(module)) return explicit;
  const synthesized = synthesizeSubjectWithLabelComponents(module && (module.plannedBounds || module.bounds));
  if (!explicit.length) return synthesized;
  return [...explicit, ...synthesized].slice(0, 4);
}

function isSubjectWithLabelModule(module) {
  const regionKind = String((module && module.regionKind) || "").toLowerCase();
  const maskPolicy = String((module && module.maskPolicy) || "").toLowerCase();
  if (regionKind === "object-with-label") return true;
  if (["legend", "route", "landmark", "building", "mountain", "water", "axis", "panel", "background"].includes(regionKind)) {
    return false;
  }
  return maskPolicy === "subject-with-label";
}

function synthesizeSubjectWithLabelComponents(bounds) {
  const base = normalizeLooseBounds(bounds);
  if (!base) return [];
  const labelWidth = Math.max(0.08, Math.min(0.28, base.width * 0.95));
  const labelHeight = Math.max(0.055, Math.min(0.18, base.height * 0.24));
  const labelX = base.x + base.width * 0.42;
  const labelY = Math.max(0, base.y - base.height * 0.02);
  return [
    { kind: "object", label: "main subject", bounds: base },
    { kind: "label", label: "attached label", bounds: clampBounds({ x: labelX, y: labelY, width: labelWidth, height: labelHeight }) }
  ].filter((component) => component.bounds && component.bounds.width > 0 && component.bounds.height > 0);
}

function normalizeLooseBounds(bounds) {
  if (!bounds || typeof bounds !== "object") return null;
  const normalized = {
    x: Number(bounds.x),
    y: Number(bounds.y),
    width: Number(bounds.width),
    height: Number(bounds.height)
  };
  if (
    !Number.isFinite(normalized.x) ||
    !Number.isFinite(normalized.y) ||
    !Number.isFinite(normalized.width) ||
    !Number.isFinite(normalized.height) ||
    normalized.width <= 0 ||
    normalized.height <= 0
  ) {
    return null;
  }
  return clampBounds(normalized);
}

function clampBounds(bounds) {
  const x0 = clamp01(Number(bounds.x));
  const y0 = clamp01(Number(bounds.y));
  const x1 = clamp01(Number(bounds.x) + Number(bounds.width));
  const y1 = clamp01(Number(bounds.y) + Number(bounds.height));
  return {
    x: roundCoord(Math.min(x0, x1)),
    y: roundCoord(Math.min(y0, y1)),
    width: roundCoord(Math.max(0, Math.abs(x1 - x0))),
    height: roundCoord(Math.max(0, Math.abs(y1 - y0)))
  };
}

function roundCoord(value) {
  return Math.max(0, Math.min(1, Number(value.toFixed(6))));
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function createSam3Config(serverConfig) {
  const enabled = isSam3Enabled(serverConfig);
  return {
    sam3Enabled: enabled,
    sam3Configured: Boolean(
      enabled &&
        serverConfig.sam3Python &&
        serverConfig.sam3WorkerPath &&
        serverConfig.sam3Checkpoint &&
        fs.existsSync(serverConfig.sam3Checkpoint) &&
        hasSam3LicenseAck(serverConfig)
    ),
    sam3Checkpoint: serverConfig.sam3Checkpoint || "",
    sam3LicenseAck: hasSam3LicenseAck(serverConfig),
    sam3CudaAvailable: enabled ? checkSam3CudaAvailable(serverConfig) : false
  };
}

function isSam3Enabled(serverConfig) {
  return ["1", "true", "yes", "sam3"].includes(String(serverConfig.sam3Enabled || "").trim().toLowerCase());
}

function hasSam3LicenseAck(serverConfig) {
  return String(serverConfig.sam3LicenseAck || "").trim() === REQUIRED_LICENSE_ACK;
}

function requireSam3Ready(serverConfig) {
  if (!isSam3Enabled(serverConfig)) {
    const error = new Error("CHATIMAGE_SAM3_ENABLED=1 is required before loading SAM3.");
    error.statusCode = 503;
    throw error;
  }
  if (!hasSam3LicenseAck(serverConfig)) {
    const error = new Error("CHATIMAGE_SAM3_LICENSE_ACK=research-evaluation is required before loading SAM3.");
    error.statusCode = 503;
    throw error;
  }
  if (!serverConfig.sam3Checkpoint || !fs.existsSync(serverConfig.sam3Checkpoint)) {
    const error = new Error(`SAM3 checkpoint not found: ${serverConfig.sam3Checkpoint || "(empty)"}`);
    error.statusCode = 503;
    throw error;
  }
}

function checkSam3CudaAvailable(serverConfig) {
  const python = serverConfig.sam3Python || "python";
  const now = Date.now();
  const entry = sam3CudaCache.get(python);
  if (entry && now - entry.timestamp < SAM3_CUDA_TTL_MS) return entry.value;
  const value = probeSam3CudaOnce(python);
  sam3CudaCache.set(python, { value, timestamp: now });
  return value;
}

// CUDA probes forked a Python interpreter on every /api/config call, blocking
// the event loop for ~3-6s while torch cold-imports. Cache for a short window.
const sam3CudaCache = new Map();
const SAM3_CUDA_TTL_MS = 60_000;

function probeSam3CudaOnce(python) {
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

function getSam3Client(serverConfig) {
  const workerPath = serverConfig.sam3WorkerPath || "";
  let workerMtime = "";
  try {
    workerMtime = workerPath ? String(fs.statSync(workerPath).mtimeMs) : "";
  } catch {}
  const key = [
    serverConfig.sam3Python || "python",
    workerPath,
    workerMtime,
    serverConfig.sam3Checkpoint || "",
    serverConfig.sam3Device || "cuda",
    process.env.CHATIMAGE_FAKE_SAM3_MODE || ""
  ].join("|");
  if (!clients.has(key)) {
    clients.set(key, new Sam3JsonlClient(serverConfig));
  }
  return clients.get(key);
}

class Sam3JsonlClient {
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
        // Reject only THIS request on timeout. Do NOT stopChild() here: the worker
        // is shared across all in-flight requests, and SIGKILLing it would reject
        // every concurrent segmentation. A genuinely wedged worker is recycled via
        // the close handler when it eventually exits, or by a later ensureStarted().
        if (this.pending.delete(id)) {
          reject(new Error(`SAM3 worker timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      // Guard against the race where the child exited between ensureStarted() and
      // here (close handler sets this.child = null and rejects all pending).
      if (!this.child || !this.child.stdin || this.child.stdin.destroyed) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error("SAM3 worker is not running"));
        return;
      }
      try {
        this.child.stdin.write(`${JSON.stringify(message)}\n`);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error(`Failed to send request to SAM3 worker: ${error.message}`));
      }
    });
  }

  ensureStarted() {
    if (this.child && !this.child.killed && this.child.exitCode === null && !this.child.stdin.destroyed) return;
    const workerPath = this.serverConfig.sam3WorkerPath;
    if (!workerPath || !fs.existsSync(workerPath)) {
      const error = new Error(`SAM3 worker not found: ${workerPath || "(empty)"}`);
      error.statusCode = 503;
      throw error;
    }
    const python = this.serverConfig.sam3Python || "python";
    const args = [
      workerPath,
      "--checkpoint",
      this.serverConfig.sam3Checkpoint,
      "--device",
      this.serverConfig.sam3Device || "cuda"
    ];
    this.lastStderr = "";
    this.child = spawn(python, args, { windowsHide: true });
    this.child.stdout.on("data", (chunk) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk) => {
      this.lastStderr = `${this.lastStderr || ""}${chunk.toString()}`;
    });
    this.child.on("error", (error) => this.rejectAll(`SAM3 worker failed to start: ${error.message}`));
    this.child.on("close", (code) => {
      this.child = null;
      this.rejectAll(`SAM3 worker exited with code ${code}: ${this.lastStderr || "no stderr"}`);
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
      if (parsed.error) pending.reject(new Error(parsed.error));
      else pending.resolve(parsed.result || {});
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

function normalizeSam3Output(value, requestedModules) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throwSam3OutputError("SAM3 worker output must be a JSON object");
  }
  const requestedIds = new Set(requestedModules.map((module) => module.moduleId));
  const modules = Array.isArray(value.modules) ? value.modules : [];
  const normalizedModules = [];
  for (const [index, item] of modules.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throwSam3OutputError(`SAM3 modules[${index}] must be an object`);
    }
    const moduleId = String(item.moduleId || item.id || "").trim();
    if (!requestedIds.has(moduleId)) throwSam3OutputError(`SAM3 returned unknown moduleId: ${moduleId || "(empty)"}`);
    normalizedModules.push({
      moduleId,
      label: String(item.label || ""),
      inputBounds: normalizeBounds(item.inputBounds || item.bounds, moduleId),
      maskBounds: normalizeBounds(item.maskBounds, moduleId),
      score: normalizeScore(item.score, moduleId),
      maskImage: normalizePngDataUrl(item.maskImage, "maskImage", 512 * 1024),
      cutoutImage: normalizePngDataUrl(item.cutoutImage, "cutoutImage", 2 * 1024 * 1024),
      organicImage: normalizePngDataUrl(item.organicImage, "organicImage", 3 * 1024 * 1024),
      organicBounds: normalizeOptionalBounds(item.organicBounds, moduleId, "organicBounds"),
      organicAspectRatio: normalizeOptionalPositiveNumber(item.organicAspectRatio),
      maskPixels: Math.max(0, Math.round(Number(item.maskPixels || 0))),
      polygon: normalizePolygon(item.polygon, moduleId)
    });
  }
  return {
    provider: "sam3",
    modules: normalizedModules,
    rejectedModules: Array.isArray(value.rejectedModules) ? value.rejectedModules : [],
    warnings: normalizeWarnings(value.warnings),
    raw: value
  };
}

function normalizeBounds(bounds, moduleId) {
  if (!bounds || typeof bounds !== "object" || Array.isArray(bounds)) {
    throwSam3OutputError(`SAM3 ${moduleId} missing bounds`);
  }
  const normalized = {
    x: Number(bounds.x),
    y: Number(bounds.y),
    width: Number(bounds.width ?? bounds.w),
    height: Number(bounds.height ?? bounds.h)
  };
  for (const [key, value] of Object.entries(normalized)) {
    if (!Number.isFinite(value)) throwSam3OutputError(`SAM3 ${moduleId} bounds.${key} is invalid`);
  }
  if (
    normalized.x < 0 ||
    normalized.y < 0 ||
    normalized.width <= 0 ||
    normalized.height <= 0 ||
    normalized.x + normalized.width > 1 ||
    normalized.y + normalized.height > 1
  ) {
    throwSam3OutputError(`SAM3 ${moduleId} bounds are outside normalized image bounds`);
  }
  return normalized;
}

function normalizeOptionalBounds(bounds, moduleId, label) {
  if (!bounds) return null;
  return normalizeBounds(bounds, `${moduleId} ${label}`);
}

function normalizeOptionalPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeScore(value, moduleId) {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throwSam3OutputError(`SAM3 ${moduleId} score must be between 0 and 1`);
  }
  return score;
}

function normalizePolygon(value, moduleId) {
  if (!Array.isArray(value)) return [];
  const points = [];
  for (const [index, point] of value.entries()) {
    if (!point || typeof point !== "object" || Array.isArray(point)) continue;
    const normalized = {
      x: Number(point.x),
      y: Number(point.y)
    };
    if (!Number.isFinite(normalized.x) || !Number.isFinite(normalized.y)) {
      throwSam3OutputError(`SAM3 ${moduleId} polygon[${index}] is invalid`);
    }
    if (normalized.x < 0 || normalized.y < 0 || normalized.x > 1 || normalized.y > 1) {
      throwSam3OutputError(`SAM3 ${moduleId} polygon[${index}] is outside normalized image bounds`);
    }
    points.push(normalized);
  }
  return points.length >= 3 ? points.slice(0, 96) : [];
}

function normalizePngDataUrl(value, label, maxLength) {
  const text = String(value || "");
  if (!text) return "";
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/i.test(text)) {
    throwSam3OutputError(`SAM3 ${label} must be a PNG data URL`);
  }
  if (text.length > maxLength) {
    throwSam3OutputError(`SAM3 ${label} is too large`);
  }
  return text;
}

function normalizeWarnings(warnings) {
  return Array.isArray(warnings) ? warnings.map((item) => String(item)) : [];
}

function addUnique(list, item) {
  return Array.from(new Set([...(Array.isArray(list) ? list : []), item]));
}

function getTimeoutMs(serverConfig) {
  return Number(serverConfig.sam3TimeoutMs || 120_000);
}

function throwSam3OutputError(message) {
  const error = new Error(message);
  error.statusCode = 502;
  throw error;
}

module.exports = {
  REQUIRED_LICENSE_ACK,
  checkSam3CudaAvailable,
  createSam3Config,
  hasSam3LicenseAck,
  isSam3Enabled,
  normalizeSam3Output,
  refineAlignmentWithSam3,
  runSam3Health,
  runSam3Preload,
  runSam3Segmentation
};
