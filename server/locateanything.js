"use strict";

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { materializeImage } = require("./local-ocr");
const alignmentModel = require("../src/alignment");

const REQUIRED_LICENSE_ACK = "research-evaluation";
const MIN_LOCAL_OCR_FALLBACK_CONFIDENCE = 0.5;
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

// Track preload failures so align requests can fast-fail instead of
// waiting the full timeout when the worker is known-broken (e.g. proxy
// down, model not cached). Reset when preload succeeds.
let locateAnythingPreloadFailed = false;
let locateAnythingPreloadError = null;

async function runLocateAnythingPreload(serverConfig) {
  requireLocateAnythingLicenseAck(serverConfig);
  try {
    const result = await getLocateAnythingClient(serverConfig).request({ type: "preload" }, getTimeoutMs(serverConfig));
    locateAnythingPreloadFailed = false;
    locateAnythingPreloadError = null;
    return result;
  } catch (error) {
    locateAnythingPreloadFailed = true;
    locateAnythingPreloadError = error.message || String(error);
    throw error;
  }
}

async function runLocateAnythingAlignment(serverConfig, { imageUrl, imageWidth, imageHeight, modules, purpose }) {
  requireLocateAnythingLicenseAck(serverConfig);
  // Fast-fail: if preload already failed (proxy down, model not cached),
  // don't wait the full 240s timeout — let the fallback chain take over.
  if (locateAnythingPreloadFailed) {
    throw new Error(`LocateAnything preload previously failed: ${locateAnythingPreloadError || "unknown"}`);
  }
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
  const acceptedMimoVisionModules = [];
  const acceptedLocalOcrModules = [];
  const layoutGuidedModules = [];
  const rejectedModules = [...(locateParsed.rejectedModules || [])];
  for (const item of locateParsed.modules || []) {
    byId.set(item.moduleId, { ...item, source: item.source || "locateanything" });
    if (item.source === "layout-guided-locateanything") {
      layoutGuidedModules.push(item.moduleId);
    } else {
      acceptedLocateAnythingModules.push(item.moduleId);
    }
  }

  const mimoVisionTargets = modules.filter((module) => {
    const candidate = byId.get(module.moduleId);
    return !candidate || layoutGuidedModules.includes(module.moduleId) || shouldReviewLocateCandidateWithMimo(module, candidate, request);
  });
  if (mimoVisionTargets.length && helpers && typeof helpers.callVisionApi === "function" && shouldUseMimoVisionFallback(serverConfig)) {
    providerChain.push("mimo-vision");
    try {
      const remote = await runMimoVisionAlignmentFallback(serverConfig, request, mimoVisionTargets, helpers);
      for (const item of remote.modules || []) {
        removeModuleIdFromAcceptedLists(item.moduleId, {
          acceptedLocateAnythingModules
        });
        byId.set(item.moduleId, { ...item, source: "mimo-vision" });
        acceptedMimoVisionModules.push(item.moduleId);
      }
      rejectedModules.push(...(remote.rejectedModules || []));
      warnings.push(...normalizeWarnings(remote.warnings));
    } catch (error) {
      warnings.push(`mimo-vision fallback failed: ${error.message || String(error)}`);
    }
  }

  const missingAfterMimoVision = modules.filter((module) => !byId.has(module.moduleId));
  if (missingAfterMimoVision.length && helpers && typeof helpers.runLocalOcrAlignment === "function") {
    providerChain.push("local-ocr");
    try {
      const local = await helpers.runLocalOcrAlignment(serverConfig, request);
      for (const item of local.modules || []) {
        if (byId.has(item.moduleId)) continue;
        if (!isAcceptableLocalOcrFallback(item)) {
          rejectedModules.push({
            moduleId: item.moduleId,
            label: item.label || item.moduleId,
            bounds: item.bounds || null,
            confidence: item.confidence,
            source: "local-ocr",
            reason: `local-ocr confidence below ${MIN_LOCAL_OCR_FALLBACK_CONFIDENCE}`
          });
          continue;
        }
        byId.set(item.moduleId, { ...item, source: "local-ocr" });
        acceptedLocalOcrModules.push(item.moduleId);
      }
      warnings.push(...normalizeWarnings(local.warnings));
    } catch (error) {
      warnings.push(`local-ocr fallback failed: ${error.message || String(error)}`);
    }
  }

  pruneSuspiciousCandidates(byId, modules, request, rejectedModules, {
    acceptedLocateAnythingModules,
    acceptedMimoVisionModules,
    acceptedLocalOcrModules,
    layoutGuidedModules
  });

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

  const finalModules = modules
    .map((module) => {
      const candidate = byId.get(module.moduleId);
      return candidate ? expandCandidateBoundsForAlignment(candidate, module, request) : null;
    })
    .filter(Boolean);
  if (finalModules.length !== modules.length) {
    const missing = modules.filter((module) => !byId.has(module.moduleId)).map((module) => module.moduleId);
    const error = new Error(`LocateAnything alignment missing modules: ${missing.join(", ")}`);
    error.statusCode = 502;
    throw error;
  }

  const sourceCounts = countModuleSources(finalModules);
  return {
    provider: "locateanything",
    effectiveProvider: Number(sourceCounts["mimo-vision"] || 0) > Number(sourceCounts.locateanything || 0)
      ? "mimo-vision"
      : acceptedLocateAnythingModules.length
      ? "locateanything"
      : acceptedLocalOcrModules.length
      ? "local-ocr"
      : "planned",
    providerChain: Array.from(new Set(providerChain)),
    modules: finalModules,
    locateAnythingRaw: locateParsed.raw || null,
    acceptedModules: acceptedLocateAnythingModules,
    acceptedLocateAnythingModules,
    acceptedLayoutGuidedModules: layoutGuidedModules,
    acceptedMimoVisionModules,
    acceptedLocalOcrModules,
    rejectedModules,
    fallbackModules,
    sourceCounts,
    warnings
  };
}

function isAcceptableLocalOcrFallback(item) {
  const confidence = Number(item && item.confidence);
  return Number.isFinite(confidence) && confidence >= MIN_LOCAL_OCR_FALLBACK_CONFIDENCE;
}

function expandCandidateBoundsForAlignment(candidate, module, request) {
  if (!candidate || !candidate.bounds) return candidate;
  const source = String(candidate.source || "").toLowerCase();
  if (source === "planned") return candidate;
  const policy = getAlignmentBoundsExpansionPolicy(module, request, candidate);
  if (!policy) return candidate;
  const expanded = expandNormalizedBounds(candidate.bounds, policy);
  if (!expanded || boundsNearlyEqual(expanded, candidate.bounds)) return candidate;
  return {
    ...candidate,
    rawBounds: candidate.rawBounds || { ...candidate.bounds },
    bounds: expanded,
    boundsExpansion: {
      strategy: policy.strategy,
      padX: policy.padX,
      padY: policy.padY,
      from: candidate.rawBounds || candidate.bounds,
      to: expanded
    }
  };
}

function getAlignmentBoundsExpansionPolicy(module, request, candidate) {
  const visualMode = String((request && request.visualMode) || (module && module.visualMode) || "").toLowerCase();
  const kind = String((module && module.regionKind) || "").toLowerCase();
  const policy = String((module && module.maskPolicy) || "").toLowerCase();
  const source = String((candidate && candidate.source) || "").toLowerCase();
  const bounds = candidate && candidate.bounds;
  if (!bounds) return null;
  const area = boundsArea(bounds);
  if (area >= 0.58) return null;
  if (source === "layout-guided-locateanything" && area >= 0.12) {
    return { strategy: "layout-guided-light-pad", padX: 0.018, padY: 0.018, maxWidth: 0.62, maxHeight: 0.62 };
  }
  const cardLike = visualMode !== "map" && visualMode !== "scene" && visualMode !== "poster" && isCardLikeCandidateModule(module);
  if (kind === "route" || kind === "axis" || policy === "route") {
    const width = Number(bounds.width || 0);
    const height = Number(bounds.height || 0);
    const horizontal = width >= height;
    return {
      strategy: "route-context-pad",
      padX: horizontal ? 0.045 : 0.14,
      padY: horizontal ? 0.14 : 0.045,
      minPad: 0.01,
      maxWidth: 0.62,
      maxHeight: 0.42
    };
  }
  if (kind === "object-with-label" || policy === "subject-with-label") {
    return {
      strategy: "subject-with-label-pad",
      padX: 0.09,
      padY: 0.075,
      minPad: 0.012,
      maxWidth: 0.5,
      maxHeight: 0.58
    };
  }
  if (["object", "person", "product"].includes(kind) || policy === "subject") {
    return {
      strategy: "subject-pad",
      padX: 0.07,
      padY: 0.07,
      minPad: 0.01,
      maxWidth: 0.44,
      maxHeight: 0.5
    };
  }
  if (kind === "legend" || policy === "legend") {
    return {
      strategy: "legend-pad",
      padX: 0.035,
      padY: 0.035,
      minPad: 0.006,
      maxWidth: 0.42,
      maxHeight: 0.34
    };
  }
  if (["landmark", "building", "mountain", "water", "area", "district", "panel"].includes(kind) || policy === "full-region") {
    return {
      strategy: "semantic-region-pad",
      padX: visualMode === "map" || visualMode === "scene" || visualMode === "poster" ? 0.1 : 0.055,
      padY: visualMode === "map" || visualMode === "scene" || visualMode === "poster" ? 0.1 : 0.055,
      minPad: visualMode === "map" || visualMode === "scene" || visualMode === "poster" ? 0.018 : 0.01,
      maxWidth: visualMode === "map" || visualMode === "scene" || visualMode === "poster" ? 0.66 : 0.58,
      maxHeight: visualMode === "map" || visualMode === "scene" || visualMode === "poster" ? 0.66 : 0.58
    };
  }
  if (cardLike) {
    const small = Number(bounds.width || 0) < 0.22 || Number(bounds.height || 0) < 0.18;
    return {
      strategy: small ? "infographic-card-small-pad" : "infographic-card-light-pad",
      padX: small ? 0.075 : 0.04,
      padY: small ? 0.075 : 0.045,
      minPad: small ? 0.012 : 0.006,
      maxWidth: 0.54,
      maxHeight: 0.56
    };
  }
  return {
    strategy: "default-semantic-pad",
    padX: 0.04,
    padY: 0.04,
    minPad: 0.008,
    maxWidth: 0.52,
    maxHeight: 0.52
  };
}

function expandNormalizedBounds(bounds, policy) {
  const source = normalizeLooseBounds(bounds);
  if (!source) return null;
  const minPad = Number.isFinite(Number(policy.minPad)) ? Number(policy.minPad) : 0.008;
  const padX = Math.max(minPad, source.width * Number(policy.padX || 0));
  const padY = Math.max(minPad, source.height * Number(policy.padY || 0));
  const maxWidth = Number.isFinite(Number(policy.maxWidth)) ? Number(policy.maxWidth) : 0.62;
  const maxHeight = Number.isFinite(Number(policy.maxHeight)) ? Number(policy.maxHeight) : 0.62;
  const targetWidth = Math.min(maxWidth, source.width + padX * 2);
  const targetHeight = Math.min(maxHeight, source.height + padY * 2);
  const centerX = source.x + source.width / 2;
  const centerY = source.y + source.height / 2;
  return clampBounds({
    x: centerX - targetWidth / 2,
    y: centerY - targetHeight / 2,
    width: targetWidth,
    height: targetHeight
  });
}

function normalizeLooseBounds(bounds) {
  if (!bounds || typeof bounds !== "object" || Array.isArray(bounds)) return null;
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
  const width = Math.max(0.001, Math.min(1, Number(bounds.width) || 0.001));
  const height = Math.max(0.001, Math.min(1, Number(bounds.height) || 0.001));
  const x = Math.max(0, Math.min(1 - width, Number(bounds.x) || 0));
  const y = Math.max(0, Math.min(1 - height, Number(bounds.y) || 0));
  return {
    x: roundBounds(x),
    y: roundBounds(y),
    width: roundBounds(width),
    height: roundBounds(height)
  };
}

function boundsNearlyEqual(a, b) {
  if (!a || !b) return false;
  return ["x", "y", "width", "height"].every((key) => Math.abs(Number(a[key] || 0) - Number(b[key] || 0)) < 0.000001);
}

function roundBounds(value) {
  return Number(Number(value).toFixed(6));
}

function pruneSuspiciousCandidates(byId, modules, request, rejectedModules, acceptedLists) {
  for (const module of modules) {
    const candidate = byId.get(module.moduleId);
    if (!candidate || isAcceptableSemanticCandidate(module, candidate, request)) continue;
    byId.delete(module.moduleId);
    removeModuleIdFromAcceptedLists(module.moduleId, acceptedLists);
    rejectedModules.push({
      moduleId: module.moduleId,
      label: module.label,
      bounds: candidate.bounds || null,
      confidence: candidate.confidence,
      source: candidate.source || "",
      reason: "semantic candidate failed planned-region quality checks"
    });
  }
}

function removeModuleIdFromAcceptedLists(moduleId, acceptedLists) {
  for (const list of Object.values(acceptedLists || {})) {
    if (!Array.isArray(list)) continue;
    let index = list.indexOf(moduleId);
    while (index !== -1) {
      list.splice(index, 1);
      index = list.indexOf(moduleId);
    }
  }
}

function isAcceptableSemanticCandidate(module, candidate, request) {
  const source = String(candidate && candidate.source || "");
  if (source === "planned") return true;
  const visualMode = String((request && request.visualMode) || "").toLowerCase();
  if (visualMode !== "map" && isCardLikeCandidateModule(module)) {
    return isAcceptableCardCandidate(module, candidate);
  }
  if (visualMode !== "map") return true;
  const kind = String((module && module.regionKind) || "").toLowerCase();
  const policy = String((module && module.maskPolicy) || "").toLowerCase();
  if (!["legend", "panel"].includes(kind) && policy !== "legend" && !isNamedCampusBuildingModule(module)) return true;
  const planned = module && module.plannedBounds;
  const bounds = candidate && candidate.bounds;
  if (!planned || !bounds) return true;
  const overlap = normalizedOverlapRatio(planned, bounds);
  if (overlap >= (isNamedCampusBuildingModule(module) ? 0.12 : 0.08)) return true;
  const distance = normalizedCenterDistance(planned, bounds);
  return distance <= (isNamedCampusBuildingModule(module) ? 0.22 : 0.32);
}

function isCardLikeCandidateModule(module) {
  const kind = String((module && module.regionKind) || "").toLowerCase();
  const policy = String((module && module.maskPolicy) || "").toLowerCase();
  if (["route", "legend", "subject", "subject-with-label"].includes(policy)) return false;
  return !kind || ["card", "area", "panel", "module"].includes(kind);
}

function isAcceptableCardCandidate(module, candidate) {
  const planned = module && module.plannedBounds;
  const bounds = candidate && candidate.bounds;
  if (!planned || !bounds) return true;
  const plannedArea = boundsArea(planned);
  const candidateArea = boundsArea(bounds);
  if (!plannedArea || !candidateArea) return true;
  const areaRatio = candidateArea / plannedArea;
  const overlap = normalizedOverlapRatio(planned, bounds);
  const distance = normalizedCenterDistance(planned, bounds);
  if (areaRatio < 0.32) return false;
  if (areaRatio > 2.05) return false;
  if (Number(bounds.width || 0) > Number(planned.width || 0) * 2.05) return false;
  if (Number(bounds.height || 0) > Number(planned.height || 0) * 2.05) return false;
  if (overlap < 0.16 && distance > 0.22) return false;
  return true;
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
  return Math.max(0, Number(bounds && bounds.width || 0)) * Math.max(0, Number(bounds && bounds.height || 0));
}

function normalizedCenterDistance(a, b) {
  const ax = Number(a && a.x || 0) + Number(a && a.width || 0) / 2;
  const ay = Number(a && a.y || 0) + Number(a && a.height || 0) / 2;
  const bx = Number(b && b.x || 0) + Number(b && b.width || 0) / 2;
  const by = Number(b && b.y || 0) + Number(b && b.height || 0) / 2;
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

function shouldUseMimoVisionFallback(serverConfig) {
  return String(serverConfig.visionFallbackMode || "").trim().toLowerCase() === "mimo-vision";
}

function shouldReviewLocateCandidateWithMimo(module, candidate, request) {
  if (!candidate) return true;
  const source = String(candidate.source || "");
  if (!/locateanything/i.test(source)) return false;
  const visualMode = String((request && request.visualMode) || "").toLowerCase();
  const kind = String(module && module.regionKind ? module.regionKind : "").toLowerCase();
  const text = [
    module && module.label,
    module && module.regionPrompt,
    module && module.maskPolicy,
    module && module.spatialHint,
    ...(Array.isArray(module && module.visualEvidence) ? module.visualEvidence : []),
    ...(Array.isArray(module && module.locatorQueries) ? module.locatorQueries : [])
  ].join(" ");
  if (/map|scene|poster/.test(visualMode)) return shouldReviewSemanticVisualCandidate(module, candidate);
  return /legend|route|landmark|building|subject|object|label/.test(kind) || /住宿|宾馆|酒店|索道|入口|栈道|路线|导览|机器人|展品|观众/.test(text);
}

function shouldReviewSemanticVisualCandidate(module, candidate) {
  const source = String((candidate && candidate.source) || "");
  if (source === "layout-guided-locateanything") return true;
  if (isNamedCampusBuildingModule(module)) return true;
  const score = Number(candidate && candidate.candidateScore);
  if (!Number.isFinite(score)) return true;
  if (score < 0.74) return true;
  const bounds = candidate && candidate.bounds;
  if (!bounds) return true;
  if (isTinySubjectCandidate(module, bounds)) return true;
  if (isHugeNonBackgroundCandidate(module, bounds)) return true;
  return false;
}

function isTinySubjectCandidate(module, bounds) {
  const kind = String((module && module.regionKind) || "").toLowerCase();
  const policy = String((module && module.maskPolicy) || "").toLowerCase();
  const text = [
    kind,
    policy,
    module && module.label,
    module && module.regionPrompt,
    module && module.text
  ].join(" ");
  if (!/object-with-label|subject-with-label|\bobject\b|\bperson\b|\bproduct\b|robot|guide|visitor|观众|人物|机器人|导览|展品|主体|标签/i.test(text)) {
    return false;
  }
  const area = boundsArea(bounds);
  const minSide = Math.min(Number(bounds.width || 0), Number(bounds.height || 0));
  const plannedArea = boundsArea(module && module.plannedBounds);
  if (area < 0.012) return true;
  if (minSide < 0.075) return true;
  return Boolean(plannedArea && area / plannedArea < 0.12);
}

function isHugeNonBackgroundCandidate(module, bounds) {
  const kind = String((module && module.regionKind) || "").toLowerCase();
  const policy = String((module && module.maskPolicy) || "").toLowerCase();
  if (kind === "background" || policy === "full-region") return false;
  return boundsArea(bounds) > 0.58;
}

function isNamedCampusBuildingModule(module) {
  const kind = String((module && module.regionKind) || "").toLowerCase();
  const policy = String((module && module.maskPolicy) || "").toLowerCase();
  if (kind !== "building" && policy !== "subject-with-label") return false;
  const text = [
    module && module.label,
    module && module.regionPrompt,
    module && module.text,
    module && module.detail,
    module && module.sourceExcerpt,
    ...(Array.isArray(module && module.visualEvidence) ? module.visualEvidence : []),
    ...(Array.isArray(module && module.locatorQueries) ? module.locatorQueries : [])
  ]
    .map((value) => String(value || ""))
    .join(" ");
  return /校园|校区|大学|学院|图书馆|实验楼|教学楼|食堂|宿舍|体育馆|校史馆|library|laboratory|teaching building|canteen|dormitory|gymnasium|campus/i.test(text);
}

async function runMimoVisionAlignmentFallback(serverConfig, request, modules, helpers) {
  // The remote MiMo-vision API cannot fetch localhost image-cache URLs.
  // If the URL is a local path, skip MiMo-vision (it will 400) and let the
  // fallback chain continue to local-ocr or planned.
  const imageUrl = String(request.imageUrl || "");
  if (/^https?:\/\/(127\.|localhost|0\.0\.0\.0)/i.test(imageUrl) || imageUrl.startsWith("/image-cache/")) {
    throw new Error("MiMo-vision fallback requires a publicly accessible image URL, got local/localhost URL");
  }
  const normalizedModules = normalizeModules(modules);
  const content = buildMimoVisionAlignmentPrompt({
    imageWidth: request.imageWidth,
    imageHeight: request.imageHeight,
    visualMode: request.visualMode || "",
    modules: normalizedModules
  });
  const answer = await helpers.callVisionApi(serverConfig, {
    content,
    imageUrl: request.imageUrl,
    model: serverConfig.visionModel || "mimo-v2.5",
    purpose: "mimo_vision_align",
    responseFormat: "json"
  });
  const parsed = normalizeLocateAnythingOutput(parseMimoVisionJson(answer), normalizedModules);
  const verified = await verifyMimoVisionCandidates(serverConfig, request, normalizedModules, parsed, helpers);
  return {
    ...verified,
    modules: (verified.modules || []).map((module) => ({
      ...module,
      source: "mimo-vision",
      strategy: module.strategy || "remote-semantic-box"
    })),
    warnings: verified.warnings || [],
    raw: {
      provider: "mimo-vision",
      prompt: content,
      answer,
      parsed: parsed.raw || null,
      verification: verified.verificationRaw || null
    }
  };
}

async function verifyMimoVisionCandidates(serverConfig, request, modules, parsed, helpers) {
  if (!parsed.modules || !parsed.modules.length) return parsed;
  const content = buildMimoVisionVerificationPrompt({
    imageWidth: request.imageWidth,
    imageHeight: request.imageHeight,
    modules,
    candidates: parsed.modules
  });
  try {
    const answer = await helpers.callVisionApi(serverConfig, {
      content,
      imageUrl: request.imageUrl,
      model: serverConfig.visionModel || "mimo-v2.5",
      purpose: "mimo_vision_verify_align",
      responseFormat: "json"
    });
    const verification = parseMimoVisionVerificationJson(answer);
    const repaired = applyMimoVisionVerification(parsed, verification, modules);
    return {
      ...repaired,
      warnings: [
        ...normalizeWarnings(parsed.warnings),
        ...normalizeWarnings(repaired.warnings),
        ...normalizeWarnings(verification.warnings)
      ],
      verificationRaw: {
        provider: "mimo-vision-verify",
        prompt: content,
        answer,
        parsed: verification.raw || null
      }
    };
  } catch (error) {
    return {
      ...parsed,
      warnings: [...normalizeWarnings(parsed.warnings), `mimo-vision verification failed: ${error.message || String(error)}`]
    };
  }
}

function buildMimoVisionAlignmentPrompt({ imageWidth, imageHeight, visualMode, modules }) {
  const mapInstructions =
    String(visualMode || "").toLowerCase() === "map" || modules.some((module) => isMapLikeModule(module))
      ? [
          "这是一张地图/地理风貌图时，请按目标粒度定位：",
          "- route/堤/桥/路：框住实际线性道路、堤岸或桥体，可细长，不要为了文字标签变宽。",
          "- landmark/building/塔/亭：框住建筑或地标主体，可包含很近的短标签，但不要框远处说明栏。",
          "- water/mountain/nature：框住可见水域、山体、荷塘、岛屿等自然区域，不要只框图例文字。",
          "- legend/图例：框住紧凑图例块、色块或说明块本身，不要框某个景点。",
          "- abstract/对景/轴线/图例：只有画面中存在明确画出的线、轴线、分区、图例块时才框；否则 rejectedModules。",
          "- 每个模块应尽量选择不同的实体或区域；不要让辅助模块重复主景点框。"
        ]
      : [];
  const entityGroundingInstructions = [
    "Additional grounding rules:",
    "- Prefer the visible real-world entity or region, not the callout label, title plaque, text note, legend text, or empty nearby water.",
    "- A valid box should contain substantial non-text visual evidence of the target: island, pavilion, pagoda, bridge, causeway, route, water area, mountain, garden, person, object, or a deliberately drawn relation line.",
    "- If a label names a target, use it only as a clue; move the box to the depicted entity connected to that label when visible.",
    "- For landmark/building targets, do not return a blank lake patch or a nearby unrelated building. If the entity is not visible, reject the module instead of guessing.",
    "- For abstract relation targets such as sightline, axis, north-south relation, comparison, or spatial relationship, only return a box when a visible line, corridor, divided area, or relation band is drawn. Otherwise reject it.",
    "- For legends, return the complete compact legend block including swatches and short labels; do not return one arbitrary map object.",
    "- For object-with-label targets only, return one outer bounds covering the whole interactive target, and also return components: one component for the visible object/person and one component for the attached label/badge when present.",
    "- Return boxes with a small safety margin around the visible target so SAM segmentation can keep the full outline. Do not make the box tight around only OCR text.",
    "- For map routes, landmarks, mountains, buildings, water, legends, panels, and ordinary infographic modules, set components to an empty array. Do not copy sample component names.",
    "- It is acceptable for boxes to overlap when real visual regions overlap, but every box must still correspond to its own target."
  ];
  return [
    "你是 ChatImage 的视觉定位助手。请直接观察图片，为下面每个目标区域返回粗略但语义正确的点击框。",
    "只返回 JSON，不要 Markdown，不要解释。",
    "任务重点：框住目标区域本身，不要只框文字、标签、小图标，也不要返回整张图。",
    "如果目标是地图/海报/场景中的区域，允许区域有机、不规则，但 JSON 里仍返回能覆盖主体的矩形 box。",
    "对于手绘地图、地理风貌图、海报或场景图：文字牌、注释框、题签只能作为识别线索，不是目标本体；除非目标明确是文字牌，否则 bounds 必须框住画面里的真实地理区域、路线、桥、建筑、水域、山体、人物或物体。",
    "如果目标是桥、堤、路、河道、海岸线这类细长对象，返回贴近该对象走向的细长矩形，不要为了包含旁边标签而放大成宽大的框。",
    "如果画面里同时有文字标签和实体对象，优先框实体对象；只有实体对象不可见时才退而框标签附近最小区域，并降低 confidence。",
    "如果无法判断某个目标在哪里，把它放入 rejectedModules，不要用整图或无关区域凑数。",
    ...mapInstructions,
    ...entityGroundingInstructions,
    "bounds 使用 0~1 归一化坐标，相对于整张图片左上角。",
    "confidence 使用 0~1，低于 0.5 代表你不确定。",
    `图片尺寸：${imageWidth}x${imageHeight}`,
    "目标列表：",
    JSON.stringify(
      modules.map((module) => ({
        moduleId: module.moduleId,
        label: module.label,
        regionKind: module.regionKind,
        regionPrompt: module.regionPrompt,
        visualEvidence: module.visualEvidence,
        maskPolicy: module.maskPolicy,
        spatialHint: module.spatialHint,
        locatorQueries: module.locatorQueries,
        componentHints: module.componentHints,
        semanticHint: module.semanticHint,
        targetDescription: module.targetDescription,
        roughPlannedBounds: module.plannedBounds
      })),
      null,
      2
    ),
    "返回格式：",
    JSON.stringify(
      {
        provider: "mimo-vision",
        modules: modules.map((module) => ({
          moduleId: module.moduleId,
          label: module.label,
          bounds: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 },
          components:
            module.regionKind === "object-with-label"
              ? [
                  { kind: "object", label: "main visible object", bounds: { x: 0.1, y: 0.2, width: 0.16, height: 0.18 } },
                  { kind: "label", label: "attached short label", bounds: { x: 0.12, y: 0.36, width: 0.18, height: 0.05 } }
                ]
              : [],
          confidence: 0.8,
          matchedText: "why this region was selected"
        })),
        rejectedModules: []
      },
      null,
      2
    )
  ].join("\n\n");
}

function buildMimoVisionVerificationPrompt({ imageWidth, imageHeight, modules, candidates }) {
  const candidateById = new Map((candidates || []).map((candidate) => [candidate.moduleId, candidate]));
  const targets = modules.map((module) => {
    const candidate = candidateById.get(module.moduleId) || {};
    return {
      moduleId: module.moduleId,
      label: module.label,
      regionKind: module.regionKind,
      regionPrompt: module.regionPrompt,
      visualEvidence: module.visualEvidence,
      maskPolicy: module.maskPolicy,
      spatialHint: module.spatialHint,
      locatorQueries: module.locatorQueries,
      componentHints: module.componentHints,
      semanticHint: module.semanticHint,
      targetDescription: module.targetDescription,
      candidateBounds: candidate.bounds || null,
      candidateMatchedText: candidate.matchedText || ""
    };
  });
  const entityVerificationRules = [
    "Additional verification rules:",
    "- Reject or correct any candidate that mainly covers text labels, title plaques, annotation cards, empty water, or unrelated scenery.",
    "- Accept only when the candidate covers the visible entity/region requested by the module, not just the nearest written name.",
    "- If a landmark/building candidate is on water with no visible object, reject it or correct it to the visible island/building.",
    "- If an abstract relation candidate has no visible drawn axis, line, band, divided region, or legend block, reject it instead of mapping it to a nearby landmark.",
    "- For object-with-label targets, keep or correct components so the final mask can include both the object/person and the attached label/badge.",
    "- For all non object-with-label targets, return components: [] unless separate components are truly part of the requested interactive object.",
    "- Overlap is allowed, but each accepted candidate must have a distinct semantic reason."
  ];
  return [
    "你是 ChatImage 的视觉定位质检员。请检查候选框是否真的框中了目标实体。",
    "只返回 JSON，不要 Markdown，不要解释。",
    "目标实体优先级高于文字标签：地图/海报/场景里，文字说明、题签、图例只能帮助识别，不应该替代真实景观、路线、建筑、水域或物体。",
    "如果候选框框到了文字栏、无关小建筑、整张图、错误景点，或只框到了标签而不是实体，请返回 accepted=false 并给出 correctedBounds。",
    "如果目标本来就是抽象图例或空间划分，correctedBounds 应覆盖对应的可见图例/水域分区，而不是随便选一个附近景点。",
    "如果目标是“对景、轴线、关系、分区说明”这类抽象关系，必须优先寻找图中是否有明确画出的线、轴线、分区、图例块；如果没有明确可见形状，不要框到附近单个景点。",
    "如果找不到可靠实体或图例，请放入 rejectedModules，不要硬凑。",
    ...entityVerificationRules,
    "bounds 使用 0~1 归一化坐标，相对于整张图片左上角。",
    `图片尺寸：${imageWidth}x${imageHeight}`,
    "候选框列表：",
    JSON.stringify(targets, null, 2),
    "返回格式：",
    JSON.stringify(
      {
        provider: "mimo-vision-verify",
        modules: targets.map((target) => ({
          moduleId: target.moduleId,
          accepted: true,
          correctedBounds: target.candidateBounds || { x: 0.1, y: 0.2, width: 0.2, height: 0.2 },
          components:
            target.regionKind === "object-with-label"
              ? [
                  { kind: "object", label: "main visible object", bounds: { x: 0.1, y: 0.2, width: 0.16, height: 0.18 } },
                  { kind: "label", label: "attached short label", bounds: { x: 0.12, y: 0.36, width: 0.18, height: 0.05 } }
                ]
              : [],
          confidence: 0.8,
          reason: "why the candidate is accepted or corrected"
        })),
        rejectedModules: []
      },
      null,
      2
    )
  ].join("\n\n");
}

function parseMimoVisionJson(content) {
  const parsed = alignmentModel.parseJsonFromText(content);
  return {
    provider: "mimo-vision",
    modules: Array.isArray(parsed.modules) ? parsed.modules : [],
    rejectedModules: Array.isArray(parsed.rejectedModules) ? parsed.rejectedModules : [],
    warnings: normalizeWarnings(parsed.warnings)
  };
}

function parseMimoVisionVerificationJson(content) {
  const parsed = alignmentModel.parseJsonFromText(content);
  return {
    provider: "mimo-vision-verify",
    modules: Array.isArray(parsed.modules) ? parsed.modules : [],
    rejectedModules: Array.isArray(parsed.rejectedModules) ? parsed.rejectedModules : [],
    warnings: normalizeWarnings(parsed.warnings),
    raw: parsed
  };
}

function applyMimoVisionVerification(parsed, verification, requestedModules) {
  const requestedById = new Map(requestedModules.map((module) => [module.moduleId, module]));
  const candidateById = new Map((parsed.modules || []).map((module) => [module.moduleId, module]));
  const modules = [];
  const rejectedModules = [...(parsed.rejectedModules || []), ...(verification.rejectedModules || [])];
  const warnings = [];
  for (const candidate of parsed.modules || []) {
    const item = (verification.modules || []).find((entry) => String(entry.moduleId || entry.id || "") === candidate.moduleId);
    if (!item) {
      modules.push(candidate);
      warnings.push(`mimo-vision verification missing ${candidate.moduleId}; kept original candidate`);
      continue;
    }
    const accepted = item.accepted !== false;
    const reason = String(item.reason || "");
    const correctedBounds = item.correctedBounds || item.bounds;
    if (!accepted && !correctedBounds) {
      rejectedModules.push({
        moduleId: candidate.moduleId,
        label: candidate.label,
        bounds: candidate.bounds,
        confidence: candidate.confidence,
        source: "mimo-vision-verify",
        reason: reason || "verification rejected candidate"
      });
      continue;
    }
    if (correctedBounds) {
      try {
        const bounds = normalizeBounds(correctedBounds, candidate.moduleId);
        modules.push({
          ...candidate,
          bounds,
          confidence: normalizeConfidence(item.confidence ?? candidate.confidence, candidate.moduleId),
          components: normalizeLocatedComponents(item.components, candidate.moduleId).length
            ? normalizeLocatedComponents(item.components, candidate.moduleId)
            : candidate.components || [],
          matchedText: reason || candidate.matchedText || "",
          strategy: accepted ? "remote-semantic-verified" : "remote-semantic-corrected"
        });
        if (!accepted || JSON.stringify(bounds) !== JSON.stringify(candidate.bounds)) {
          warnings.push(`mimo-vision corrected ${candidate.moduleId}: ${reason || "candidate adjusted"}`);
        }
        continue;
      } catch (error) {
        warnings.push(`mimo-vision correction invalid for ${candidate.moduleId}: ${error.message || String(error)}`);
      }
    }
    modules.push(candidateById.get(candidate.moduleId) || candidate);
  }
  for (const module of requestedModules) {
    if (!modules.some((item) => item.moduleId === module.moduleId) && candidateById.has(module.moduleId)) {
      modules.push(candidateById.get(module.moduleId));
    }
  }
  return {
    ...parsed,
    modules,
    rejectedModules,
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
  return cachedCudaProbe(cudaProbeCache, python, "LocateAnything");
}

// CUDA probes used to fork a Python interpreter on every /api/config and
// /api/vision/health request, blocking the event loop for ~3-6s while torch
// cold-imports. Cache the boolean per-python-path for a short window so a
// burst of requests amortizes the cost.
const cudaProbeCache = new Map();
const CUDA_PROBE_TTL_MS = 60_000;

function cachedCudaProbe(cache, python, label) {
  const now = Date.now();
  const entry = cache.get(python);
  if (entry && now - entry.timestamp < CUDA_PROBE_TTL_MS) return entry.value;
  const value = probeCudaOnce(python, label);
  cache.set(python, { value, timestamp: now });
  return value;
}

function probeCudaOnce(python, label) {
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
    this.lastActivityAt = 0;
    // Recycle the worker if it has been idle longer than this (ms). A long-idle
    // worker may have leaked GPU memory or wedged; recycling forces a fresh start
    // on the next request. 0 = disabled.
    this.idleRecycleMs = Number(this.serverConfig.locateAnythingIdleRecycleMs || 120000);
  }

  request(payload, timeoutMs) {
    this.ensureStarted();
    const id = `req_${this.nextId++}`;
    const message = { ...payload, id };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Reject only THIS request on timeout. Do NOT stopChild() here: the worker
        // is shared across all in-flight requests, and SIGKILLing it would reject
        // every concurrent alignment. A genuinely wedged worker is recycled via the
        // close handler when it eventually exits, or by a later ensureStarted().
        if (this.pending.delete(id)) {
          reject(new Error(`LocateAnything worker timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      // Guard against the race where the child exited between ensureStarted() and
      // here (close handler sets this.child = null and rejects all pending).
      if (!this.child || !this.child.stdin || this.child.stdin.destroyed) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error("LocateAnything worker is not running"));
        return;
      }
      try {
        this.child.stdin.write(`${JSON.stringify(message)}\n`);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error(`Failed to send request to LocateAnything worker: ${error.message}`));
      }
    });
  }

  ensureStarted() {
    // Recycle a long-idle worker to reclaim leaked GPU memory and recover from
    // a silently-wedged state (process alive but unresponsive).
    if (this.child && !this.child.killed && this.child.exitCode === null && !this.child.stdin.destroyed) {
      if (this.idleRecycleMs > 0 && this.lastActivityAt > 0 &&
          Date.now() - this.lastActivityAt > this.idleRecycleMs) {
        this.stopChild();
      } else {
        return;
      }
    }
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
    this.lastActivityAt = Date.now();
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
  const requestedById = new Map(requestedModules.map((module) => [module.moduleId, module]));
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
    const requestedModule = requestedById.get(moduleId) || {};
    const regionKind = String(requestedModule.regionKind || "");
    normalizedModules.push({
      moduleId,
      label: String(item.label || ""),
      matchedText: String(item.matchedText || ""),
      bounds: normalizeBounds(item.bounds, moduleId),
      confidence: normalizeConfidence(item.confidence, moduleId),
      source: String(item.source || "locateanything"),
      answer: String(item.answer || ""),
      strategy: String(item.strategy || ""),
      phraseKind: String(item.phraseKind || ""),
      candidateScore: Number.isFinite(Number(item.candidateScore)) ? Number(item.candidateScore) : null,
      candidateDiagnostics:
        item.candidateDiagnostics && typeof item.candidateDiagnostics === "object" && !Array.isArray(item.candidateDiagnostics)
          ? item.candidateDiagnostics
          : Array.isArray(item.candidateDiagnostics)
            ? item.candidateDiagnostics
            : null,
      regionKind,
      targetDescription: String(requestedModule.targetDescription || ""),
      visualEvidence: requestedModule.visualEvidence || [],
      maskPolicy: requestedModule.maskPolicy || "",
      spatialHint: requestedModule.spatialHint || "",
      locatorQueries: requestedModule.locatorQueries || [],
      componentHints: requestedModule.componentHints || [],
      components: shouldKeepLocatedComponents(regionKind, item.components)
        ? normalizeLocatedComponents(item.components, moduleId)
        : [],
      cropWindow: item.cropWindow ? normalizeBounds(item.cropWindow, moduleId) : null
    });
  }
  return {
    modules: normalizedModules,
    rejectedModules,
    warnings: normalizeWarnings(value.warnings),
    raw: value
  };
}

function shouldKeepLocatedComponents(regionKind, components) {
  if (!Array.isArray(components) || components.length === 0) return false;
  if (String(regionKind || "").toLowerCase() === "object-with-label") return true;
  return components.some((component) => {
    const label = String((component && (component.label || component.text || component.kind || component.type)) || "").toLowerCase();
    return /robot|person|badge|机器|机器人|人物|徽标/.test(label);
  });
}

function normalizeLocatedComponents(components, moduleId) {
  if (!Array.isArray(components)) return [];
  return components
    .map((component, index) => {
      if (!component || typeof component !== "object" || Array.isArray(component)) return null;
      const bounds = component.bounds || component.box;
      if (!bounds) return null;
      try {
        return {
          kind: String(component.kind || component.type || `component_${index + 1}`),
          label: String(component.label || component.text || ""),
          bounds: normalizeBounds(bounds, `${moduleId}.components[${index}]`)
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .slice(0, 4);
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
    const detail = String(module.detail || "").slice(0, 700);
    const sourceExcerpt = String(module.sourceExcerpt || "").slice(0, 260);
    const visualEvidence = normalizeTextList(module.visualEvidence || module.evidence, 4, 160);
    const locatorQueries = normalizeTextList(module.locatorQueries || module.queries, 4, 180);
    const componentHints = normalizeComponentHints(module.componentHints || module.parts, 4, 120);
    const maskPolicy = normalizeMaskPolicy(module.maskPolicy);
    const spatialHint = String(module.spatialHint || module.positionHint || "").slice(0, 100);
    const visualMode = String(module.visualMode || "").trim().toLowerCase();
    const targetDescription = buildTargetDescription({
      label,
      text,
      regionPrompt,
      detail,
      sourceExcerpt,
      regionKind: module.regionKind,
      visualEvidence,
      maskPolicy,
      spatialHint,
      locatorQueries,
      componentHints
    });
    return {
      moduleId,
      label,
      order: Number(module.order || index + 1),
      text,
      regionKind: String(module.regionKind || "card"),
      regionPrompt,
      visualEvidence,
      maskPolicy,
      spatialHint,
      locatorQueries,
      componentHints,
      detail,
      sourceExcerpt,
      targetDescription,
      semanticHint: buildSemanticHint({
        ...module,
        label,
        text,
        visualMode,
        regionPrompt,
        detail,
        sourceExcerpt,
        visualEvidence,
        maskPolicy,
        spatialHint,
        locatorQueries,
        componentHints
      }),
      components: normalizeLocatedComponents(module.components, moduleId),
      visualMode,
      plannedBounds: module.plannedBounds ? normalizeBounds(module.plannedBounds, moduleId) : null
    };
  });
}

function buildTargetDescription({ label, text, regionPrompt, detail, sourceExcerpt, regionKind, visualEvidence, maskPolicy, spatialHint, locatorQueries, componentHints }) {
  return [
    `label: ${label}`,
    `kind: ${regionKind || "area"}`,
    maskPolicy ? `mask policy: ${maskPolicy}` : "",
    spatialHint ? `rough position: ${spatialHint}` : "",
    regionPrompt ? `visual target: ${regionPrompt}` : "",
    visualEvidence && visualEvidence.length ? `must-see evidence: ${visualEvidence.join("; ")}` : "",
    locatorQueries && locatorQueries.length ? `alternate locate queries: ${locatorQueries.join("; ")}` : "",
    componentHints && componentHints.length
      ? `component hints: ${componentHints.map((item) => `${item.kind}:${item.label}`).join("; ")}`
      : "",
    text ? `visible text clue: ${text}` : "",
    detail ? `meaning: ${detail}` : "",
    sourceExcerpt ? `source: ${sourceExcerpt}` : ""
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1200);
}

function normalizeTextList(value, maxItems, maxChars) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[;\n]/) : [];
  return Array.from(
    new Set(
      source
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .map((item) => item.slice(0, maxChars))
    )
  ).slice(0, maxItems);
}

function normalizeComponentHints(value, maxItems, maxChars) {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item, index) => {
      if (typeof item === "string") return { kind: "component", label: item.slice(0, maxChars) };
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      return {
        kind: String(item.kind || item.type || `component_${index + 1}`).slice(0, 40),
        label: String(item.label || item.text || item.name || "").slice(0, maxChars)
      };
    })
    .filter((item) => item && item.label)
    .slice(0, maxItems);
}

function normalizeMaskPolicy(value) {
  const source = String(value || "").trim().toLowerCase();
  const allowed = ["card", "full-region", "subject", "subject-with-label", "route", "legend"];
  return allowed.includes(source) ? source : "";
}

function isMapLikeModule(module) {
  const text = [module.regionKind, module.regionPrompt, module.label, module.text, module.detail, module.sourceExcerpt]
    .map((value) => String(value || ""))
    .join(" ");
  return /map|route|landmark|building|water|mountain|nature|shore|lake|island|pagoda|bridge|causeway|trail|transport|legend|panel|\u5730\u56fe|\u5730\u7406|\u98ce\u8c8c|\u5824|\u6865|\u5854|\u4ead|\u6e56|\u6c34\u57df|\u5c71|\u5c9b|\u8377|\u5bf9\u666f|\u8f74\u7ebf|\u6808\u9053|\u6d77\u5cb8|\u6b65\u9053|\u7ebf\u8def|\u8def\u7ebf|\u4ea4\u901a|\u63a5\u9a73|\u7d22\u9053|\u56fe\u4f8b/.test(text);
}

function buildSemanticHint(module) {
  const primaryRaw = [module.regionPrompt, module.label].map((value) => String(value || "")).join(" ");
  const contractRaw = [
    ...(Array.isArray(module.visualEvidence) ? module.visualEvidence : []),
    ...(Array.isArray(module.locatorQueries) ? module.locatorQueries : []),
    module.maskPolicy,
    module.spatialHint
  ]
    .map((value) => String(value || ""))
    .join(" ");
  const raw = [primaryRaw, contractRaw, module.text, module.detail, module.sourceExcerpt, module.regionKind].map((value) => String(value || "")).join(" ");
  const kind = String(module.regionKind || "").toLowerCase();
  const maskPolicy = String(module.maskPolicy || "").toLowerCase();
  const visualMode = String(module.visualMode || "").toLowerCase();
  const cardLikeInfographic = isCardLikeInfographicModule(visualMode, kind, maskPolicy);
  const strongMapHint = cardLikeInfographic ? "" : buildStrongMapSemanticHint(kind, raw, [primaryRaw, contractRaw].join(" "));
  if (strongMapHint) return strongMapHint;
  const keywordMap = [
    [/\u5c4f\u5e55|\u663e\u793a|\u89e6\u63a7|OLED|AMOLED|LTPO/i, "display screen touch panel"],
    [/\u7535\u6c60|\u7eed\u822a|\u5145\u7535|\u9502|BMS/i, "battery pack power cell"],
    [/\u4f20\u611f|\u5fc3\u7387|\u8840\u6c27|PPG|\u5065\u5eb7|\u6e29\u5ea6/i, "health sensor optical sensor"],
    [/\u5916\u58f3|\u4e2d\u6846|\u9632\u62a4|\u949b|\u4e0d\u9508\u94a2|\u8868\u58f3/i, "protective watch case metal frame"],
    [/\u8868\u5e26|\u8155\u5e26|\u5feb\u62c6|NFC/i, "watch strap band"],
    [/\u82af\u7247|\u5904\u7406\u5668|\u4e3b\u677f|PCB|\u7535\u8def/i, "chip mainboard circuit board"],
    [/\u6444\u50cf|\u955c\u5934|\u76f8\u673a/i, "camera lens optical module"],
    [/\u897f\u6e56|\u6e56\u6c34|\u6e56\u9762|\u6c34\u57df|\u6e38\u8239/i, "lake water area boats"],
    [/\u56fe\u4f8b|\u8272\u5757|legend|key/i, "map legend block swatches"],
    [/\u5bf9\u666f|\u8f74\u7ebf|\u76f8\u671b|\u89c6\u7ebf|axis|sightline/i, "visual axis sightline relationship line"],
    [/\u6808\u9053|\u6d77\u5cb8|\u6b65\u9053|\u6e38\u7ebf|\u7ebf\u8def|\u8def\u7ebf|\u767d\u5824|\u65ad\u6865|\u6865|\u5824|trail|route|walkway|coast/i, "visible trail route corridor"],
    [/\u82cf\u5824|\u957f\u5824|\u8def\u7ebf|\u6b65\u9053/i, "long causeway walking route"],
    [/\u4e09\u6f6d\u5370\u6708|\u6e56\u5fc3|\u5c9b|\u77f3\u5854/i, "lake island stone pagodas"],
    [/\u96f7\u5cf0\u5854|\u5854|\u5efa\u7b51/i, "pagoda landmark building"],
    [/\u8377\u82b1|\u690d\u7269|\u8fdc\u5c71|\u5c71|\u81ea\u7136|\u5cb8/i, "lotus plants mountains shoreline"],
    [/\u5c55\u54c1|\u5c55\u89c8|\u88c5\u7f6e|\u827a\u672f\u54c1/i, "museum exhibit installation"],
    [/\u89c2\u4f17|\u4eba\u7269|\u6e38\u5ba2|\u5c45\u6c11|\u4eba\u7fa4/i, "people visitors residents"],
    [/\u673a\u5668\u4eba|\u5bfc\u89c8|\u52a9\u624b/i, "guide robot assistant"],
    [/\u7a7a\u95f4|\u7ed3\u6784|\u573a\u9986/i, "spatial structure architecture"],
    [/\u516c\u4ea4|\u4ea4\u901a|\u63a5\u9a73|\u9ad8\u94c1|\u5df4\u58eb|\u7d22\u9053|\u5730\u94c1|\u81ea\u884c\u8f66/i, "transport information legend panel"],
    [/\u80fd\u6e90|\u592a\u9633\u80fd|\u98ce\u80fd|\u7535\u7f51/i, "clean energy infrastructure"]
  ];
  const parts = [];
  for (const [pattern, phrase] of keywordMap) {
    if (pattern.test(primaryRaw)) parts.push(phrase);
  }
  if (!parts.length && !cardLikeInfographic) {
    for (const [pattern, phrase] of keywordMap) {
      if (pattern.test(raw)) parts.push(phrase);
    }
  }
  const asciiSource = cardLikeInfographic ? [primaryRaw, contractRaw, module.text].join(" ") : raw;
  const asciiText = asciiSource.replace(/[^A-Za-z0-9,.;:()/%+\- ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!parts.length && isUsefulAsciiHint(asciiText)) parts.push(asciiText);
  if (!parts.length) parts.push(cardLikeInfographic ? buildCardSemanticHint(module) : "the described visual element or separated region");
  return Array.from(new Set(parts)).join("; ").slice(0, 180);
}

function isCardLikeInfographicModule(visualMode, kind, maskPolicy) {
  if (["map", "scene", "poster"].includes(String(visualMode || "").toLowerCase())) return false;
  if (["route", "legend", "subject", "subject-with-label"].includes(String(maskPolicy || "").toLowerCase())) return false;
  const normalizedKind = String(kind || "").toLowerCase();
  return !normalizedKind || ["card", "area", "panel", "module"].includes(normalizedKind);
}

function buildCardSemanticHint(module) {
  const label = String((module && module.label) || (module && module.regionPrompt) || "target card").trim();
  const text = String((module && module.text) || "").trim();
  return [`infographic card or separated panel for ${label}`, text ? `visible text: ${text}` : ""]
    .filter(Boolean)
    .join("; ")
    .slice(0, 180);
}

function buildStrongMapSemanticHint(kind, raw, primaryRaw = "") {
  const text = String(raw || "");
  const primaryText = String(primaryRaw || "");
  if (/legend|panel/.test(kind) || /\u56fe\u4f8b|\u8272\u5757|legend|key|info panel|guide panel/i.test(primaryText)) {
    return "complete compact information legend panel with icons labels";
  }
  if (/\u5b64\u5c71/.test(primaryText)) return "Gushan hill island region: hill mass, shoreline, trees, pavilion or cultural building, not just the text label";
  if (/\u5b9d\u77f3\u5c71|\u4fdd\u4ff6\u5854/.test(primaryText)) return "Baoshi Hill ridge region with hill terrain, trees, and Baochu Pagoda if visible";
  if (/\u66f2\u9662\u98ce\u8377|\u8377\u5858|\u8377\u82b1/.test(primaryText)) return "lotus pond scenic garden region with lotus leaves, curved bridge, shoreline plants";
  if (/\u67f3\u6d6a\u95fb\u83ba|\u67f3\u6797|\u95fb\u83ba/.test(primaryText)) return "willow garden shoreline region with willow trees, path, and south/east lake bank";
  if (/\u4e09\u6f6d\u5370\u6708|\u6e56\u5fc3|\u77f3\u5854/.test(primaryText)) return "lake island and three stone pagodas landmark region";
  if (/\u96f7\u5cf0\u5854/.test(primaryText)) return "Leifeng Pagoda building landmark with nearby hill slope, not only the label";
  if (/route/.test(kind) || /\u6808\u9053|\u6d77\u5cb8|\u6b65\u9053|\u6e38\u7ebf|\u7ebf\u8def|\u8def\u7ebf|\u7d22\u9053|\u73af\u7ebf|trail|route|walkway|coast|corridor/i.test(primaryText)) {
    const exactName = extractRouteName(primaryText) || extractRouteName(text);
    const sideHint = buildRouteSideHint(primaryText || text);
    return [
      exactName ? `${exactName} exact named route` : "exact named route",
      "visible path line/corridor plus its attached short label if visible",
      "narrow footprint following the route, not a nearby bridge, generic path, or unrelated scenic label",
      sideHint
    ]
      .filter(Boolean)
      .join("; ")
      .slice(0, 260);
  }
  if (/\u4ea4\u901a|\u63a5\u9a73|\u9ad8\u94c1|\u5df4\u58eb|\u7d22\u9053|\u8f66\u7ad9|transport|transit|bus|rail|station|cableway|ropeway/i.test(primaryText)) {
    return "transport information legend panel with route icons";
  }
  if (/building/.test(kind)) return buildNamedBuildingSemanticHint(primaryText || text) || "visible building landmark icon and nearby short label";
  if (/water/.test(kind)) return "visible water area";
  if (/landmark/.test(kind)) return "visible landmark scenic region";
  if (/mountain/.test(kind)) return "visible mountain terrain scenic region";
  return "";
}

function buildNamedBuildingSemanticHint(text) {
  const source = String(text || "");
  const namedBuildings = [
    [/\u56fe\u4e66\u9986|library/i, "campus library building: visible library building footprint plus its 图书馆/library label; not laboratory, teaching building, canteen, dormitory, gym, or gate"],
    [/\u5b9e\u9a8c\u697c|\u5b9e\u9a8c\u5ba4|laboratory|lab building/i, "campus laboratory building: visible lab/实验楼 building footprint plus its label; not library, teaching building, canteen, dormitory, gym, or gate"],
    [/\u6559\u5b66\u697c|teaching building|classroom building/i, "campus teaching building: visible 教学楼/classroom building footprint plus its label; not library, laboratory, canteen, dormitory, gym, or gate"],
    [/\u98df\u5802|canteen|dining hall|cafeteria/i, "campus canteen/dining hall building: visible 食堂/canteen footprint plus its label; not library, laboratory, teaching building, dormitory, gym, or gate"],
    [/\u5bbf\u820d|\u5bbf\u820d\u533a|dormitory|student housing/i, "campus dormitory/student housing region: visible 宿舍/dorm building group plus its label; not library, laboratory, teaching building, canteen, gym, or gate"],
    [/\u4f53\u80b2\u9986|gymnasium|sports hall|arena/i, "campus gymnasium/sports hall building: visible 体育馆/gym footprint plus its label; not library, laboratory, teaching building, canteen, dormitory, or gate"],
    [/\u6821\u53f2\u9986|history museum|school museum/i, "campus history museum building: visible 校史馆 building footprint plus its label; not library, laboratory, teaching building, canteen, dormitory, gym, or gate"]
  ];
  const match = namedBuildings.find(([pattern]) => pattern.test(source));
  return match ? match[1] : "";
}

function extractRouteName(text) {
  const source = String(text || "");
  const patterns = [
    /([\u4e00-\u9fffA-Za-z0-9·]{2,24}(?:栈道|步道|游线|线路|路线|索道|海岸|白堤|苏堤|断桥|桥|堤))/,
    /(West Coast Trail|Sunshine Coast Trail|coast trail|causeway|bridge|route|walkway)/i
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match && match[1]) return match[1].trim();
  }
  return "";
}

function buildRouteSideHint(text) {
  const source = String(text || "");
  const parts = [];
  if (/东侧|东方|日出|east|right/i.test(source)) parts.push("east/right side");
  if (/西侧|日落|west|left/i.test(source)) parts.push("west/left side");
  if (/南|south/i.test(source)) parts.push("south/lower side");
  if (/北|north/i.test(source)) parts.push("north/upper side");
  return parts.length ? `rough spatial cue: ${Array.from(new Set(parts)).join(", ")}` : "";
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
  MIN_LOCAL_OCR_FALLBACK_CONFIDENCE,
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
