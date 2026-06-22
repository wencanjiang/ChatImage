"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  createSam3Config,
  normalizeSam3Output,
  refineAlignmentWithSam3,
  runSam3Preload,
  runSam3Segmentation
} = require("../server/sam3");
const { createHealthFixtureDataUrl } = require("../server/local-ocr");

async function main() {
  await testLicenseAckRequired();
  await testFakeSam3Preload();
  await testFakeSam3Segmentation();
  await testFakeSam3ComponentSegmentation();
  await testSubjectWithLabelSynthesizesComponents();
  await testLegendSubjectWithLabelDoesNotSynthesizeComponents();
  await testRefineAlignmentKeepsLocateBoundsAndAddsMask();
  await testRefineAlignmentExpandsComponentBoundsForSam3();
  await testLongLabelExpandsSamInputHorizontally();
  await testVeryLowConfidenceRouteUsesCorridorFallback();
  await testLowConfidenceLodgingObjectUsesSemanticBoundsFallback();
  await testLandmarkWithBridgeTextDoesNotUseRouteFallback();
  await testMapRegionInputBoundsAreContextual();
  await testRefineFailureDoesNotBlockAlignment();
  testNormalizeRejectsInvalidMaskBounds();
  testConfigRequiresExplicitEnableAndAck();
  console.log("sam3.test.js passed");
}

function createConfig(overrides = {}) {
  const checkpoint = path.join(process.cwd(), "tmp", "fake-sam3.pt");
  fs.mkdirSync(path.dirname(checkpoint), { recursive: true });
  if (!fs.existsSync(checkpoint)) fs.writeFileSync(checkpoint, "fake");
  return {
    sam3Enabled: "1",
    sam3Python: "python",
    sam3WorkerPath: path.join(process.cwd(), "tests", "fixtures", "sam3_fake.py"),
    sam3Checkpoint: checkpoint,
    sam3Device: "cuda",
    sam3TimeoutMs: 1000,
    sam3LicenseAck: "research-evaluation",
    localOcrMaxImageBytes: 1024 * 1024,
    ...overrides
  };
}

function createModules() {
  return [
    { moduleId: "module_1", label: "Lake", plannedBounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } },
    { moduleId: "module_2", label: "Bridge", plannedBounds: { x: 0.5, y: 0.2, width: 0.2, height: 0.2 } }
  ];
}

function createAlignmentResult() {
  return {
    provider: "locateanything",
    providerChain: ["locateanything"],
    modules: createModules().map((module) => ({
      moduleId: module.moduleId,
      label: module.label,
      bounds: module.plannedBounds,
      confidence: 0.88,
      source: "locateanything"
    })),
    warnings: []
  };
}

async function testLicenseAckRequired() {
  await assert.rejects(
    () =>
      runSam3Segmentation(createConfig({ sam3LicenseAck: "" }), {
        imageUrl: createHealthFixtureDataUrl(),
        imageWidth: 640,
        imageHeight: 360,
        modules: createModules()
      }),
    /CHATIMAGE_SAM3_LICENSE_ACK/
  );
}

async function testFakeSam3Preload() {
  const result = await runSam3Preload(createConfig());
  assert.strictEqual(result.provider, "sam3");
  assert.strictEqual(result.loaded, true);
}

async function testFakeSam3Segmentation() {
  const parsed = await runSam3Segmentation(createConfig(), {
    imageUrl: createHealthFixtureDataUrl(),
    imageWidth: 640,
    imageHeight: 360,
    modules: createModules()
  });
  assert.strictEqual(parsed.modules.length, 2);
  assert.strictEqual(parsed.modules[0].score, 0.94);
  assert.strictEqual(parsed.modules[0].maskBounds.x, 0.11);
  assert.match(parsed.modules[0].maskImage, /^data:image\/png;base64,/);
  assert.match(parsed.modules[0].cutoutImage, /^data:image\/png;base64,/);
  assert.ok(parsed.modules[0].polygon.length >= 3);
  assert.match(parsed.warnings.join("\n"), /fake sam3/);
}

async function testFakeSam3ComponentSegmentation() {
  const parsed = await runSam3Segmentation(createConfig(), {
    imageUrl: createHealthFixtureDataUrl(),
    imageWidth: 640,
    imageHeight: 360,
    modules: [
      {
        moduleId: "module_1",
        label: "Guide robot",
        plannedBounds: { x: 0.1, y: 0.1, width: 0.45, height: 0.55 },
        components: [
          { kind: "object", label: "robot", bounds: { x: 0.14, y: 0.12, width: 0.2, height: 0.42 } },
          { kind: "label", label: "AI guide", bounds: { x: 0.18, y: 0.5, width: 0.28, height: 0.08 } }
        ]
      }
    ]
  });
  assert.strictEqual(parsed.modules.length, 1);
  assert.strictEqual(parsed.modules[0].maskBounds.x, 0.14);
  assert.strictEqual(parsed.modules[0].maskBounds.y, 0.12);
  assert.strictEqual(parsed.modules[0].maskBounds.width, 0.32);
  assert.strictEqual(parsed.modules[0].maskBounds.height, 0.46);
}

async function testSubjectWithLabelSynthesizesComponents() {
  const parsed = await runSam3Segmentation(createConfig(), {
    imageUrl: createHealthFixtureDataUrl(),
    imageWidth: 640,
    imageHeight: 360,
    modules: [
      {
        moduleId: "module_1",
        label: "Guide robot",
        regionKind: "object-with-label",
        maskPolicy: "subject-with-label",
        plannedBounds: { x: 0.1, y: 0.2, width: 0.2, height: 0.5 }
      }
    ]
  });
  assert.strictEqual(parsed.modules.length, 1);
  assert.strictEqual(parsed.modules[0].maskBounds.x, 0.1);
  assert.strictEqual(parsed.modules[0].maskBounds.y, 0.19);
  assert.ok(parsed.modules[0].maskBounds.width > 0.25, "synthetic label box should expand the mask union to the right");
  assert.strictEqual(parsed.modules[0].maskBounds.height, 0.51);
}

async function testLegendSubjectWithLabelDoesNotSynthesizeComponents() {
  const parsed = await runSam3Segmentation(createConfig(), {
    imageUrl: createHealthFixtureDataUrl(),
    imageWidth: 640,
    imageHeight: 360,
    modules: [
      {
        moduleId: "module_1",
        label: "Lodging legend",
        regionKind: "legend",
        maskPolicy: "subject-with-label",
        plannedBounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
      }
    ]
  });
  assert.strictEqual(parsed.modules.length, 1);
  assert.strictEqual(parsed.modules[0].maskBounds.x, 0.11);
  assert.strictEqual(parsed.modules[0].maskBounds.y, 0.21);
  assert.strictEqual(parsed.modules[0].maskBounds.width, 0.28);
  assert.strictEqual(parsed.modules[0].maskBounds.height, 0.38);
}

async function testRefineAlignmentKeepsLocateBoundsAndAddsMask() {
  const refined = await refineAlignmentWithSam3(createConfig(), createAlignmentResult(), {
    imageUrl: createHealthFixtureDataUrl(),
    imageWidth: 640,
    imageHeight: 360
  });
  assert.deepStrictEqual(refined.providerChain, ["locateanything", "sam3"]);
  assert.strictEqual(refined.modules[0].source, "locateanything");
  assert.deepStrictEqual(refined.modules[0].bounds, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  assert.strictEqual(refined.modules[0].mask.provider, "sam3");
  assert.ok(refined.modules[0].mask.inputBounds.x < refined.modules[0].bounds.x);
  assert.ok(refined.modules[0].mask.inputBounds.y < refined.modules[0].bounds.y);
  assert.ok(refined.modules[0].mask.inputBounds.width > refined.modules[0].bounds.width);
  assert.ok(refined.modules[0].mask.inputBounds.height > refined.modules[0].bounds.height);
  assert.strictEqual(refined.modules[0].mask.bounds.x, 0.082);
  assert.match(refined.modules[0].mask.image, /^data:image\/png;base64,/);
  assert.match(refined.modules[0].mask.cutoutImage, /^data:image\/png;base64,/);
  assert.ok(refined.modules[0].mask.polygon.length >= 3);
  assert.deepStrictEqual(refined.acceptedSam3Modules, ["module_1", "module_2"]);
}

async function testRefineAlignmentExpandsComponentBoundsForSam3() {
  const alignment = {
    provider: "locateanything",
    providerChain: ["locateanything"],
    modules: [
      {
        moduleId: "module_1",
        label: "Guide robot",
        regionKind: "object-with-label",
        maskPolicy: "subject-with-label",
        targetDescription: "visual target: guide robot with the AI guide label",
        bounds: { x: 0.1, y: 0.1, width: 0.45, height: 0.55 },
        components: [
          { kind: "object", label: "robot", bounds: { x: 0.14, y: 0.12, width: 0.2, height: 0.42 } },
          { kind: "label", label: "AI guide", bounds: { x: 0.18, y: 0.5, width: 0.28, height: 0.08 } }
        ],
        confidence: 0.9,
        source: "locateanything"
      }
    ],
    warnings: []
  };
  const refined = await refineAlignmentWithSam3(createConfig(), alignment, {
    imageUrl: createHealthFixtureDataUrl(),
    imageWidth: 640,
    imageHeight: 360
  });
  assert.deepStrictEqual(refined.modules[0].bounds, alignment.modules[0].bounds);
  assert.ok(refined.modules[0].mask.inputBounds.x < refined.modules[0].bounds.x);
  assert.ok(refined.modules[0].mask.inputBounds.y < refined.modules[0].bounds.y);
  assert.ok(refined.modules[0].mask.inputBounds.width > refined.modules[0].bounds.width);
  assert.ok(refined.modules[0].mask.inputBounds.height > refined.modules[0].bounds.height);
  assert.ok(refined.modules[0].mask.bounds.x < 0.14);
  assert.ok(refined.modules[0].mask.bounds.y < 0.12);
  assert.ok(refined.modules[0].mask.bounds.width > 0.32);
  assert.ok(refined.modules[0].mask.bounds.height > 0.46);
}

async function testLongLabelExpandsSamInputHorizontally() {
  // 两个 object-with-label 目标，bounds 完全相同，只有标签长度不同。
  // 长中文标签应让 SAM 输入框横向更宽，避免裁掉标签尾部。
  const bounds = { x: 0.3, y: 0.3, width: 0.4, height: 0.3 };
  const alignment = {
    provider: "locateanything",
    providerChain: ["locateanything"],
    modules: [
      {
        moduleId: "module_short",
        label: "门",
        regionKind: "object-with-label",
        maskPolicy: "subject-with-label",
        bounds: { ...bounds },
        confidence: 0.9,
        source: "locateanything"
      },
      {
        moduleId: "module_long",
        label: "应急出口安全疏散指示标牌",
        regionKind: "object-with-label",
        maskPolicy: "subject-with-label",
        bounds: { ...bounds },
        confidence: 0.9,
        source: "locateanything"
      }
    ],
    warnings: []
  };
  const refined = await refineAlignmentWithSam3(createConfig(), alignment, {
    imageUrl: createHealthFixtureDataUrl(),
    imageWidth: 640,
    imageHeight: 360
  });
  const shortInput = refined.modules[0].mask.inputBounds;
  const longInput = refined.modules[1].mask.inputBounds;
  // click bounds 保持不变
  assert.deepStrictEqual(refined.modules[0].bounds, bounds);
  assert.deepStrictEqual(refined.modules[1].bounds, bounds);
  // 长标签横向输入框更宽，纵向不受标签长度影响
  assert.ok(
    longInput.width > shortInput.width,
    `expected long-label input width ${longInput.width} > short-label ${shortInput.width}`
  );
  assert.ok(Math.abs(longInput.height - shortInput.height) < 1e-9);
}

async function testVeryLowConfidenceRouteUsesCorridorFallback() {
  await withEnv("CHATIMAGE_FAKE_SAM3_MODE", "low-route-score", async () => {
    const alignment = {
      provider: "locateanything",
      providerChain: ["locateanything"],
      modules: [
        {
          moduleId: "module_1",
          label: "阳光海岸栈道",
          regionKind: "route",
          maskPolicy: "route",
          targetDescription: "visual target: 阳光海岸栈道，位于山体东侧的栈道线路",
          bounds: { x: 0.58, y: 0.18, width: 0.3, height: 0.12 },
          confidence: 0.62,
          source: "mimo-vision"
        }
      ],
      warnings: []
    };
    const refined = await refineAlignmentWithSam3(createConfig(), alignment, {
      imageUrl: createHealthFixtureDataUrl(),
      imageWidth: 640,
      imageHeight: 360
    });
    assert.strictEqual(refined.modules[0].mask.strategy, "route-corridor-fallback");
    assert.strictEqual(refined.modules[0].mask.score, 0.24);
    assert.deepStrictEqual(refined.modules[0].bounds, alignment.modules[0].bounds);
    assert.ok(refined.modules[0].mask.inputBounds.x < refined.modules[0].bounds.x);
    assert.ok(refined.modules[0].mask.inputBounds.y < refined.modules[0].bounds.y);
    assert.ok(refined.modules[0].mask.inputBounds.width > refined.modules[0].bounds.width);
    assert.ok(refined.modules[0].mask.inputBounds.height > refined.modules[0].bounds.height);
    assert.deepStrictEqual(refined.modules[0].mask.bounds, refined.modules[0].mask.inputBounds);
    assert.strictEqual(refined.modules[0].mask.image, "");
    assert.ok(refined.modules[0].mask.polygon.length >= 4);
  });
}

async function testLowConfidenceLodgingObjectUsesSemanticBoundsFallback() {
  await withEnv("CHATIMAGE_FAKE_SAM3_MODE", "low-route-score", async () => {
    const alignment = {
      provider: "locateanything",
      providerChain: ["locateanything"],
      modules: [
        {
          moduleId: "module_1",
          label: "山上住宿点",
          regionKind: "object-with-label",
          maskPolicy: "subject-with-label",
          targetDescription: "visual target: 地图上的山上住宿点实体标记，必须包含房屋、床位、宾馆或补给图标，并贴近住宿短标签",
          bounds: { x: 0.38, y: 0.62, width: 0.42, height: 0.22 },
          confidence: 0.82,
          source: "mimo-vision"
        }
      ],
      warnings: []
    };
    const refined = await refineAlignmentWithSam3(createConfig(), alignment, {
      imageUrl: createHealthFixtureDataUrl(),
      imageWidth: 640,
      imageHeight: 360
    });
    assert.strictEqual(refined.modules[0].mask.strategy, "semantic-bounds-fallback");
    assert.strictEqual(refined.modules[0].mask.score, 0.24);
    assert.deepStrictEqual(refined.modules[0].bounds, alignment.modules[0].bounds);
    assert.ok(refined.modules[0].mask.inputBounds.x < refined.modules[0].bounds.x);
    assert.ok(refined.modules[0].mask.inputBounds.y < refined.modules[0].bounds.y);
    assert.ok(refined.modules[0].mask.inputBounds.width > refined.modules[0].bounds.width);
    assert.ok(refined.modules[0].mask.inputBounds.height > refined.modules[0].bounds.height);
    assert.deepStrictEqual(refined.modules[0].mask.bounds, refined.modules[0].mask.inputBounds);
    assert.strictEqual(refined.modules[0].mask.image, "");
    assert.ok(refined.modules[0].mask.polygon.length >= 4);
  });
}

async function testLandmarkWithBridgeTextDoesNotUseRouteFallback() {
  await withEnv("CHATIMAGE_FAKE_SAM3_MODE", "low-route-score", async () => {
    const alignment = {
      provider: "locateanything",
      providerChain: ["locateanything"],
      modules: [
        {
          moduleId: "module_1",
          label: "曲院风荷",
          regionKind: "landmark",
          maskPolicy: "full-region",
          targetDescription: "visual target: 荷塘、曲桥、近岸植物和水面形成的景区区域",
          bounds: { x: 0.02, y: 0.4, width: 0.15, height: 0.3 },
          confidence: 0.82,
          source: "mimo-vision"
        }
      ],
      warnings: []
    };
    const refined = await refineAlignmentWithSam3(createConfig(), alignment, {
      imageUrl: createHealthFixtureDataUrl(),
      imageWidth: 640,
      imageHeight: 360
    });
    assert.notStrictEqual(refined.modules[0].mask.strategy, "route-corridor-fallback");
    assert.deepStrictEqual(refined.modules[0].bounds, alignment.modules[0].bounds);
    assert.ok(refined.modules[0].mask.inputBounds.x < refined.modules[0].bounds.x);
    assert.ok(refined.modules[0].mask.inputBounds.width > refined.modules[0].bounds.width);
    assert.ok(refined.modules[0].mask.bounds.x < refined.modules[0].bounds.x);
    assert.match(refined.modules[0].mask.image, /^data:image\/png;base64,/);
  });
}

async function testMapRegionInputBoundsAreContextual() {
  const alignment = {
    provider: "locateanything",
    providerChain: ["locateanything"],
    modules: [
      {
        moduleId: "module_1",
        label: "光明顶与云海",
        regionKind: "mountain",
        maskPolicy: "full-region",
        targetDescription: "visual target: complete mountain peak, cloud sea and surrounding ridge region",
        bounds: { x: 0.78, y: 0.34, width: 0.16, height: 0.18 },
        confidence: 0.82,
        source: "locateanything"
      }
    ],
    warnings: []
  };
  const refined = await refineAlignmentWithSam3(createConfig(), alignment, {
    imageUrl: createHealthFixtureDataUrl(),
    imageWidth: 640,
    imageHeight: 360
  });
  const input = refined.modules[0].mask.inputBounds;
  assert.deepStrictEqual(refined.modules[0].bounds, alignment.modules[0].bounds);
  assert.ok(input.x < alignment.modules[0].bounds.x);
  assert.ok(input.y < alignment.modules[0].bounds.y);
  assert.ok(input.width >= 0.22, `expected contextual input width, got ${input.width}`);
  assert.ok(input.height >= 0.25, `expected contextual input height, got ${input.height}`);
}

async function testRefineFailureDoesNotBlockAlignment() {
  await withEnv("CHATIMAGE_FAKE_SAM3_MODE", "invalid-bounds", async () => {
    const refined = await refineAlignmentWithSam3(createConfig(), createAlignmentResult(), {
      imageUrl: createHealthFixtureDataUrl(),
      imageWidth: 640,
      imageHeight: 360
    });
    assert.strictEqual(refined.modules[0].mask, undefined);
    assert.match(refined.warnings.join("\n"), /outside normalized image bounds/);
  });
}

function testNormalizeRejectsInvalidMaskBounds() {
  assert.throws(
    () =>
      normalizeSam3Output(
        {
          modules: [
            {
              moduleId: "module_1",
              inputBounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
              maskBounds: { x: 0.95, y: 0.1, width: 0.2, height: 0.2 },
              score: 0.9
            }
          ]
        },
        createModules()
      ),
    /outside normalized image bounds/
  );
}

function testConfigRequiresExplicitEnableAndAck() {
  const disabled = createSam3Config(createConfig({ sam3Enabled: "" }));
  assert.strictEqual(disabled.sam3Enabled, false);
  assert.strictEqual(disabled.sam3Configured, false);
  const enabled = createSam3Config(createConfig());
  assert.strictEqual(enabled.sam3Enabled, true);
  assert.strictEqual(enabled.sam3Configured, true);
  assert.strictEqual(enabled.sam3LicenseAck, true);
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
