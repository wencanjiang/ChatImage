"use strict";

const assert = require("assert");
const {
  applyTextBudgets,
  buildApiImagePrompt,
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

function sanitizeForTest(value) {
  return truncateVisibleText(value, 999);
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
  assert.strictEqual(hotspots[0].clickShape, "rect");
  assert.strictEqual(hotspots[0].maskUsableForClick, false);

  const maskClickLayout = {
    regions: [
      {
        hotspotId: "module_1",
        bounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        mask: {
          bounds: { x: 0.18, y: 0.28, width: 0.04, height: 0.05 },
          polygon: [
            { x: 0.18, y: 0.28 },
            { x: 0.22, y: 0.28 },
            { x: 0.22, y: 0.33 }
          ]
        }
      }
    ]
  };
  const maskClickHotspot = deriveHotspots([spec.modules[0]], maskClickLayout)[0];
  assert.strictEqual(maskClickHotspot.x, 0.1);
  assert.strictEqual(maskClickHotspot.y, 0.2);
  assert.strictEqual(maskClickHotspot.width, 0.3);
  assert.strictEqual(maskClickHotspot.height, 0.4);
  assert.strictEqual(maskClickHotspot.clickShape, "rect");

  const alignedCardHotspot = deriveHotspots([spec.modules[0]], {
    regions: [
      {
        hotspotId: "module_1",
        bounds: { x: 0.42, y: 0.42, width: 0.2, height: 0.18 },
        alignedBy: "locateanything"
      }
    ]
  })[0];
  assert.strictEqual(alignedCardHotspot.alignmentSource, "locateanything");
  assert.ok(alignedCardHotspot.width > 0.2);
  assert.ok(alignedCardHotspot.height > 0.18);
  assert.ok(alignedCardHotspot.clickDiagnostics.includes("expanded_visual_module_bounds"));

  const overlappingHotspots = deriveHotspots(spec.modules.slice(0, 2), {
    regions: [
      { hotspotId: "module_1", bounds: { x: 0.1, y: 0.1, width: 0.16, height: 0.14 }, zIndex: 2 },
      { hotspotId: "module_2", bounds: { x: 0.1, y: 0.1, width: 0.42, height: 0.34 }, zIndex: 3 }
    ]
  });
  assert.ok(overlappingHotspots[0].zIndex > overlappingHotspots[1].zIndex);
  assert.ok(overlappingHotspots[0].clickDiagnostics.some((item) => /center_was_covered_by:module_2/.test(item)));

  const backgroundHotspots = deriveHotspots(
    [
      { id: "module_bg", title: "Space background", imageText: "Hall", detail: "Full background", regionKind: "background", maskPolicy: "full-region" },
      { id: "module_obj", title: "Guide robot", imageText: "Robot", detail: "Foreground object", regionKind: "object-with-label", maskPolicy: "subject-with-label" }
    ],
    {
      regions: [
        { hotspotId: "module_bg", bounds: { x: 0.035, y: 0.035, width: 0.93, height: 0.93 }, zIndex: 1 },
        { hotspotId: "module_obj", bounds: { x: 0.35, y: 0.35, width: 0.2, height: 0.24 }, zIndex: 9 }
      ]
    }
  );
  assert.ok(backgroundHotspots[0].zIndex < backgroundHotspots[1].zIndex);
  assert.ok(!backgroundHotspots[0].clickDiagnostics.some((item) => /center_was_covered_by/.test(item)));

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
  const apiPrompt = buildApiImagePrompt(spec, layout);
  assert.match(apiPrompt, /Create a polished Chinese interactive infographic/);
  assert.match(apiPrompt, /01 模块1/);
  assert.ok(apiPrompt.length < stylePrompt.length * 0.55, `API prompt should be compact: ${apiPrompt.length}/${stylePrompt.length}`);
  assert.doesNotMatch(apiPrompt, /detailContext/);

  const oauthSpec = {
    language: "zh-CN",
    title: "OAuth 2.0 \u6388\u6743\u7801\u6d41\u7a0b",
    summary: "\u6388\u6743\u7801\u6362 token \u5e76\u4f7f\u7528 access token",
    relationType: "flow",
    visualComposition: {
      layoutVariant: "swimlane-flow",
      visualFocus: "OAuth 2.0 \u6388\u6743\u670d\u52a1\u5668\u4e0e\u6388\u6743\u7801"
    },
    modules: [
      { id: "module_1", title: "\u6388\u6743\u8bf7\u6c42", imageText: "\u6388\u6743\u670d\u52a1\u5668", detail: "d" },
      { id: "module_2", title: "\u6388\u6743\u7801\u4ea4\u6362", imageText: "code \u6362 token", detail: "d" }
    ]
  };
  const oauthLayout = createLayout(oauthSpec, { uid });
  const oauthApiPrompt = buildApiImagePrompt(oauthSpec, oauthLayout);
  assert.doesNotMatch(oauthApiPrompt, /OAuth|oauth|\u6388\u6743\u7801|\btoken\b|access token|client_id|redirect_uri|PKCE|\bcode\b|\btok\b/i);
  assert.match(oauthApiPrompt, /\u767b\u5f55\u534f\u4f5c\u6d41\u7a0b\u56fe/);
  assert.match(oauthApiPrompt, /\u8ba4\u8bc1\u670d\u52a1/);
  assert.match(oauthApiPrompt, /\u4e34\u65f6\u51ed\u8bc1/);

  const tokenButNotAuthSpec = {
    language: "zh-CN",
    title: "\u96c6\u7fa4\u914d\u7f6e\u5173\u7cfb",
    summary: "Secret \u53ef\u80fd\u5305\u542b token\uff0c\u4f46\u8fd9\u91cc\u8981\u753b\u7684\u662f\u914d\u7f6e\u5173\u7cfb\u3002",
    relationType: "flow",
    visualComposition: { layoutVariant: "swimlane-flow", visualFocus: "secret value flow" },
    modules: [
      { id: "module_1", title: "Secret", imageText: "masked value", detail: "d" },
      { id: "module_2", title: "Secret", imageText: "token \u914d\u7f6e", detail: "d" }
    ]
  };
  const tokenButNotAuthLayout = createLayout(tokenButNotAuthSpec, { uid });
  const tokenButNotAuthPrompt = buildApiImagePrompt(tokenButNotAuthSpec, tokenButNotAuthLayout);
  assert.doesNotMatch(tokenButNotAuthPrompt, /\u767b\u5f55\u534f\u4f5c\u6d41\u7a0b\u56fe/);
  assert.match(tokenButNotAuthPrompt, /Secret/);

  const kubernetesApiSpec = {
    language: "zh-CN",
    title: "Kubernetes \u90e8\u7f72\u67b6\u6784",
    summary: "\u5305\u542b Deployment\u3001ReplicaSet\u3001Pod\u3001Service\u3001Ingress\u3001ConfigMap\u3001Secret \u548c HPA",
    relationType: "flow",
    visualComposition: { layoutVariant: "asymmetric-focus-stack", visualFocus: "Kubernetes" },
    modules: [{ id: "module_1", title: "Deployment", imageText: "Pod", detail: "d" }]
  };
  const kubernetesApiLayout = createLayout(kubernetesApiSpec, { uid });
  const kubernetesApiPrompt = buildApiImagePrompt(kubernetesApiSpec, kubernetesApiLayout);
  assert.match(kubernetesApiPrompt, /\u7cfb\u7edf\u7ec4\u4ef6\u5173\u7cfb\u56fe/);
  assert.doesNotMatch(kubernetesApiPrompt, /Kubernetes|Deployment|ReplicaSet|Ingress|ConfigMap|HPA/i);

  const apiMapSpec = {
    language: "zh-CN",
    title: "\u5927\u5b66\u6821\u56ed\u624b\u7ed8\u5bfc\u89c8\u5730\u56fe",
    summary: "\u7528\u5730\u56fe\u5448\u73b0\u56fe\u4e66\u9986\u548c\u6e56\u8fb9\u5c0f\u8def",
    relationType: "hierarchy",
    visualMode: "map",
    visualComposition: { layoutVariant: "map", visualFocus: "\u6821\u56ed\u5730\u56fe\u533a\u57df" },
    modules: [
      {
        id: "module_1",
        title: "\u56fe\u4e66\u9986",
        imageText: "\u56fe\u4e66\u9986",
        regionPrompt: "\u56fe\u4e66\u9986\u5728\u5730\u56fe\u4e0a\u7684\u5b8c\u6574\u533a\u57df",
        visualEvidence: ["\u5730\u56fe\u533a\u57df"],
        detail: "d"
      }
    ]
  };
  const apiMapLayout = createLayout(apiMapSpec, { uid });
  const mapApiPrompt = buildApiImagePrompt(apiMapSpec, apiMapLayout);
  assert.doesNotMatch(mapApiPrompt, /\u5730\u56fe|\bmap\b/i);
  assert.match(mapApiPrompt, /\u5bfc\u89c8\u63d2\u753b|guide illustration/);

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

  const flowStripAuxSpec = createSpec("flow", 5);
  flowStripAuxSpec.visualComposition.layoutVariant = "swimlane-flow";
  flowStripAuxSpec.auxiliaryModules = [
    {
      id: "aux_1",
      title: "Resource collaboration workflow",
      imageText: "Deployment -> ReplicaSet -> Pod -> Service -> Ingress",
      detail: "Complete end-to-end resource flow across controller and networking resources.",
      regionKind: "flow-strip",
      maskPolicy: "full-region"
    }
  ];
  const flowStripLayout = createLayout(flowStripAuxSpec, { uid });
  const flowStripRegion = flowStripLayout.regions.find((region) => region.hotspotId === "aux_1");
  assert.ok(flowStripRegion.bounds.width >= 0.84);
  assert.ok(flowStripRegion.bounds.height >= 0.12);
  const smallFlowStripHotspot = deriveHotspots(
    [flowStripAuxSpec.auxiliaryModules[0]],
    {
      regions: [
        {
          hotspotId: "aux_1",
          bounds: { x: 0.06, y: 0.22, width: 0.25, height: 0.12 },
          alignedBy: "planned"
        }
      ]
    }
  )[0];
  assert.ok(smallFlowStripHotspot.width >= 0.72);
  assert.ok(smallFlowStripHotspot.clickDiagnostics.includes("expanded_flow_strip_bounds"));

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
  assert.strictEqual(visualSpec.modules[0].title, sanitizeForTest(longSpec.modules[0].title));
  assert.ok(visualSpec.modules[0].imageTitle.length <= visualSpec.modules[0].textBudget.titleMaxChars);
  assert.ok(visualSpec.modules[0].imageText.length <= visualSpec.modules[0].textBudget.imageTextMaxChars);
  assert.strictEqual(visualSpec.modules[1].title, "Perception");
  assert.strictEqual(visualSpec.modules[1].imageTitle, "Perception");
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
  const asymModule2 = asymLayout.regions.find((region) => region.hotspotId === "module_2");
  const asymModule3 = asymLayout.regions.find((region) => region.hotspotId === "module_3");
  assert.ok(asymModule2.bounds.x < asymModule3.bounds.x);
  assert.ok(asymModule2.bounds.height > asymModule3.bounds.height);
  assert.ok(asymModule3.bounds.x >= 0.65);

  const mapSpec = createSpec("hierarchy", 9);
  mapSpec.visualMode = "map";
  mapSpec.title = "西湖手绘游览地图";
  mapSpec.visualComposition = {
    compositionType: "hand-drawn-map",
    layoutVariant: "map",
    visualFocus: "西湖水面与环湖地标",
    primaryModules: ["module_1", "module_2", "module_3", "module_4"],
    secondaryModules: ["module_5", "module_6", "module_7", "module_8", "module_9"],
    densityStrategy: "用地理区域、路线、地标和自然风貌组织画面"
  };
  const westLakeTargets = [
    ["西湖水域", "water", "西湖中央大面积湖水区域"],
    ["白堤断桥", "route", "西湖北侧的白堤和断桥"],
    ["苏堤春晓", "route", "纵贯西湖的苏堤路线"],
    ["三潭印月", "landmark", "西湖湖心附近的三潭印月小岛和石塔"],
    ["雷峰塔", "building", "西湖南岸的雷峰塔"],
    ["孤山", "landmark", "西湖北侧孤山山岛区域"],
    ["宝石山", "mountain", "西湖北岸宝石山和保俶塔"],
    ["曲院风荷", "landmark", "西湖西北侧曲院风荷荷塘区域"],
    ["柳浪闻莺", "landmark", "西湖南岸柳浪闻莺园林区域"]
  ];
  mapSpec.modules = mapSpec.modules.map((module, index) => ({
    ...module,
    title: westLakeTargets[index][0],
    imageText: westLakeTargets[index][0],
    regionKind: westLakeTargets[index][1],
    regionPrompt: westLakeTargets[index][2]
  }));
  const mapLayout = createLayout(mapSpec, { uid });
  assert.strictEqual(getVisualMode(mapSpec), "map");
  assert.strictEqual(getLayoutVariant(mapSpec, "grid"), "map");
  assert.strictEqual(mapLayout.layoutVariant, "map");
  assert.strictEqual(mapLayout.regions.filter((region) => region.role === "module").length, 9);
  assert.deepStrictEqual(
    mapLayout.regions.filter((region) => region.role === "module").map((region) => region.bounds),
    createMapRegions(mapSpec.modules).map((region) => region.bounds)
  );
  const westLakeRegions = createMapRegions(mapSpec.modules);
  assert.ok(westLakeRegions.find((region) => region.hotspotId === "module_6").bounds.x < 0.2);
  assert.ok(westLakeRegions.find((region) => region.hotspotId === "module_7").bounds.x > 0.65);
  assert.ok(westLakeRegions.find((region) => region.hotspotId === "module_8").bounds.x < 0.1);
  assert.ok(westLakeRegions.find((region) => region.hotspotId === "module_9").bounds.x > 0.6);
  const mapPrompt = buildStyleImagePrompt(mapSpec, mapLayout);
  assert.match(mapPrompt, /hand-drawn illustrated map/);
  assert.match(mapPrompt, /Target semantic regions/);
  assert.match(mapPrompt, /regionPrompt/);
  assert.match(mapPrompt, /visualEvidence/);
  assert.match(mapPrompt, /maskPolicy/);
  assert.match(mapPrompt, /locatorQueries/);
  assert.match(mapPrompt, /Treat visualEvidence as acceptance criteria/);
  assert.match(mapPrompt, /Every semantic region/);
  assert.match(mapPrompt, /Lodging\/hotel\/accommodation/);
  assert.match(mapPrompt, /Transport\/cableway\/station/);
  assert.match(mapPrompt, /easy to segment later/);
  assert.match(mapPrompt, /visible label must include the target title/);
  assert.doesNotMatch(mapPrompt, /OCR-readable/);

  const subjectLabelSpec = createSpec("hierarchy", 3);
  subjectLabelSpec.visualMode = "map";
  subjectLabelSpec.modules[0] = {
    ...subjectLabelSpec.modules[0],
    title: "Three Pools",
    imageText: "Lake core",
    regionKind: "building",
    maskPolicy: "subject-with-label",
    regionPrompt: "three stone pagodas and attached label"
  };
  const subjectLabelPrompt = buildStyleImagePrompt(subjectLabelSpec, createLayout(subjectLabelSpec, { uid }));
  assert.match(subjectLabelPrompt, /"visibleLabel": "Three Pools\\nLake core"/);

  const routeLabelSpec = createSpec("hierarchy", 3);
  routeLabelSpec.visualMode = "map";
  routeLabelSpec.modules[0] = {
    ...routeLabelSpec.modules[0],
    title: "Sunshine Coast Trail",
    imageText: "east ridge route",
    regionKind: "route",
    maskPolicy: "route",
    regionPrompt: "east-side mountain trail route"
  };
  const routeLabelPrompt = buildStyleImagePrompt(routeLabelSpec, createLayout(routeLabelSpec, { uid }));
  assert.match(routeLabelPrompt, /"visibleLabel": "Sunshine Coast Trail\\neast ridge route"/);

  const sceneSpec = createSpec("hierarchy", 4);
  sceneSpec.visualMode = "scene";
  sceneSpec.visualComposition = {
    compositionType: "illustrated-scene",
    layoutVariant: "scene",
    visualFocus: "guide robot",
    primaryModules: ["module_1"],
    secondaryModules: ["module_2", "module_3", "module_4"],
    densityStrategy: "objects, people, and space"
  };
  const sceneLayout = createLayout(sceneSpec, { uid });
  assert.strictEqual(getVisualMode(sceneSpec), "scene");
  assert.strictEqual(getLayoutVariant(sceneSpec, "grid"), "scene");
  assert.strictEqual(sceneLayout.visualMode, "scene");
  assert.strictEqual(sceneLayout.layoutVariant, "scene");
  const scenePrompt = buildStyleImagePrompt(sceneSpec, sceneLayout);
  assert.match(scenePrompt, /painterly illustrated scene/);
  assert.match(scenePrompt, /Mode: scene/);
  assert.doesNotMatch(scenePrompt, /OCR-readable/);

  const sanqingMapSpec = {
    ...mapSpec,
    modules: [
      { id: "module_1", title: "南清园核心景区", imageText: "奇峰集中", detail: "核心景区", regionKind: "landmark", regionPrompt: "中心奇峰景区" },
      { id: "module_2", title: "西海岸栈道", imageText: "西侧云海", detail: "西侧栈道", regionKind: "route", regionPrompt: "山体西侧的西海岸栈道" },
      { id: "module_3", title: "阳光海岸栈道", imageText: "东侧林线", detail: "东侧栈道，与西海岸形成对照", regionKind: "route", regionPrompt: "山体东侧的阳光海岸栈道", spatialHint: "east" },
      { id: "module_4", title: "交通索道入口", imageText: "索道入口", detail: "交通索道", regionKind: "legend", regionPrompt: "索道、车站和入口图例" },
      { id: "module_5", title: "山上住宿点", imageText: "住宿标记", detail: "山上住宿", regionKind: "legend", regionPrompt: "住宿、宾馆和房屋图标" }
    ]
  };
  const sanqingRegions = createMapRegions(sanqingMapSpec.modules);
  const westRoute = sanqingRegions.find((region) => region.hotspotId === "module_2");
  const eastRoute = sanqingRegions.find((region) => region.hotspotId === "module_3");
  const transport = sanqingRegions.find((region) => region.hotspotId === "module_4");
  const lodging = sanqingRegions.find((region) => region.hotspotId === "module_5");
  assert.ok(westRoute.bounds.x < 0.2);
  assert.ok(eastRoute.bounds.x > 0.6);
  assert.ok(transport.bounds.y >= 0.7);
  assert.ok(lodging.bounds.y >= 0.7);
  assert.ok(lodging.bounds.x > transport.bounds.x);

  assert.throws(
    () => deriveHotspots(spec.modules, { regions: [] }),
    /缺少 module_1 的布局区域/
  );

  console.log("layout.test.js passed");
}

main();
