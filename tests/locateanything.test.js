"use strict";

const assert = require("assert");
const http = require("http");
const path = require("path");
const { createServer } = require("../server");
const { createHealthFixtureDataUrl } = require("../server/local-ocr");
const {
  buildSemanticHint,
  normalizeLocateAnythingOutput,
  normalizeModules,
  runLocateAnythingAlignment,
  runLocateAnythingAlignmentWithFallback,
  runLocateAnythingPreload
} = require("../server/locateanything");

async function main() {
  await testLicenseAckRequired();
  await testFakeLocateAnythingPreload();
  await testFakeLocateAnythingSuccess();
  await testLocatedBoundsAreSlightlyExpanded();
  await testRouteBoundsExpandPerpendicularForSegmentation();
  await testMimoVisionFallbackFillsMissingModule();
  await testMimoVisionReplacesLayoutGuidedModule();
  await testGoodSceneLocateCandidateSkipsMimoVisionOverride();
  await testTinySceneSubjectCandidateUsesMimoVisionOverride();
  await testMapLegendFarFromPlanFallsBackToPlanned();
  await testTinyInfographicCardFallsBackToPlanned();
  await testPlannedFallbackForMissingModule();
  await testLowConfidenceLocalOcrFallsBackToPlanned();
  await testInvalidBoundsReject();
  await testVisionRoutesExposeLocateAnything();
  testSemanticHintUsesPrimaryChineseLabels();
  testInfographicCardSemanticHintIgnoresSensorWords();
  testNormalizeRejectsBadConfidence();
  testNormalizePreservesCropStrategy();
  testNormalizePreservesObjectComponents();
  testNormalizeModulesPreservesTargetContract();
  console.log("locateanything.test.js passed");
}

async function testLowConfidenceLocalOcrFallsBackToPlanned() {
  await withEnv("CHATIMAGE_FAKE_LOCATE_MODE", "no-box", async () => {
    await withEnv("CHATIMAGE_FAKE_OCR_MODE", "low-confidence", async () => {
      const parsed = await runLocateAnythingAlignmentWithFallback(
        createConfig(),
        {
          imageUrl: createHealthFixtureDataUrl(),
          imageWidth: 640,
          imageHeight: 360,
          modules: createModules(),
          purpose: "test_low_confidence_local_ocr"
        },
        {
          runLocalOcrAlignment: require("../server/local-ocr").runLocalOcrAlignment
        }
      );
      assert.strictEqual(parsed.modules.length, 3);
      assert.strictEqual(parsed.modules[0].source, "planned");
      assert.deepStrictEqual(parsed.acceptedLocateAnythingModules, ["module_2", "module_3"]);
      assert.deepStrictEqual(parsed.acceptedLocalOcrModules, []);
      assert.deepStrictEqual(parsed.fallbackModules, ["module_1"]);
      assert.match(JSON.stringify(parsed.rejectedModules), /local-ocr confidence below 0.5/);
    });
  });
}

async function testFakeLocateAnythingPreload() {
  await withEnv("CHATIMAGE_FAKE_LOCATE_MODE", "success", async () => {
    const parsed = await runLocateAnythingPreload(createConfig());
    assert.strictEqual(parsed.provider, "locateanything");
    assert.strictEqual(parsed.loaded, true);
    assert.strictEqual(parsed.model, "fake-locate");
  });
}

function createConfig(overrides = {}) {
  return {
    apiKey: "test-key",
    visionMode: "locateanything",
    locateAnythingPython: "python",
    locateAnythingWorkerPath: path.join(process.cwd(), "tests", "fixtures", "locateanything_fake.py"),
    locateAnythingModel: "fake-locate",
    locateAnythingDevice: "cuda",
    locateAnythingTimeoutMs: 1000,
    locateAnythingMaxNewTokens: 128,
    locateAnythingGenerationMode: "hybrid",
    locateAnythingLicenseAck: "research-evaluation",
    localOcrPython: "python",
    localOcrWorkerPath: path.join(process.cwd(), "tests", "fixtures", "local_ocr_fake.py"),
    localOcrTimeoutMs: 1000,
    localOcrMaxImageBytes: 1024 * 1024,
    apiRequestTimeoutMs: 1000,
    ...overrides
  };
}

function createModules() {
  return [
    { moduleId: "module_1", label: "Input", order: 1, text: "Ask", plannedBounds: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 } },
    { moduleId: "module_2", label: "Layout", order: 2, text: "Plan", plannedBounds: { x: 0.4, y: 0.2, width: 0.2, height: 0.2 } },
    { moduleId: "module_3", label: "Thread", order: 3, text: "Follow", plannedBounds: { x: 0.7, y: 0.2, width: 0.2, height: 0.2 } }
  ];
}

async function testLicenseAckRequired() {
  await assert.rejects(
    () =>
      runLocateAnythingAlignment(createConfig({ locateAnythingLicenseAck: "" }), {
        imageUrl: createHealthFixtureDataUrl(),
        imageWidth: 640,
        imageHeight: 360,
        modules: createModules()
      }),
    /CHATIMAGE_LOCATEANYTHING_LICENSE_ACK/
  );
}

async function testFakeLocateAnythingSuccess() {
  await withEnv("CHATIMAGE_FAKE_LOCATE_MODE", "success", async () => {
    const parsed = await runLocateAnythingAlignment(createConfig(), {
      imageUrl: createHealthFixtureDataUrl(),
      imageWidth: 640,
      imageHeight: 360,
      modules: createModules(),
      purpose: "test_success"
    });
    assert.strictEqual(parsed.modules.length, 3);
    assert.strictEqual(parsed.modules[0].source, "locateanything");
    assert.match(parsed.modules[0].answer, /<box>/);
    assert.deepStrictEqual(parsed.warnings, ["fake locate"]);
  });
}

async function testLocatedBoundsAreSlightlyExpanded() {
  await withEnv("CHATIMAGE_FAKE_LOCATE_MODE", "success", async () => {
    const parsed = await runLocateAnythingAlignmentWithFallback(
      createConfig(),
      {
        imageUrl: createHealthFixtureDataUrl(),
        imageWidth: 640,
        imageHeight: 360,
        modules: createModules(),
        purpose: "test_bounds_expansion"
      },
      {}
    );
    const first = parsed.modules[0];
    assert.deepStrictEqual(first.rawBounds, { x: 0.08, y: 0.18, width: 0.18, height: 0.2 });
    assert.ok(first.bounds.width > first.rawBounds.width);
    assert.ok(first.bounds.height > first.rawBounds.height);
    assert.strictEqual(first.boundsExpansion.strategy, "infographic-card-small-pad");
  });
}

async function testRouteBoundsExpandPerpendicularForSegmentation() {
  await withEnv("CHATIMAGE_FAKE_LOCATE_MODE", "success", async () => {
    const parsed = await runLocateAnythingAlignmentWithFallback(
      createConfig(),
      {
        imageUrl: createHealthFixtureDataUrl(),
        imageWidth: 640,
        imageHeight: 360,
        visualMode: "map",
        modules: [
          {
            moduleId: "module_1",
            label: "Coast trail",
            order: 1,
            text: "route",
            regionKind: "route",
            maskPolicy: "route",
            regionPrompt: "visible walking trail corridor",
            plannedBounds: { x: 0.08, y: 0.18, width: 0.2, height: 0.24 }
          }
        ],
        purpose: "test_route_bounds_expansion"
      },
      {}
    );
    const first = parsed.modules[0];
    const widthGrowth = first.bounds.width - first.rawBounds.width;
    const heightGrowth = first.bounds.height - first.rawBounds.height;
    assert.strictEqual(first.boundsExpansion.strategy, "route-context-pad");
    assert.ok(widthGrowth > heightGrowth, "vertical route should gain more perpendicular width than along-route height");
  });
}

async function testMimoVisionFallbackFillsMissingModule() {
  await withEnv("CHATIMAGE_FAKE_LOCATE_MODE", "no-box", async () => {
    const parsed = await runLocateAnythingAlignmentWithFallback(
      createConfig({ visionMode: "locateanything", visionFallbackMode: "mimo-vision", visionModel: "mimo-v2.5" }),
      {
        imageUrl: createHealthFixtureDataUrl(),
        imageWidth: 640,
        imageHeight: 360,
        modules: createModules(),
        purpose: "test_mimo_vision_fallback"
      },
      {
        callVisionApi: async () =>
          JSON.stringify({
            provider: "mimo-vision",
            modules: [
              {
                moduleId: "module_1",
                label: "Input",
                bounds: { x: 0.12, y: 0.22, width: 0.22, height: 0.24 },
                confidence: 0.83,
                matchedText: "semantic visual match"
              }
            ],
            rejectedModules: []
          })
      }
    );
    assert.strictEqual(parsed.modules.length, 3);
    assert.deepStrictEqual(parsed.providerChain, ["locateanything", "mimo-vision"]);
    assert.strictEqual(parsed.modules[0].source, "mimo-vision");
    assert.deepStrictEqual(parsed.acceptedMimoVisionModules, ["module_1"]);
    assert.deepStrictEqual(parsed.sourceCounts, { "mimo-vision": 1, locateanything: 2 });
  });
}

async function testMimoVisionReplacesLayoutGuidedModule() {
  await withEnv("CHATIMAGE_FAKE_LOCATE_MODE", "layout-guided", async () => {
    const parsed = await runLocateAnythingAlignmentWithFallback(
      createConfig({ visionMode: "locateanything", visionFallbackMode: "mimo-vision", visionModel: "mimo-v2.5" }),
      {
        imageUrl: createHealthFixtureDataUrl(),
        imageWidth: 640,
        imageHeight: 360,
        modules: createModules(),
        purpose: "test_mimo_vision_replaces_layout_guided"
      },
      {
        callVisionApi: async () =>
          JSON.stringify({
            provider: "mimo-vision",
            modules: [
              {
                moduleId: "module_1",
                label: "Input",
                bounds: { x: 0.15, y: 0.24, width: 0.24, height: 0.26 },
                confidence: 0.86,
                matchedText: "mimo semantic replacement"
              }
            ],
            rejectedModules: []
          })
      }
    );
    assert.strictEqual(parsed.modules[0].source, "mimo-vision");
    assert.deepStrictEqual(parsed.acceptedLayoutGuidedModules, ["module_1"]);
    assert.deepStrictEqual(parsed.acceptedMimoVisionModules, ["module_1"]);
    assert.deepStrictEqual(parsed.sourceCounts, { "mimo-vision": 1, locateanything: 2 });
  });
}

async function testGoodSceneLocateCandidateSkipsMimoVisionOverride() {
  await withEnv("CHATIMAGE_FAKE_LOCATE_MODE", "scene-good-locate", async () => {
    const parsed = await runLocateAnythingAlignmentWithFallback(
      createConfig({ visionMode: "locateanything", visionFallbackMode: "mimo-vision", visionModel: "mimo-v2.5" }),
      {
        imageUrl: createHealthFixtureDataUrl(),
        imageWidth: 640,
        imageHeight: 360,
        visualMode: "scene",
        modules: [
          {
            moduleId: "module_1",
            label: "Guide robot",
            order: 1,
            text: "AI guide",
            regionKind: "object-with-label",
            maskPolicy: "subject-with-label",
            regionPrompt: "guide robot with attached AI guide label",
            plannedBounds: { x: 0.08, y: 0.24, width: 0.32, height: 0.52 }
          }
        ],
        purpose: "test_good_scene_locate_skips_mimo"
      },
      {
        callVisionApi: async () => {
          throw new Error("mimo-vision should not be called for a high-quality LocateAnything scene candidate");
        }
      }
    );
    assert.deepStrictEqual(parsed.providerChain, ["locateanything"]);
    assert.strictEqual(parsed.modules[0].source, "locateanything");
    assert.deepStrictEqual(parsed.sourceCounts, { locateanything: 1 });
  });
}

async function testTinySceneSubjectCandidateUsesMimoVisionOverride() {
  await withEnv("CHATIMAGE_FAKE_LOCATE_MODE", "scene-small-subject", async () => {
    const parsed = await runLocateAnythingAlignmentWithFallback(
      createConfig({ visionMode: "locateanything", visionFallbackMode: "mimo-vision", visionModel: "mimo-v2.5" }),
      {
        imageUrl: createHealthFixtureDataUrl(),
        imageWidth: 640,
        imageHeight: 360,
        visualMode: "scene",
        modules: [
          {
            moduleId: "module_1",
            label: "Guide robot",
            order: 1,
            text: "AI guide",
            regionKind: "object-with-label",
            maskPolicy: "subject-with-label",
            regionPrompt: "guide robot with attached AI guide label",
            plannedBounds: { x: 0.08, y: 0.24, width: 0.32, height: 0.52 }
          }
        ],
        purpose: "test_tiny_scene_subject_uses_mimo"
      },
      {
        callVisionApi: async () =>
          JSON.stringify({
            provider: "mimo-vision",
            modules: [
              {
                moduleId: "module_1",
                label: "Guide robot",
                bounds: { x: 0.12, y: 0.3, width: 0.2, height: 0.5 },
                confidence: 0.88,
                matchedText: "robot body plus attached label"
              }
            ],
            rejectedModules: []
          })
      }
    );
    assert.deepStrictEqual(parsed.providerChain, ["locateanything", "mimo-vision"]);
    assert.strictEqual(parsed.modules[0].source, "mimo-vision");
    assert.deepStrictEqual(parsed.sourceCounts, { "mimo-vision": 1 });
  });
}

async function testMapLegendFarFromPlanFallsBackToPlanned() {
  await withEnv("CHATIMAGE_FAKE_LOCATE_MODE", "no-box", async () => {
    const parsed = await runLocateAnythingAlignmentWithFallback(
      createConfig({ visionMode: "locateanything", visionFallbackMode: "mimo-vision", visionModel: "mimo-v2.5" }),
      {
        imageUrl: createHealthFixtureDataUrl(),
        imageWidth: 640,
        imageHeight: 360,
        visualMode: "map",
        modules: [
          {
            moduleId: "module_5",
            label: "山上住宿点",
            order: 5,
            text: "女神宾馆与日上山庄",
            regionKind: "legend",
            maskPolicy: "legend",
            regionPrompt: "地图上山上区域的小房子或宾馆住宿标记",
            plannedBounds: { x: 0.58, y: 0.7, width: 0.3, height: 0.16 }
          }
        ],
        purpose: "test_map_legend_far_from_plan_fallback"
      },
      {
        callVisionApi: async () =>
          JSON.stringify({
            provider: "mimo-vision",
            modules: [
              {
                moduleId: "module_5",
                label: "山上住宿点",
                bounds: { x: 0.35, y: 0.36, width: 0.38, height: 0.16 },
                confidence: 0.86,
                matchedText: "wrong central scenic area"
              }
            ],
            rejectedModules: []
          })
      }
    );
    assert.strictEqual(parsed.modules.length, 1);
    assert.strictEqual(parsed.modules[0].source, "planned");
    assert.deepStrictEqual(parsed.fallbackModules, ["module_5"]);
    assert.deepStrictEqual(parsed.acceptedMimoVisionModules, []);
    assert.match(JSON.stringify(parsed.rejectedModules), /failed planned-region quality checks/);
  });
}

async function testTinyInfographicCardFallsBackToPlanned() {
  await withEnv("CHATIMAGE_FAKE_LOCATE_MODE", "tiny-card", async () => {
    const parsed = await runLocateAnythingAlignmentWithFallback(
      createConfig(),
      {
        imageUrl: createHealthFixtureDataUrl(),
        imageWidth: 640,
        imageHeight: 360,
        visualMode: "infographic",
        modules: [
          {
            moduleId: "module_1",
            label: "Pod runtime unit",
            order: 1,
            text: "containers share lifecycle",
            regionKind: "area",
            maskPolicy: "card",
            plannedBounds: { x: 0.06, y: 0.25, width: 0.26, height: 0.56 }
          },
          {
            moduleId: "module_2",
            label: "Deployment",
            order: 2,
            text: "ReplicaSet and rollout",
            regionKind: "area",
            maskPolicy: "card",
            plannedBounds: { x: 0.35, y: 0.25, width: 0.26, height: 0.56 }
          }
        ],
        purpose: "test_tiny_infographic_card_fallback"
      },
      {}
    );
    assert.strictEqual(parsed.modules[0].source, "planned");
    assert.deepStrictEqual(parsed.modules[0].bounds, { x: 0.06, y: 0.25, width: 0.26, height: 0.56 });
    assert.ok(parsed.fallbackModules.includes("module_1"));
    assert.match(JSON.stringify(parsed.rejectedModules), /failed planned-region quality checks/);
  });
}

async function testPlannedFallbackForMissingModule() {
  await withEnv("CHATIMAGE_FAKE_LOCATE_MODE", "no-box", async () => {
    const parsed = await runLocateAnythingAlignmentWithFallback(
      createConfig({ localOcrWorkerPath: path.join(process.cwd(), "missing-worker.py") }),
      {
        imageUrl: createHealthFixtureDataUrl(),
        imageWidth: 640,
        imageHeight: 360,
        modules: createModules(),
        purpose: "test_planned_fallback"
      },
      {}
    );
    assert.strictEqual(parsed.modules.length, 3);
    assert.strictEqual(parsed.modules[0].source, "planned");
    assert.strictEqual(parsed.effectiveProvider, "locateanything");
    assert.deepStrictEqual(parsed.sourceCounts, { planned: 1, locateanything: 2 });
    assert.deepStrictEqual(parsed.acceptedLocateAnythingModules, ["module_2", "module_3"]);
    assert.deepStrictEqual(parsed.acceptedLocalOcrModules, []);
    assert.deepStrictEqual(parsed.fallbackModules, ["module_1"]);
    assert.match(parsed.warnings.join("\n"), /fake locate/);
  });
}

async function testInvalidBoundsReject() {
  await withEnv("CHATIMAGE_FAKE_LOCATE_MODE", "invalid-bounds", async () => {
    await assert.rejects(
      () =>
        runLocateAnythingAlignment(createConfig(), {
          imageUrl: createHealthFixtureDataUrl(),
          imageWidth: 640,
          imageHeight: 360,
          modules: createModules()
        }),
      /outside normalized image bounds/
    );
  });
}

async function testVisionRoutesExposeLocateAnything() {
  await withEnv("CHATIMAGE_FAKE_LOCATE_MODE", "success", async () => {
    const server = createServer(createConfig({ port: 0 }));
    try {
      await listen(server);
      const { port } = server.address();
      const configResponse = await fetch(`http://127.0.0.1:${port}/api/config`);
      assert.strictEqual(configResponse.status, 200);
      const config = await configResponse.json();
      assert.strictEqual(config.visionMode, "locateanything");
      assert.strictEqual(config.locateAnythingConfigured, true);
      assert.strictEqual(config.locateAnythingLicenseAck, true);

      const healthResponse = await fetch(`http://127.0.0.1:${port}/api/vision/health`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      assert.strictEqual(healthResponse.status, 200);
      const health = await healthResponse.json();
      assert.strictEqual(health.parsed.provider, "locateanything");

      const alignResponse = await fetch(`http://127.0.0.1:${port}/api/vision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: createHealthFixtureDataUrl(),
          imageWidth: 640,
          imageHeight: 360,
          modules: createModules()
        })
      });
      assert.strictEqual(alignResponse.status, 200);
      const body = await alignResponse.json();
      const parsed = JSON.parse(body.content);
      assert.strictEqual(parsed.provider, "locateanything");
      assert.strictEqual(parsed.modules.length, 3);
      assert.deepStrictEqual(parsed.providerChain, ["locateanything"]);
    } finally {
      await close(server);
    }
  });
}

function testNormalizeRejectsBadConfidence() {
  assert.throws(
    () =>
      normalizeLocateAnythingOutput(
        {
          modules: [{ moduleId: "module_1", bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, confidence: 2 }]
        },
        createModules()
      ),
    /confidence/
  );
}

function testNormalizePreservesCropStrategy() {
  const parsed = normalizeLocateAnythingOutput(
    {
      modules: [
        {
          moduleId: "module_1",
          bounds: { x: 0.12, y: 0.2, width: 0.22, height: 0.24 },
          confidence: 0.72,
          source: "locateanything-crop",
          strategy: "planned-crop",
          phraseKind: "crop-numbered-card",
          candidateScore: 0.812,
          candidateDiagnostics: [{ score: 0.812, strategy: "planned-crop:numbered-card" }],
          cropWindow: { x: 0.08, y: 0.16, width: 0.3, height: 0.32 }
        }
      ]
    },
    createModules()
  );
  assert.strictEqual(parsed.modules[0].source, "locateanything-crop");
  assert.strictEqual(parsed.modules[0].strategy, "planned-crop");
  assert.strictEqual(parsed.modules[0].phraseKind, "crop-numbered-card");
  assert.strictEqual(parsed.modules[0].candidateScore, 0.812);
  assert.strictEqual(parsed.modules[0].candidateDiagnostics[0].score, 0.812);
  assert.strictEqual(parsed.modules[0].cropWindow.width, 0.3);
}

function testNormalizePreservesObjectComponents() {
  const parsed = normalizeLocateAnythingOutput(
    {
      modules: [
        {
          moduleId: "module_1",
          bounds: { x: 0.1, y: 0.1, width: 0.4, height: 0.5 },
          confidence: 0.82,
          components: [
            { kind: "object", label: "guide robot", bounds: { x: 0.12, y: 0.14, width: 0.22, height: 0.4 } },
            { kind: "label", label: "AI personalized guide", bounds: { x: 0.16, y: 0.48, width: 0.24, height: 0.08 } }
          ]
        }
      ]
    },
    createModules()
  );
  assert.strictEqual(parsed.modules[0].components.length, 2);
  assert.strictEqual(parsed.modules[0].components[0].kind, "object");
  assert.strictEqual(parsed.modules[0].components[1].kind, "label");
  assert.strictEqual(parsed.modules[0].components[1].bounds.width, 0.24);
}

function testNormalizeModulesPreservesTargetContract() {
  const modules = normalizeModules([
    {
      moduleId: "module_1",
      label: "Guide robot",
      text: "AI guide",
      regionKind: "object-with-label",
      regionPrompt: "guide robot plus attached AI guide badge",
      visualEvidence: ["visible robot body", "attached AI guide badge"],
      maskPolicy: "subject-with-label",
      spatialHint: "foreground center",
      locatorQueries: ["guide robot", "robot with AI guide badge"],
      componentHints: [
        { kind: "object", label: "robot body" },
        { kind: "label", label: "AI guide badge" }
      ],
      plannedBounds: { x: 0.2, y: 0.2, width: 0.3, height: 0.4 }
    }
  ]);
  assert.strictEqual(modules[0].maskPolicy, "subject-with-label");
  assert.strictEqual(modules[0].spatialHint, "foreground center");
  assert.deepStrictEqual(modules[0].visualEvidence, ["visible robot body", "attached AI guide badge"]);
  assert.deepStrictEqual(modules[0].locatorQueries, ["guide robot", "robot with AI guide badge"]);
  assert.strictEqual(modules[0].componentHints[1].label, "AI guide badge");
  assert.match(modules[0].targetDescription, /must-see evidence: visible robot body; attached AI guide badge/);
  assert.match(modules[0].targetDescription, /component hints: object:robot body; label:AI guide badge/);
  assert.match(modules[0].semanticHint, /guide robot assistant|robot/i);
}

function testSemanticHintUsesPrimaryChineseLabels() {
  assert.strictEqual(
    buildSemanticHint({
      label: "\u9ad8\u5bc6\u5ea6\u8f6f\u5305\u7535\u6c60",
      regionPrompt: "\u9ad8\u5bc6\u5ea6\u8f6f\u5305\u7535\u6c60",
      text: "\u7ed3\u6784 \u4f20\u611f \u82af\u7247"
    }),
    "battery pack power cell"
  );
  assert.strictEqual(
    buildSemanticHint({
      label: "\u667a\u80fd\u4ea4\u4e92\u8868\u5e26",
      regionPrompt: "\u667a\u80fd\u4ea4\u4e92\u8868\u5e26",
      text: "\u4f20\u611f\u5668\u63a5\u89e6 NFC"
    }),
    "watch strap band"
  );
  assert.strictEqual(
    buildSemanticHint({
      label: "阳光海岸栈道",
      regionKind: "route",
      regionPrompt: "阳光海岸栈道，位于山体东侧，朝向东方，可远眺群山",
      locatorQueries: ["阳光海岸栈道", "东侧栈道", "日出栈道"]
    }),
    "阳光海岸栈道 exact named route; visible path line/corridor plus its attached short label if visible; narrow footprint following the route, not a nearby bridge, generic path, or unrelated scenic label; rough spatial cue: east/right side"
  );
  assert.strictEqual(
    buildSemanticHint({
      label: "交通接驳指南",
      regionKind: "legend",
      regionPrompt: "高铁站、巴士路线和索道位置"
    }),
    "complete compact information legend panel with icons labels"
  );
  assert.match(
    buildSemanticHint({
      label: "\u5b64\u5c71",
      regionKind: "landmark",
      regionPrompt: "\u897f\u6e56\u5317\u4fa7\u5b64\u5c71\uff0c\u5c71\u4f53\u3001\u6e56\u5cb8\u3001\u4ead\u53f0\u6216\u6587\u5316\u5efa\u7b51\u5f62\u6210\u7684\u5c9b\u72b6\u5730\u6807\u533a\u57df",
      detail:
        "\u70b9\u51fb\u540e\u5e94\u8bf4\u660e\u5b83\u5728\u5730\u56fe\u4e2d\u627f\u62c5\u5317\u5cb8\u5730\u5f62\u548c\u4eba\u6587\u6c14\u8d28\u7684\u53cc\u91cd\u4f5c\u7528\u3002"
    }),
    /Gushan hill island region/
  );
  assert.doesNotMatch(
    buildSemanticHint({
      label: "\u5b64\u5c71",
      regionKind: "landmark",
      regionPrompt: "\u897f\u6e56\u5317\u4fa7\u5b64\u5c71",
      detail: "\u70b9\u51fb\u540e\u5e94\u8bf4\u660e\u5b64\u5c71\u7684\u5c71\u5c9b\u4e0e\u6e56\u5cb8\u5173\u7cfb\u3002"
    }),
    /legend panel/
  );
}

function testInfographicCardSemanticHintIgnoresSensorWords() {
  const hint = buildSemanticHint({
    label: "Pod runtime unit",
    text: "containers share lifecycle",
    detail: "\u5065\u5eb7\u68c0\u67e5 and restart policy are explanation text, not a sensor target",
    regionKind: "area",
    maskPolicy: "card",
    visualMode: "infographic"
  });
  assert.match(hint, /infographic card|Pod runtime unit/);
  assert.doesNotMatch(hint, /health sensor/);
}

async function withEnv(key, value, fn) {
  const previous = process.env[key];
  process.env[key] = value;
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    if (!server || !server.listening) {
      resolve();
      return;
    }
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
