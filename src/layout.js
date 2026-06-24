(function initLayout(global) {
  "use strict";

  const core =
    global.ChatImageCore ||
    (typeof require !== "undefined" && typeof module !== "undefined" && module.exports
      ? require("./core")
      : null);

  function createLayout(spec, { uid }) {
    const family = core.chooseFamily(spec);
    const visualMode = getVisualMode(spec);
    const layoutVariant = getLayoutVariant(spec, family);
    const canvas = {
      width: 1600,
      height: 900,
      safeArea: { x: 0.055, y: 0.055, width: 0.89, height: 0.89 }
    };
    const fixedRegions = [
      {
        id: "title",
        role: "title",
        bounds: { x: 0.06, y: 0.06, width: 0.58, height: 0.08 },
        shape: "rect",
        zIndex: 1
      },
      {
        id: "summary",
        role: "summary",
        bounds: { x: 0.06, y: 0.15, width: 0.62, height: 0.07 },
        shape: "rect",
        zIndex: 1
      }
    ];

    const hasAuxiliaryModules = Array.isArray(spec.auxiliaryModules) && spec.auxiliaryModules.length > 0;
    const candidateRegions = createModuleRegions(family, spec.modules, layoutVariant, { hasAuxiliaryModules, visualMode: getVisualMode(spec) });
    const validation = core.validateLayoutRegions(candidateRegions);
    const moduleRegions = validation.valid
      ? candidateRegions
      : createGridRegions(spec.modules);
    const auxiliaryRegions = createAuxiliaryRegions(spec.auxiliaryModules, family, layoutVariant);
    const finalValidation = core.validateLayoutRegions(moduleRegions);
    if (!finalValidation.valid) {
      throw new Error(`布局校验失败：${finalValidation.errors.join("；")}`);
    }
    return {
      id: uid("layout"),
      family,
      visualMode,
      layoutVariant,
      aspectRatio: "16:9",
      canvas,
      regions: fixedRegions.concat(moduleRegions, auxiliaryRegions),
      validation: finalValidation
    };
  }

  function getInteractiveModules(spec) {
    const main = Array.isArray(spec && spec.modules) ? spec.modules : [];
    const auxiliary = Array.isArray(spec && spec.auxiliaryModules) ? spec.auxiliaryModules : [];
    return main.concat(auxiliary);
  }

  function createModuleRegions(family, modules, layoutVariant, options = {}) {
    if (options.visualMode === "map" || layoutVariant === "map") return createMapRegions(modules);
    if (layoutVariant === "compare-matrix") return createCompareMatrixRegions(modules, options);
    if (layoutVariant === "compare-split") return createCompareSplitRegions(modules);
    if (layoutVariant === "asymmetric-focus-stack") return createAsymmetricFocusStackRegions(modules);
    if (family === "flow") return createFlowRegions(modules);
    if (family === "compare") return createCompareRegions(modules);
    if (family === "timeline") return createTimelineRegions(modules);
    if (family === "matrix") return createMatrixRegions(modules);
    if (family === "hub") return createHubRegions(modules);
    return createGridRegions(modules);
  }

  function getLayoutVariant(spec, family) {
    const visualComposition = (spec && spec.visualComposition) || {};
    const variant = String(visualComposition.layoutVariant || "").trim().toLowerCase();
    const allowed = ["compare-matrix", "compare-split", "asymmetric-focus-stack", "swimlane-flow", "timeline", "grid", "map", "scene", "poster"];
    if (allowed.includes(variant)) return variant;
    if (getVisualMode(spec) === "map") return "map";
    if (getVisualMode(spec) === "scene") return "scene";
    if (getVisualMode(spec) === "poster") return "poster";
    if (family === "compare" || family === "matrix") return "compare-matrix";
    if (family === "flow") return "swimlane-flow";
    if (family === "timeline") return "timeline";
    if (family === "hub") return "asymmetric-focus-stack";
    return "grid";
  }

  function getVisualMode(spec) {
    const source = String((spec && spec.visualMode) || "").trim().toLowerCase();
    if (["infographic", "map", "poster", "scene"].includes(source)) return source;
    return "infographic";
  }

  function describeLayoutContract(layout) {
    const variant = String((layout && (layout.layoutVariant || layout.variant)) || "").toLowerCase();
    if (variant === "asymmetric-focus-stack") {
      return [
        "asymmetric-focus-stack order is fixed:",
        "module_1 = left tall card;",
        "module_2 = center tall focus card;",
        "module_3 = top-right card;",
        "module_4 = middle-right card;",
        "module_5 = bottom-right card.",
        "Do not swap module zones even if the visual style changes."
      ].join(" ");
    }
    if (variant === "compare-matrix") {
      return "compare-matrix must keep each module inside its own matrix cell; do not merge cells.";
    }
    if (variant === "swimlane-flow") {
      return "swimlane-flow must preserve the left-to-right or top-to-bottom step order from module_1 onward.";
    }
    if (["map", "scene", "poster"].includes(variant)) {
      return "semantic targets may be organic, but each target must stay close to its planned area and remain recognizable as natural image content.";
    }
    return "Keep every module inside its listed target footprint and preserve module order.";
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createGridRegions(modules) {
    const count = modules.length;
    const columns = count <= 4 ? 2 : count <= 9 ? 3 : count <= 16 ? 4 : 5;
    const rows = Math.ceil(count / columns);
    const gapX = 0.035;
    const startX = 0.06;
    const startY = 0.28;
    const totalW = 0.88;
    const minCellHeight = 0.12;
    let gapY = 0.055;
    let totalH = 0.58;
    // 行数较多时固定高度会把单元压到最小点击区域以下，向下扩展到安全区并压缩纵向间距
    if ((totalH - gapY * (rows - 1)) / rows < minCellHeight) {
      gapY = 0.03;
      totalH = 0.95 - startY;
    }
    const cellW = (totalW - gapX * (columns - 1)) / columns;
    const cellH = (totalH - gapY * (rows - 1)) / rows;
    return modules.map((module, index) => ({
      id: `region_${module.id}`,
      hotspotId: module.id,
      role: "module",
      bounds: {
        x: startX + (index % columns) * (cellW + gapX),
        y: startY + Math.floor(index / columns) * (cellH + gapY),
        width: cellW,
        height: cellH
      },
      shape: "rect",
      zIndex: 2
    }));
  }

  function createMapRegions(modules) {
    const slots = createSemanticMapSlots(modules);
    return modules.map((module, index) => {
      const position = slots.get(module.id) || fallbackMapPosition(index);
      return {
        id: `region_${module.id}`,
        hotspotId: module.id,
        role: "module",
        bounds: {
          x: position.x,
          y: position.y,
          width: position.width,
          height: position.height
        },
        shape: position.shape || "freeform",
        zIndex: index >= 4 ? 3 : 2
      };
    });
  }

  function createSemanticMapSlots(modules) {
    const slots = new Map();
    const used = new Set();
    const slotCatalog = {
      centerLandmark: { x: 0.36, y: 0.31, width: 0.28, height: 0.28, shape: "freeform" },
      westRoute: { x: 0.12, y: 0.28, width: 0.24, height: 0.42, shape: "freeform" },
      eastRoute: { x: 0.64, y: 0.28, width: 0.24, height: 0.42, shape: "freeform" },
      northRoute: { x: 0.24, y: 0.18, width: 0.52, height: 0.13, shape: "freeform" },
      northCauseway: { x: 0.30, y: 0.16, width: 0.38, height: 0.12, shape: "freeform" },
      westCauseway: { x: 0.16, y: 0.34, width: 0.13, height: 0.36, shape: "freeform" },
      lakeIsland: { x: 0.45, y: 0.47, width: 0.17, height: 0.17, shape: "freeform" },
      southTower: { x: 0.64, y: 0.73, width: 0.18, height: 0.13, shape: "freeform" },
      northwestIsland: { x: 0.16, y: 0.19, width: 0.12, height: 0.13, shape: "freeform" },
      northeastRidge: { x: 0.70, y: 0.18, width: 0.16, height: 0.14, shape: "freeform" },
      northwestLotus: { x: 0.04, y: 0.41, width: 0.18, height: 0.25, shape: "freeform" },
      southeastGarden: { x: 0.62, y: 0.54, width: 0.18, height: 0.14, shape: "freeform" },
      water: { x: 0.34, y: 0.30, width: 0.32, height: 0.32, shape: "freeform" },
      building: { x: 0.68, y: 0.12, width: 0.18, height: 0.14, shape: "freeform" },
      transportLegend: { x: 0.12, y: 0.70, width: 0.30, height: 0.16, shape: "freeform" },
      lodgingLegend: { x: 0.58, y: 0.70, width: 0.30, height: 0.16, shape: "freeform" },
      legend: { x: 0.58, y: 0.70, width: 0.30, height: 0.16, shape: "freeform" },
      mountain: { x: 0.20, y: 0.64, width: 0.46, height: 0.18, shape: "freeform" },
      axis: { x: 0.28, y: 0.22, width: 0.48, height: 0.48, shape: "freeform" }
    };

    const ordered = modules.map((module, index) => ({ module, index }));
    for (const entry of ordered) {
      const slotName = chooseSemanticMapSlot(entry.module, used, entry.index);
      const slot = slotCatalog[slotName] || fallbackMapPosition(entry.index);
      slots.set(entry.module.id, slot);
      used.add(slotName);
    }
    return slots;
  }

  function chooseSemanticMapSlot(module, used, index) {
    const titleText = [module && module.title, module && module.imageText]
      .map((value) => String(value || ""))
      .join("\n")
      .toLowerCase();
    const primaryText = [module && module.title, module && module.imageText, module && module.regionPrompt, module && module.spatialHint]
      .map((value) => String(value || ""))
      .join("\n")
      .toLowerCase();
    const text = [module && module.title, module && module.imageText, module && module.regionPrompt, module && module.detail]
      .map((value) => String(value || ""))
      .join("\n")
      .toLowerCase();
    const kind = String((module && module.regionKind) || "").toLowerCase();
    if (/\u4f4f\u5bbf|\u9152\u5e97|\u5bbe\u9986|\u5ba2\u6808|\u623f\u5c4b|\u5e8a\u4f4d|\u8865\u7ed9|hotel|lodging|accommodation/.test(primaryText + "\n" + text)) {
      return unusedSlot(used, ["lodgingLegend", "legend", "transportLegend"], index);
    }
    if (/\u767d\u5824|\u65ad\u6865/.test(primaryText)) return unusedSlot(used, ["northCauseway", "northRoute"], index);
    if (/\u82cf\u5824|\u6625\u6653/.test(primaryText)) return unusedSlot(used, ["westCauseway", "westRoute"], index);
    if (/\u4e09\u6f6d|\u6e56\u5fc3|\u77f3\u5854/.test(primaryText)) return unusedSlot(used, ["lakeIsland", "centerLandmark"], index);
    if (/\u96f7\u5cf0|\u5854\u5f71/.test(primaryText)) return unusedSlot(used, ["southTower", "building"], index);
    if (/\u5b64\u5c71/.test(primaryText)) return unusedSlot(used, ["northwestIsland", "northRoute"], index);
    if (/\u5b9d\u77f3\u5c71|\u4fdd\u4ff6\u5854/.test(primaryText)) return unusedSlot(used, ["northeastRidge", "mountain"], index);
    if (/\u66f2\u9662\u98ce\u8377|\u98ce\u8377|\u8377\u5858|\u8377\u82b1/.test(primaryText)) return unusedSlot(used, ["northwestLotus", "mountain"], index);
    if (/\u67f3\u6d6a\u95fb\u83ba|\u95fb\u83ba|\u67f3\u6797/.test(primaryText)) return unusedSlot(used, ["southeastGarden", "eastRoute"], index);
    if (kind === "water") return unusedSlot(used, ["water", "centerLandmark"], index);
    if (kind === "axis") return unusedSlot(used, ["axis", "northRoute"], index);
    if (kind === "building") return unusedSlot(used, ["building", "centerLandmark"], index);
    if (kind === "mountain") return unusedSlot(used, ["mountain", "centerLandmark"], index);
    if (kind === "legend") {
      if (/\u4ea4\u901a|\u7d22\u9053|\u7f06\u8f66|\u8f66\u7ad9|\u5165\u53e3|\u5df4\u58eb|\u9ad8\u94c1|\u63a5\u9a73/.test(titleText)) {
        return unusedSlot(used, ["transportLegend", "legend", "lodgingLegend"], index);
      }
      if (/\u4f4f\u5bbf|\u9152\u5e97|\u5bbe\u9986|\u5ba2\u6808|\u623f\u5c4b|\u5e8a\u4f4d|\u8865\u7ed9/.test(titleText)) {
        return unusedSlot(used, ["lodgingLegend", "legend", "transportLegend"], index);
      }
      if (/\u4f4f\u5bbf|\u9152\u5e97|\u5bbe\u9986|\u5ba2\u6808|\u623f\u5c4b|\u5e8a\u4f4d|\u8865\u7ed9/.test(text)) {
        return unusedSlot(used, ["lodgingLegend", "legend", "transportLegend"], index);
      }
      if (/\u4ea4\u901a|\u7d22\u9053|\u7f06\u8f66|\u8f66\u7ad9|\u5165\u53e3|\u5df4\u58eb|\u9ad8\u94c1|\u63a5\u9a73/.test(text)) {
        return unusedSlot(used, ["transportLegend", "legend", "lodgingLegend"], index);
      }
      if (/住宿|酒店|宾馆|客栈|房屋|床位|补给/.test(text)) {
        return unusedSlot(used, ["lodgingLegend", "legend", "transportLegend"], index);
      }
      if (/交通|索道|缆车|车站|入口|巴士|高铁|接驳/.test(text)) {
        return unusedSlot(used, ["transportLegend", "legend", "lodgingLegend"], index);
      }
      if (/住宿|酒店|宾馆|客栈|hotel|lodging|accommodation/.test(text)) {
        return unusedSlot(used, ["lodgingLegend", "legend", "transportLegend"], index);
      }
      if (/交通|索道|车站|入口|巴士|高铁|cableway|ropeway|station|transport|bus|rail/.test(text)) {
        return unusedSlot(used, ["transportLegend", "legend", "lodgingLegend"], index);
      }
      return unusedSlot(used, ["legend", "transportLegend", "lodgingLegend"], index);
    }
    if (kind === "route") {
      if (/\u4e1c|\u9633\u5149|east|sunshine/.test(primaryText)) return unusedSlot(used, ["eastRoute", "northRoute", "westRoute"], index);
      if (/\u897f|west/.test(primaryText)) return unusedSlot(used, ["westRoute", "northRoute", "eastRoute"], index);
      if (/西|west/.test(text)) return unusedSlot(used, ["westRoute", "northRoute", "eastRoute"], index);
      if (/东|阳光|east|sunshine/.test(text)) return unusedSlot(used, ["eastRoute", "northRoute", "westRoute"], index);
      return unusedSlot(used, ["northRoute", "westRoute", "eastRoute"], index);
    }
    if (kind === "landmark") {
      const preferred = used.has("water")
        ? ["building", "mountain", "westRoute", "eastRoute", "centerLandmark"]
        : ["centerLandmark", "building", "mountain"];
      return unusedSlot(used, preferred, index);
    }
    return unusedSlot(used, ["centerLandmark", "northRoute", "westRoute", "eastRoute", "transportLegend", "lodgingLegend"], index);
  }

  function unusedSlot(used, names, index) {
    for (const name of names) {
      if (!used.has(name)) return name;
    }
    return `fallback_${index}`;
  }

  function fallbackMapPosition(index) {
    const positions = [
      { x: 0.39, y: 0.36, width: 0.22, height: 0.20, shape: "freeform" },
      { x: 0.30, y: 0.16, width: 0.38, height: 0.12, shape: "freeform" },
      { x: 0.16, y: 0.34, width: 0.13, height: 0.36, shape: "freeform" },
      { x: 0.45, y: 0.47, width: 0.17, height: 0.17, shape: "freeform" },
      { x: 0.64, y: 0.73, width: 0.18, height: 0.13, shape: "freeform" },
      { x: 0.16, y: 0.19, width: 0.12, height: 0.13, shape: "freeform" },
      { x: 0.70, y: 0.18, width: 0.16, height: 0.14, shape: "freeform" },
      { x: 0.04, y: 0.41, width: 0.18, height: 0.25, shape: "freeform" },
      { x: 0.62, y: 0.54, width: 0.18, height: 0.14, shape: "freeform" },
      { x: 0.08, y: 0.74, width: 0.18, height: 0.14, shape: "freeform" },
      { x: 0.36, y: 0.74, width: 0.18, height: 0.14, shape: "freeform" },
      { x: 0.78, y: 0.38, width: 0.14, height: 0.18, shape: "freeform" }
    ];
    return positions[index] || positions[positions.length - 1];
  }

  function createFlowRegions(modules) {
    if (modules.length === 5) {
      return createFiveStepFlowRegions(modules);
    }
    const gap = 0.025;
    const width = (0.88 - gap * (modules.length - 1)) / modules.length;
    return modules.map((module, index) => ({
      id: `region_${module.id}`,
      hotspotId: module.id,
      role: "module",
      bounds: { x: 0.06 + index * (width + gap), y: 0.39, width, height: 0.30 },
      shape: "rect",
      zIndex: 2
    }));
  }

  function createFiveStepFlowRegions(modules) {
    const positions = [
      { x: 0.06, y: 0.39, width: 0.19, height: 0.27 },
      { x: 0.275, y: 0.39, width: 0.19, height: 0.27 },
      { x: 0.49, y: 0.39, width: 0.19, height: 0.27 },
      { x: 0.705, y: 0.39, width: 0.235, height: 0.27 },
      { x: 0.14, y: 0.73, width: 0.72, height: 0.14 }
    ];
    return createPositionedRegions(modules, positions);
  }

  function createCompareRegions(modules) {
    const positions = [
      { x: 0.06, y: 0.26, width: 0.40, height: 0.21 },
      { x: 0.54, y: 0.26, width: 0.40, height: 0.21 },
      { x: 0.06, y: 0.52, width: 0.40, height: 0.21 },
      { x: 0.54, y: 0.52, width: 0.40, height: 0.21 },
      { x: 0.18, y: 0.77, width: 0.64, height: 0.17 }
    ];
    return modules.map((module, index) => ({
      id: `region_${module.id}`,
      hotspotId: module.id,
      role: "module",
      bounds: positions[index] || positions[positions.length - 1],
      shape: "rect",
      zIndex: index === 4 ? 3 : 2
    }));
  }

  function createCompareMatrixRegions(modules, options = {}) {
    const positions = options.hasAuxiliaryModules
      ? [
          { x: 0.25, y: 0.26, width: 0.31, height: 0.19 },
          { x: 0.58, y: 0.26, width: 0.36, height: 0.19 },
          { x: 0.06, y: 0.50, width: 0.44, height: 0.18 },
          { x: 0.52, y: 0.50, width: 0.42, height: 0.18 },
          { x: 0.06, y: 0.74, width: 0.88, height: 0.18 }
        ]
      : [
          { x: 0.06, y: 0.26, width: 0.40, height: 0.19 },
          { x: 0.54, y: 0.26, width: 0.40, height: 0.19 },
          { x: 0.06, y: 0.50, width: 0.40, height: 0.18 },
          { x: 0.54, y: 0.50, width: 0.40, height: 0.18 },
          { x: 0.18, y: 0.74, width: 0.64, height: 0.18 }
        ];
    return createPositionedRegions(modules, positions);
  }

  function createCompareSplitRegions(modules) {
    const positions = [
      { x: 0.06, y: 0.26, width: 0.40, height: 0.43 },
      { x: 0.54, y: 0.26, width: 0.40, height: 0.43 },
      { x: 0.06, y: 0.75, width: 0.27, height: 0.16 },
      { x: 0.365, y: 0.75, width: 0.27, height: 0.16 },
      { x: 0.68, y: 0.75, width: 0.26, height: 0.16 }
    ];
    return createPositionedRegions(modules, positions);
  }

  function createAsymmetricFocusStackRegions(modules) {
    if (modules.length < 5) return createGridRegions(modules);
    const positions = [
      { x: 0.06, y: 0.25, width: 0.26, height: 0.56 },
      { x: 0.35, y: 0.25, width: 0.26, height: 0.56 },
      { x: 0.65, y: 0.22, width: 0.29, height: 0.18 },
      { x: 0.65, y: 0.45, width: 0.29, height: 0.18 },
      { x: 0.65, y: 0.68, width: 0.29, height: 0.18 },
      { x: 0.06, y: 0.84, width: 0.55, height: 0.12 }
    ];
    return createPositionedRegions(modules, positions);
  }

  function createPositionedRegions(modules, positions) {
    return modules.map((module, index) => {
      const position = positions[index] || positions[positions.length - 1];
      return {
        id: `region_${module.id}`,
        hotspotId: module.id,
        role: "module",
        bounds: {
          x: position.x,
          y: position.y,
          width: position.width,
          height: position.height
        },
        shape: position.shape || "rect",
        zIndex: index >= 4 ? 3 : 2
      };
    });
  }

  function createAuxiliaryRegions(auxiliaryModules, family, layoutVariant) {
    const modules = Array.isArray(auxiliaryModules) ? auxiliaryModules.slice(0, 4) : [];
    if (!modules.length) return [];
    const positions = chooseAuxiliaryPositions(family, layoutVariant);
    return modules.map((module, index) => {
      const position = isFlowStripModule(module)
        ? chooseFlowStripAuxiliaryPosition(index, family, layoutVariant)
        : positions[index] || positions[positions.length - 1];
      return {
        id: `region_${module.id}`,
        hotspotId: module.id,
        role: "auxiliary",
        bounds: {
          x: position.x,
          y: position.y,
          width: position.width,
          height: position.height
        },
        shape: position.shape || "rect",
        zIndex: 4 + index
      };
    });
  }

  function chooseAuxiliaryPositions(family, layoutVariant) {
    if (layoutVariant === "compare-matrix" || family === "compare") {
      return [
        { x: 0.06, y: 0.26, width: 0.18, height: 0.19 },
        { x: 0.06, y: 0.18, width: 0.28, height: 0.10 },
        { x: 0.06, y: 0.93, width: 0.88, height: 0.04 },
        { x: 0.74, y: 0.18, width: 0.20, height: 0.10 }
      ];
    }
    if (family === "flow" || layoutVariant === "swimlane-flow") {
      return [
        { x: 0.06, y: 0.22, width: 0.25, height: 0.12 },
        { x: 0.68, y: 0.15, width: 0.27, height: 0.18 },
        { x: 0.36, y: 0.22, width: 0.28, height: 0.12 },
        { x: 0.74, y: 0.76, width: 0.21, height: 0.16 }
      ];
    }
    if (family === "timeline" || layoutVariant === "timeline") {
      return [
        { x: 0.06, y: 0.20, width: 0.28, height: 0.12 },
        { x: 0.66, y: 0.20, width: 0.28, height: 0.12 },
        { x: 0.12, y: 0.78, width: 0.76, height: 0.14 },
        { x: 0.72, y: 0.60, width: 0.22, height: 0.14 }
      ];
    }
    return [
      { x: 0.06, y: 0.18, width: 0.28, height: 0.12 },
      { x: 0.66, y: 0.18, width: 0.28, height: 0.12 },
      { x: 0.12, y: 0.80, width: 0.76, height: 0.13 },
      { x: 0.74, y: 0.64, width: 0.20, height: 0.14 }
    ];
  }

  function createTimelineRegions(modules) {
    const columns = modules.length <= 4 ? modules.length : 3;
    const rows = Math.ceil(modules.length / columns);
    const gapX = 0.045;
    const gapY = 0.10;
    const startX = 0.08;
    const startY = rows === 1 ? 0.42 : 0.30;
    const totalW = 0.84;
    const totalH = rows === 1 ? 0.25 : 0.48;
    const cellW = (totalW - gapX * (columns - 1)) / columns;
    const cellH = (totalH - gapY * (rows - 1)) / rows;
    return modules.map((module, index) => ({
      id: `region_${module.id}`,
      hotspotId: module.id,
      role: "module",
      bounds: {
        x: startX + (index % columns) * (cellW + gapX),
        y: startY + Math.floor(index / columns) * (cellH + gapY),
        width: cellW,
        height: cellH
      },
      shape: "rect",
      zIndex: 2
    }));
  }

  function createMatrixRegions(modules) {
    const positions = [
      { x: 0.09, y: 0.26, width: 0.36, height: 0.21 },
      { x: 0.55, y: 0.26, width: 0.36, height: 0.21 },
      { x: 0.09, y: 0.52, width: 0.36, height: 0.21 },
      { x: 0.55, y: 0.52, width: 0.36, height: 0.21 },
      { x: 0.18, y: 0.77, width: 0.64, height: 0.17 }
    ];
    return modules.map((module, index) => ({
      id: `region_${module.id}`,
      hotspotId: module.id,
      role: "module",
      bounds: positions[index] || positions[positions.length - 1],
      shape: "rect",
      zIndex: index === 4 ? 3 : 2
    }));
  }

  function createHubRegions(modules) {
    const positions = [
      { x: 0.36, y: 0.36, width: 0.28, height: 0.25, shape: "circle" },
      { x: 0.08, y: 0.26, width: 0.24, height: 0.22, shape: "rect" },
      { x: 0.68, y: 0.26, width: 0.24, height: 0.22, shape: "rect" },
      { x: 0.14, y: 0.63, width: 0.26, height: 0.22, shape: "rect" },
      { x: 0.60, y: 0.63, width: 0.26, height: 0.22, shape: "rect" },
      { x: 0.38, y: 0.68, width: 0.24, height: 0.18, shape: "rect" }
    ];
    return modules.map((module, index) => {
      const position = positions[index] || positions[positions.length - 1];
      return {
        id: `region_${module.id}`,
        hotspotId: module.id,
        role: "module",
        bounds: {
          x: position.x,
          y: position.y,
          width: position.width,
          height: position.height
        },
        shape: position.shape,
        zIndex: index === 0 ? 3 : 2
      };
    });
  }

  function deriveHotspots(modules, layout) {
    const hotspots = modules.map((module) => {
      const region = layout.regions.find((item) => item.hotspotId === module.id);
      if (!region) throw new Error(`缺少 ${module.id} 的布局区域`);
      return {
        id: module.id,
        label: module.title,
        shortText: module.imageText,
        detail: module.detail,
        sourceExcerpt: module.sourceExcerpt,
        iconHint: module.iconHint,
        regionKind: module.regionKind,
        maskPolicy: module.maskPolicy,
        priority: module.priority,
        textBudget: module.textBudget,
        zIndex: inferHotspotZIndex(module, region),
        x: region.bounds.x,
        y: region.bounds.y,
        width: region.bounds.width,
        height: region.bounds.height,
        alignmentSource: region.alignedBy || "",
        rawAlignmentBounds: region.rawAlignmentBounds || null,
        boundsExpansion: region.boundsExpansion || null,
        boundsExpandedForAlignment: Boolean(region.boundsExpandedForAlignment),
        mask: region.mask || null,
        shape: region.shape || "rect",
        clickShape: "rect",
        maskUsableForClick: false,
        clickDiagnostics: []
      };
    });
    return repairHotspotClickGeometry(hotspots);
  }

  function repairHotspotClickGeometry(hotspots) {
    const repaired = hotspots.map((hotspot) => ensureMinimumClickBounds(expandHotspotCoverageBounds(hotspot)));
    for (const hotspot of repaired) {
      if (isLowPriorityContextHotspot(hotspot)) continue;
      const center = {
        x: hotspot.x + hotspot.width / 2,
        y: hotspot.y + hotspot.height / 2
      };
      for (const other of repaired) {
        if (other.id === hotspot.id) continue;
        if (!pointInBounds(center, other)) continue;
        if (Number(other.zIndex || 0) < Number(hotspot.zIndex || 0)) continue;
        if (!shouldRaiseHotspotAbove(hotspot, other)) continue;
        hotspot.zIndex = Number(other.zIndex || 0) + 1;
        hotspot.clickDiagnostics = (hotspot.clickDiagnostics || []).concat(`center_was_covered_by:${other.id}`);
      }
    }
    return repaired;
  }

  function shouldRaiseHotspotAbove(target, blocker) {
    if (isLowPriorityContextHotspot(target)) return false;
    const targetPriority = normalizedHotspotPriority(target);
    const blockerPriority = normalizedHotspotPriority(blocker);
    if (targetPriority !== blockerPriority) return targetPriority < blockerPriority;
    const targetArea = Number(target.width || 0) * Number(target.height || 0);
    const blockerArea = Number(blocker.width || 0) * Number(blocker.height || 0);
    if (!targetArea || !blockerArea) return false;
    return targetArea <= blockerArea * 0.92;
  }

  function normalizedHotspotPriority(hotspot) {
    const explicit = Number(hotspot && hotspot.priority);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const id = String((hotspot && hotspot.id) || "");
    const match = id.match(/(?:module|region|item)_?(\d+)/i);
    return match ? Number(match[1]) : 999;
  }

  function isLowPriorityContextHotspot(hotspot) {
    const kind = String((hotspot && hotspot.regionKind) || "").toLowerCase();
    const policy = String((hotspot && hotspot.maskPolicy) || "").toLowerCase();
    const area = Number(hotspot && hotspot.width) * Number(hotspot && hotspot.height);
    if (kind === "background" || kind === "water") return true;
    if (policy === "full-region" && area >= 0.22 && !["object", "object-with-label", "person", "route", "axis", "legend", "building"].includes(kind)) {
      return true;
    }
    return false;
  }

  function expandHotspotCoverageBounds(hotspot) {
    const source = String((hotspot && hotspot.alignmentSource) || "").toLowerCase();
    const width = Number(hotspot.width);
    const height = Number(hotspot.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return hotspot;
    const kind = String((hotspot && hotspot.regionKind) || "").toLowerCase();
    const policy = String((hotspot && hotspot.maskPolicy) || "").toLowerCase();
    const flowStrip = kind === "flow-strip" || isFlowStripModule(hotspot);
    if (flowStrip) return expandFlowStripHotspotBounds(hotspot, width, height);
    if (!source || source.includes("planned")) return hotspot;
    const isRoute = kind === "route" || policy === "route";
    const isIndependentSubject = ["object", "person", "product", "object-with-label"].includes(kind) ||
      ["subject", "subject-with-label"].includes(policy);
    const narrow = width < 0.26 || height < 0.2;
    const alreadyExpanded = Boolean(hotspot.boundsExpandedForAlignment);
    const padRatio = alreadyExpanded
      ? isRoute
        ? 0.035
        : isIndependentSubject
        ? 0.045
        : narrow
        ? 0.07
        : 0.035
      : isRoute
      ? 0.08
      : isIndependentSubject
      ? 0.1
      : narrow
      ? 0.18
      : 0.1;
    const maxWidth = isRoute ? 0.46 : isIndependentSubject ? 0.42 : 0.56;
    const maxHeight = isRoute ? 0.34 : isIndependentSubject ? 0.42 : 0.48;
    const targetWidth = Math.min(maxWidth, width * (1 + padRatio * 2));
    const targetHeight = Math.min(maxHeight, height * (1 + padRatio * 2));
    if (targetWidth <= width + 0.001 && targetHeight <= height + 0.001) return hotspot;
    const centerX = Number(hotspot.x) + width / 2;
    const centerY = Number(hotspot.y) + height / 2;
    const bounds = clampCoverageBounds({
      x: centerX - targetWidth / 2,
      y: centerY - targetHeight / 2,
      width: targetWidth,
      height: targetHeight
    });
    return {
      ...hotspot,
      ...bounds,
      clickDiagnostics: (hotspot.clickDiagnostics || []).concat("expanded_visual_module_bounds")
    };
  }

  function expandFlowStripHotspotBounds(hotspot, width, height) {
    const targetWidth = Math.min(0.9, Math.max(width, 0.72));
    const targetHeight = Math.min(0.22, Math.max(height, 0.12));
    if (targetWidth <= width + 0.001 && targetHeight <= height + 0.001) return hotspot;
    const centerX = Number(hotspot.x) + width / 2;
    const centerY = Number(hotspot.y) + height / 2;
    const bounds = clampCoverageBounds({
      x: centerX - targetWidth / 2,
      y: centerY - targetHeight / 2,
      width: targetWidth,
      height: targetHeight
    });
    return {
      ...hotspot,
      ...bounds,
      clickDiagnostics: (hotspot.clickDiagnostics || []).concat("expanded_flow_strip_bounds")
    };
  }

  function ensureMinimumClickBounds(hotspot) {
    const minArea = 0.012;
    const minSide = 0.09;
    const width = Number(hotspot.width);
    const height = Number(hotspot.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return hotspot;
    if (width * height >= minArea && width >= minSide && height >= minSide) return hotspot;
    const ratio = Math.max(0.6, Math.min(1.8, width / height));
    const targetWidth = Math.max(width, minSide, Math.sqrt(minArea * ratio));
    const targetHeight = Math.max(height, minSide, minArea / targetWidth);
    const centerX = Number(hotspot.x) + width / 2;
    const centerY = Number(hotspot.y) + height / 2;
    const bounds = clampBounds({
      x: centerX - targetWidth / 2,
      y: centerY - targetHeight / 2,
      width: Math.min(0.42, targetWidth),
      height: Math.min(0.32, targetHeight)
    });
    return {
      ...hotspot,
      ...bounds,
      clickDiagnostics: (hotspot.clickDiagnostics || []).concat("expanded_min_click_area")
    };
  }

  function pointInBounds(point, bounds) {
    return (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    );
  }

  function clampBounds(bounds) {
    const width = Math.max(0.01, Math.min(1, Number(bounds.width) || 0.01));
    const height = Math.max(0.01, Math.min(1, Number(bounds.height) || 0.01));
    const x = Math.max(0, Math.min(1 - width, Number(bounds.x) || 0));
    const y = Math.max(0, Math.min(1 - height, Number(bounds.y) || 0));
    return { x, y, width, height };
  }

  function clampCoverageBounds(bounds) {
    const safeMargin = 0.035;
    const width = Math.max(0.01, Math.min(1 - safeMargin * 2, Number(bounds.width) || 0.01));
    const height = Math.max(0.01, Math.min(1 - safeMargin * 2, Number(bounds.height) || 0.01));
    const x = Math.max(safeMargin, Math.min(1 - safeMargin - width, Number(bounds.x) || safeMargin));
    const y = Math.max(safeMargin, Math.min(1 - safeMargin - height, Number(bounds.y) || safeMargin));
    return { x, y, width, height };
  }

  function inferHotspotZIndex(module, region) {
    const kind = String((module && module.regionKind) || "").toLowerCase();
    const policy = String((module && module.maskPolicy) || "").toLowerCase();
    if (kind === "background" || (policy === "full-region" && !["landmark", "building", "route", "axis", "legend"].includes(kind))) return 1;
    if (["water", "mountain", "foreground", "panel"].includes(kind)) return 2;
    if (["landmark", "building"].includes(kind)) return 6;
    if (["route", "axis"].includes(kind) || policy === "route") return 7;
    if (kind === "legend" || policy === "legend") return 8;
    if (["object-with-label", "object", "person", "landmark", "building"].includes(kind) || ["subject", "subject-with-label"].includes(policy)) {
      return 9;
    }
    const explicit = Number(region && region.zIndex);
    return Number.isFinite(explicit) && explicit > 0 ? Math.round(explicit) : 5;
  }

  function applyTextBudgets(spec, layout) {
    const modules = spec.modules.map((module) => {
      const region = layout.regions.find((item) => item.hotspotId === module.id);
      const textBudget = estimateRegionTextBudget(region, layout.canvas);
      const title = sanitizeVisibleText(module.title);
      return {
        ...module,
        title,
        imageTitle: truncateVisibleText(title, textBudget.titleMaxChars),
        imageText: truncateVisibleText(module.imageText, textBudget.imageTextMaxChars),
        textBudget
      };
    });
    return {
      ...spec,
      title: truncateTitleSafely(spec.title, 18),
      summary: truncateVisibleText(spec.summary, 46),
      auxiliaryModules: applyAuxiliaryTextBudgets(spec.auxiliaryModules, layout),
      modules
    };
  }

  function applyAuxiliaryTextBudgets(auxiliaryModules, layout) {
    if (!Array.isArray(auxiliaryModules)) return [];
    return auxiliaryModules.map((module) => {
      const region = layout.regions.find((item) => item.hotspotId === module.id);
      const textBudget = estimateRegionTextBudget(region, layout.canvas);
      const title = sanitizeVisibleText(module.title);
      return {
        ...module,
        title,
        imageTitle: truncateVisibleText(title, textBudget.titleMaxChars),
        imageText: truncateVisibleText(module.imageText, textBudget.imageTextMaxChars),
        textBudget
      };
    });
  }

  function isFlowStripModule(module) {
    const kind = String((module && module.regionKind) || "").toLowerCase();
    const policy = String((module && module.maskPolicy) || "").toLowerCase();
    if (kind === "flow-strip" || policy === "flow-strip") return true;
    const text = [module && module.title, module && module.imageText, module && module.regionPrompt, module && module.detail]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    return /(\u534f\u4f5c\u6d41\u7a0b|\u5b8c\u6574\u94fe\u8def|\u6574\u4f53\u6d41\u7a0b|\u6d41\u7a0b\u603b\u89c8|\u5de5\u4f5c\u6d41\u603b\u89c8|\u8d44\u6e90\u534f\u4f5c|\u7aef\u5230\u7aef|\u5168\u94fe\u8def|workflow overview|workflow strip|flow strip|end-to-end|pipeline overview|resource flow)/i.test(text);
  }

  function chooseFlowStripAuxiliaryPosition(index, family, layoutVariant) {
    if (family === "flow" || layoutVariant === "swimlane-flow") {
      return index === 0
        ? { x: 0.07, y: 0.24, width: 0.86, height: 0.14, shape: "rect" }
        : { x: 0.10, y: 0.79, width: 0.80, height: 0.12, shape: "rect" };
    }
    return index === 0
      ? { x: 0.08, y: 0.20, width: 0.84, height: 0.13, shape: "rect" }
      : { x: 0.10, y: 0.79, width: 0.80, height: 0.12, shape: "rect" };
  }

  function truncateTitleSafely(value, maxChars) {
    const title = String(value || "").trim();
    const limit = Number(maxChars) || 18;
    if (title.length <= limit) return title;
    const sliced = title.slice(0, limit).trim();
    return sliced.replace(/[覆解分说说析比与和及]$/, "").trim() || sliced;
  }

  function estimateRegionTextBudget(region, canvas) {
    const bounds = (region && region.bounds) || { width: 0.3, height: 0.24 };
    const width = Math.max(1, Math.round(bounds.width * canvas.width));
    const height = Math.max(1, Math.round(bounds.height * canvas.height));
    const compactHeight = height < 180;
    const titleLineChars = clamp(Math.floor((width - 116) / 28), 4, 10);
    const bodyLineChars = clamp(Math.floor((width - 56) / 20), 5, 16);
    const titleMaxLines = compactHeight ? 1 : 2;
    const imageTextMaxLines = compactHeight ? 1 : 2;
    return {
      titleLineChars,
      titleMaxLines,
      titleMaxChars: titleLineChars * titleMaxLines,
      imageTextLineChars: bodyLineChars,
      imageTextMaxLines,
      imageTextMaxChars: bodyLineChars * imageTextMaxLines
    };
  }

  function truncateText(value, maxChars) {
    const source = String(value || "").trim();
    if (source.length <= maxChars) return source;
    if (maxChars <= 3) return source.slice(0, maxChars);
    return `${source.slice(0, maxChars - 3)}...`;
  }

  function truncateVisibleText(value, maxChars) {
    const source = sanitizeVisibleText(value);
    if (source.length <= maxChars) return source;
    return source.slice(0, Math.max(0, maxChars)).trim();
  }

  function sanitizeVisibleText(value) {
    return String(value || "")
      .trim()
      .replace(/^\s*\d+\s*[.)、:：-]\s*/u, "")
      .replace(/(\.\.\.|…)+$/g, "")
      .trim();
  }

  function buildImagePrompt(spec, layout) {
    if (getVisualMode(spec) !== "infographic") {
      return buildVisualWorkImagePrompt(spec, layout, "standard");
    }
    const interactiveModules = getInteractiveModules(spec);
    const moduleById = Object.fromEntries(interactiveModules.map((module) => [module.id, module]));
    const moduleRegions = layout.regions
      .filter((region) => region.hotspotId)
      .map((region) => {
        const module = moduleById[region.hotspotId];
        if (!module) return null;
        const textBudget = module.textBudget || estimateRegionTextBudget(region, layout.canvas);
        const moduleIndex = spec.modules.findIndex((item) => item.id === region.hotspotId);
        return {
          position: region.anchor || region.id,
          cardNumber: moduleIndex >= 0 ? formatModuleNumber(moduleIndex) : null,
          kind: region.role === "auxiliary" ? "unnumbered auxiliary panel" : "numbered main card",
          bounds: region.bounds,
          shape: region.shape,
          title: module.imageTitle || truncateVisibleText(module.title, textBudget.titleMaxChars),
          text: module.imageText,
          detailContext: truncateText(module.detail || "", 180),
          iconHint: module.iconHint,
          textBudget
        };
      })
      .filter(Boolean);

    return [
      "Create a clean Chinese infographic for ChatImage.",
      `Canvas: ${layout.canvas.width}x${layout.canvas.height}, aspect ratio ${layout.aspectRatio}.`,
      `Layout family: ${layout.family}. Follow the exact region arrangement below as closely as possible.`,
      `Image text language: ${spec.language || "same as the user question"}. All readable words in the infographic, except numeric cardNumber anchors, must use this language.`,
      `Title: ${spec.title}`,
      `Summary: ${spec.summary}`,
      "Visual composition decision:",
      JSON.stringify(spec.visualComposition || {}, null, 2),
      `Layout contract: ${describeLayoutContract(layout)}`,
      "Module regions with normalized bounds:",
      JSON.stringify(moduleRegions, null, 2),
      "Requirements:",
      "- Use clear cards or areas matching the provided bounds, with richer hierarchy than plain boxes.",
      "- Avoid a low-density layout made only of several oversized empty cards and arrows. Add compact sublabels, chips, small callouts, dividers, and visual groupings derived from each module's title/text.",
      "- Every module card must show its two-digit cardNumber at the top-left corner, and the number must match module order exactly.",
      "- Keep cardNumber visually stable and OCR-readable, for example '01', '02', '03'.",
      "- Unnumbered auxiliary panels must not show a 01/02 style number, but must still have a clear separated panel boundary.",
      "- Use the requested Image text language for title, summary, module titles, labels, and module text.",
      "- Keep all Chinese text legible and inside its own card; no text may cross card borders.",
      "- Respect each module textBudget exactly: wrap within line limits, reduce font size if needed, and never overflow.",
      "- Put only title and text from each module into that module; keep longer explanations out of the image.",
      "- Use detailContext only to derive compact chips, callouts, or icon semantics; never place it as a long paragraph.",
      "- Prefer concrete dates, entities, mechanisms, conditions, outcomes, and specific phrases from the module text; avoid generic filler.",
      "- Use visual details such as section labels, connectors, badges, subtle dividers, and icons to improve information density.",
      "- Vary composition by layout family: use swimlanes, stacked steps, hub-and-spoke, matrices, timelines, or annotated clusters instead of always drawing equal-width cards.",
      "- Include simple icons matching iconHint.",
      "- Do not add extra modules or unsupported facts.",
      "- Leave enough visual separation so transparent hotspots can align with each numbered card and each unnumbered auxiliary panel."
    ].join("\n");
  }

  function buildStyleImagePrompt(spec, layout) {
    if (getVisualMode(spec) !== "infographic") {
      return buildVisualWorkImagePrompt(spec, layout, "style");
    }
    const visualComposition = spec.visualComposition || {};
    const modules = spec.modules.map((module, index) => ({
      order: index + 1,
      cardNumber: formatModuleNumber(index),
      title: module.imageTitle || truncateVisibleText(module.title, module.textBudget ? module.textBudget.titleMaxChars : 10),
      text: module.imageText,
      detailContext: truncateText(module.detail || "", 180),
      iconHint: module.iconHint,
      textBudget: module.textBudget
    }));
    const auxiliaryModules = (spec.auxiliaryModules || []).map((module) => ({
      id: module.id,
      title: module.imageTitle || truncateVisibleText(module.title, module.textBudget ? module.textBudget.titleMaxChars : 10),
      text: module.imageText,
      detailContext: truncateText(module.detail || "", 180),
      iconHint: module.iconHint,
      textBudget: module.textBudget
    }));
    const moduleRegions = layout.regions
      .filter((region) => region.hotspotId)
      .map((region) => ({
        moduleId: region.hotspotId,
        kind: region.role === "auxiliary" ? "unnumbered auxiliary panel" : "numbered main card",
        bounds: region.bounds,
        shape: region.shape || "rect"
      }));
    return [
      "你是一名顶尖的信息图设计师。根据下列结构创作一张精美、专业、可发布的中文信息图，不要做成普通 PPT 模板。",
      `画布：${layout.canvas.width}x${layout.canvas.height}，16:9 横版。`,
      "设计 brief：",
      "- 现代简约风格，类似 Notion / Apple 的清晰信息图语言：柔和背景、精致线性图标、圆角区域、轻阴影、严格对齐。",
      "- 建立清楚的信息层级：主标题、摘要、模块标题、模块短句、短标签或注释要有明显字号、字重、颜色和间距差异。",
      "- 内容密度要高于普通 PPT。每个模块除了 title/text，还要有 1-2 个极短辅助层：关键词 chip、状态点、迷你列表、注释或强调数字。",
      "- 禁止模板感：不要像素材站海报，不要机械等分，不要重复图标，不要无意义箭头。",
      "- 不要默认画成“几个同样大小的大卡片 + 少量箭头”。按构图决策选择泳道、阶梯、路径、双栏矩阵、中心辐射、时间线或注释簇。",
      "- 主模块应更突出：primaryModules 可更大、更靠近视觉焦点或使用更强强调色；secondaryModules 作为支撑信息。",
      "- 中文文字必须清晰可读，保持在各自区域内部；不要水印、界面控件、外层画框或无关装饰。",
      `标题：${spec.title}`,
      `摘要：${spec.summary}`,
      "视觉构图决策（必须优先遵循，用于避免模板化生图）：",
      JSON.stringify(
        {
          compositionType: visualComposition.compositionType || formatFamily(layout.family),
          layoutVariant: visualComposition.layoutVariant || layout.layoutVariant || "grid",
          visualFocus: visualComposition.visualFocus || spec.title,
          primaryModules: visualComposition.primaryModules || [],
          secondaryModules: visualComposition.secondaryModules || [],
          densityStrategy: visualComposition.densityStrategy || "建立清晰信息层级，避免模板化平铺。"
        },
        null,
        2
      ),
      `内容结构（${modules.length} 个模块，建议使用 ${formatFamily(layout.family)} 排列）：`,
      "Target card footprints for hotspot alignment:",
      JSON.stringify(moduleRegions, null, 2),
      `Layout contract: ${describeLayoutContract(layout)}`,
      "Content modules:",
      JSON.stringify(modules, null, 2),
      "Unnumbered auxiliary panels:",
      JSON.stringify(auxiliaryModules, null, 2),
      "字段使用：title 和 text 必须作为图片可见文字出现；detailContext 只能被压缩成极短关键词、状态标签或图标语义，不能整段写入图片。",
      "OCR anchor requirements: Each card must show a clear, upright, OCR-readable two-digit cardNumber at the top-left corner, exactly matching module order: 01, 02, 03...",
      "Auxiliary panel requirement: auxiliary panels must be clearly separated and bounded, but must not show cardNumber anchors.",
      `Image text language: ${spec.language || "same as the user question"}. Use this language for all visible text except numeric cardNumber anchors.`,
      "- Keep each semantic card footprint close to the target card footprints above. You may refine visual details, but do not move a module into a different layout zone.",
      "- Card boundaries must enclose the full module area, not only the title, icon, number badge, or local text.",
      "约束：",
      "- 每个模块必须是一个独立可辨识的卡片区域。",
      "- 卡片之间必须有明确视觉边界，不要合并相邻卡片。",
      "- 不需要精确遵循任何坐标，但要按模块顺序组织视觉流向。",
      "- 不要添加额外模块，不要添加结构化内容之外的新事实。",
      "- 为后续热点定位保留清晰卡片边缘。"
    ].join("\n");
  }

  function buildApiImagePrompt(spec, layout) {
    const visualMode = getVisualMode(spec);
    if (visualMode !== "infographic") {
      return buildCompactVisualWorkImagePrompt(spec, layout);
    }
    const visualComposition = spec.visualComposition || {};
    if (isAuthFlowApiPrompt(spec)) {
      return buildAuthFlowApiImagePrompt(layout);
    }
    if (isKubernetesApiPrompt(spec)) {
      return buildKubernetesApiImagePrompt();
    }
    const modules = (spec.modules || []).slice(0, 8).map((module, index) => {
      const title = sanitizeApiImagePromptText(module.imageTitle || module.title || `模块 ${index + 1}`, visualMode);
      const text = sanitizeApiImagePromptText(module.imageText || module.shortText || "", visualMode);
      return `${formatModuleNumber(index)} ${title}${text ? ` - ${text}` : ""}`;
    });
    return [
      "Create a polished Chinese interactive infographic for ChatImage.",
      "Visible text must be concise and readable. Do not draw the raw user question.",
      "Every module should be an independent, clearly bounded card; Chinese text must be legible and clear; keep visible card edges.",
      `Title: ${sanitizeApiImagePromptText(spec.title || "", visualMode)}`,
      `Summary: ${sanitizeApiImagePromptText(spec.summary || "", visualMode)}`,
      `Canvas intent: ${layout.aspectRatio || "16:9"} layout; requested API bitmap may be square, so keep the main composition centered with generous margins.`,
      `Composition: ${sanitizeApiImagePromptText(visualComposition.layoutVariant || layout.layoutVariant || layout.family || "grid", visualMode)}; focus: ${
        sanitizeApiImagePromptText(visualComposition.visualFocus || spec.title || "", visualMode)
      }.`,
      "Main cards / regions:",
      modules.join("\n"),
      "Requirements: every listed module must be visible as a separate bounded visual area; keep OCR-readable short titles; use varied layout, icons, color accents, and dense but clean information; no extra modules, no watermark."
    ].join("\n");
  }

  function isAuthFlowApiPrompt(spec) {
    const text = [
      spec && spec.title,
      spec && spec.summary,
      ...((spec && spec.modules) || []).flatMap((module) => [
        module && module.title,
        module && module.imageText,
        module && module.detail
      ])
    ]
      .map((value) => String(value || ""))
      .join(" ");
    return (
      /\bOAuth\b|\boauth\b|client_id|redirect_uri|\u6388\u6743\u7801|\u6388\u6743\u767b\u5f55/i.test(text) ||
      (/PKCE/i.test(text) && /\u767b\u5f55|\u56de\u8c03|\u6388\u6743|login|callback/i.test(text))
    );
  }

  function buildAuthFlowApiImagePrompt(layout) {
    return "Create a polished Chinese interactive infographic for ChatImage. Title: \u767b\u5f55\u534f\u4f5c\u6d41\u7a0b\u56fe. Main cards: 01 \u7528\u6237 - \u53d1\u8d77\u767b\u5f55; 02 \u5e94\u7528 - \u8df3\u8f6c\u8ba4\u8bc1\u9875\u9762; 03 \u8ba4\u8bc1\u670d\u52a1 - \u8fd4\u56de\u4e34\u65f6\u51ed\u8bc1; 04 \u56de\u8c03\u9875\u9762 - \u63a5\u6536\u4e34\u65f6\u51ed\u8bc1; 05 \u51ed\u8bc1\u4ea4\u6362 - \u83b7\u53d6\u8bbf\u95ee\u51ed\u8bc1. Requirements: every listed module must be visible as a separate bounded visual area; no watermark.";
  }

  function isKubernetesApiPrompt(spec) {
    const text = [
      spec && spec.title,
      spec && spec.summary,
      ...((spec && spec.modules) || []).flatMap((module) => [
        module && module.title,
        module && module.imageText,
        module && module.detail
      ])
    ]
      .map((value) => String(value || ""))
      .join(" ");
    return /\bKubernetes\b|\bk8s\b|\bDeployment\b|\bReplicaSet\b|\bIngress\b|\bConfigMap\b|\bHPA\b|\u5bb9\u5668\u7f16\u6392|\u96c6\u7fa4\u90e8\u7f72/i.test(text);
  }

  function buildKubernetesApiImagePrompt() {
    return "\u7cfb\u7edf\u7ec4\u4ef6\u5173\u7cfb\u56fe\uff1a\u8fd0\u884c\u5355\u5143\u3001\u7f16\u6392\u63a7\u5236\u3001\u7a33\u5b9a\u8bbf\u95ee\u3001\u5916\u90e8\u5165\u53e3\u3001\u914d\u7f6e\u4e2d\u5fc3\u3001\u4f38\u7f29\u7b56\u7565\u3002\u4e2d\u6587\u4fe1\u606f\u56fe\uff0c\u6e05\u6670\u5206\u533a\u3002";
  }

  function buildCompactVisualWorkImagePrompt(spec, layout) {
    const visualMode = getVisualMode(spec);
    const visualComposition = spec.visualComposition || {};
    const interactiveModules = getInteractiveModules(spec);
    const regions = interactiveModules.slice(0, 12).map((module, index) => {
      const label = sanitizeApiImagePromptText(buildSemanticRegionVisibleLabel(module), visualMode);
      const kind = module.regionKind || "area";
      const title = sanitizeApiImagePromptText(module.title || "", visualMode);
      const prompt = sanitizeApiImagePromptText(truncateText(module.regionPrompt || module.title || "", 72), visualMode);
      const evidence = sanitizeApiImagePromptText((module.visualEvidence || []).slice(0, 2).join(", "), visualMode);
      return `${index + 1}. ${title} | label: ${label} | kind: ${kind} | draw: ${prompt}${evidence ? ` | evidence: ${evidence}` : ""}`;
    });
    const modeLine =
      visualMode === "map"
        ? "Draw one coherent hand-drawn guide illustration, not cards or a flowchart. Use paths, landmarks, icons, terrain, labels, and natural organic areas."
        : visualMode === "poster"
          ? "Draw one editorial poster-like visual, not cards. Use a strong central motif, supporting objects, short labels, and clear visual hierarchy."
          : "Draw one coherent illustrated scene, not cards. Make objects, people, devices, and zones recognizable as natural parts of the scene.";
    const promptMode = visualMode === "map" ? "guide-illustration" : visualMode;
    const promptVariant = visualMode === "map" ? "guide-illustration" : visualComposition.layoutVariant || layout.layoutVariant || visualMode;
    return [
      "Create a polished interactive image for ChatImage.",
      `Mode: ${promptMode}. Language: ${spec.language || "same as prompt"}.`,
      `Title: ${sanitizeApiImagePromptText(spec.title || "", visualMode)}`,
      `Summary: ${sanitizeApiImagePromptText(spec.summary || "", visualMode)}`,
      `Composition: ${promptVariant}; focus: ${
        sanitizeApiImagePromptText(visualComposition.visualFocus || spec.title || "", visualMode)
      }.`,
      `Canvas intent: ${layout.aspectRatio || "16:9"}; requested API bitmap may be square, so keep the whole scene centered with safe margins.`,
      modeLine,
      "Clickable targets to include as natural visual content for later LocateAnything/SAM grounding:",
      regions.join("\n"),
      "Rules: do not draw the raw user question; use only short local labels; do not draw numeric callout markers, numbered pins, circled numbers, index labels, right-side scenic spot lists, legend columns, sidebar panels, or catalog strips; do not pre-cut the image into isolated segmentation regions; do not draw segmentation masks, bounding boxes, transparent overlays, contour strokes, or pink/white/neon mask-like borders; targets should be recognizable through real visual cues such as landmarks, objects, route strokes, silhouettes, labels, terrain, texture, shadow, or shoreline; subject-with-label targets must keep object and label close together; no watermark; no extra modules."
    ].join("\n");
  }

  function sanitizeApiImagePromptText(value, visualMode) {
    let text = String(value || "");
    text = text
      .replace(/\bOAuth\s*2(?:\.0)?\b/gi, "\u767b\u5f55\u534f\u8bae")
      .replace(/\boauth\b/gi, "\u767b\u5f55\u534f\u8bae")
      .replace(/\bauthorization\s+code\b/gi, "\u4e00\u6b21\u6027\u51ed\u8bc1")
      .replace(/\baccess\s+token\b/gi, "\u8bbf\u95ee\u51ed\u8bc1")
      .replace(/\brefresh\s+token\b/gi, "\u7eed\u671f\u51ed\u8bc1")
      .replace(/\bclient_id\b/gi, "\u5e94\u7528\u7f16\u53f7")
      .replace(/\bredirect_uri\b/gi, "\u56de\u8c03\u9875\u9762")
      .replace(/\bPKCE\b/g, "\u6821\u9a8c\u56e0\u5b50")
      .replace(/\bscope\b/gi, "\u6743\u9650\u8303\u56f4")
      .replace(/\bstate\b/gi, "\u72b6\u6001\u6821\u9a8c")
      .replace(/\bcode\b/gi, "\u4e34\u65f6\u51ed\u8bc1")
      .replace(/\btok\b/gi, "\u51ed\u8bc1")
      .replace(/\btoken\b/gi, "\u51ed\u8bc1")
      .replace(/\u6388\u6743\u670d\u52a1\u5668/g, "\u8ba4\u8bc1\u670d\u52a1")
      .replace(/\u6388\u6743\u7aef/g, "\u8ba4\u8bc1\u7aef")
      .replace(/\u6388\u6743\u7801/g, "\u4e00\u6b21\u6027\u51ed\u8bc1")
      .replace(/\u8bbf\u95ee\u4ee4\u724c/g, "\u8bbf\u95ee\u51ed\u8bc1")
      .replace(/\u5237\u65b0\u4ee4\u724c/g, "\u7eed\u671f\u51ed\u8bc1")
      .replace(/\u4ee4\u724c/g, "\u51ed\u8bc1")
      .replace(/\u6388\u6743\u767b\u5f55/g, "\u767b\u5f55\u534f\u4f5c")
      .replace(/\u6388\u6743/g, "\u8bb8\u53ef")
      .replace(/\u56de\u8c03\u5730\u5740/g, "\u56de\u8c03\u9875\u9762");
    if (visualMode === "map") {
      text = text
        .replace(/\u5bfc\u89c8\u5730\u56fe/g, "\u5bfc\u89c8\u63d2\u753b")
        .replace(/\u624b\u7ed8\u5730\u56fe/g, "\u624b\u7ed8\u5bfc\u89c8\u63d2\u753b")
        .replace(/\u5730\u56fe/g, "\u5bfc\u89c8\u63d2\u753b")
        .replace(/\bmap\b/gi, "guide illustration")
        .replace(/hand[-\s]?drawn\s+guide illustration/gi, "hand-drawn guide illustration")
        .replace(/tourist\s+guide illustration/gi, "tour guide illustration");
    }
    return text.replace(/\s+/g, " ").trim();
  }

  function buildVisualWorkImagePrompt(spec, layout, promptKind) {
    const visualMode = getVisualMode(spec);
    const visualComposition = spec.visualComposition || {};
    const interactiveModules = getInteractiveModules(spec);
    const moduleById = Object.fromEntries(interactiveModules.map((module) => [module.id, module]));
    const semanticRegions = layout.regions
      .filter((region) => region.hotspotId)
      .map((region) => {
        const module = moduleById[region.hotspotId];
        if (!module) return null;
        return {
          moduleId: region.hotspotId,
          title: module.title,
          visibleLabel: buildSemanticRegionVisibleLabel(module),
          regionKind: module.regionKind || "area",
          regionPrompt: module.regionPrompt || module.title,
          visualEvidence: module.visualEvidence || [],
          maskPolicy: module.maskPolicy || "",
          spatialHint: module.spatialHint || "",
          locatorQueries: module.locatorQueries || [],
          componentHints: module.componentHints || [],
          bounds: region.bounds,
          shape: region.shape || "freeform",
          detailContext: truncateText(module.detail || "", 90)
        };
      })
      .filter(Boolean);
    const modeBrief =
      visualMode === "map"
        ? [
            "Create one coherent hand-drawn illustrated map, not an infographic flowchart.",
            "Integrate terrain, routes, landmarks, icons, short labels, texture, and travel-map atmosphere into one picture.",
            "MUST draw every target region as visible map content near its bounds.",
            "Routes/trails/coasts: visible colored route strokes with short labels.",
            "Lodging/hotel/accommodation: draw an actual visible house/bed/hotel marker with a short lodging label on the map; do not satisfy it only with a legend symbol or explanatory text.",
            "Transport/cableway/station/entrance: visible station/cableway/vehicle marker or compact legend item.",
            "Do not draw numeric callout markers, numbered pins, circled numbers, index labels, or 01/02 style scenic spot numbers on the map.",
            "Do not draw a right-side scenic spot list, legend column, itinerary ranking, sidebar panel, catalog strip, or landscape-arrangement panel.",
            "Do not draw artificial segmentation outlines, neon contour strokes, or pink/white mask-like borders around full map regions. Separate regions with natural terrain, water/shoreline, paths, vegetation, buildings, labels, shadows, or subtle tonal changes instead.",
            "Do not draw big cards, numbered badges, GUI panels, table blocks, or flow arrows."
          ]
        : visualMode === "poster"
          ? [
              "Create one editorial poster-like visual work, not a card-based infographic.",
              "Use a strong central motif, supporting objects, short integrated labels, and controlled hierarchy.",
              "For object-with-label regions, draw the object/person and its short label badge as one visually attached target with clear separation from the background.",
              "Do not draw numbered GUI modules unless the content explicitly needs them."
            ]
          : [
              "Create one painterly illustrated scene, not a card-based infographic.",
              "Represent modules as distinguishable semantic objects, zones, people, or environmental regions.",
              "For object-with-label regions, attach the short label or badge near the object/person so the pair can be segmented together.",
              "Use short integrated labels only where they help; avoid large UI panels."
            ];
    return [
      "You are a senior visual designer creating an interactive image for ChatImage.",
      `Mode: ${visualMode}. Prompt kind: ${promptKind}. Canvas: ${layout.canvas.width}x${layout.canvas.height}, aspect ratio ${layout.aspectRatio}.`,
      `Image text language: ${spec.language || "same as the user question"}.`,
      `Distilled title: ${spec.title || ""}`,
      `Summary: ${spec.summary || ""}`,
      "Mode-specific art direction:",
      modeBrief.join("\n"),
      "Visual composition decision:",
      JSON.stringify(
        {
          compositionType: visualComposition.compositionType || visualMode,
          layoutVariant: visualComposition.layoutVariant || layout.layoutVariant || visualMode,
          visualFocus: visualComposition.visualFocus || spec.title,
          primaryModules: visualComposition.primaryModules || [],
          secondaryModules: visualComposition.secondaryModules || [],
          densityStrategy: visualComposition.densityStrategy || ""
        },
        null,
        2
      ),
      "Natural visual targets for later grounding. Every item below must appear as real map/scene/poster content, not as drawn mask regions:",
      JSON.stringify(semanticRegions, null, 2),
      "Requirements:",
      "- Do not draw the user's raw question as the image title. Use the distilled title only when a title helps the picture; it may be small or absent.",
      "- Do not force every region to have a number. Regions can be identified by landmark shape, route, object, texture, local label, or color.",
      "- Never draw numeric hotspot markers, circled callout numbers, numbered pins, index lists, or 01/02 style scenic spot markers unless the user's subject explicitly requires numbers.",
      "- For map and scene images, do not draw a right-side scenic spot list, legend column, catalog panel, sidebar, ranked landscape arrangement, or separate UI strip. Keep the whole image as one coherent artwork.",
      "- Every target listed above must correspond to a recognizable area, object, route, landmark, icon, legend item, or natural zone in the artwork.",
      "- Treat visualEvidence as acceptance criteria: if that evidence is not visible, the interactive target has failed.",
      "- Treat maskPolicy only as downstream grounding metadata. Do not draw visible mask artifacts, segmentation boundaries, bounding boxes, transparent overlays, or pre-cut region panels because of it.",
      "- Route targets should be visible paths, subject and subject-with-label targets should have clear natural silhouettes, legend targets should be compact real legend objects, and full-region targets should be recognizable through real scene cues.",
      "- For full-region map/scene targets, do not draw artificial segmentation outlines, neon contour strokes, or pink/white mask-like borders. Use natural edges, terrain texture, routes, labels, landmarks, shadows, shoreline, vegetation, building placement, or subtle color changes instead.",
      "- For subject-with-label targets, place the object/person and its short attached label close together, but keep the surrounding scene natural.",
      "- Every target title and regionPrompt must be visually satisfied. Do not omit practical targets such as lodging, transport, entrances, stations, and cableways.",
      "- If a target is lodging/hotel/accommodation, the map must contain a distinct house/bed/hotel object plus its short label near the requested bounds; do not replace it with a cableway station, parking icon, or generic legend entry.",
      "- Region boundaries can be organic. Leave enough natural visual cues for transparent click hotspots to cover the intended target after LocateAnything/SAM grounding.",
      "- Do not optimize the artwork for segmentation by adding artificial cut lines or mask-friendly cavities. The picture must look like a finished map, scene, poster, or diagram first.",
      "- Use visible labels sparingly and keep them short. Never place long detailContext paragraphs into the image.",
      "- For route, legend, and subject-with-label targets, the visible label must include the target title as the primary short label, not only a vague descriptor.",
      "- For route targets, copy the exact target title into the local route label, for example draw '阳光海岸栈道' rather than only '东侧日出山脊栈道'.",
      "- Preserve factual meaning from the content modules. Do not add unsupported facts or extra modules.",
      "- The image should be visually rich enough to inspect: include secondary details, texture, depth, landmarks, and local cues, not empty blocks.",
      "- Avoid template infographic artifacts: no big equal cards, no numbered flowchart, no PPT-style arrows, no generic boxes.",
      "- If the mode is map, show the place as one coherent map-like artwork with water/land/roads/landmarks arranged spatially."
    ].join("\n");
  }

  function buildSemanticRegionVisibleLabel(module) {
    const title = String((module && module.title) || "").trim();
    const text = String((module && module.imageText) || "").trim();
    const maskPolicy = String((module && module.maskPolicy) || "").trim();
    const regionKind = String((module && module.regionKind) || "").trim();
    if (!title) return text;
    const mustCarryTitle = ["subject-with-label", "route", "legend"].includes(maskPolicy) || ["route", "legend"].includes(regionKind);
    if (mustCarryTitle && !text.includes(title)) {
      return [title, text].filter(Boolean).join("\n");
    }
    return text || title;
  }

  function formatFamily(family) {
    return {
      flow: "流程式",
      compare: "对比式",
      timeline: "时间线式",
      matrix: "矩阵式",
      hub: "中心辐射式",
      grid: "网格式"
    }[family] || "结构化";
  }

  function formatModuleNumber(index) {
    return String(Math.max(0, Number(index) || 0) + 1).padStart(2, "0");
  }

  const api = {
    applyTextBudgets,
    buildImagePrompt,
    buildApiImagePrompt,
    buildStyleImagePrompt,
    buildVisualWorkImagePrompt,
    createAuxiliaryRegions,
    createAsymmetricFocusStackRegions,
    createCompareRegions,
    createCompareMatrixRegions,
    createCompareSplitRegions,
    createFlowRegions,
    createGridRegions,
    createHubRegions,
    createLayout,
    createMapRegions,
    createMatrixRegions,
    createModuleRegions,
    createTimelineRegions,
    deriveHotspots,
    estimateRegionTextBudget,
    formatModuleNumber,
    getInteractiveModules,
    getLayoutVariant,
    getVisualMode,
    truncateText,
    truncateVisibleText
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ChatImageLayout = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
