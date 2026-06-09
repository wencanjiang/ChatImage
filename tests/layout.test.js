"use strict";

const assert = require("assert");
const {
  applyTextBudgets,
  buildImagePrompt,
  buildStyleImagePrompt,
  createAsymmetricFocusStackRegions,
  createAuxiliaryRegions,
  createCompareMatrixRegions,
  createCompareSplitRegions,
  createGridRegions,
  createLayout,
  createMapRegions,
  createTimelineRegions,
  deriveHotspots,
  estimateRegionTextBudget,
  getInteractiveModules,
  getLayoutVariant,
  getVisualMode,
  truncateText,
  truncateVisibleText
} = require("../src/layout");

function uid(prefix) {
  return `${prefix}_test`;
}

function createSpec(relationType = "timeline", count = 5) {
  return {
    language: "zh-CN",
    title: "测试图",
    summary: "测试摘要",
    relationType,
    visualComposition: {
      compositionType: "annotated-clusters",
      visualFocus: "测试焦点",
      primaryModules: ["module_1"],
      secondaryModules: ["module_2", "module_3"],
      densityStrategy: "用注释标签提升层级。"
    },
    modules: Array.from({ length: count }, (_, index) => ({
      id: `module_${index + 1}`,
      title: `模块${index + 1}`,
      imageText: `短文案${index + 1}`,
      detail: `详情${index + 1}`,
      sourceExcerpt: `片段${index + 1}`,
      iconHint: index === 0 ? "risk" : "step"
    }))
  };
}

function main() {
  const spec = createSpec("timeline", 5);
  const layout = createLayout(spec, { uid });
  assert.strictEqual(layout.id, "layout_test");
  assert.strictEqual(layout.family, "timeline");
  assert.strictEqual(layout.validation.valid, true);
  assert.strictEqual(layout.regions.filter((region) => region.role === "module").length, 5);

  const hotspots = deriveHotspots(spec.modules, layout);
  assert.strictEqual(hotspots.length, 5);
  assert.strictEqual(hotspots[0].id, "module_1");
  assert.strictEqual(hotspots[0].label, "模块1");
  assert.ok(hotspots[0].width > 0.12);

  const prompt = buildImagePrompt(spec, layout);
  assert.match(prompt, /Layout family: timeline/);
  assert.match(prompt, /Module regions with normalized bounds/);
  assert.match(prompt, /"title": "模块1"/);
  assert.match(prompt, /"textBudget"/);
  assert.match(prompt, /"cardNumber": "01"/);
  assert.match(prompt, /Visual composition decision/);
  assert.match(prompt, /annotated-clusters/);
  assert.match(prompt, /detailContext/);
  assert.match(prompt, /Image text language: zh-CN/);
  assert.match(prompt, /Respect each module textBudget exactly/);

  const stylePrompt = buildStyleImagePrompt(spec, layout);
  assert.match(stylePrompt, /"cardNumber": "01"/);
  assert.match(stylePrompt, /Image text language: zh-CN/);
  assert.match(stylePrompt, /OCR-readable/);
  assert.match(stylePrompt, /现代简约风格/);
  assert.match(stylePrompt, /独立可辨识的卡片区域/);
  assert.match(stylePrompt, /不需要精确遵循任何坐标/);
  assert.match(stylePrompt, /几个同样大小的大卡片/);
  assert.match(stylePrompt, /内容密度/);
  assert.match(stylePrompt, /信息层级/);
  assert.match(stylePrompt, /禁止模板感/);
  assert.match(stylePrompt, /视觉构图决策/);
  assert.match(stylePrompt, /测试焦点/);
  assert.match(stylePrompt, /detailContext/);
  assert.match(stylePrompt, /primaryModules/);
  assert.match(stylePrompt, /主模块应更突出/);
  assert.doesNotMatch(stylePrompt, /normalized bounds/i);

  const auxSpec = createSpec("flow", 5);
  auxSpec.visualComposition.layoutVariant = "swimlane-flow";
  auxSpec.auxiliaryModules = [
    {
      id: "aux_1",
      title: "输入与环境",
      imageText: "用户意图和约束",
      detail: "说明流程启动前的上下文。",
      sourceExcerpt: "输入",
      iconHint: "user"
    },
    {
      id: "aux_2",
      title: "外部工具",
      imageText: "搜索与计算器",
      detail: "说明可调用的外部工具。",
      sourceExcerpt: "工具",
      iconHint: "tool"
    }
  ];
  const auxLayout = createLayout(auxSpec, { uid });
  assert.strictEqual(auxLayout.regions.filter((region) => region.role === "auxiliary").length, 2);
  const flowMainRegions = auxLayout.regions.filter((region) => region.role === "module");
  assert.ok(flowMainRegions.slice(0, 4).every((region) => region.bounds.width >= 0.19));
  assert.ok(flowMainRegions[4].bounds.width > 0.7);
  assert.ok(flowMainRegions[4].bounds.y > flowMainRegions[0].bounds.y);
  assert.strictEqual(createAuxiliaryRegions(auxSpec.auxiliaryModules, "flow", "swimlane-flow").length, 2);
  const auxVisualSpec = applyTextBudgets(auxSpec, auxLayout);
  const interactiveModules = getInteractiveModules(auxVisualSpec);
  assert.strictEqual(interactiveModules.length, 7);
  const auxHotspots = deriveHotspots(interactiveModules, auxLayout);
  assert.strictEqual(auxHotspots.length, 7);
  assert.ok(auxHotspots.some((hotspot) => hotspot.id === "aux_1"));
  const auxPrompt = buildImagePrompt(auxVisualSpec, auxLayout);
  assert.match(auxPrompt, /unnumbered auxiliary panel/);
  assert.match(auxPrompt, /Unnumbered auxiliary panels must not show/);
  const auxStylePrompt = buildStyleImagePrompt(auxVisualSpec, auxLayout);
  assert.match(auxStylePrompt, /Unnumbered auxiliary panels/);
  assert.match(auxStylePrompt, /Auxiliary panel requirement/);

  const budget = estimateRegionTextBudget(layout.regions.find((region) => region.hotspotId === "module_1"), layout.canvas);
  assert.ok(budget.titleMaxChars >= 4);
  assert.ok(budget.imageTextMaxChars >= 5);
  assert.strictEqual(truncateText("1234567890", 7), "1234...");

  const longSpec = createSpec("timeline", 5);
  longSpec.title = "这是一个非常非常长的标题用于检查主标题截断";
  longSpec.summary = "这是一个非常非常长的摘要用于检查图片顶部摘要不会挤出边界并影响视觉稳定性";
  longSpec.modules[0].title = "这是一个非常非常长的模块标题";
  longSpec.modules[0].imageText = "这是一个非常非常长的模块短文本用于检查生图提示词不会让文字溢出卡片边界";
  longSpec.modules[1].title = "2. Perception...";
  longSpec.modules[1].imageText = "2. Receives context...";
  const visualSpec = applyTextBudgets(longSpec, layout);
  assert.ok(visualSpec.title.length <= 18);
  assert.doesNotMatch(visualSpec.title, /\.{3}|…/);
  assert.ok(visualSpec.summary.length <= 46);
  assert.doesNotMatch(truncateVisibleText("Transformer 架构与注意力机制", 14), /\.{3}|…/);
  assert.ok(visualSpec.modules[0].title.length <= visualSpec.modules[0].textBudget.titleMaxChars);
  assert.ok(visualSpec.modules[0].imageText.length <= visualSpec.modules[0].textBudget.imageTextMaxChars);
  assert.strictEqual(visualSpec.modules[1].title, "Perception");
  assert.strictEqual(visualSpec.modules[1].imageText, "Receives context");

  const grid = createGridRegions(createSpec("hierarchy", 6).modules);
  assert.strictEqual(grid.length, 6);
  assert.ok(grid.every((region) => region.bounds.x >= 0.055));

  const timeline = createTimelineRegions(createSpec("timeline", 6).modules);
  assert.strictEqual(timeline.length, 6);
  assert.ok(timeline[3].bounds.y > timeline[0].bounds.y);

  const matrixSpec = createSpec("compare", 5);
  matrixSpec.visualComposition.layoutVariant = "compare-matrix";
  const matrixLayout = createLayout(matrixSpec, { uid });
  assert.strictEqual(matrixLayout.layoutVariant, "compare-matrix");
  assert.strictEqual(getLayoutVariant(matrixSpec, "compare"), "compare-matrix");
  assert.deepStrictEqual(
    matrixLayout.regions.filter((region) => region.role === "module").map((region) => region.bounds.x),
    createCompareMatrixRegions(matrixSpec.modules).map((region) => region.bounds.x)
  );

  matrixSpec.auxiliaryModules = [
    { id: "aux_1", title: "Team", imageText: "Stack fit", detail: "Team and stack constraints.", iconHint: "user" }
  ];
  const matrixWithAuxLayout = createLayout(matrixSpec, { uid });
  const matrixWithAuxModule1 = matrixWithAuxLayout.regions.find((region) => region.hotspotId === "module_1");
  const matrixWithAux = matrixWithAuxLayout.regions.find((region) => region.hotspotId === "aux_1");
  assert.strictEqual(matrixWithAuxModule1.bounds.x, 0.25);
  assert.strictEqual(matrixWithAux.bounds.x, 0.06);
  assert.strictEqual(matrixWithAux.bounds.y, 0.26);
  assert.ok(matrixWithAux.bounds.x + matrixWithAux.bounds.width < matrixWithAuxModule1.bounds.x);

  const splitRegions = createCompareSplitRegions(matrixSpec.modules);
  assert.ok(splitRegions[0].bounds.height > splitRegions[2].bounds.height);
  assert.ok(splitRegions[1].bounds.x > splitRegions[0].bounds.x);

  const asymSpec = createSpec("hierarchy", 5);
  asymSpec.visualComposition.layoutVariant = "asymmetric-focus-stack";
  const asymLayout = createLayout(asymSpec, { uid });
  const asymRegions = createAsymmetricFocusStackRegions(asymSpec.modules);
  assert.strictEqual(asymLayout.layoutVariant, "asymmetric-focus-stack");
  assert.deepStrictEqual(
    asymLayout.regions.filter((region) => region.role === "module").map((region) => region.bounds),
    asymRegions.map((region) => region.bounds)
  );

  const mapSpec = createSpec("hierarchy", 6);
  mapSpec.visualMode = "map";
  mapSpec.title = "西湖手绘游览地图";
  mapSpec.visualComposition = {
    compositionType: "hand-drawn-map",
    layoutVariant: "map",
    visualFocus: "西湖水面与环湖地标",
    primaryModules: ["module_1", "module_2"],
    secondaryModules: ["module_3", "module_4", "module_5", "module_6"],
    densityStrategy: "用地理区域、路线、地标和自然风貌组织画面"
  };
  mapSpec.modules = mapSpec.modules.map((module, index) => ({
    ...module,
    regionKind: index === 0 ? "water" : index === 1 ? "route" : "landmark",
    regionPrompt: `完整地图语义区域 ${index + 1}`
  }));
  const mapLayout = createLayout(mapSpec, { uid });
  assert.strictEqual(getVisualMode(mapSpec), "map");
  assert.strictEqual(getLayoutVariant(mapSpec, "grid"), "map");
  assert.strictEqual(mapLayout.layoutVariant, "map");
  assert.deepStrictEqual(
    mapLayout.regions.filter((region) => region.role === "module").map((region) => region.bounds),
    createMapRegions(mapSpec.modules).map((region) => region.bounds)
  );
  const mapPrompt = buildStyleImagePrompt(mapSpec, mapLayout);
  assert.match(mapPrompt, /hand-drawn illustrated map/);
  assert.match(mapPrompt, /Target semantic regions/);
  assert.match(mapPrompt, /regionPrompt/);
  assert.match(mapPrompt, /Every semantic region/);
  assert.doesNotMatch(mapPrompt, /OCR-readable/);

  assert.throws(
    () => deriveHotspots(spec.modules, { regions: [] }),
    /缺少 module_1 的布局区域/
  );

  console.log("layout.test.js passed");
}

main();
