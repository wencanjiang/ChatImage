(function initCore(global) {
  "use strict";

  function inferRelationType(question) {
    const text = String(question || "").toLowerCase();
    if (/对比|比较|区别|差异|优缺点|compare|versus|\bvs\b/.test(text)) return "compare";
    if (/流程|步骤|工作流|链路|路线|过程|如何|怎么|agent|workflow|process|flow|pipeline/.test(text)) return "flow";
    if (/时间|阶段|演进|里程碑|timeline|roadmap/.test(text)) return "timeline";
    if (/优先级|象限|矩阵|matrix|quadrant/.test(text)) return "matrix";
    return "hierarchy";
  }

  function chooseFamily(spec) {
    const relation = spec && spec.relationType;
    const moduleCount = spec && Array.isArray(spec.modules) ? spec.modules.length : 0;
    if (relation === "flow") return "flow";
    if (relation === "compare") return "compare";
    if (relation === "timeline") return "timeline";
    if (relation === "matrix") return "matrix";
    if (moduleCount === 5) return "hub";
    return "grid";
  }

  function validateLayoutRegions(regions) {
    const safeMargin = 0.035;
    const minWidth = 0.12;
    const minHeight = 0.12;
    const maxOverlapArea = 0.002;
    const maxFreeformOverlapArea = 0.028;
    const epsilon = 0.000001;
    const errors = [];
    const moduleRegions = (regions || []).filter((region) => region.role === "module");
    const seen = new Set();

    for (const region of moduleRegions) {
      const bounds = region.bounds || {};
      if (!region.hotspotId) errors.push(`${region.id} missing hotspotId`);
      if (seen.has(region.hotspotId)) errors.push(`${region.hotspotId} duplicated`);
      seen.add(region.hotspotId);
      if (bounds.x < safeMargin - epsilon || bounds.y < safeMargin - epsilon) {
        errors.push(`${region.id} violates safe margin`);
      }
      if (bounds.x + bounds.width > 1 - safeMargin + epsilon || bounds.y + bounds.height > 1 - safeMargin + epsilon) {
        errors.push(`${region.id} exceeds safe bounds`);
      }
      if (bounds.width < minWidth || bounds.height < minHeight) {
        errors.push(`${region.id} below minimum click area`);
      }
    }

    for (let i = 0; i < moduleRegions.length; i += 1) {
      for (let j = i + 1; j < moduleRegions.length; j += 1) {
        const area = overlapArea(moduleRegions[i].bounds, moduleRegions[j].bounds);
        const allowedOverlapArea =
          moduleRegions[i].shape === "freeform" || moduleRegions[j].shape === "freeform" || moduleRegions[i].shape === "mask" || moduleRegions[j].shape === "mask"
            ? maxFreeformOverlapArea
            : maxOverlapArea;
        if (area > allowedOverlapArea) {
          errors.push(`${moduleRegions[i].id} overlaps ${moduleRegions[j].id}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  function overlapArea(a, b) {
    const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    return x * y;
  }

  function iconGlyph(hint) {
    const map = {
      target: "01",
      nodes: "02",
      layout: "03",
      image: "04",
      thread: "05",
      idea: "ID",
      risk: "RK",
      step: "ST",
      flow: "FL",
      compare: "CP",
      timeline: "TL",
      matrix: "MX",
      summary: "SM",
      data: "DT",
      source: "SC",
      tool: "TL",
      user: "US",
      action: "AC",
      result: "RS"
    };
    return map[String(hint || "").toLowerCase()] || "CI";
  }

  const api = {
    chooseFamily,
    iconGlyph,
    inferRelationType,
    overlapArea,
    validateLayoutRegions
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ChatImageCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
