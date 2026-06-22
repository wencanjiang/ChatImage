(function initCalibration(global) {
  "use strict";

  const core =
    global.ChatImageCore ||
    (typeof require !== "undefined" && typeof module !== "undefined" && module.exports
      ? require("./core")
      : null);

  function parseCalibration(value) {
    let parsed;
    try {
      parsed = JSON.parse(String(value || ""));
    } catch (error) {
      throw new Error(`热点校准 JSON 无法解析：${error.message}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error("热点校准数据必须是数组");
    }
    const seen = new Set();
    return parsed.map((item, index) => {
      const id = String(item && item.id ? item.id : item && item.moduleId ? item.moduleId : "").trim();
      if (!id) throw new Error(`第 ${index + 1} 个热点缺少 id`);
      if (seen.has(id)) throw new Error(`热点校准重复 id：${id}`);
      seen.add(id);
      const sourceBounds = item.bounds || item;
      const bounds = normalizeBounds(sourceBounds, id);
      return {
        id,
        label: item.label || "",
        bounds
      };
    });
  }

  function buildCalibratedResult(result, calibrationJson, options = {}) {
    const calibration = Array.isArray(calibrationJson) ? calibrationJson : parseCalibration(calibrationJson);
    const currentHotspots = Array.isArray(result && result.hotspots) ? result.hotspots : [];
    const calibrationById = new Map(calibration.map((item) => [item.id, item.bounds]));
    const missing = currentHotspots.filter((hotspot) => !calibrationById.has(hotspot.id));
    if (missing.length) {
      throw new Error(`热点校准缺少模块：${missing.map((hotspot) => hotspot.label || hotspot.id).join("、")}`);
    }

    const regions = result && result.layout && Array.isArray(result.layout.regions) ? result.layout.regions : [];
    const nextRegions = regions.map((region) => {
      if (!region.hotspotId || !calibrationById.has(region.hotspotId)) return { ...region };
      return {
        ...region,
        bounds: { ...calibrationById.get(region.hotspotId) },
        alignedBy: "manual"
      };
    });
    const validation = core.validateLayoutRegions(nextRegions);
    const nonOverlapErrors = validation.errors.filter((error) => !/\boverlaps\b/.test(String(error)));
    if (!validation.valid && nonOverlapErrors.length) {
      throw new Error(`热点校准未通过布局校验：${validation.errors.join("；")}`);
    }

    const effectiveValidation = validation.valid
      ? validation
      : { valid: true, errors: validation.errors, allowedOverlap: true };
    const appliedAt = options.appliedAt || new Date().toISOString();
    return {
      ...result,
      hotspots: currentHotspots.map((hotspot) => {
        const bounds = calibrationById.get(hotspot.id);
        return {
          ...hotspot,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          alignmentSource: "manual"
        };
      }),
      layout: {
        ...(result.layout || {}),
        clickBoundsSource: "manual-calibration",
        regions: nextRegions,
        validation: effectiveValidation,
        alignment: {
          provider: "manual",
          alignedAt: appliedAt,
          modules: calibration
        }
      },
      alignmentRaw: {
        provider: "manual-calibration",
        appliedAt,
        previous: result.alignmentRaw || null,
        modules: calibration,
        hitTest: { ok: true, source: "manual-calibration" }
      }
    };
  }

  function buildCalibrationComparison(result, options = {}) {
    const manualRaw = result && result.alignmentRaw;
    if (!manualRaw || manualRaw.provider !== "manual-calibration") {
      return {
        available: false,
        status: "none",
        reason: "current result is not manual-calibration",
        summary: "当前结果不是手动校准结果，暂无误差评估。"
      };
    }
    const manual = normalizeAlignmentList(manualRaw.modules || []);
    const previous = normalizeAlignmentList(extractPreviousAlignmentItems(manualRaw.previous));
    if (!manual.length || !previous.length) {
      return {
        available: false,
        status: "none",
        reason: !manual.length ? "missing manual modules" : "missing previous alignment modules",
        summary: "缺少手动校准或上一轮视觉对齐数据，无法计算误差。"
      };
    }

    const previousById = new Map(previous.map((item) => [item.id, item]));
    const threshold = Object.assign(
      {
        centerWarn: 0.03,
        centerFail: 0.06,
        iouWarn: 0.75,
        iouFail: 0.55
      },
      options.thresholds || options
    );
    const modules = manual.map((item) => {
      const base = previousById.get(item.id);
      if (!base) {
        return {
          id: item.id,
          label: item.label,
          status: "fail",
          reason: "上一轮视觉对齐缺少该模块"
        };
      }
      const centerDistance = distance(center(item.bounds), center(base.bounds));
      const iou = intersectionOverUnion(item.bounds, base.bounds);
      const sizeDelta = {
        width: Math.abs(item.bounds.width - base.bounds.width),
        height: Math.abs(item.bounds.height - base.bounds.height)
      };
      const maxSizeDelta = Math.max(sizeDelta.width, sizeDelta.height);
      const status =
        centerDistance > threshold.centerFail || iou < threshold.iouFail
          ? "fail"
          : centerDistance > threshold.centerWarn || iou < threshold.iouWarn
            ? "warn"
            : "ok";
      return {
        id: item.id,
        label: item.label || base.label || item.id,
        status,
        centerDistance: roundMetric(centerDistance),
        iou: roundMetric(iou),
        maxSizeDelta: roundMetric(maxSizeDelta),
        delta: {
          x: roundMetric(item.bounds.x - base.bounds.x),
          y: roundMetric(item.bounds.y - base.bounds.y),
          width: roundMetric(item.bounds.width - base.bounds.width),
          height: roundMetric(item.bounds.height - base.bounds.height)
        },
        sizeDelta: {
          width: roundMetric(sizeDelta.width),
          height: roundMetric(sizeDelta.height)
        },
        manual: item.bounds,
        previous: base.bounds
      };
    });
    const failed = modules.filter((item) => item.status === "fail").length;
    const warnings = modules.filter((item) => item.status === "warn").length;
    const maxCenterDistance = Math.max(...modules.map((item) => Number(item.centerDistance || 0)));
    const maxSizeDelta = Math.max(...modules.map((item) => Number(item.maxSizeDelta || 0)));
    const minIou = Math.min(...modules.map((item) => Number.isFinite(item.iou) ? item.iou : 0));
    return {
      available: true,
      status: failed ? "fail" : warnings ? "warn" : "ok",
      moduleCount: modules.length,
      summary: failed
        ? `${failed} 个模块与视觉对齐差异较大，需要检查视觉模型或手动坐标。`
        : warnings
          ? `${warnings} 个模块存在可见偏差，建议复核真实图片。`
          : "手动校准与上一轮视觉对齐基本一致。",
      maxCenterDistance: roundMetric(maxCenterDistance),
      maxSizeDelta: roundMetric(maxSizeDelta),
      minIou: roundMetric(minIou),
      modules
    };
  }

  function buildCalibrationDriftReport(result, options = {}) {
    return buildCalibrationComparison(result, options);
  }

  function normalizeBounds(sourceBounds, id) {
    const bounds = {
      x: Number(sourceBounds && sourceBounds.x),
      y: Number(sourceBounds && sourceBounds.y),
      width: Number(sourceBounds && sourceBounds.width),
      height: Number(sourceBounds && sourceBounds.height)
    };
    for (const [key, number] of Object.entries(bounds)) {
      if (!Number.isFinite(number)) throw new Error(`${id}.bounds.${key} 必须是数字`);
    }
    if (bounds.x < 0 || bounds.y < 0 || bounds.width <= 0 || bounds.height <= 0) {
      throw new Error(`${id}.bounds 必须为正向区域`);
    }
    if (bounds.x + bounds.width > 1 || bounds.y + bounds.height > 1) {
      throw new Error(`${id}.bounds 超出图片范围`);
    }
    return bounds;
  }

  function normalizeAlignmentList(list) {
    return (Array.isArray(list) ? list : []).map((item) => {
      const id = String(item.id || item.moduleId || item.hotspotId || "").trim();
      return {
        id,
        label: item.label || item.title || "",
        bounds: normalizeBounds(item.bounds || item, id || "unknown")
      };
    }).filter((item) => item.id);
  }

  function extractPreviousAlignmentItems(previousRaw) {
    if (!previousRaw) return [];
    if (Array.isArray(previousRaw)) return previousRaw;
    if (Array.isArray(previousRaw.alignments)) return previousRaw.alignments;
    if (Array.isArray(previousRaw.modules)) return previousRaw.modules;
    if (previousRaw.data && Array.isArray(previousRaw.data.alignments)) return previousRaw.data.alignments;
    if (previousRaw.data && Array.isArray(previousRaw.data.modules)) return previousRaw.data.modules;
    return [];
  }

  function center(bounds) {
    return {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2
    };
  }

  function distance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  function intersectionOverUnion(a, b) {
    const intersectionWidth = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const intersectionHeight = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const intersection = intersectionWidth * intersectionHeight;
    const union = a.width * a.height + b.width * b.height - intersection;
    return union > 0 ? intersection / union : 0;
  }

  function roundMetric(value) {
    return Number(Number(value).toFixed(4));
  }

  const api = {
    buildCalibratedResult,
    buildCalibrationComparison,
    buildCalibrationDriftReport,
    parseCalibration
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ChatImageCalibration = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
