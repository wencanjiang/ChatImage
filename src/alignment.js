(function initAlignment(global) {
  "use strict";

  const core =
    global.ChatImageCore ||
    (typeof require !== "undefined" && typeof module !== "undefined" && module.exports
      ? require("./core")
      : null);

  const DEFAULT_MIN_CONFIDENCE = 0.5;

  function buildAlignmentPrompt({ imageUrl, imageWidth, imageHeight, spec, layout }) {
    assertImageDimensions(imageWidth, imageHeight);
    const regionByHotspotId = new Map(
      (layout.regions || [])
        .filter((region) => region.hotspotId)
        .map((region) => [region.hotspotId, region])
    );
    const targetModules = getAlignableModules(spec);
    const modules = targetModules.map((module, index) => {
      const region = regionByHotspotId.get(module.id);
      return {
        moduleId: module.id,
        label: module.title,
        order: index + 1,
        text: module.imageText,
        regionKind: module.regionKind || "card",
        regionPrompt: module.regionPrompt || module.title,
        plannedBounds: region ? region.bounds : null
      };
    });
    const visualMode = String((spec && spec.visualMode) || "infographic").toLowerCase();
    const modeInstruction =
      visualMode === "infographic"
        ? "This image is an infographic. Locate the complete card or panel boundary for each module. Do not return only the title, icon, number, or a small text cluster."
        : "This image is a semantic visual work, not a card-only infographic. Locate the complete visible region/object/route/landmark described by regionPrompt, even if it has no number. Prefer the full semantic footprint over local OCR text.";
    return [
      modeInstruction,
      "你是 ChatImage 的视觉对齐助手。请观察图片，找出每个信息图模块卡片的真实边界框。",
      "只返回 JSON，不要解释，不要使用 Markdown。",
      "bounds 使用 0~1 归一化坐标，相对于整张图片左上角。",
      "confidence 使用 0~1，表示你对该卡片边界框的把握。",
      "必须框住完整可点击信息模块/卡片，不要只框图标、编号、标题、VS 圆点、关键词小列或局部文本。",
      "如果图像把一个语义模块拆成左右两块或含有对比中轴，请优先返回最接近 plannedBounds 的完整可点击区域。",
      "每个 bounds 的 width 和 height 都应不小于 0.12，模块之间不要重叠，并保持在安全边距内。",
      "如果某个模块没有独立可辨识卡片，也必须返回最接近的卡片区域并降低 confidence。",
      `图片地址：${imageUrl}`,
      `图片尺寸：${imageWidth}x${imageHeight}`,
      `布局族：${layout.family}`,
      "需要定位的模块：",
      JSON.stringify(modules, null, 2),
      "返回格式：",
      JSON.stringify(
        {
          modules: modules.map((module) => ({
            moduleId: module.moduleId,
            label: module.label,
            bounds: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 },
            confidence: 0.9
          }))
        },
        null,
        2
      )
    ].join("\n\n");
  }

  function parseAlignmentResponse(content, modules, options = {}) {
    const parsed = parseJsonFromText(content);
    const list = Array.isArray(parsed.modules) ? parsed.modules : parsed.alignments;
    if (!Array.isArray(list)) {
      throw new Error("视觉对齐失败：返回 JSON 缺少 modules 数组");
    }

    const minConfidence = Number(options.minConfidence ?? DEFAULT_MIN_CONFIDENCE);
    const modulesById = new Map(modules.map((module) => [module.id, module]));
    const modulesByTitle = new Map(modules.map((module) => [module.title, module]));
    const seen = new Set();
    const alignments = list.map((item, index) => {
      const module = resolveModule(item, modulesById, modulesByTitle);
      if (!module) {
        throw new Error(`视觉对齐失败：第 ${index + 1} 个模块无法匹配结构化模块`);
      }
      if (seen.has(module.id)) {
        throw new Error(`视觉对齐失败：重复返回模块 ${module.id}`);
      }
      seen.add(module.id);
      const confidence = Number(item.confidence ?? item.score);
      if (!Number.isFinite(confidence) || confidence < minConfidence) {
        throw new Error(`视觉对齐失败：${module.title} 置信度不足`);
      }
      const bounds = normalizeBounds(item.bounds, module.title);
      return {
        moduleId: module.id,
        label: item.label || item.title || module.title,
        bounds,
        confidence,
        source: item.source || item.provider || parsed.provider || "vision",
        matchedText: item.matchedText || ""
      };
    });

    const missing = modules.filter((module) => !seen.has(module.id));
    if (missing.length) {
      throw new Error(`视觉对齐失败：缺少模块 ${missing.map((module) => module.title).join("、")}`);
    }
    return { alignments };
  }

  function getAlignableModules(spec) {
    const main = Array.isArray(spec && spec.modules) ? spec.modules : [];
    const auxiliary = Array.isArray(spec && spec.auxiliaryModules) ? spec.auxiliaryModules : [];
    return main.concat(auxiliary);
  }

  function applyAlignmentsToLayout(layout, alignments) {
    const alignmentById = new Map(alignments.map((alignment) => [alignment.moduleId, alignment]));
    const nextLayout = {
      ...layout,
      regions: layout.regions.map((region) => {
        if (!region.hotspotId || !alignmentById.has(region.hotspotId)) return { ...region };
        return {
          ...region,
          bounds: repairClickableBounds(alignmentById.get(region.hotspotId).bounds),
          alignedBy: alignmentById.get(region.hotspotId).source || "vision"
        };
      })
    };
    const validation = core.validateLayoutRegions(nextLayout.regions);
    if (validation.valid) {
      const sourceSummary = summarizeAlignmentSources(alignments);
      return {
        ...nextLayout,
        validation,
        alignment: {
          provider: sourceSummary.provider,
          alignedAt: new Date().toISOString(),
          modules: alignments,
          sourceCounts: sourceSummary.sourceCounts
        }
      };
    }

    return buildRepairedAlignmentLayout(layout, alignments, validation.errors);
  }

  function buildRepairedAlignmentLayout(layout, alignments, candidateErrors) {
    let regions = layout.regions.map((region) => ({ ...region, bounds: { ...(region.bounds || {}) } }));
    const accepted = [];
    const rejected = [];
    const alignmentIds = alignments.map((alignment) => alignment.moduleId);

    for (let alignmentIndex = 0; alignmentIndex < alignments.length; alignmentIndex += 1) {
      const alignment = alignments[alignmentIndex];
      const pendingIds = new Set(alignmentIds.slice(alignmentIndex + 1));
      const index = regions.findIndex((region) => region.hotspotId === alignment.moduleId);
      if (index === -1) continue;
      let candidateRegions = regions.map((region, regionIndex) => {
        if (regionIndex !== index) return region;
        return {
          ...region,
          bounds: repairClickableBounds(alignment.bounds),
          alignedBy: alignment.source || "vision"
        };
      });
      let validation = validateAlignmentCandidateRegions(candidateRegions, pendingIds);
      if (!validation.valid) {
        const compactCandidateRegions = regions.map((region, regionIndex) => {
          if (regionIndex !== index) return region;
          return {
            ...region,
            bounds: repairClickableBounds(alignment.bounds, { compact: true }),
            alignedBy: alignment.source || "vision"
          };
        });
        const compactValidation = validateAlignmentCandidateRegions(compactCandidateRegions, pendingIds);
        if (compactValidation.valid) {
          candidateRegions = compactCandidateRegions;
          validation = compactValidation;
        }
      }
      if (validation.valid) {
        regions = candidateRegions;
        accepted.push(alignment.moduleId);
      } else {
        rejected.push({
          moduleId: alignment.moduleId,
          label: alignment.label || alignment.moduleId,
          bounds: alignment.bounds,
          repairedBounds: repairClickableBounds(alignment.bounds),
          errors: validation.errors
        });
      }
    }

    const validation = core.validateLayoutRegions(regions);
    if (!validation.valid) {
      const plannedValidation = core.validateLayoutRegions(layout.regions);
      if (plannedValidation.valid) {
        return {
          ...layout,
          regions: layout.regions.map((region) => ({ ...region, bounds: { ...(region.bounds || {}) } })),
          validation: plannedValidation,
          alignment: {
            provider: "vision-fallback",
            alignedAt: new Date().toISOString(),
            modules: alignments,
            acceptedModules: [],
            rejectedModules: alignments.map((alignment) => ({
              moduleId: alignment.moduleId,
              label: alignment.label || alignment.moduleId,
              bounds: alignment.bounds,
              repairedBounds: repairClickableBounds(alignment.bounds),
              errors: validation.errors
            })),
            originalValidationErrors: candidateErrors,
            finalValidationErrors: validation.errors
          }
        };
      }
      const error = new Error(`vision alignment fallback invalid: ${validation.errors.join("; ")}`);
      error.alignment = {
        provider: "vision-fallback-error",
        modules: alignments,
        acceptedModules: accepted,
        rejectedModules: rejected,
        originalValidationErrors: candidateErrors,
        finalValidationErrors: validation.errors,
        plannedValidationErrors: plannedValidation.errors
      };
      throw error;
    }

    return {
      ...layout,
      regions,
      validation,
      alignment: {
        provider: accepted.length ? "vision-repaired" : "vision-fallback",
        alignedAt: new Date().toISOString(),
        modules: alignments,
        acceptedModules: accepted,
        rejectedModules: rejected,
        originalValidationErrors: candidateErrors
      }
    };
  }

  function validateAlignmentCandidateRegions(regions, pendingIds) {
    if (!pendingIds || !pendingIds.size) return core.validateLayoutRegions(regions);
    const filteredRegions = regions.filter((region) => {
      if (region.role !== "module") return true;
      if (!region.hotspotId) return true;
      return !pendingIds.has(region.hotspotId);
    });
    return core.validateLayoutRegions(filteredRegions);
  }

  function summarizeAlignmentSources(alignments) {
    const sourceCounts = {};
    for (const alignment of alignments || []) {
      const source = String(alignment && alignment.source ? alignment.source : "vision");
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    }
    const sources = Object.keys(sourceCounts);
    if (sources.length === 1 && sources[0] === "planned") {
      return { provider: "planned-fallback", sourceCounts };
    }
    if (sourceCounts.planned) {
      return { provider: "vision-mixed", sourceCounts };
    }
    return { provider: "vision", sourceCounts };
  }

  function repairClickableBounds(bounds, options = {}) {
    const safeMargin = 0.035;
    const minWidth = 0.12;
    const minHeight = 0.12;
    const compact = Boolean(options.compact);
    const source = bounds || {};
    const sourceWidth = Number(source.width || 0);
    const sourceHeight = Number(source.height || 0);
    if (compact && sourceWidth >= minWidth && sourceHeight >= minHeight) {
      return clipBoundsToSafeArea(source, safeMargin, minWidth, minHeight);
    }
    const padX = !compact && sourceWidth > 0 && sourceWidth < 0.22 ? 0.06 : 0;
    const padY = !compact && sourceHeight > 0 && sourceHeight < 0.18 ? 0.05 : 0;
    const targetMinWidth = compact ? minWidth + 0.001 : minWidth;
    const targetMinHeight = compact ? minHeight + 0.001 : minHeight;
    let width = Math.max(targetMinWidth, sourceWidth + padX);
    let height = Math.max(targetMinHeight, sourceHeight + padY);
    width = Math.min(width, 1 - safeMargin * 2);
    height = Math.min(height, 1 - safeMargin * 2);
    const centerX = Number(source.x || 0) + Number(source.width || 0) / 2;
    const centerY = Number(source.y || 0) + Number(source.height || 0) / 2;
    const x = clamp(centerX - width / 2, safeMargin, 1 - safeMargin - width);
    const y = clamp(centerY - height / 2, safeMargin, 1 - safeMargin - height);
    return {
      x: roundBoundsNumber(x),
      y: roundBoundsNumber(y),
      width: roundBoundsNumber(width),
      height: roundBoundsNumber(height)
    };
  }

  function clipBoundsToSafeArea(bounds, safeMargin, minWidth, minHeight) {
    const left = Math.max(safeMargin, Number(bounds.x || 0));
    const top = Math.max(safeMargin, Number(bounds.y || 0));
    const right = Math.min(1 - safeMargin, Number(bounds.x || 0) + Number(bounds.width || 0));
    const bottom = Math.min(1 - safeMargin, Number(bounds.y || 0) + Number(bounds.height || 0));
    if (right - left >= minWidth && bottom - top >= minHeight) {
      return {
        x: roundBoundsNumber(left),
        y: roundBoundsNumber(top),
        width: roundBoundsNumber(right - left),
        height: roundBoundsNumber(bottom - top)
      };
    }
    return repairClickableBounds(bounds, { compact: false });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function roundBoundsNumber(value) {
    return Number(Number(value).toFixed(6));
  }

  function parseJsonFromText(content) {
    const text = String(content || "").trim();
    if (!text) throw new Error("视觉对齐失败：返回内容为空");
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : text;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("视觉对齐失败：无法从返回内容解析 JSON");
    }
    return JSON.parse(candidate.slice(start, end + 1));
  }

  function assertImageDimensions(width, height) {
    const normalizedWidth = Number(width);
    const normalizedHeight = Number(height);
    if (
      !Number.isInteger(normalizedWidth) ||
      !Number.isInteger(normalizedHeight) ||
      normalizedWidth < 16 ||
      normalizedHeight < 16
    ) {
      throw new Error("视觉对齐失败：缺少真实图片像素尺寸");
    }
    return { width: normalizedWidth, height: normalizedHeight };
  }

  function resolveModule(item, modulesById, modulesByTitle) {
    const id = item.moduleId || item.id || item.hotspotId;
    if (id && modulesById.has(id)) return modulesById.get(id);
    const label = item.label || item.title || item.name;
    if (label && modulesByTitle.has(label)) return modulesByTitle.get(label);
    return null;
  }

  function normalizeBounds(bounds, label) {
    if (!bounds || typeof bounds !== "object" || Array.isArray(bounds)) {
      throw new Error(`视觉对齐失败：${label} 缺少 bounds`);
    }
    const normalized = {
      x: Number(bounds.x),
      y: Number(bounds.y),
      width: Number(bounds.width ?? bounds.w),
      height: Number(bounds.height ?? bounds.h)
    };
    for (const [key, value] of Object.entries(normalized)) {
      if (!Number.isFinite(value)) {
        throw new Error(`视觉对齐失败：${label} bounds.${key} 非法`);
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
      throw new Error(`视觉对齐失败：${label} bounds 越界`);
    }
    return normalized;
  }

  const api = {
    applyAlignmentsToLayout,
    assertImageDimensions,
    buildAlignmentPrompt,
    getAlignableModules,
    parseAlignmentResponse,
    parseJsonFromText,
    summarizeAlignmentSources
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ChatImageAlignment = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
