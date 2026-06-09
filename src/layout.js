(function initLayout(global) {
  "use strict";

  const core =
    global.ChatImageCore ||
    (typeof require !== "undefined" && typeof module !== "undefined" && module.exports
      ? require("./core")
      : null);

  function createLayout(spec, { uid }) {
    const family = core.chooseFamily(spec);
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
    const candidateRegions = createModuleRegions(family, spec.modules, layoutVariant, { hasAuxiliaryModules });
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
    const allowed = ["compare-matrix", "compare-split", "asymmetric-focus-stack", "swimlane-flow", "timeline", "grid"];
    if (allowed.includes(variant)) return variant;
    if (family === "compare" || family === "matrix") return "compare-matrix";
    if (family === "flow") return "swimlane-flow";
    if (family === "timeline") return "timeline";
    if (family === "hub") return "asymmetric-focus-stack";
    return "grid";
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createGridRegions(modules) {
    const count = modules.length;
    const columns = count <= 4 ? 2 : 3;
    const rows = Math.ceil(count / columns);
    const gapX = 0.035;
    const gapY = 0.055;
    const startX = 0.06;
    const startY = 0.28;
    const totalW = 0.88;
    const totalH = 0.58;
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
      { x: 0.65, y: 0.22, width: 0.29, height: 0.18 },
      { x: 0.35, y: 0.25, width: 0.26, height: 0.56 },
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
      const position = positions[index] || positions[positions.length - 1];
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
        { x: 0.06, y: 0.76, width: 0.66, height: 0.16 },
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
    return modules.map((module) => {
      const region = layout.regions.find((item) => item.hotspotId === module.id);
      if (!region) throw new Error(`缺少 ${module.id} 的布局区域`);
      return {
        id: module.id,
        label: module.title,
        shortText: module.imageText,
        detail: module.detail,
        sourceExcerpt: module.sourceExcerpt,
        iconHint: module.iconHint,
        textBudget: module.textBudget,
        x: region.bounds.x,
        y: region.bounds.y,
        width: region.bounds.width,
        height: region.bounds.height
      };
    });
  }

  function applyTextBudgets(spec, layout) {
    const modules = spec.modules.map((module) => {
      const region = layout.regions.find((item) => item.hotspotId === module.id);
      const textBudget = estimateRegionTextBudget(region, layout.canvas);
      return {
        ...module,
        title: truncateVisibleText(module.title, textBudget.titleMaxChars),
        imageText: truncateVisibleText(module.imageText, textBudget.imageTextMaxChars),
        textBudget
      };
    });
    return {
      ...spec,
      title: truncateVisibleText(spec.title, 18),
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
      return {
        ...module,
        title: truncateVisibleText(module.title, textBudget.titleMaxChars),
        imageText: truncateVisibleText(module.imageText, textBudget.imageTextMaxChars),
        textBudget
      };
    });
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
          title: module.title,
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
    const visualComposition = spec.visualComposition || {};
    const modules = spec.modules.map((module, index) => ({
      order: index + 1,
      cardNumber: formatModuleNumber(index),
      title: module.title,
      text: module.imageText,
      detailContext: truncateText(module.detail || "", 180),
      iconHint: module.iconHint,
      textBudget: module.textBudget
    }));
    const auxiliaryModules = (spec.auxiliaryModules || []).map((module) => ({
      id: module.id,
      title: module.title,
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
    buildStyleImagePrompt,
    createAuxiliaryRegions,
    createAsymmetricFocusStackRegions,
    createCompareRegions,
    createCompareMatrixRegions,
    createCompareSplitRegions,
    createFlowRegions,
    createGridRegions,
    createHubRegions,
    createLayout,
    createMatrixRegions,
    createModuleRegions,
    createTimelineRegions,
    deriveHotspots,
    estimateRegionTextBudget,
    formatModuleNumber,
    getInteractiveModules,
    getLayoutVariant,
    truncateText,
    truncateVisibleText
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ChatImageLayout = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
