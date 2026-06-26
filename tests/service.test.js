"use strict";

const assert = require("assert");
const layoutModel = require("../src/layout");
const stateModel = require("../src/state");
const threadModel = require("../src/thread");
const {
  buildCompactThreadHistory,
  buildFollowupPrompt,
  clipContextText,
  clipContextTail,
  createAlignmentProvider,
  createAnswerStructureProvider,
  createChatImageService,
  createDefaultServices,
  filterGroundingScaffoldModules,
  createPersistence
} = require("../src/service");

function createUid() {
  const counters = {};
  return (prefix) => {
    counters[prefix] = (counters[prefix] || 0) + 1;
    return `${prefix}_${counters[prefix]}`;
  };
}

function createSpec() {
  return {
    title: "测试图",
    summary: "测试摘要",
    relationType: "grid",
    modules: [
      {
        id: "module_1",
        title: "目标",
        imageText: "识别目标",
        detail: "目标详情",
        sourceExcerpt: "目标片段",
        iconHint: "target"
      },
      {
        id: "module_2",
        title: "路径",
        imageText: "执行路径",
        detail: "路径详情",
        sourceExcerpt: "路径片段",
        iconHint: "step"
      },
      {
        id: "module_3",
        title: "风险",
        imageText: "控制风险",
        detail: "风险详情",
        sourceExcerpt: "风险片段",
        iconHint: "risk"
      }
    ]
  };
}

async function main() {
  testCreateDefaultServicesFallsBackToGlobalLayoutModel();
  await testCreateService();
  await testAnswerStructureProviderUsesOneTextCall();
  await testAnswerStructureProviderRepairsParseFailure();
  await testAnswerStructureProviderRepairsThinResult();
  await testFallbackAnswerStructureDoesNotLeakVisualPrompt();
  await testScaffoldModulesAreFilteredBeforeGrounding();
  await testAlignmentFailureFallsBackToPlannedLayout();
  await testStrictAlignmentFailureDoesNotFallBackToPlannedLayout();
  await testHitTestMatchesDomOrderWhenZIndexTies();
  await testAlignmentProviderUsesVisionEndpoint();
  await testAlignmentProviderRequiresImageDimensions();
  await testAlignmentPreflightBlocksMissingVision();
  await testFollowupService();
  await testPersistenceAdapter();
  testFollowupPrompt();
  testContextClipping();
  testCompactThreadHistory();
  console.log("service.test.js passed");
}

async function testAlignmentFailureFallsBackToPlannedLayout() {
  const uid = createUid();
  const saved = [];
  const spec = createSpec();
  const service = createChatImageService({
    uid,
    sleep: async () => {},
    state: stateModel.createChatImageState(),
    stateModel,
    threadModel,
    layoutModel,
    persistence: {
      async saveResult(result) {
        saved.push(result);
      },
      async saveThread() {}
    },
    answerStructureProvider: {
      async create() {
        return { rawAnswer: "raw", visualSpec: spec };
      }
    },
    llmProvider: {},
    structureProvider: {},
    layoutPlanner: {
      create(inputSpec) {
        return layoutModel.createLayout(inputSpec, { uid });
      }
    },
    imageProvider: {
      async generate(inputSpec, layout) {
        return {
          imageUrl: "data:image/png;base64,test",
          width: layout.canvas.width,
          height: layout.canvas.height,
          providerRaw: { ok: true },
          prompt: "prompt with 01",
          usedApi: true
        };
      }
    },
    alignmentProvider: {
      async align() {
        const error = new Error("Local OCR missing module_2");
        error.alignmentRaw = { provider: "local-ocr", warnings: ["missing module_2"] };
        throw error;
      }
    },
    followupProvider: {}
  });

  const result = await service.create("question", () => {});
  assert.strictEqual(saved.length, 1);
  assert.strictEqual(saved[0], result);
  assert.strictEqual(result.imageUrl, "data:image/png;base64,test");
  assert.strictEqual(result.hotspots.length, 3);
  assert.strictEqual(result.alignmentRaw.provider, "alignment-fallback");
  assert.strictEqual(result.alignmentRaw.fallback, "planned-layout");
  assert.match(result.alignmentRaw.error, /Local OCR missing module_2/);
  assert.deepStrictEqual(result.alignmentRaw.previous, { provider: "local-ocr", warnings: ["missing module_2"] });
  assert.strictEqual(result.alignmentRaw.hitTest.ok, true);
  assert.strictEqual(result.visualQualityRaw.provider, "limited-local");
  assert.deepStrictEqual(result.visualQualityWarnings, []);
}

async function testStrictAlignmentFailureDoesNotFallBackToPlannedLayout() {
  const uid = createUid();
  const spec = createSpec();
  const service = createChatImageService({
    uid,
    sleep: async () => {},
    state: stateModel.createChatImageState(),
    stateModel,
    threadModel,
    layoutModel,
    persistence: {
      async saveResult() {
        throw new Error("strict alignment failures must not be saved");
      },
      async saveThread() {}
    },
    answerStructureProvider: {
      async create() {
        return { rawAnswer: "raw", visualSpec: spec };
      }
    },
    llmProvider: {},
    structureProvider: {},
    layoutPlanner: {
      create(inputSpec) {
        return layoutModel.createLayout(inputSpec, { uid });
      }
    },
    imageProvider: {
      async generate(inputSpec, layout) {
        return {
          imageUrl: "data:image/png;base64,test",
          width: layout.canvas.width,
          height: layout.canvas.height,
          providerRaw: { ok: true },
          prompt: "prompt",
          usedApi: true
        };
      }
    },
    alignmentProvider: {
      async align() {
        const error = new Error("视觉对齐失败：module_1 未通过 SAM mask");
        error.statusCode = 422;
        throw error;
      }
    },
    followupProvider: {}
  });

  await assert.rejects(() => service.create("question", () => {}), /视觉对齐失败/);
}

async function testHitTestMatchesDomOrderWhenZIndexTies() {
  const uid = createUid();
  const spec = {
    title: "Overlap",
    summary: "Overlap audit",
    modules: [
      {
        id: "module_1",
        title: "Back card",
        imageText: "Back",
        detail: "Back detail",
        sourceExcerpt: "Back source",
        iconHint: "card"
      },
      {
        id: "module_2",
        title: "Front card",
        imageText: "Front",
        detail: "Front detail",
        sourceExcerpt: "Front source",
        iconHint: "card"
      }
    ]
  };
  const service = createChatImageService({
    uid,
    sleep: async () => {},
    state: stateModel.createChatImageState(),
    stateModel,
    threadModel,
    layoutModel: {
      applyTextBudgets(inputSpec) {
        return inputSpec;
      },
      getInteractiveModules(inputSpec) {
        return inputSpec.modules;
      },
      deriveHotspots() {
        return [
          {
            id: "module_1",
            label: "Back card",
            x: 0.1,
            y: 0.1,
            width: 0.4,
            height: 0.4,
            zIndex: 5
          },
          {
            id: "module_2",
            label: "Front card",
            x: 0.25,
            y: 0.25,
            width: 0.1,
            height: 0.1,
            zIndex: 5
          }
        ];
      }
    },
    persistence: {
      async saveResult() {},
      async saveThread() {}
    },
    answerStructureProvider: {
      async create() {
        return { rawAnswer: "raw", visualSpec: spec };
      }
    },
    llmProvider: {},
    structureProvider: {},
    layoutPlanner: {
      create() {
        return { canvas: { width: 1600, height: 900 }, regions: [] };
      }
    },
    imageProvider: {
      async generate() {
        return {
          imageUrl: "data:image/png;base64,test",
          width: 1600,
          height: 900,
          providerRaw: { ok: true },
          prompt: "prompt",
          usedApi: false
        };
      }
    },
    alignmentProvider: {
      async align({ layout }) {
        return { layout, alignmentRaw: { provider: "test" } };
      }
    },
    followupProvider: {}
  });

  const result = await service.create("question", () => {});
  assert.strictEqual(result.alignmentRaw.hitTest.ok, true);
  assert.deepStrictEqual(
    result.alignmentRaw.hitTest.modules.map((item) => [item.moduleId, item.ok, item.topModuleId]),
    [
      ["module_1", true, "module_1"],
      ["module_2", true, "module_2"]
    ]
  );
  assert.deepStrictEqual(result.visualQualityWarnings, []);
}

function testCreateDefaultServicesFallsBackToGlobalLayoutModel() {
  const services = createDefaultServices({
    uid: createUid(),
    sleep: async () => {},
    shouldUseApi: async () => false,
    apiPost: async () => ({}),
    apiGet: async () => ({}),
    apiPatch: async () => ({}),
    apiDelete: async () => ({}),
    providerConfig: { mode: "mock", endpoints: {} },
    structureModel: {},
    layoutModel: undefined,
    mockSvg: {},
    state: stateModel.createChatImageState(),
    stateModel,
    threadModel,
    getRuntimeConfig: async () => ({})
  });
  const layout = services.layoutPlanner.create(createSpec());
  assert.ok(layout && layout.canvas && layout.canvas.width > 0);
}

async function testFallbackAnswerStructureDoesNotLeakVisualPrompt() {
  const question =
    "画一张机场航站楼接驳指引图：值机柜台、安检、候机区、登机口、行李提取、地铁出租车接驳，需要每个区域都可以点击查看说明";
  const provider = createAnswerStructureProvider({
    shouldUseApi: async () => true,
    apiPost: async () => ({
      content: JSON.stringify({
        rawAnswer: "This answer is about an unrelated shopping app.",
        visualSpec: {
          title: "Shopping app",
          summary: "Unrelated topic",
          relationType: "hierarchy",
          modules: [
            { title: "Cart", imageText: "Cart", detail: "Cart detail" },
            { title: "Checkout", imageText: "Checkout", detail: "Checkout detail" },
            { title: "Payment", imageText: "Payment", detail: "Payment detail" }
          ]
        }
      })
    }),
    providerConfig: {
      mode: "api",
      endpoints: { textGeneration: "/api/llm" }
    },
    structureModel: require("../src/structure"),
    mockLlmProvider: {
      async answer() {
        throw new Error("mock should not be used");
      }
    },
    sleep: async () => {}
  });

  const result = await provider.create(question);
  assert.doesNotMatch(result.rawAnswer, /需要先给出直接回答/);
  assert.doesNotMatch(result.rawAnswer, /拆成若干可视化模块/);
  assert.match(result.rawAnswer, /值机柜台/);
  assert.match(result.rawAnswer, /行李提取/);

  const detailText = (result.visualSpec.modules || [])
    .map((module) => `${module.detail || ""}\n${module.sourceExcerpt || ""}`)
    .join("\n");
  assert.doesNotMatch(detailText, /需要先给出直接回答/);
  assert.doesNotMatch(detailText, /拆成若干可视化模块/);
  assert.doesNotMatch(detailText, /每个区域都可以点击查看说明/);
}

async function testScaffoldModulesAreFilteredBeforeGrounding() {
  const uid = createUid();
  const saved = [];
  const pollutedSpec = {
    title: "Fridge prep shelf",
    summary: "A visual fridge organization scene.",
    visualMode: "scene",
    relationType: "parallel",
    modules: [
      {
        id: "module_1",
        title: "Protein Boxes",
        imageText: "Protein",
        detail: "Cooked protein boxes.",
        regionKind: "object",
        regionPrompt: "clear meal prep protein boxes on the fridge shelf"
      },
      {
        id: "module_2",
        title: "Input context",
        imageText: "Prompt notes",
        detail: "Meta prompt explanation.",
        regionKind: "panel",
        regionPrompt: "input context panel"
      },
      {
        id: "module_3",
        title: "Sauce Jars",
        imageText: "Sauces",
        detail: "Small sauce jars.",
        regionKind: "object",
        regionPrompt: "small sauce jars in the fridge door"
      },
      {
        id: "module_4",
        title: "External tools",
        imageText: "Tools",
        detail: "External tools that are not visible.",
        regionKind: "panel",
        regionPrompt: "external tools panel"
      }
    ],
    auxiliaryModules: [
      {
        id: "aux_1",
        title: "Legend",
        imageText: "Legend",
        detail: "Explains the diagram.",
        regionKind: "legend",
        regionPrompt: "legend panel"
      }
    ]
  };
  const filtered = filterGroundingScaffoldModules(pollutedSpec, "Create a fridge meal prep scene");
  assert.deepStrictEqual(filtered.modules.map((module) => module.title), ["Protein Boxes", "Sauce Jars"]);
  assert.deepStrictEqual(filtered.auxiliaryModules, []);
  assert.strictEqual(filtered.groundingFilter.removed.length, 3);

  const coffeeSpec = {
    title: "Coffee shop",
    visualMode: "scene",
    modules: [
      { title: "Barista", regionPrompt: "barista behind the coffee counter", detail: "Barista role." },
      { title: "Espresso machine", regionPrompt: "large espresso machine on the bar", detail: "Machine role." },
      { title: "Pastry case", regionPrompt: "glass pastry case near the counter", detail: "Pastry role." },
      { title: "Window seating", regionPrompt: "window seating area", detail: "Seating role." },
      { title: "Entrance queue", regionPrompt: "entrance queue by the door", detail: "Queue role." },
      { title: "Create a h", regionPrompt: "create a h", detail: "Truncated prompt fragment." },
      { title: "-drawn neighborhood libr", regionPrompt: "drawn neighborhood library fragment", detail: "Truncated prompt fragment." }
    ]
  };
  const coffeeQuestion =
    "Create an isometric boutique coffee shop scene. Let users click the barista, espresso machine, pastry case, window seating, pickup shelf, and entrance queue.";
  const coffeeFiltered = filterGroundingScaffoldModules(coffeeSpec, coffeeQuestion);
  assert.deepStrictEqual(coffeeFiltered.modules.map((module) => module.title), [
    "Barista",
    "Espresso machine",
    "Pastry case",
    "Window seating",
    "Entrance queue"
  ]);
  assert.deepStrictEqual(
    coffeeFiltered.groundingFilter.removed.map((item) => item.title),
    ["Create a h", "-drawn neighborhood libr"]
  );

  const service = createChatImageService({
    uid,
    sleep: async () => {},
    state: stateModel.createChatImageState(),
    stateModel,
    threadModel,
    layoutModel,
    persistence: {
      async saveResult(result) {
        saved.push(result);
      },
      async saveThread() {}
    },
    answerStructureProvider: {
      async create() {
        return { rawAnswer: "raw", visualSpec: pollutedSpec };
      }
    },
    llmProvider: {},
    structureProvider: {},
    layoutPlanner: {
      create(inputSpec) {
        assert.deepStrictEqual(inputSpec.modules.map((module) => module.title), ["Protein Boxes", "Sauce Jars"]);
        assert.deepStrictEqual(inputSpec.auxiliaryModules, []);
        return layoutModel.createLayout(inputSpec, { uid });
      }
    },
    imageProvider: {
      async generate(inputSpec, layout) {
        assert.deepStrictEqual(inputSpec.modules.map((module) => module.title), ["Protein Boxes", "Sauce Jars"]);
        return {
          imageUrl: "data:image/png;base64,test",
          width: layout.canvas.width,
          height: layout.canvas.height,
          providerRaw: { ok: true },
          prompt: "prompt",
          usedApi: true
        };
      }
    },
    alignmentProvider: {
      async align({ spec, layout }) {
        assert.deepStrictEqual(spec.modules.map((module) => module.title), ["Protein Boxes", "Sauce Jars"]);
        return { layout, alignmentRaw: { provider: "test-align" } };
      }
    },
    followupProvider: {}
  });

  const result = await service.create("question", () => {});
  assert.strictEqual(result.hotspots.length, 2);
  assert.strictEqual(result.structuredSpec.groundingFilter.removed.length, 3);
  assert.match(result.alignmentRaw.qualityWarnings.join("\n"), /grounding_scaffold_filtered:3/);
  assert.strictEqual(saved[0], result);
}

async function testAnswerStructureProviderUsesOneTextCall() {
  const calls = [];
  const provider = createAnswerStructureProvider({
    shouldUseApi: async () => true,
    apiPost: async (url, body) => {
      calls.push({ url, body });
      return {
        content: JSON.stringify({
          rawAnswer:
            "ChatImage turns long text answers into clickable visual modules. It first answers the user question, then extracts a compact visual structure with title, summary, modules, details, and source context. The generated image keeps only concise visible text while the detail panel preserves richer explanations for follow-up questions.",
          visualSpec: {
            title: "Product value",
            summary: "Long answers become interactive visual modules.",
            relationType: "flow",
            visualComposition: {
              compositionType: "swimlane-flow",
              layoutVariant: "swimlane-flow",
              visualFocus: "Answer to visual workflow",
              primaryModules: ["module_1"],
              secondaryModules: ["module_2", "module_3"],
              densityStrategy: "Use compact steps and labels."
            },
            modules: [
              {
                title: "Input",
                imageText: "User asks",
                detail:
                  "The user starts with a question or file context, and the system keeps the original intent available for the generated answer and later regional follow-up.",
                sourceExcerpt: "The system first answers the user question.",
                iconHint: "idea"
              },
              {
                title: "Structure",
                imageText: "Split modules",
                detail:
                  "The answer is converted into visual modules with concise image text, richer click details, and source excerpts, so the image stays readable while the detail panel remains useful.",
                sourceExcerpt: "It extracts a compact visual structure with title, summary, modules, details, and source context.",
                iconHint: "nodes"
              },
              {
                title: "Follow-up",
                imageText: "Ask by area",
                detail:
                  "Each interactive region keeps its own context and history, allowing the user to continue from one module without mixing it with other module conversations.",
                sourceExcerpt: "The detail panel preserves richer explanations for follow-up questions.",
                iconHint: "thread"
              }
            ]
          }
        })
      };
    },
    providerConfig: {
      mode: "api",
      endpoints: {
        textGeneration: "/api/llm"
      }
    },
    structureModel: require("../src/structure"),
    mockLlmProvider: {
      async answer() {
        throw new Error("mock should not be used");
      }
    },
    sleep: async () => {}
  });

  const result = await provider.create("介绍 ChatImage");
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, "/api/llm");
  assert.strictEqual(calls[0].body.purpose, "answer_structure");
  assert.strictEqual(calls[0].body.responseFormat, "json");
  assert.match(calls[0].body.content, /rawAnswer/);
  assert.strictEqual(result.rawAnswer.includes("clickable visual modules"), true);
  assert.strictEqual(result.visualSpec.modules.length, 3);
  assert.strictEqual(result.visualSpec.modules[0].id, "module_1");
}

async function testAnswerStructureProviderRepairsParseFailure() {
  const calls = [];
  const repairedPayload = {
    rawAnswer: "HTTP rendering starts with URL parsing, then DNS, TCP and TLS setup, request routing, response parsing, HTML tokenization, CSS and JavaScript loading, layout, paint, and compositing. Each stage can add latency or block later rendering work, so diagnostics usually separate network, server, parser, style, layout, and paint costs.",
    visualSpec: {
      title: "HTTP render flow",
      summary: "Network, parsing, rendering, and compositing form the critical path.",
      relationType: "flow",
      visualComposition: {
        compositionType: "swimlane-flow",
        layoutVariant: "swimlane-flow",
        visualFocus: "Browser rendering pipeline",
        primaryModules: ["module_1", "module_3"],
        secondaryModules: ["module_2"],
        densityStrategy: "Use compact pipeline cards with stage chips."
      },
      modules: [
        {
          title: "URL and DNS",
          imageText: "Resolve host and target",
          detail: "The browser parses the URL, checks cache and security policy, then resolves the hostname through DNS. This determines the destination IP and can be skipped or shortened when DNS cache is warm.",
          sourceExcerpt: "URL parsing, then DNS",
          iconHint: "target"
        },
        {
          title: "Connection",
          imageText: "TCP and TLS prepare transport",
          detail: "TCP establishes transport and TLS negotiates encryption before the HTTP request can safely carry headers and body. Reused connections and modern protocols reduce this setup cost.",
          sourceExcerpt: "TCP and TLS setup",
          iconHint: "nodes"
        },
        {
          title: "Render pipeline",
          imageText: "Parse, layout, paint",
          detail: "After HTML arrives, the browser builds DOM and CSSOM, runs blocking scripts when needed, computes layout, paints visual layers, and composites them to the screen.",
          sourceExcerpt: "HTML tokenization, CSS and JavaScript loading, layout, paint, and compositing",
          iconHint: "layout"
        }
      ]
    }
  };
  const provider = createAnswerStructureProvider({
    shouldUseApi: async () => true,
    apiPost: async (url, body) => {
      calls.push({ url, body });
      if (body.purpose === "answer_structure_parse_repair") return { content: JSON.stringify(repairedPayload) };
      return { content: '{"rawAnswer":"broken "quote","visualSpec":{"title":"Broken","modules":[{"title":"A"}]}}' };
    },
    providerConfig: {
      mode: "api",
      endpoints: {
        textGeneration: "/api/llm"
      }
    },
    structureModel: require("../src/structure"),
    mockLlmProvider: {
      async answer() {
        throw new Error("mock should not be used");
      }
    },
    sleep: async () => {}
  });

  const result = await provider.create("Explain HTTP rendering");
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[1].body.purpose, "answer_structure_parse_repair");
  assert.strictEqual(result.visualSpec.title, "HTTP render flow");
  assert.strictEqual(result.visualSpec.modules.length, 3);
}

async function testAnswerStructureProviderRepairsThinResult() {
  const calls = [];
  const provider = createAnswerStructureProvider({
    shouldUseApi: async () => true,
    apiPost: async (url, body) => {
      calls.push({ url, body });
      if (body.purpose === "answer_structure_repair") {
        return {
          content: JSON.stringify({
            rawAnswer:
              "REST and GraphQL solve API design with different tradeoffs. REST models resources through URLs and HTTP methods, which keeps caching, status codes, and gateway behavior straightforward. GraphQL exposes a typed Schema and lets clients request exact fields, which reduces over-fetching but requires query complexity limits, resolver performance control, and explicit caching strategy. The better choice depends on interface stability, client diversity, and governance maturity.",
            visualSpec: {
              title: "REST vs GraphQL",
              summary: "Resource endpoints and typed query graphs optimize different API problems.",
              relationType: "compare",
              visualComposition: {
                compositionType: "matrix",
                layoutVariant: "compare-matrix",
                visualFocus: "Resource model versus query graph",
                primaryModules: ["module_1", "module_2"],
                secondaryModules: ["module_3", "module_4", "module_5"],
                densityStrategy: "Use a comparison matrix with compact technical chips."
              },
              modules: [
                {
                  title: "Resource model",
                  imageText: "REST uses URL resources",
                  detail: "REST organizes APIs around resource URLs and HTTP methods. This makes boundaries clear and lets infrastructure reuse HTTP status codes, cache headers, gateways, and CDN behavior with little extra protocol design.",
                  sourceExcerpt: "REST models resources through URLs and HTTP methods.",
                  iconHint: "nodes"
                },
                {
                  title: "Query shape",
                  imageText: "GraphQL selects fields",
                  detail: "GraphQL lets clients describe exact fields and nested relationships from one endpoint. That flexibility reduces over-fetching and endpoint sprawl, but it requires server-side limits for query depth, resolver cost, and permissions.",
                  sourceExcerpt: "GraphQL exposes a typed Schema and lets clients request exact fields.",
                  iconHint: "target"
                },
                {
                  title: "Caching",
                  imageText: "REST fits HTTP cache",
                  detail: "REST can use ETag, Cache-Control, status codes, and CDN caching directly. GraphQL often needs persisted queries, normalized client caches, field-level caches, or gateway policy to reach similar predictability.",
                  sourceExcerpt: "REST keeps caching straightforward, while GraphQL requires explicit caching strategy.",
                  iconHint: "step"
                },
                {
                  title: "Schema evolution",
                  imageText: "GraphQL governs types",
                  detail: "REST usually evolves through versioned endpoints or additive fields. GraphQL uses Schema types, field deprecation, and compatibility rules, which works well across many clients when schema governance is mature.",
                  sourceExcerpt: "GraphQL exposes a typed Schema.",
                  iconHint: "layout"
                },
                {
                  title: "Scenarios",
                  imageText: "Choose by client diversity",
                  detail: "REST is practical for stable resources, strong cache needs, and simple teams. GraphQL is stronger when many clients need different field combinations or when product views frequently combine several backend resources.",
                  sourceExcerpt: "The better choice depends on interface stability, client diversity, and governance maturity.",
                  iconHint: "idea"
                }
              ]
            }
          })
        };
      }
      return {
        content: JSON.stringify({
          rawAnswer: "REST 和 GraphQL 可以从背景、现状、驱动、挑战和趋势五个角度理解。",
          visualSpec: {
            title: "对比 REST 和 Graph...",
            summary: "可以从五个角度理解。",
            relationType: "compare",
            modules: [
              { title: "背景基础", imageText: "先看背景", detail: "背景。", sourceExcerpt: "REST", iconHint: "idea" },
              { title: "当前现状", imageText: "看现状", detail: "现状。", sourceExcerpt: "GraphQL", iconHint: "idea" },
              { title: "核心驱动", imageText: "看驱动", detail: "驱动。", sourceExcerpt: "cache", iconHint: "idea" }
            ]
          }
        })
      };
    },
    providerConfig: {
      mode: "api",
      endpoints: {
        textGeneration: "/api/llm"
      }
    },
    structureModel: require("../src/structure"),
    mockLlmProvider: {
      async answer() {
        throw new Error("mock should not be used");
      }
    },
    sleep: async () => {}
  });

  const result = await provider.create("Compare REST and GraphQL");
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[1].body.purpose, "answer_structure_repair");
  assert.strictEqual(result.visualSpec.title, "REST vs GraphQL");
  assert.strictEqual(result.visualSpec.visualComposition.layoutVariant, "compare-matrix");
  assert.match(result.rawAnswer, /typed Schema/);
  assert.strictEqual(result.visualSpec.qualityWarnings.length, 0);
}

async function testAlignmentPreflightBlocksMissingVision() {
  let imageCalls = 0;
  const service = createChatImageService({
    uid: createUid(),
    sleep: async () => {},
    state: stateModel.createChatImageState(),
    stateModel,
    threadModel,
    layoutModel,
    persistence: { async saveResult() {}, async saveThread() {} },
    llmProvider: { async answer() { return "raw"; } },
    structureProvider: { async parse() { return createSpec(); } },
    layoutPlanner: { create(inputSpec) { return layoutModel.createLayout(inputSpec, { uid: createUid() }); } },
    imageProvider: {
      async generate() {
        imageCalls += 1;
        return {};
      }
    },
    alignmentProvider: {
      async requireReadyForApiImage() {
        throw new Error("真实生图热点对齐需要配置 CHATIMAGE_VISION_ENDPOINT");
      },
      async align() {
        throw new Error("should not align");
      }
    },
    followupProvider: {}
  });

  await assert.rejects(() => service.create("问题", () => {}), /CHATIMAGE_VISION_ENDPOINT/);
  assert.strictEqual(imageCalls, 0);
}

async function testAlignmentProviderUsesVisionEndpoint() {
  const calls = [];
  const alignmentProvider = createAlignmentProvider({
    shouldUseApi: async () => true,
    apiPost: async (url, body) => {
      calls.push({ url, body });
      return {
        content: JSON.stringify({
          modules: [
            { moduleId: "module_1", label: "目标", bounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.3 }, confidence: 0.9 },
            { moduleId: "module_2", label: "路径", bounds: { x: 0.5, y: 0.2, width: 0.3, height: 0.3 }, confidence: 0.9 }
          ]
        })
      };
    },
    providerConfig: {
      endpoints: {
        visionAlignment: "/api/vision",
        textGeneration: "/api/llm"
      }
    },
    alignmentModel: require("../src/alignment"),
    sleep: async () => {}
  });
  const layout = {
    family: "grid",
    regions: [
      { id: "r1", role: "module", hotspotId: "module_1", bounds: { x: 0.12, y: 0.22, width: 0.2, height: 0.2 } },
      { id: "r2", role: "module", hotspotId: "module_2", bounds: { x: 0.52, y: 0.22, width: 0.2, height: 0.2 } }
    ]
  };
  const spec = {
    modules: [
      { id: "module_1", title: "目标", imageText: "识别目标" },
      { id: "module_2", title: "路径", imageText: "执行路径" }
    ]
  };
  const result = await alignmentProvider.align({
    image: { imageUrl: "https://cdn.example.com/a.png", width: 1600, height: 900, usedApi: true },
    spec,
    layout
  });

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, "/api/vision");
  assert.strictEqual(calls[0].body.imageUrl, "https://cdn.example.com/a.png");
  assert.strictEqual(calls[0].body.imageWidth, 1600);
  assert.strictEqual(calls[0].body.imageHeight, 900);
  assert.strictEqual(calls[0].body.purpose, "vision_align");
  assert.strictEqual(result.alignmentRaw.provider, "vision-api-align");
  assert.strictEqual(result.alignmentRaw.imageWidth, 1600);
  assert.strictEqual(result.alignmentRaw.imageHeight, 900);
  assert.strictEqual(result.alignmentRaw.moduleCount, 2);
  assert.strictEqual(result.layout.regions[0].bounds.x, 0.1);
}

async function testAlignmentProviderRequiresImageDimensions() {
  let calls = 0;
  const alignmentProvider = createAlignmentProvider({
    shouldUseApi: async () => true,
    apiPost: async () => {
      calls += 1;
      return {};
    },
    providerConfig: {
      endpoints: {
        visionAlignment: "/api/vision"
      }
    },
    alignmentModel: require("../src/alignment"),
    sleep: async () => {}
  });

  await assert.rejects(
    () =>
      alignmentProvider.align({
        image: { imageUrl: "https://cdn.example.com/a.png", width: undefined, height: 900, usedApi: true },
        spec: {
          modules: [
            { id: "module_1", title: "目标", imageText: "识别目标" }
          ]
        },
        layout: {
          family: "grid",
          regions: [
            { id: "r1", role: "module", hotspotId: "module_1", bounds: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 } }
          ]
        }
      }),
    /真实图片像素尺寸/
  );
  assert.strictEqual(calls, 0);
}

async function testCreateService() {
  const uid = createUid();
  const state = stateModel.createChatImageState();
  const spec = createSpec();
  const saved = [];
  const statuses = [];

  const service = createChatImageService({
    uid,
    sleep: async () => {},
    state,
    stateModel,
    threadModel,
    layoutModel,
    persistence: {
      async saveResult(result) {
        saved.push(result);
      },
      async saveThread() {}
    },
    llmProvider: {
      async answer(question) {
        return `raw:${question}`;
      }
    },
    structureProvider: {
      async parse(question, rawAnswer) {
        assert.strictEqual(question, "问题");
        assert.strictEqual(rawAnswer, "raw:问题");
        return spec;
      }
    },
    layoutPlanner: {
      create(inputSpec) {
        return layoutModel.createLayout(inputSpec, { uid });
      }
    },
    imageProvider: {
      async generate(inputSpec, layout) {
        assert.strictEqual(inputSpec.title, "测试图");
        assert.ok(inputSpec.modules[0].textBudget);
        return {
          imageUrl: "data:image/svg+xml,test",
          width: layout.canvas.width,
          height: layout.canvas.height,
          providerRaw: { provider: "test" },
          prompt: "exact prompt",
          usedApi: true
        };
      }
    },
    alignmentProvider: {
      async align({ image, layout }) {
        assert.strictEqual(image.usedApi, true);
        return {
          layout: {
            ...layout,
            regions: layout.regions.map((region) =>
              region.hotspotId === "module_1"
                ? { ...region, bounds: { x: 0.2, y: 0.3, width: 0.3, height: 0.3 }, alignedBy: "vision" }
                : region
            )
          },
          alignmentRaw: { provider: "test-align" }
        };
      }
    },
    followupProvider: {
      async ask() {
        return "unused";
      }
    }
  });

  const result = await service.create("问题", (status) => statuses.push(status));
  assert.deepStrictEqual(statuses, ["answering", "structuring", "layout", "image", "align"]);
  assert.strictEqual(result.id, "ci_1");
  assert.strictEqual(result.rawAnswer, "raw:问题");
  assert.strictEqual(result.structuredSpec.title, "测试图");
  assert.strictEqual(result.structuredSpec.modules[0].textBudget, result.hotspots[0].textBudget);
  assert.strictEqual(result.hotspots.length, 3);
  assert.ok(result.hotspots[0].x < 0.2);
  assert.ok(result.hotspots[0].width > 0.3);
  assert.ok(Math.abs(result.hotspots[0].x + result.hotspots[0].width / 2 - 0.35) < 1e-9);
  assert.strictEqual(result.hotspots[0].alignmentSource, "vision");
  assert.strictEqual(result.imageWidth, 1600);
  assert.strictEqual(result.imagePrompt, "exact prompt");
  assert.strictEqual(result.alignmentRaw.provider, "test-align");
  assert.strictEqual(saved[0], result);
}

async function testFollowupService() {
  const uid = createUid();
  const state = stateModel.createChatImageState();
  const savedThreads = [];
  const result = {
    id: "ci_1",
    question: "原始问题",
    rawAnswer: "原始回答",
    title: "测试图",
    summary: "测试摘要",
    hotspots: [
      {
        id: "module_1",
        label: "目标",
        shortText: "识别目标",
        detail: "目标详情",
        sourceExcerpt: "目标片段"
      },
      {
        id: "module_2",
        label: "路径",
        shortText: "执行路径",
        detail: "路径详情",
        sourceExcerpt: "路径片段"
      }
    ]
  };
  stateModel.setResult(state, result);

  const service = createChatImageService({
    uid,
    sleep: async () => {},
    state,
    stateModel,
    threadModel,
    layoutModel,
    persistence: {
      async saveResult() {},
      async saveThread(chatImageId, hotspotId, thread) {
        savedThreads.push({ chatImageId, hotspotId, thread });
      }
    },
    llmProvider: {},
    structureProvider: {
      async parse(question, rawAnswer) {
        assert.match(question, /module_1|目标/);
        assert.strictEqual(rawAnswer, "追问回答");
        return createSpec();
      }
    },
    layoutPlanner: {
      create(spec) {
        return layoutModel.createLayout(spec, { uid });
      }
    },
    imageProvider: {
      async generate(spec, layout) {
        assert.strictEqual(spec.modules.length, 3);
        return {
          imageUrl: "data:image/svg+xml,followup",
          width: layout.canvas.width,
          height: layout.canvas.height,
          providerRaw: { provider: "test-followup" },
          prompt: "followup prompt"
        };
      }
    },
    alignmentProvider: {},
    followupProvider: {
      async ask(context) {
        assert.strictEqual(context.currentHotspot.label, "目标");
        assert.strictEqual(context.rawAnswer, "原始回答");
        assert.deepStrictEqual(context.siblingHotspots, [
          { id: "module_2", label: "路径", shortText: "执行路径" }
        ]);
        assert.strictEqual(context.threadMessages.length, 0);
        return "追问回答";
      }
    }
  });

  const thread = await service.followup(result, "module_1", "为什么重要？");
  assert.strictEqual(thread.id, "thread_1");
  assert.strictEqual(thread.messages.length, 2);
  assert.strictEqual(thread.messages[0].content, "为什么重要？");
  const artifact = threadModel.parseFollowupArtifact(thread.messages[1].content);
  assert.ok(artifact);
  assert.strictEqual(artifact.rawAnswer, "追问回答");
  assert.strictEqual(artifact.imageUrl, "data:image/svg+xml,followup");
  assert.strictEqual(artifact.interactive, false);
  assert.deepStrictEqual(artifact.hotspots, []);
  assert.strictEqual(artifact.imagePrompt, "followup prompt");
  assert.strictEqual(stateModel.getThread(state, "module_1"), thread);
  assert.strictEqual(state.result.threads.length, 1);
  assert.strictEqual(state.result.threads[0], thread);
  assert.strictEqual(savedThreads[0].chatImageId, "ci_1");
  assert.strictEqual(savedThreads[0].hotspotId, "module_1");

  await assert.rejects(
    () => service.followup(result, "missing", "问题"),
    /hotspot 不存在/
  );
}

async function testPersistenceAdapter() {
  const calls = [];
  const providerConfig = {
    endpoints: {
      chatImages: "/api/chatimages"
    }
  };
  const persistence = createPersistence({
    shouldUseApi: async () => true,
    apiPost: async (url, body) => calls.push({ method: "post", url, body }),
    apiPatch: async (url, body) => {
      calls.push({ method: "patch", url, body });
      return { item: { id: "ci 1", title: body.title || "Pinned" } };
    },
    apiDelete: async (url) => {
      calls.push({ method: "delete", url });
      return { deleted: true };
    },
    apiGet: async (url) => {
      calls.push({ method: "get", url });
      if (url.endsWith("/ci%201")) return { result: { id: "ci 1" } };
      return { items: [{ id: "ci_1" }] };
    },
    providerConfig
  });

  await persistence.saveResult({ id: "ci_1" });
  await persistence.saveThread("ci 1", "module/1", { id: "thread_1" });
  const history = await persistence.loadHistory();
  const restored = await persistence.loadResult("ci 1");
  const renamed = await persistence.updateHistoryItem("ci 1", { title: "Renamed" });
  const deleted = await persistence.deleteHistoryItem("ci 1");
  assert.deepStrictEqual(history, [{ id: "ci_1" }]);
  assert.deepStrictEqual(restored, { id: "ci 1" });
  assert.deepStrictEqual(renamed, { id: "ci 1", title: "Renamed" });
  assert.strictEqual(deleted, true);
  assert.strictEqual(calls[0].url, "/api/chatimages");
  assert.strictEqual(calls[1].url, "/api/chatimages/ci%201/hotspots/module%2F1/messages");
  assert.strictEqual(calls[2].url, "/api/chatimages");
  assert.strictEqual(calls[3].url, "/api/chatimages/ci%201");
  assert.strictEqual(calls[4].url, "/api/chatimages/ci%201");
  assert.strictEqual(calls[4].method, "patch");
  assert.strictEqual(calls[5].url, "/api/chatimages/ci%201");
  assert.strictEqual(calls[5].method, "delete");

  const mockPersistence = createPersistence({
    shouldUseApi: async () => false,
    apiPost: async () => {
      throw new Error("should not post");
    },
    apiPatch: async () => {
      throw new Error("should not patch");
    },
    apiDelete: async () => {
      throw new Error("should not delete");
    },
    apiGet: async () => {
      throw new Error("should not get");
    },
    providerConfig
  });
  await mockPersistence.saveResult({ id: "ci_2" });
  await mockPersistence.saveThread("ci_2", "module_1", { id: "thread_2" });
  assert.deepStrictEqual(await mockPersistence.loadHistory(), []);
  assert.strictEqual(await mockPersistence.loadResult("ci_2"), null);
  assert.strictEqual(await mockPersistence.updateHistoryItem("ci_2", { title: "x" }), null);
  assert.strictEqual(await mockPersistence.deleteHistoryItem("ci_2"), false);
}

function testFollowupPrompt() {
  const prompt = buildFollowupPrompt({
    originalQuestion: "原始问题",
    rawAnswer: "原始回答",
    chatImageTitle: "标题",
    chatImageSummary: "摘要",
    currentHotspot: {
      label: "目标",
      shortText: "识别目标",
      detail: "目标详情",
      sourceExcerpt: "目标片段"
    },
    siblingHotspots: [{ id: "module_2", label: "路径", shortText: "执行路径" }],
    threadMessages: [{ role: "user", content: "旧问题" }],
    userQuestion: "新问题"
  });
  assert.match(prompt, /当前热点：目标/);
  assert.match(prompt, /原始回答：原始回答/);
  assert.match(prompt, /其他热点概览：\n- 路径: 执行路径/);
  assert.match(prompt, /当前热点对话历史：\nuser: 旧问题/);
  assert.match(prompt, /用户追问：新问题/);
}

function testContextClipping() {
  const clipped = clipContextText("x".repeat(2300), 120);
  assert.ok(clipped.length <= 120);
  assert.match(clipped, /已截断/);
  assert.strictEqual(clipContextText("短文本", 120), "短文本");

  const tailClipped = clipContextTail(`开头${"x".repeat(200)}结尾`, 80);
  assert.ok(tailClipped.length <= 80);
  assert.match(tailClipped, /已截断早期历史/);
  assert.match(tailClipped, /结尾$/);
}

function testCompactThreadHistory() {
  const messages = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 ? "assistant" : "user",
    content: `第 ${index + 1} 条消息 ${"x".repeat(180)}`
  }));
  const history = buildCompactThreadHistory(messages, {
    recentLimit: 4,
    perMessageMaxChars: 60,
    totalMaxChars: 260
  });
  assert.ok(history.length <= 260);
  assert.match(history, /已省略 8 条更早消息/);
  assert.doesNotMatch(history, /第 1 条消息/);
  assert.match(history, /第 12 条消息/);
  assert.match(history, /已截断/);

  assert.strictEqual(buildCompactThreadHistory([], { totalMaxChars: 100 }), "");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
