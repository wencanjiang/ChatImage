(function initPreviewStrategy(global) {
  "use strict";

  // Region kinds that represent a geographic/contextual area rather than an
  // independent object. These must use original-image context crops instead of
  // transparent SAM3 cutouts, otherwise map/scene targets get shredded into
  // text fragments and tree dots (the 宝石山 regression).
  const CONTEXT_CROP_REGION_KINDS = [
    "water",
    "route",
    "landmark",
    "building",
    "mountain",
    "axis",
    "legend",
    "district",
    "area",
    "annotation",
    "panel",
    "flow-strip",
    "foreground",
    "background"
  ];

  // Region kinds that represent an independent subject which can be cleanly
  // segmented and shown as a transparent cutout (robot, person, product).
  const INDEPENDENT_SUBJECT_KINDS = ["object", "person", "product"];
  const SUBJECT_WITH_LABEL_KINDS = ["object-with-label"];

  // Visual modes where the whole image is a semantic scene/map rather than a
  // card grid. For these modes, every hotspot defaults to a context crop unless
  // it explicitly opts into an independent-subject kind. This protects old
  // saved data where regionKind was lost during serialization.
  const MAP_LIKE_VISUAL_MODES = ["map", "scene", "poster"];

  function resolveHotspotRegionKind(result, hotspot) {
    const direct = String((hotspot && hotspot.regionKind) || "").toLowerCase();
    if (direct) return direct;
    const modules = getStructuredTargets(result);
    const module = modules.find((item) => item && item.id === hotspot.id);
    return String((module && module.regionKind) || "").toLowerCase();
  }

  function resolveHotspotMaskPolicy(result, hotspot) {
    const direct = String((hotspot && hotspot.maskPolicy) || "").toLowerCase();
    if (direct) return direct;
    const modules = getStructuredTargets(result);
    const module = modules.find((item) => item && item.id === hotspot.id);
    return String((module && module.maskPolicy) || "").toLowerCase();
  }

  function getStructuredTargets(result) {
    const spec = result && result.structuredSpec ? result.structuredSpec : {};
    const main = Array.isArray(spec.modules) ? spec.modules : [];
    const auxiliary = Array.isArray(spec.auxiliaryModules) ? spec.auxiliaryModules : [];
    return main.concat(auxiliary);
  }

  function resolveVisualMode(result) {
    return String((result && result.structuredSpec && result.structuredSpec.visualMode) || "infographic").toLowerCase();
  }

  // Pure decision function: given a result and a hotspot, decide whether the
  // preview should use an original-image context crop or a transparent cutout.
  // Kept side-effect-free so it can be unit-tested in Node without a browser.
  function inferPreviewStrategy(result, hotspot) {
    const regionKind = resolveHotspotRegionKind(result, hotspot);
    const maskPolicy = resolveHotspotMaskPolicy(result, hotspot);
    const visualMode = resolveVisualMode(result);
    const isIndependentSubject = visualMode !== "infographic" && INDEPENDENT_SUBJECT_KINDS.includes(regionKind);
    const mapLikeRegion = CONTEXT_CROP_REGION_KINDS.includes(regionKind);
    const mapLikeVisualMode = MAP_LIKE_VISUAL_MODES.includes(visualMode);
    const isRoute = regionKind === "route" || maskPolicy === "route";
    const maskScore = Number(hotspot && hotspot.mask && hotspot.mask.score);
    const lowConfidenceFullRegion =
      maskPolicy === "full-region" && Number.isFinite(maskScore) && maskScore < 0.35;
    const subjectWithLabel = SUBJECT_WITH_LABEL_KINDS.includes(regionKind);
    const infographicSubjectWithLabel = visualMode === "infographic" && subjectWithLabel;
    const semanticSubjectWithLabel = MAP_LIKE_VISUAL_MODES.includes(visualMode) && subjectWithLabel;
    const flowStrip = regionKind === "flow-strip" || isFlowStripHotspot(result, hotspot);

    // Route targets keep the original image but use the route caption.
    if (isRoute) {
      return {
        preferContextCrop: true,
        mapLike: false,
        route: true,
        independentSubject: false,
        regionKind,
        maskPolicy,
        visualMode,
        caption: "路线区域预览"
      };
    }
    if (flowStrip) {
      return {
        preferContextCrop: true,
        mapLike: false,
        route: false,
        flowStrip: true,
        independentSubject: false,
        regionKind: "flow-strip",
        maskPolicy,
        visualMode,
        caption: ""
      };
    }
    // The attached label is part of the intended target, but semantic
    // map/scene/poster outputs still need a little surrounding context.
    if (semanticSubjectWithLabel) {
      return {
        preferContextCrop: true,
        mapLike: true,
        route: false,
        independentSubject: false,
        subjectWithLabel: true,
        regionKind,
        maskPolicy,
        visualMode,
        caption: "区域上下文预览"
      };
    }
    if (infographicSubjectWithLabel) {
      return {
        preferContextCrop: false,
        mapLike: false,
        route: false,
        independentSubject: false,
        subjectWithLabel: true,
        regionKind,
        maskPolicy,
        visualMode,
        cardLike: true,
        caption: ""
      };
    }
    if (subjectWithLabel) {
      return {
        preferContextCrop: true,
        mapLike: true,
        route: false,
        independentSubject: false,
        subjectWithLabel: true,
        regionKind,
        maskPolicy,
        visualMode,
        caption: "区域上下文预览"
      };
    }
    // Map-like regions (landmark/mountain/water/...) always use context crops.
    if (mapLikeRegion) {
      return {
        preferContextCrop: true,
        mapLike: true,
        route: false,
        independentSubject: false,
        regionKind,
        maskPolicy,
        visualMode,
        caption: "区域上下文预览"
      };
    }
    // Independent subjects keep their transparent cutout path (for example the
    // museum guide robot). Do not use maskPolicy=subject by itself here: map
    // landmarks such as 三潭印月/宝石山 also use subject masks, but they should
    // render as organic region previews rather than shredded transparent cutouts.
    if (isIndependentSubject) {
      return {
        preferContextCrop: false,
        mapLike: false,
        route: false,
        independentSubject: true,
        regionKind,
        maskPolicy,
        visualMode,
        caption: "主体抠图预览"
      };
    }
    // Whole-image fallback: for map/scene/poster outputs, treat every hotspot
    // as a context-region unless it explicitly opted into a subject kind above.
    // This protects old saved data where regionKind was lost.
    if (mapLikeVisualMode || lowConfidenceFullRegion) {
      return {
        preferContextCrop: true,
        mapLike: true,
        route: false,
        independentSubject: false,
        regionKind,
        maskPolicy,
        visualMode,
        caption: "区域上下文预览"
      };
    }
    return {
      preferContextCrop: false,
      mapLike: false,
      route: false,
      independentSubject: false,
      regionKind,
      maskPolicy,
      visualMode,
      cardLike: visualMode === "infographic",
      caption: ""
    };
  }

  function isInfographicCardLike(strategy) {
    if (!strategy) return false;
    const visualMode = String(strategy.visualMode || "").toLowerCase();
    if (visualMode !== "infographic") return false;
    if (strategy.independentSubject || strategy.route || strategy.mapLike || strategy.flowStrip) return false;
    const regionKind = String(strategy.regionKind || "card").toLowerCase();
    const maskPolicy = String(strategy.maskPolicy || "").toLowerCase();
    if (["subject", "subject-with-label"].includes(maskPolicy) && !["card", "panel", "object", "person", "product", "object-with-label", ""].includes(regionKind)) return false;
    return true;
  }

  function shouldUseContextPreviewShape(strategy) {
    return Boolean(
      strategy &&
        (strategy.route ||
          (MAP_LIKE_VISUAL_MODES.includes(String(strategy.visualMode || "").toLowerCase()) && strategy.subjectWithLabel) ||
          strategy.flowStrip ||
          isInfographicCardLike(strategy))
    );
  }

  function isFlowStripHotspot(result, hotspot) {
    const directText = [hotspot && hotspot.label, hotspot && hotspot.shortText, hotspot && hotspot.detail]
      .filter(Boolean)
      .join("\n");
    const module = getStructuredTargets(result).find((item) => item && hotspot && item.id === hotspot.id);
    const structuredText = [module && module.title, module && module.imageText, module && module.regionPrompt, module && module.detail]
      .filter(Boolean)
      .join("\n");
    const text = `${directText}\n${structuredText}`.toLowerCase();
    return /(\u534f\u4f5c\u6d41\u7a0b|\u5b8c\u6574\u94fe\u8def|\u6574\u4f53\u6d41\u7a0b|\u6d41\u7a0b\u603b\u89c8|\u5de5\u4f5c\u6d41\u603b\u89c8|\u8d44\u6e90\u534f\u4f5c|\u7aef\u5230\u7aef|\u5168\u94fe\u8def|workflow overview|workflow strip|flow strip|end-to-end|pipeline overview|resource flow)/i.test(text);
  }

  // ---- Pure geometry helpers for organic previews ----
  // Kept here (not in app.js) so they are unit-testable in Node without a DOM.

  function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
  }

  function normalizeBounds(bounds) {
    const normalized = {
      x: Number(bounds && bounds.x),
      y: Number(bounds && bounds.y),
      width: Number(bounds && bounds.width),
      height: Number(bounds && bounds.height)
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
      normalized.x + normalized.width > 1 + 1e-6 ||
      normalized.y + normalized.height > 1 + 1e-6
    ) {
      return null;
    }
    return normalized;
  }

  function normalizePolygonPoints(polygon) {
    if (!Array.isArray(polygon)) return [];
    return polygon
      .map((point) => ({
        x: clamp01(Number(point && point.x)),
        y: clamp01(Number(point && point.y))
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  }

  function getPolygonBounds(polygon) {
    const points = normalizePolygonPoints(polygon);
    if (points.length < 3) return null;
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    points.forEach((point) => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
    if (maxX <= minX || maxY <= minY) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  function expandPolygonAroundCenter(polygon, scale) {
    const points = normalizePolygonPoints(polygon);
    const bounds = getPolygonBounds(points);
    if (!bounds || points.length < 3) return [];
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const factor = Math.max(1, Number(scale) || 1);
    return points.map((point) => ({
      x: clamp01(centerX + (point.x - centerX) * factor),
      y: clamp01(centerY + (point.y - centerY) * factor)
    }));
  }

  function padNormalizedBounds(bounds, ratio) {
    const w = Math.max(0.01, Number(bounds && bounds.width) || 0);
    const h = Math.max(0.01, Number(bounds && bounds.height) || 0);
    const x0 = Math.max(0, Number(bounds && bounds.x) || 0);
    const y0 = Math.max(0, Number(bounds && bounds.y) || 0);
    const padX = w * ratio;
    const padY = h * ratio;
    const x = Math.max(0, x0 - padX);
    const y = Math.max(0, y0 - padY);
    const right = Math.min(1, x0 + w + padX);
    const bottom = Math.min(1, y0 + h + padY);
    return {
      x,
      y,
      width: Math.max(0.01, right - x),
      height: Math.max(0.01, bottom - y)
    };
  }

  // Compute the crop window + grown polygon for an organic preview. Pure and
  // deterministic: no pixel analysis. The mask silhouette is grown a little
  // outward (scales with area) and padded so a soft halo fits.
  function getOrganicPreviewGeometry(maskBounds, dimensions, polygon) {
    const normalizedBounds = normalizeBounds(maskBounds) || { x: 0, y: 0, width: 1, height: 1 };
    const normalizedPolygon = normalizePolygonPoints(polygon);
    const polygonBounds = normalizedPolygon.length >= 3 ? getPolygonBounds(normalizedPolygon) : null;
    const baseBounds = polygonBounds || normalizedBounds;
    const baseArea = Math.max(0.0001, baseBounds.width * baseBounds.height);
    const growRatio = normalizedPolygon.length >= 3
      ? Math.max(0.02, Math.min(0.08, Math.sqrt(baseArea) * 0.16))
      : 0;
    const grownPolygon = normalizedPolygon.length >= 3
      ? expandPolygonAroundCenter(normalizedPolygon, 1 + growRatio)
      : [];
    const grownBounds = grownPolygon.length >= 3 ? getPolygonBounds(grownPolygon) : baseBounds;
    const padRatio = grownPolygon.length >= 3
      ? Math.max(0.05, Math.min(0.14, Math.sqrt(baseArea) * 0.12))
      : Math.max(0.09, Math.min(0.22, Math.sqrt(baseArea) * 0.26));
    const paddedBounds = padNormalizedBounds(grownBounds || normalizedBounds, padRatio);
    return {
      paddedBounds,
      polygon: grownPolygon,
      aspectRatio:
        (paddedBounds.width * Number((dimensions && dimensions.width) || 1600)) /
        Math.max(1, paddedBounds.height * Number((dimensions && dimensions.height) || 900))
    };
  }

  const api = {
    CONTEXT_CROP_REGION_KINDS,
    INDEPENDENT_SUBJECT_KINDS,
    SUBJECT_WITH_LABEL_KINDS,
    MAP_LIKE_VISUAL_MODES,
    inferPreviewStrategy,
    resolveHotspotRegionKind,
    resolveHotspotMaskPolicy,
    resolveVisualMode,
    isInfographicCardLike,
    shouldUseContextPreviewShape,
    clamp01,
    normalizeBounds,
    normalizePolygonPoints,
    getPolygonBounds,
    expandPolygonAroundCenter,
    padNormalizedBounds,
    getOrganicPreviewGeometry
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ChatImagePreviewStrategy = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
