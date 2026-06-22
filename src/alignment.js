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
        visualEvidence: module.visualEvidence || [],
        maskPolicy: module.maskPolicy || "",
        spatialHint: module.spatialHint || "",
        locatorQueries: module.locatorQueries || [],
        componentHints: module.componentHints || [],
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
      "Use each module's visualEvidence, maskPolicy, spatialHint, locatorQueries, and componentHints when choosing the bounds.",
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
        rawBounds: normalizeOptionalBounds(item.rawBounds, module.title),
        boundsExpansion: normalizeBoundsExpansion(item.boundsExpansion, module.title),
        confidence,
        source: item.source || item.provider || parsed.provider || "vision",
        matchedText: item.matchedText || "",
        mask: normalizeMask(item.mask, module.title)
      };
    });

    const missing = modules.filter((module) => !seen.has(module.id));
    // NOTE: we intentionally do NOT throw when some modules are missing a
    // grounding result. Throwing forces service.js to discard ALL alignments
    // and fall back to the planned grid for every module — so one un-located
    // region mis-positions all the correctly-located ones. The planned-layout
    // fallback for missing modules is synthesized in applyAlignmentsToLayout,
    // which has access to `layout` (this function does not). Callers can detect
    // partial alignment by comparing alignments.length to modules.length.
    void missing;
    return { alignments };
  }

  function getAlignableModules(spec) {
    const main = Array.isArray(spec && spec.modules) ? spec.modules : [];
    const auxiliary = Array.isArray(spec && spec.auxiliaryModules) ? spec.auxiliaryModules : [];
    return main.concat(auxiliary);
  }

  function applyAlignmentsToLayout(layout, alignments) {
    const split = splitAlignmentCandidates(layout, alignments);
    const usableAlignments = split.usable;
    const qualityRejected = split.rejected;
    const alignmentById = new Map(usableAlignments.map((alignment) => [alignment.moduleId, alignment]));
    const rejectedById = new Map(qualityRejected.map((alignment) => [alignment.moduleId, alignment]));
    const nextLayout = {
      ...layout,
      regions: layout.regions.map((region) => {
        if (!region.hotspotId) return { ...region };
        const alignment = alignmentById.get(region.hotspotId);
        if (alignment) {
          return {
            ...region,
            bounds: repairClickableBounds(alignment.bounds),
            alignedBy: alignment.source || "vision",
            rawAlignmentBounds: alignment.rawBounds || null,
            boundsExpansion: alignment.boundsExpansion || null,
            boundsExpandedForAlignment: Boolean(alignment.boundsExpansion),
            mask: alignment.mask || region.mask || null
          };
        }
        // A module whose LocateAnything box was quality-rejected. The previous
        // behavior silently fell back to the planned grid for ALL rejections.
        // That hides a real problem: a "far_from_planned_card" rejection means
        // the model DID find the region, just offset from the planned slot —
        // the grounded box is still closer to truth than a hard-coded grid, so
        // keep it and tag it low-confidence. But header/cross-panel strips are
        // cases where the model latched onto the wrong thing entirely (a title
        // bar, a border) — for those the planned slot is genuinely better, and
        // we preserve the prior behavior of falling back to planned (untagged).
        const rejected = rejectedById.get(region.hotspotId);
        if (rejected && rejected.reason === "candidate_far_from_planned_card") {
          return {
            ...region,
            bounds: rejected.repairedBounds || repairClickableBounds(rejected.bounds),
            alignedBy: "vision-low-confidence",
            rawAlignmentBounds: rejected.rawBounds || null,
            boundsExpansion: rejected.boundsExpansion || null,
            boundsExpandedForAlignment: Boolean(rejected.boundsExpansion),
            mask: region.mask || null
          };
        }
        if (rejected) {
          // header-strip / cross-panel-strip: grounded box is the wrong region,
          // fall back to the planned slot (prior behavior).
          return { ...region };
        }
        // No grounding result at all (module missing from the alignment
        // response). Keep the planned-layout bounds — this is intentional: a
        // single missing module no longer discards the whole alignment. Tag
        // it so the report can surface partial alignment.
        return { ...region, alignedBy: "planned-fallback" };
      })
    };
    const validation = validateAlignmentRegions(nextLayout.regions, nextLayout);
    if (validation.valid) {
      const sourceSummary = summarizeAlignmentSources(usableAlignments);
      // Synthesize alignment records for modules that had no grounding result,
      // so the report's acceptedModules/sourceCounts reflect partial alignment
      // rather than silently dropping the missing ones.
      const alignedIds = new Set([
        ...usableAlignments.map((a) => a.moduleId),
        ...qualityRejected.map((a) => a.moduleId)
      ]);
      const missingAlignments = layout.regions
        .filter((region) => region.hotspotId && !alignedIds.has(region.hotspotId))
        .map((region) => ({
          moduleId: region.hotspotId,
          label: region.label || region.hotspotId,
          bounds: region.bounds ? { ...region.bounds } : null,
          confidence: 0,
          // Use "planned" (not "planned-fallback") as the source so the existing
          // summarizeAlignmentSources mixed-detection (sourceCounts.planned)
          // still flags this as vision-mixed rather than silently "vision".
          // The per-region alignedBy "planned-fallback" tag carries the detail.
          source: "planned",
          matchedText: "",
          mask: null
        }));
      return {
        ...nextLayout,
        validation,
        alignment: {
          provider: usableAlignments.length ? sourceSummary.provider : "vision-fallback",
          alignedAt: new Date().toISOString(),
          modules: [...alignments, ...missingAlignments],
          acceptedModules: usableAlignments.map((alignment) => alignment.moduleId),
          rejectedModules: qualityRejected,
          missingModules: missingAlignments.map((alignment) => alignment.moduleId),
          sourceCounts: summarizeAlignmentSources([...usableAlignments, ...missingAlignments]).sourceCounts
        }
      };
    }

    return buildRepairedAlignmentLayout(layout, usableAlignments, validation.errors, qualityRejected, alignments);
  }

  function splitAlignmentCandidates(layout, alignments) {
    const plannedByHotspotId = new Map(
      (layout && Array.isArray(layout.regions) ? layout.regions : [])
        .filter((region) => region && region.hotspotId)
        .map((region) => [region.hotspotId, region])
    );
    const usable = [];
    const rejected = [];
    for (const alignment of alignments || []) {
      const plannedRegion = plannedByHotspotId.get(alignment && alignment.moduleId);
      const rejection = getAlignmentCandidateRejection(plannedRegion, alignment, layout);
      if (rejection) {
        rejected.push({
          moduleId: alignment.moduleId,
          label: alignment.label || alignment.moduleId,
          bounds: alignment.bounds,
          rawBounds: alignment.rawBounds || null,
          boundsExpansion: alignment.boundsExpansion || null,
          repairedBounds: repairClickableBounds(alignment.bounds),
          source: alignment.source || "vision",
          reason: rejection.reason,
          metrics: rejection.metrics
        });
      } else {
        usable.push(alignment);
      }
    }
    return { usable, rejected };
  }

  function getAlignmentCandidateRejection(plannedRegion, alignment, layout) {
    if (!plannedRegion || !alignment || !alignment.bounds) return null;
    if (allowsSemanticOverlap(layout)) return null;
    if (String(alignment.source || "").toLowerCase() === "planned") return null;
    if (!["module", "auxiliary"].includes(String(plannedRegion.role || ""))) return null;

    const planned = plannedRegion.bounds || {};
    const raw = alignment.bounds || {};
    const repaired = repairClickableBounds(raw, { compact: true });
    const overlap = core.overlapArea(repaired, planned);
    const minArea = Math.min(boundsArea(repaired), boundsArea(planned));
    const overlapToMin = minArea > 0 ? overlap / minArea : 0;
    const centerDistance = boundsCenterDistance(repaired, planned);
    const rawAspect = safeAspect(raw);
    const plannedAspect = safeAspect(planned);
    const centerYDelta = Math.abs(boundsCenter(raw).y - boundsCenter(planned).y);
    const centerXDelta = Math.abs(boundsCenter(raw).x - boundsCenter(planned).x);
    const metrics = {
      overlapToMin: roundMetric(overlapToMin),
      centerDistance: roundMetric(centerDistance),
      rawAspect: roundMetric(rawAspect),
      plannedAspect: roundMetric(plannedAspect),
      centerXDelta: roundMetric(centerXDelta),
      centerYDelta: roundMetric(centerYDelta)
    };

    const farFromPlanned = overlapToMin < 0.12 && centerDistance > 0.16;
    const tooSmallRaw = Number(raw.width || 0) < 0.1 || Number(raw.height || 0) < 0.1;
    const likelyHeaderStrip =
      rawAspect > Math.max(2.75, plannedAspect * 1.55) &&
      centerYDelta > Math.max(0.07, Number(planned.height || 0) * 0.45);
    const likelyCrossPanelStrip =
      Number(raw.width || 0) > Number(planned.width || 0) * 1.45 &&
      overlapToMin < 0.35 &&
      (centerYDelta > 0.06 || centerXDelta > Number(planned.width || 0) * 0.45);

    if (farFromPlanned && tooSmallRaw) return { reason: "candidate_far_from_planned_card", metrics };
    if (likelyHeaderStrip) return { reason: "candidate_looks_like_header_strip", metrics };
    if (likelyCrossPanelStrip) return { reason: "candidate_looks_like_cross_panel_strip", metrics };
    return null;
  }

  function boundsCenter(bounds) {
    return {
      x: Number(bounds && bounds.x || 0) + Number(bounds && bounds.width || 0) / 2,
      y: Number(bounds && bounds.y || 0) + Number(bounds && bounds.height || 0) / 2
    };
  }

  function safeAspect(bounds) {
    const width = Math.max(0, Number(bounds && bounds.width) || 0);
    const height = Math.max(0.000001, Number(bounds && bounds.height) || 0);
    return width / height;
  }

  function roundMetric(value) {
    return Number(Number(value || 0).toFixed(4));
  }

  function buildRepairedAlignmentLayout(layout, alignments, candidateErrors, qualityRejected = [], originalAlignments = alignments) {
    let regions = layout.regions.map((region) => ({ ...region, bounds: { ...(region.bounds || {}) } }));
    const accepted = [];
    const rejected = qualityRejected.slice();
    const alignmentIds = alignments.map((alignment) => alignment.moduleId);

    for (let alignmentIndex = 0; alignmentIndex < alignments.length; alignmentIndex += 1) {
      const alignment = alignments[alignmentIndex];
      const pendingIds = new Set(alignmentIds.slice(alignmentIndex + 1));
      const index = regions.findIndex((region) => region.hotspotId === alignment.moduleId);
      if (index === -1) continue;
      const baselineValidation = validateAlignmentCandidateRegions(regions, pendingIds, layout);
      let candidateRegions = regions.map((region, regionIndex) => {
        if (regionIndex !== index) return region;
        return {
          ...region,
          bounds: repairClickableBounds(alignment.bounds),
          alignedBy: alignment.source || "vision",
          rawAlignmentBounds: alignment.rawBounds || null,
          boundsExpansion: alignment.boundsExpansion || null,
          boundsExpandedForAlignment: Boolean(alignment.boundsExpansion),
          mask: alignment.mask || region.mask || null
        };
      });
      let validation = validateAlignmentCandidateRegions(candidateRegions, pendingIds, layout);
      if (!validation.valid) {
        const compactCandidateRegions = regions.map((region, regionIndex) => {
          if (regionIndex !== index) return region;
          return {
            ...region,
            bounds: repairClickableBounds(alignment.bounds, { compact: true }),
            alignedBy: alignment.source || "vision",
            rawAlignmentBounds: alignment.rawBounds || null,
            boundsExpansion: alignment.boundsExpansion || null,
            boundsExpandedForAlignment: Boolean(alignment.boundsExpansion),
            mask: alignment.mask || region.mask || null
          };
        });
        const compactValidation = validateAlignmentCandidateRegions(compactCandidateRegions, pendingIds, layout);
        if (compactValidation.valid) {
          candidateRegions = compactCandidateRegions;
          validation = compactValidation;
        }
      }
      if (validation.valid) {
        regions = candidateRegions;
        accepted.push(alignment.moduleId);
      } else if (hasSameValidationErrors(validation, baselineValidation)) {
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

    const validation = validateAlignmentRegions(regions, layout);
    if (!validation.valid) {
      const sourceSummary = summarizeAlignmentSources(alignments);
      const candidateLayout = {
        ...layout,
        regions,
        validation,
        alignment: {
          provider: accepted.length ? "vision-repaired" : "vision-fallback",
          alignedAt: new Date().toISOString(),
          modules: originalAlignments,
          acceptedModules: accepted,
          rejectedModules: rejected,
          sourceCounts: sourceSummary.sourceCounts,
          originalValidationErrors: candidateErrors,
          finalValidationErrors: validation.errors
        }
      };
      const strictLayout = enforceStrictLayoutRegions(candidateLayout, layout, originalAlignments, candidateErrors);
      if (strictLayout) return strictLayout;

      const plannedValidation = core.validateLayoutRegions(layout.regions);
      if (plannedValidation.valid) {
        return {
          ...layout,
          regions: layout.regions.map((region) => ({ ...region, bounds: { ...(region.bounds || {}) } })),
          validation: plannedValidation,
          alignment: {
            provider: "vision-fallback",
            alignedAt: new Date().toISOString(),
            modules: originalAlignments,
            acceptedModules: [],
            rejectedModules: rejected.concat(alignments.map((alignment) => ({
              moduleId: alignment.moduleId,
              label: alignment.label || alignment.moduleId,
              bounds: alignment.bounds,
              repairedBounds: repairClickableBounds(alignment.bounds),
              errors: validation.errors
            }))),
            originalValidationErrors: candidateErrors,
            finalValidationErrors: validation.errors
          }
        };
      }
      const error = new Error(`vision alignment fallback invalid: ${validation.errors.join("; ")}`);
      error.alignment = {
        provider: "vision-fallback-error",
        modules: originalAlignments,
        acceptedModules: accepted,
        rejectedModules: rejected,
        originalValidationErrors: candidateErrors,
        finalValidationErrors: validation.errors,
        plannedValidationErrors: plannedValidation.errors
      };
      throw error;
    }

    const repairedLayout = {
      ...layout,
      regions,
      validation,
      alignment: {
        provider: accepted.length ? "vision-repaired" : "vision-fallback",
        alignedAt: new Date().toISOString(),
        modules: originalAlignments,
        acceptedModules: accepted,
        rejectedModules: rejected,
        originalValidationErrors: candidateErrors
      }
    };
    return repairedLayout;
  }

  function enforceStrictLayoutRegions(candidateLayout, plannedLayout, alignments, originalValidationErrors) {
    const strictValidation = core.validateLayoutRegions(candidateLayout.regions);
    if (strictValidation.valid) return null;
    if (allowsSemanticOverlap(candidateLayout || plannedLayout)) {
      const looseValidation = validateAlignmentRegions(candidateLayout.regions, candidateLayout || plannedLayout);
      if (looseValidation.valid) return null;
    }
    let regions = candidateLayout.regions.map((region) => ({ ...region, bounds: { ...(region.bounds || {}) } }));
    const plannedByHotspotId = new Map(
      (plannedLayout.regions || [])
        .filter((region) => region && region.hotspotId)
        .map((region) => [region.hotspotId, region])
    );
    const reverted = [];
    const maxPasses = Math.max(1, regions.length * 2);
    for (let pass = 0; pass < maxPasses; pass += 1) {
      const conflict = findFirstStrictConflict(regions);
      if (!conflict) break;
      const region = chooseConflictRegionToRevert(conflict, plannedByHotspotId);
      if (!region || !region.hotspotId || reverted.includes(region.hotspotId)) break;
      const planned = plannedByHotspotId.get(region.hotspotId);
      if (!planned) break;
      regions = regions.map((item) => {
        if (item.hotspotId !== region.hotspotId) return item;
        return {
          ...item,
          bounds: { ...(planned.bounds || item.bounds || {}) },
          alignedBy: "planned-strict-repair",
          mask: null
        };
      });
      reverted.push(region.hotspotId);
    }
    const repairedValidation = core.validateLayoutRegions(regions);
    if (!repairedValidation.valid) return null;
    return {
      ...candidateLayout,
      regions,
      validation: repairedValidation,
      alignment: {
        ...(candidateLayout.alignment || {}),
        provider: "vision-strict-repaired",
        alignedAt: new Date().toISOString(),
        modules: alignments,
        sourceCounts: summarizeFinalRegionSources(regions),
        acceptedModules: ((candidateLayout.alignment && candidateLayout.alignment.acceptedModules) || []).filter(
          (moduleId) => !reverted.includes(moduleId)
        ),
        rejectedModules: [
          ...((candidateLayout.alignment && candidateLayout.alignment.rejectedModules) || []),
          ...reverted.map((moduleId) => ({ moduleId, reason: "strict layout repair reverted to planned bounds" }))
        ],
        strictRepairedModules: reverted,
        originalValidationErrors,
        strictValidationErrors: strictValidation.errors
      }
    };
  }

  function summarizeFinalRegionSources(regions) {
    const sourceCounts = {};
    for (const region of regions || []) {
      if (!region || !region.hotspotId || !["module", "auxiliary"].includes(String(region.role || ""))) continue;
      let source = String(region.alignedBy || "").trim();
      if (!source) continue;
      if (/^planned/.test(source)) source = "planned";
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    }
    return sourceCounts;
  }

  function hasSameValidationErrors(current, baseline) {
    if (!current || !baseline || baseline.valid) return false;
    const currentErrors = Array.isArray(current.errors) ? current.errors : [];
    const baselineErrors = Array.isArray(baseline.errors) ? baseline.errors : [];
    if (currentErrors.length !== baselineErrors.length) return false;
    const baselineSet = new Set(baselineErrors.map((error) => String(error)));
    return currentErrors.every((error) => baselineSet.has(String(error)));
  }

  function findFirstStrictConflict(regions) {
    const moduleRegions = (regions || []).filter((region) => region.role === "module");
    for (let i = 0; i < moduleRegions.length; i += 1) {
      for (let j = i + 1; j < moduleRegions.length; j += 1) {
        const area = core.overlapArea(moduleRegions[i].bounds, moduleRegions[j].bounds);
        const allowedArea = isLooseOverlapRegion(moduleRegions[i]) || isLooseOverlapRegion(moduleRegions[j]) ? 0.028 : 0.002;
        if (area > allowedArea) return { first: moduleRegions[i], second: moduleRegions[j], area };
      }
    }
    return null;
  }

  function isLooseOverlapRegion(region) {
    return region && (region.shape === "freeform" || region.shape === "mask");
  }

  function allowsSemanticOverlap(layout) {
    const visualMode = String((layout && layout.visualMode) || "").toLowerCase();
    const variant = String((layout && (layout.layoutVariant || layout.variant)) || "").toLowerCase();
    const family = String((layout && layout.family) || "").toLowerCase();
    return /^(map|scene|poster)$/.test(visualMode) || /^(map|scene|poster|organic-map|illustrated-scene)$/.test(variant) || /^(map|scene|poster)$/.test(family);
  }

  function chooseConflictRegionToRevert(conflict, plannedByHotspotId) {
    const first = conflict.first;
    const second = conflict.second;
    const firstPlanned = plannedByHotspotId.get(first.hotspotId);
    const secondPlanned = plannedByHotspotId.get(second.hotspotId);
    const firstDrift = boundsCenterDistance(first.bounds, firstPlanned && firstPlanned.bounds);
    const secondDrift = boundsCenterDistance(second.bounds, secondPlanned && secondPlanned.bounds);
    return secondDrift >= firstDrift ? second : first;
  }

  function boundsCenterDistance(a, b) {
    if (!a || !b) return 0;
    const ax = Number(a.x || 0) + Number(a.width || 0) / 2;
    const ay = Number(a.y || 0) + Number(a.height || 0) / 2;
    const bx = Number(b.x || 0) + Number(b.width || 0) / 2;
    const by = Number(b.y || 0) + Number(b.height || 0) / 2;
    return Math.hypot(ax - bx, ay - by);
  }

  function validateAlignmentCandidateRegions(regions, pendingIds, layout) {
    if (!pendingIds || !pendingIds.size) return validateAlignmentRegions(regions, layout);
    const filteredRegions = regions.filter((region) => {
      if (region.role !== "module") return true;
      if (!region.hotspotId) return true;
      return !pendingIds.has(region.hotspotId);
    });
    return validateAlignmentRegions(filteredRegions, layout);
  }

  function validateAlignmentRegions(regions, layout) {
    const base = core.validateLayoutRegions(regions);
    if (base.valid) return base;
    const nonOverlapErrors = base.errors.filter((error) => !/\boverlaps\b/.test(String(error)));
    if (allowsSemanticOverlap(layout)) {
      return {
        valid: nonOverlapErrors.length === 0,
        errors: nonOverlapErrors,
        strictErrors: base.errors
      };
    }
    const hardOverlapErrors = buildHardOverlapErrors(regions);
    const errors = nonOverlapErrors.concat(hardOverlapErrors);
    return {
      valid: errors.length === 0,
      errors,
      strictErrors: base.errors
    };
  }

  function buildHardOverlapErrors(regions) {
    const maxOverlapRatio = 0.55;
    const moduleRegions = (regions || []).filter((region) => region.role === "module");
    const errors = [];
    for (let i = 0; i < moduleRegions.length; i += 1) {
      for (let j = i + 1; j < moduleRegions.length; j += 1) {
        const ratio = overlapRatio(moduleRegions[i].bounds, moduleRegions[j].bounds);
        const allowedRatio = isLooseOverlapRegion(moduleRegions[i]) || isLooseOverlapRegion(moduleRegions[j]) ? 0.8 : maxOverlapRatio;
        if (ratio > allowedRatio) {
          errors.push(`${moduleRegions[i].id} heavily overlaps ${moduleRegions[j].id}`);
        }
      }
    }
    return errors;
  }

  function overlapRatio(a, b) {
    const overlap = core.overlapArea(a || {}, b || {});
    const minArea = Math.min(boundsArea(a), boundsArea(b));
    return minArea > 0 ? overlap / minArea : 0;
  }

  function boundsArea(bounds) {
    return Math.max(0, Number(bounds && bounds.width) || 0) * Math.max(0, Number(bounds && bounds.height) || 0);
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
    const padX = !compact && sourceWidth > 0 && sourceWidth < minWidth ? Math.min(0.04, minWidth - sourceWidth + 0.02) : 0;
    const padY = !compact && sourceHeight > 0 && sourceHeight < minHeight ? Math.min(0.04, minHeight - sourceHeight + 0.02) : 0;
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

  function normalizeOptionalBounds(bounds, label) {
    if (!bounds) return null;
    return normalizeBounds(bounds, `${label}.rawBounds`);
  }

  function normalizeBoundsExpansion(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const from = normalizeOptionalBounds(value.from, `${label}.boundsExpansion.from`);
    const to = normalizeOptionalBounds(value.to, `${label}.boundsExpansion.to`);
    return {
      strategy: String(value.strategy || ""),
      padX: Number.isFinite(Number(value.padX)) ? Number(value.padX) : null,
      padY: Number.isFinite(Number(value.padY)) ? Number(value.padY) : null,
      from,
      to
    };
  }

  function normalizeMask(mask, label) {
    if (!mask || typeof mask !== "object" || Array.isArray(mask)) return null;
    try {
      const result = {
        provider: String(mask.provider || "sam3"),
        score: Number(mask.score ?? 0),
        bounds: normalizeBounds(mask.bounds, `${label} mask`),
        inputBounds: mask.inputBounds ? normalizeBounds(mask.inputBounds, `${label} mask input`) : null,
        maskPixels: Math.max(0, Math.round(Number(mask.maskPixels || 0))),
        image: normalizeMaskImage(mask.image),
        cutoutImage: normalizeMaskImage(mask.cutoutImage),
        polygon: normalizePolygon(mask.polygon),
        strategy: String(mask.strategy || "")
      };
      if (!Number.isFinite(result.score) || result.score < 0 || result.score > 1) {
        result.score = 0;
      }
      return result;
    } catch {
      return null;
    }
  }

  function normalizeMaskImage(value) {
    const text = String(value || "");
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/i.test(text)) return "";
    return text.length <= 512 * 1024 ? text : "";
  }

  function normalizePolygon(value) {
    if (!Array.isArray(value)) return [];
    const points = value
      .map((point) => ({
        x: Number(point && point.x),
        y: Number(point && point.y)
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.y >= 0 && point.x <= 1 && point.y <= 1);
    return points.length >= 3 ? points.slice(0, 96) : [];
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
