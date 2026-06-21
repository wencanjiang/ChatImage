(function initQuality(global) {
  "use strict";

  const core =
    global.ChatImageCore ||
    (typeof require !== "undefined" && typeof module !== "undefined" && module.exports
      ? require("./core")
      : null);

  const EPSILON = 0.000001;

  function buildQualityReport(result) {
    const checks = [
      checkImageDimensions(result),
      checkAlignmentProvider(result),
      checkLayoutValidation(result),
      checkHotspotBindings(result),
      checkTextBudgets(result),
      checkImagePrompt(result)
    ];
    const failed = checks.filter((check) => check.status === "fail").length;
    const warnings = checks.filter((check) => check.status === "warn").length;
    const score = Math.round(
      (checks.reduce((total, check) => total + (check.status === "ok" ? 1 : check.status === "warn" ? 0.5 : 0), 0) /
        checks.length) *
        100
    );
    return {
      status: failed ? "fail" : warnings ? "warn" : "ok",
      score,
      canRegenerate: Boolean(failed || warnings),
      summary: formatQualitySummary(failed, warnings, checks.length),
      checks
    };
  }

  function formatQualitySummary(failed, warnings, total) {
    if (failed) return `${failed} 项失败，${warnings} 项注意，需要重新生成或修正布局数据。`;
    if (warnings) return `${warnings} 项注意，建议重新生成或检查调试信息。`;
    return `${total} 项检查全部通过。`;
  }

  function checkImageDimensions(result) {
    const width = Number(result && result.imageWidth);
    const height = Number(result && result.imageHeight);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return fail("image_dimensions", "图片尺寸", "imageWidth/imageHeight 缺失或非法。");
    }
    const ratio = width / height;
    const expectedRatio = parseAspectRatio(result && result.layout && result.layout.aspectRatio);
    if (expectedRatio && Math.abs(ratio - expectedRatio) > 0.03) {
      return warn(
        "image_dimensions",
        "图片尺寸",
        `图片比例 ${ratio.toFixed(2)} 与 LayoutSpec ${result.layout.aspectRatio} 不一致。`
      );
    }
    return ok("image_dimensions", "图片尺寸", `${width}x${height}`);
  }

  function checkAlignmentProvider(result) {
    const raw = (result && result.alignmentRaw) || {};
    const provider = String(raw.provider || "");
    const layoutProvider = String(raw.layoutProvider || "");
    if (!provider || provider === "mock-alignment") {
      return ok("alignment_provider", "视觉对齐", "当前结果未使用真实视觉定位，使用规划热点。");
    }
    if (provider === "alignment-fallback") {
      return fail(
        "alignment_provider",
        "视觉对齐",
        `视觉定位失败，当前热点已回退到规划布局。${raw.error || ""}`.trim()
      );
    }
    if (layoutProvider === "planned-fallback" || raw.effectiveProvider === "planned") {
      return fail(
        "alignment_provider",
        "视觉对齐",
        "LocateAnything/local-ocr 未产生可采用的模块边界，当前热点使用规划布局。"
      );
    }
    if (layoutProvider === "vision-mixed") {
      return warn(
        "alignment_provider",
        "视觉对齐",
        "部分热点使用视觉定位，部分热点使用规划布局回退。"
      );
    }
    if (layoutProvider === "vision-fallback") {
      return warn(
        "alignment_provider",
        "视觉对齐",
        "视觉模型返回的候选框未通过重叠/边界校验，当前热点使用规划布局回退。"
      );
    }
    const fallbackCount = Array.isArray(raw.fallbackModules) ? raw.fallbackModules.length : 0;
    const rejectedCount = Array.isArray(raw.rejectedModules) ? raw.rejectedModules.length : 0;
    if (fallbackCount || rejectedCount) {
      return warn(
        "alignment_provider",
        "视觉对齐",
        `已使用 ${provider}，但有 ${fallbackCount + rejectedCount} 个模块发生回退或拒绝。`
      );
    }
    return ok("alignment_provider", "视觉对齐", `已使用 ${provider} 完成热点定位。`);
  }

  function checkLayoutValidation(result) {
    const moduleRegions = getModuleRegions(result);
    if (!moduleRegions.length) {
      return fail("layout_validation", "布局校验", "LayoutSpec 中没有可点击模块 region。");
    }
    const validation = core.validateLayoutRegions(moduleRegions);
    if (!validation.valid && (isSemanticVisualWork(result) || isAllowedOverlapLayout(result))) {
      const nonOverlapErrors = validation.errors.filter((error) => !/\boverlaps\b/.test(String(error)));
      if (!nonOverlapErrors.length) {
        return ok("layout_validation", "布局校验", `${moduleRegions.length} semantic regions passed bounds and click-area checks; overlap is expected for mask-based visual works.`);
      }
      return fail("layout_validation", "布局校验", nonOverlapErrors.join("; "));
    }
    if (!validation.valid) {
      return fail("layout_validation", "布局校验", validation.errors.join("；"));
    }
    return ok("layout_validation", "布局校验", `${moduleRegions.length} 个模块 region 通过安全边距、点击面积和重叠检查。`);
  }

  function isAllowedOverlapLayout(result) {
    const validation = result && result.layout && result.layout.validation;
    if (validation && validation.valid === true && validation.allowedOverlap === true) return true;
    const clickBoundsSource = String(result && result.layout && result.layout.clickBoundsSource ? result.layout.clickBoundsSource : "").toLowerCase();
    const hitTestOk = Boolean(result && result.alignmentRaw && result.alignmentRaw.hitTest && result.alignmentRaw.hitTest.ok);
    return (clickBoundsSource === "hotspot-derived" && hitTestOk) || clickBoundsSource === "manual-calibration";
  }

  function checkHotspotBindings(result) {
    const hotspots = Array.isArray(result && result.hotspots) ? result.hotspots : [];
    const moduleRegions = getModuleRegions(result);
    if (!hotspots.length) return fail("hotspot_bindings", "热点绑定", "结果中没有 hotspot。");
    const hotspotById = new Map(hotspots.map((hotspot) => [hotspot.id, hotspot]));
    const errors = [];
    for (const region of moduleRegions) {
      const hotspot = hotspotById.get(region.hotspotId);
      if (!hotspot) {
        errors.push(`${region.id} 引用了不存在的 hotspot ${region.hotspotId}`);
        continue;
      }
      if (!sameBounds(hotspot, region.bounds || {})) {
        errors.push(`${region.hotspotId} 的 hotspot bounds 与 region bounds 不一致`);
      }
    }
    const regionIds = new Set(moduleRegions.map((region) => region.hotspotId));
    for (const hotspot of hotspots) {
      if (!regionIds.has(hotspot.id)) errors.push(`${hotspot.id} 没有对应 module region`);
    }
    if (errors.length) return fail("hotspot_bindings", "热点绑定", errors.join("；"));
    return ok("hotspot_bindings", "热点绑定", "hotspots 与 LayoutSpec module regions 一一绑定且坐标一致。");
  }

  function checkTextBudgets(result) {
    const hotspots = Array.isArray(result && result.hotspots) ? result.hotspots : [];
    const budgeted = hotspots.filter((hotspot) => hotspot.textBudget);
    if (!budgeted.length) {
      return warn("text_budgets", "文字预算", "当前结果未携带 textBudget，可能是旧历史记录或外部导入结果。");
    }
    const errors = [];
    for (const hotspot of budgeted) {
      const budget = hotspot.textBudget || {};
      if (String(hotspot.label || "").length > Number(budget.titleMaxChars || 0)) {
        errors.push(`${hotspot.id} 标题超过预算`);
      }
      if (String(hotspot.shortText || "").length > Number(budget.imageTextMaxChars || 0)) {
        errors.push(`${hotspot.id} 短文本超过预算`);
      }
    }
    if (errors.length) return fail("text_budgets", "文字预算", errors.join("；"));
    return ok("text_budgets", "文字预算", `${budgeted.length} 个热点的标题和短文本均在预算内。`);
  }

  function checkImagePrompt(result) {
    const prompt = String((result && result.imagePrompt) || "");
    if (result && result.alignmentRaw && !/mock-alignment/.test(JSON.stringify(result.alignmentRaw))) {
      const missing = [];
      if (isSemanticVisualWork(result)) {
        if (!/Target semantic regions|Every semantic region|visible separated area|semantic region/i.test(prompt)) missing.push("semantic regions");
        if (!/visualEvidence|maskPolicy|locatorQueries/i.test(prompt)) missing.push("visual target contract");
        if (!/easy to segment|segment later|SAM-style|mask/i.test(prompt)) missing.push("segmentation constraints");
        if (missing.length) {
          return warn("image_prompt", "生图提示词", `Semantic visual prompt is missing: ${missing.join(", ")}.`);
        }
        return ok("image_prompt", "生图提示词", "Prompt includes semantic regions, target contract, and segmentation constraints.");
      }
      if (!/独立可辨识|independent/i.test(prompt)) missing.push("独立卡片");
      if (!/中文文字必须清晰|legible|清晰可读/i.test(prompt)) missing.push("中文清晰");
      if (!/视觉边界|卡片边缘|card/i.test(prompt)) missing.push("视觉边界");
      if (missing.length) {
        return warn("image_prompt", "生图提示词", `两遍法生图提示词缺少关键约束：${missing.join("、")}。`);
      }
      return ok("image_prompt", "生图提示词", "两遍法提示词强调独立卡片、中文清晰和视觉边界。");
    }
    const missing = [];
    if (!/normalized bounds/i.test(prompt)) missing.push("normalized bounds");
    if (!/textBudget/.test(prompt)) missing.push("textBudget");
    if (!/transparent hotspots|hotspots can align|热点/i.test(prompt)) missing.push("热点对齐约束");
    if (missing.length) {
      return warn("image_prompt", "生图提示词", `缺少关键约束：${missing.join("、")}。`);
    }
    return ok("image_prompt", "生图提示词", "包含布局坐标、文字预算和热点对齐约束。");
  }

  function getModuleRegions(result) {
    const regions = result && result.layout && Array.isArray(result.layout.regions) ? result.layout.regions : [];
    return regions.filter((region) => region.hotspotId);
  }

  function isSemanticVisualWork(result) {
    const visualMode = String(
      (result && result.structuredSpec && result.structuredSpec.visualMode) ||
        (result && result.layout && result.layout.visualMode) ||
        ""
    ).toLowerCase();
    const layoutVariant = String(
      result && result.layout && (result.layout.layoutVariant || result.layout.variant)
        ? result.layout.layoutVariant || result.layout.variant
        : ""
    ).toLowerCase();
    const family = String(result && result.layout && result.layout.family ? result.layout.family : "").toLowerCase();
    return /^(map|scene|poster)$/.test(visualMode) || /^(map|scene|poster|organic-map|illustrated-scene)$/.test(layoutVariant) || /^(map|scene|poster)$/.test(family);
  }

  function sameBounds(hotspot, bounds) {
    return (
      Math.abs(Number(hotspot.x) - Number(bounds.x)) <= EPSILON &&
      Math.abs(Number(hotspot.y) - Number(bounds.y)) <= EPSILON &&
      Math.abs(Number(hotspot.width) - Number(bounds.width)) <= EPSILON &&
      Math.abs(Number(hotspot.height) - Number(bounds.height)) <= EPSILON
    );
  }

  function parseAspectRatio(value) {
    const match = String(value || "").match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    return width / height;
  }

  function ok(id, label, detail) {
    return { id, label, status: "ok", detail };
  }

  function warn(id, label, detail) {
    return { id, label, status: "warn", detail };
  }

  function fail(id, label, detail) {
    return { id, label, status: "fail", detail };
  }

  const api = {
    buildQualityReport,
    formatQualitySummary,
    parseAspectRatio
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ChatImageQuality = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
