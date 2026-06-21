"use strict";

const assert = require("assert");
const {
  applyAlignmentsToLayout,
  assertImageDimensions,
  buildAlignmentPrompt,
  parseAlignmentResponse
} = require("../src/alignment");

function main() {
  testBuildPrompt();
  testParseAlignmentResponse();
  testParseAlignmentResponseKeepsCutoutImage();
  testParseAlignmentResponseKeepsBoundsExpansion();
  testInvalidAlignmentResponse();
  testImageDimensionsRequired();
  testApplyAlignmentsToLayout();
  testPlannedSourceIsNotReportedAsVision();
  testRepairInvalidAlignmentBounds();
  testPartialOverlapIsKeptForHitTestPersistence();
  testSemanticMapKeepsMaskedOverlap();
  testSemanticSceneKeepsSam3Cutouts();
  testFinalOverlapUsesLocalStrictRepair();
  testStrictRepairPreservesUnaffectedAlignment();
  testRestGraphqlFailedSampleBounds();
  testTransformerModuleTwoAdjacentOverlap();
  testNarrowLocateCardsDoNotExpandIntoStrictRepair();
  testInfographicHeaderStripFallsBackToPlannedCard();
  testMissingModuleFallsBackToPlanned();
  console.log("alignment.test.js passed");
}

function testImageDimensionsRequired() {
  assert.deepStrictEqual(assertImageDimensions(1536, 1024), { width: 1536, height: 1024 });
  assert.throws(() => assertImageDimensions(undefined, 900), /真实图片像素尺寸/);
  assert.throws(() => assertImageDimensions(0.3, 0.4), /真实图片像素尺寸/);
  assert.throws(
    () =>
      buildAlignmentPrompt({
        imageUrl: "https://cdn.example.com/image.png",
        imageWidth: null,
        imageHeight: 900,
        spec: createSpec(),
        layout: createLayout()
      }),
    /真实图片像素尺寸/
  );
}

function testBuildPrompt() {
  const prompt = buildAlignmentPrompt({
    imageUrl: "https://cdn.example.com/image.png",
    imageWidth: 1600,
    imageHeight: 900,
    spec: createSpec(),
    layout: createLayout()
  });
  assert.match(prompt, /图片地址：https:\/\/cdn\.example\.com\/image\.png/);
  assert.match(prompt, /module_1/);
  assert.match(prompt, /plannedBounds/);
  assert.match(prompt, /完整可点击信息模块/);
  assert.match(prompt, /confidence/);
  assert.match(prompt, /只返回 JSON/);
}

function testParseAlignmentResponse() {
  const parsed = parseAlignmentResponse(
    "```json\n" +
      JSON.stringify({
        modules: [
          { moduleId: "module_1", label: "目标", bounds: { x: 0.1, y: 0.2, width: 0.25, height: 0.22 }, confidence: 0.91 },
          { label: "路径", bounds: { x: 0.5, y: 0.2, width: 0.25, height: 0.22 }, confidence: 0.82 }
        ]
      }) +
      "\n```",
    createSpec().modules
  );
  assert.strictEqual(parsed.alignments.length, 2);
  assert.strictEqual(parsed.alignments[1].moduleId, "module_2");
  assert.strictEqual(parsed.alignments[0].bounds.width, 0.25);
}

function testParseAlignmentResponseKeepsCutoutImage() {
  const parsed = parseAlignmentResponse(
    JSON.stringify({
      modules: [
        { moduleId: "module_1", label: "Target", bounds: { x: 0.1, y: 0.2, width: 0.25, height: 0.22 }, confidence: 0.91 },
        {
          moduleId: "module_2",
          label: "Guide robot",
          bounds: { x: 0.5, y: 0.2, width: 0.25, height: 0.22 },
          confidence: 0.82,
          mask: {
            provider: "sam3",
            score: 0.8,
            bounds: { x: 0.5, y: 0.2, width: 0.25, height: 0.22 },
            image: "data:image/png;base64,mask",
            cutoutImage: "data:image/png;base64,cutout"
          }
        }
      ]
    }),
    createSpec().modules
  );
  assert.strictEqual(parsed.alignments[1].mask.image, "data:image/png;base64,mask");
  assert.strictEqual(parsed.alignments[1].mask.cutoutImage, "data:image/png;base64,cutout");
}

function testParseAlignmentResponseKeepsBoundsExpansion() {
  const parsed = parseAlignmentResponse(
    JSON.stringify({
      modules: [
        {
          moduleId: "module_1",
          label: "Target",
          bounds: { x: 0.08, y: 0.18, width: 0.22, height: 0.24 },
          rawBounds: { x: 0.1, y: 0.2, width: 0.18, height: 0.2 },
          boundsExpansion: {
            strategy: "infographic-card-small-pad",
            padX: 0.075,
            padY: 0.075,
            from: { x: 0.1, y: 0.2, width: 0.18, height: 0.2 },
            to: { x: 0.08, y: 0.18, width: 0.22, height: 0.24 }
          },
          confidence: 0.91
        }
      ]
    }),
    createSpec().modules
  );
  assert.strictEqual(parsed.alignments[0].rawBounds.width, 0.18);
  assert.strictEqual(parsed.alignments[0].boundsExpansion.strategy, "infographic-card-small-pad");
  assert.strictEqual(parsed.alignments[0].boundsExpansion.to.width, 0.22);
}

function testInvalidAlignmentResponse() {
  // Missing modules no longer throw — a single missing grounding result must
  // not discard all alignments. parseAlignmentResponse returns the alignments
  // it has; the planned fallback for missing modules is synthesized later in
  // applyAlignmentsToLayout (see testMissingModuleFallsBackToPlanned).
  const parsed = parseAlignmentResponse(
    JSON.stringify({
      modules: [
        { moduleId: "module_1", bounds: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 }, confidence: 0.9 }
      ]
    }),
    createSpec().modules
  );
  assert.strictEqual(parsed.alignments.length, 1);
  assert.throws(
    () =>
      parseAlignmentResponse(
        JSON.stringify({
          modules: [
            { moduleId: "module_1", bounds: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 }, confidence: 0.2 },
            { moduleId: "module_2", bounds: { x: 0.5, y: 0.2, width: 0.2, height: 0.2 }, confidence: 0.9 }
          ]
        }),
        createSpec().modules
      ),
    /置信度不足/
  );
  assert.throws(
    () =>
      parseAlignmentResponse(
        JSON.stringify({
          modules: [
            { moduleId: "module_1", bounds: { x: 0.9, y: 0.2, width: 0.2, height: 0.2 }, confidence: 0.9 },
            { moduleId: "module_2", bounds: { x: 0.5, y: 0.2, width: 0.2, height: 0.2 }, confidence: 0.9 }
          ]
        }),
        createSpec().modules
      ),
    /bounds 越界/
  );
}

function testMissingModuleFallsBackToPlanned() {
  // When one module has no grounding result, the well-grounded module keeps
  // its real box and the missing one falls back to its planned bounds tagged
  // "planned-fallback" — instead of discarding both alignments.
  const layout = {
    family: "grid",
    visualMode: "infographic",
    regions: [
      { id: "title", role: "title", bounds: { x: 0.06, y: 0.06, width: 0.5, height: 0.1 } },
      { id: "region_module_1", role: "module", hotspotId: "module_1", bounds: { x: 0.08, y: 0.22, width: 0.22, height: 0.22 } },
      { id: "region_module_2", role: "module", hotspotId: "module_2", bounds: { x: 0.38, y: 0.22, width: 0.22, height: 0.22 } }
    ]
  };
  const aligned = applyAlignmentsToLayout(layout, [
    { moduleId: "module_1", bounds: { x: 0.1, y: 0.2, width: 0.25, height: 0.22 }, confidence: 0.9 }
  ]);
  // module_1 keeps its grounded box.
  assert.strictEqual(aligned.regions[1].bounds.x, 0.1);
  assert.strictEqual(aligned.regions[1].alignedBy, "vision");
  // module_2 keeps its planned bounds and is tagged as a planned fallback.
  assert.strictEqual(aligned.regions[2].alignedBy, "planned-fallback");
  assert.strictEqual(aligned.alignment.missingModules.length, 1);
  assert.strictEqual(aligned.alignment.missingModules[0], "module_2");
}

function testApplyAlignmentsToLayout() {
  const layout = createLayout();
  const aligned = applyAlignmentsToLayout(layout, [
    { moduleId: "module_1", bounds: { x: 0.1, y: 0.2, width: 0.25, height: 0.22 }, confidence: 0.9 },
    { moduleId: "module_2", bounds: { x: 0.5, y: 0.2, width: 0.25, height: 0.22 }, confidence: 0.9 }
  ]);
  assert.deepStrictEqual(aligned.regions[0], layout.regions[0]);
  assert.strictEqual(aligned.regions[1].bounds.x, 0.1);
  assert.strictEqual(aligned.regions[1].alignedBy, "vision");
  assert.strictEqual(aligned.alignment.modules.length, 2);
}

function testPlannedSourceIsNotReportedAsVision() {
  const layout = createLayout();
  const aligned = applyAlignmentsToLayout(layout, [
    { moduleId: "module_1", bounds: { x: 0.1, y: 0.2, width: 0.25, height: 0.22 }, confidence: 0.5, source: "planned" },
    { moduleId: "module_2", bounds: { x: 0.5, y: 0.2, width: 0.25, height: 0.22 }, confidence: 0.5, source: "planned" }
  ]);
  assert.strictEqual(aligned.validation.valid, true);
  assert.strictEqual(aligned.alignment.provider, "planned-fallback");
  assert.deepStrictEqual(aligned.alignment.sourceCounts, { planned: 2 });
  assert.strictEqual(aligned.regions[1].alignedBy, "planned");
}

function testRepairInvalidAlignmentBounds() {
  const layout = createLayout();
  const aligned = applyAlignmentsToLayout(layout, [
    { moduleId: "module_1", label: "目标", bounds: { x: 0.12, y: 0.22, width: 0.04, height: 0.04 }, confidence: 0.9 },
    { moduleId: "module_2", label: "路径", bounds: { x: 0.13, y: 0.23, width: 0.04, height: 0.04 }, confidence: 0.9 }
  ]);
  assert.strictEqual(aligned.validation.valid, true);
  assert.strictEqual(aligned.alignment.provider, "vision-repaired");
  assert.deepStrictEqual(aligned.alignment.acceptedModules, ["module_1"]);
  assert.strictEqual(aligned.alignment.rejectedModules.length, 1);
  assert.strictEqual(aligned.regions[1].alignedBy, "vision");
  assert.ok(aligned.regions[1].bounds.width >= 0.12);
  assert.strictEqual(aligned.regions[2].bounds.x, layout.regions[2].bounds.x);
  assert.strictEqual(aligned.regions[2].alignedBy, undefined);
}

function testPartialOverlapIsKeptForHitTestPersistence() {
  const layout = createLayout();
  const aligned = applyAlignmentsToLayout(layout, [
    { moduleId: "module_1", label: "target", bounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.24 }, confidence: 0.9, source: "locateanything" },
    { moduleId: "module_2", label: "path", bounds: { x: 0.34, y: 0.2, width: 0.3, height: 0.24 }, confidence: 0.9, source: "sam3" }
  ]);
  assert.strictEqual(aligned.validation.valid, true);
  assert.strictEqual(aligned.alignment.provider, "vision");
  assert.deepStrictEqual(aligned.alignment.sourceCounts, { locateanything: 1, sam3: 1 });
  assert.ok(!aligned.alignment.strictRepairedModules);
  assert.strictEqual(require("../src/core").validateLayoutRegions(aligned.regions).valid, false);
}

function testSemanticMapKeepsMaskedOverlap() {
  const layout = {
    ...createLayout(),
    family: "compare",
    layoutVariant: "map"
  };
  const mask = {
    provider: "sam3",
    score: 0.8,
    bounds: { x: 0.12, y: 0.22, width: 0.28, height: 0.22 },
    image: "data:image/png;base64,abc"
  };
  const aligned = applyAlignmentsToLayout(layout, [
    {
      moduleId: "module_1",
      label: "west route",
      bounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.24 },
      confidence: 0.9,
      source: "mimo-vision",
      mask
    },
    {
      moduleId: "module_2",
      label: "east route",
      bounds: { x: 0.34, y: 0.2, width: 0.3, height: 0.24 },
      confidence: 0.9,
      source: "mimo-vision",
      mask: { ...mask, bounds: { x: 0.34, y: 0.2, width: 0.3, height: 0.24 } }
    }
  ]);
  assert.strictEqual(aligned.validation.valid, true);
  assert.strictEqual(aligned.alignment.provider, "vision");
  assert.strictEqual(aligned.regions[1].alignedBy, "mimo-vision");
  assert.strictEqual(aligned.regions[2].alignedBy, "mimo-vision");
  assert.ok(aligned.regions[1].mask);
  assert.ok(aligned.regions[2].mask);
  assert.strictEqual(require("../src/core").validateLayoutRegions(aligned.regions).valid, false);
}

function testSemanticSceneKeepsSam3Cutouts() {
  const layout = {
    ...createLayout(),
    visualMode: "scene",
    layoutVariant: "grid",
    regions: [
      { id: "title", role: "title", bounds: { x: 0.06, y: 0.06, width: 0.5, height: 0.1 } },
      { id: "region_module_1", role: "module", hotspotId: "module_1", bounds: { x: 0.06, y: 0.28, width: 0.42, height: 0.26 } },
      { id: "region_module_2", role: "module", hotspotId: "module_2", bounds: { x: 0.52, y: 0.28, width: 0.42, height: 0.26 } },
      { id: "region_module_3", role: "module", hotspotId: "module_3", bounds: { x: 0.06, y: 0.6, width: 0.42, height: 0.26 } },
      { id: "region_module_4", role: "module", hotspotId: "module_4", bounds: { x: 0.52, y: 0.6, width: 0.42, height: 0.26 } }
    ]
  };
  const samMask = {
    provider: "sam3",
    score: 0.82,
    bounds: { x: 0.09, y: 0.28, width: 0.18, height: 0.58 },
    cutoutImage: "data:image/png;base64,cutout",
    image: "data:image/png;base64,mask"
  };
  const aligned = applyAlignmentsToLayout(layout, [
    { moduleId: "module_1", bounds: { x: 0.085, y: 0.285, width: 0.18, height: 0.58 }, confidence: 0.9, source: "mimo-vision", mask: samMask },
    { moduleId: "module_2", bounds: { x: 0.35, y: 0.04, width: 0.42, height: 0.65 }, confidence: 0.9, source: "mimo-vision", mask: samMask },
    { moduleId: "module_3", bounds: { x: 0.29, y: 0.49, width: 0.35, height: 0.5 }, confidence: 0.9, source: "mimo-vision", mask: samMask },
    { moduleId: "module_4", bounds: { x: 0, y: 0, width: 1, height: 1 }, confidence: 0.8, source: "mimo-vision", mask: samMask }
  ]);
  const guide = aligned.regions.find((region) => region.hotspotId === "module_1");
  assert.strictEqual(aligned.validation.valid, true);
  assert.strictEqual(aligned.alignment.provider, "vision");
  assert.strictEqual(guide.alignedBy, "mimo-vision");
  assert.strictEqual(guide.mask.cutoutImage, "data:image/png;base64,cutout");
  assert.ok(!aligned.alignment.strictRepairedModules);
  assert.strictEqual(require("../src/core").validateLayoutRegions(aligned.regions).valid, false);
}

function testFinalOverlapUsesLocalStrictRepair() {
  const layout = createLayout();
  const aligned = applyAlignmentsToLayout(layout, [
    { moduleId: "module_1", label: "target", bounds: { x: 0.49, y: 0.2, width: 0.25, height: 0.22 }, confidence: 0.9 },
    { moduleId: "module_2", label: "path", bounds: { x: 0.49, y: 0.2, width: 0.25, height: 0.22 }, confidence: 0.9 }
  ]);
  assert.strictEqual(aligned.validation.valid, true);
  assert.strictEqual(aligned.alignment.provider, "vision-strict-repaired");
  assert.deepStrictEqual(aligned.regions[1].bounds, layout.regions[1].bounds);
  assert.strictEqual(aligned.regions[2].alignedBy, "vision");
  assert.deepStrictEqual(aligned.regions[2].bounds, { x: 0.49, y: 0.2, width: 0.25, height: 0.22 });
  assert.ok(aligned.alignment.rejectedModules.length >= 1);
  assert.ok(aligned.alignment.strictValidationErrors.some((error) => /overlaps/.test(error)));
}

function testStrictRepairPreservesUnaffectedAlignment() {
  const layout = {
    family: "grid",
    visualMode: "infographic",
    regions: [
      { id: "title", role: "title", bounds: { x: 0.06, y: 0.06, width: 0.5, height: 0.1 } },
      { id: "region_module_1", role: "module", hotspotId: "module_1", bounds: { x: 0.08, y: 0.22, width: 0.22, height: 0.22 } },
      { id: "region_module_2", role: "module", hotspotId: "module_2", bounds: { x: 0.38, y: 0.22, width: 0.22, height: 0.22 } },
      { id: "region_module_3", role: "module", hotspotId: "module_3", bounds: { x: 0.68, y: 0.22, width: 0.22, height: 0.22 } }
    ]
  };
  const mask = { provider: "sam3", score: 0.82, image: "data:image/png;base64,mask" };
  const aligned = applyAlignmentsToLayout(layout, [
    { moduleId: "module_1", label: "first", bounds: { x: 0.38, y: 0.22, width: 0.22, height: 0.22 }, confidence: 0.9, source: "locateanything", mask },
    { moduleId: "module_2", label: "second", bounds: { x: 0.38, y: 0.22, width: 0.22, height: 0.22 }, confidence: 0.9, source: "locateanything", mask },
    { moduleId: "module_3", label: "third", bounds: { x: 0.7, y: 0.24, width: 0.2, height: 0.2 }, confidence: 0.9, source: "sam3", mask }
  ]);
  const module3 = aligned.regions.find((region) => region.hotspotId === "module_3");
  assert.strictEqual(aligned.validation.valid, true);
  assert.strictEqual(aligned.alignment.provider, "vision-strict-repaired");
  assert.strictEqual(module3.alignedBy, "sam3");
  assert.ok(module3.mask);
  assert.ok(!aligned.alignment.strictRepairedModules.includes("module_3"));
  assert.deepStrictEqual(aligned.alignment.sourceCounts, { planned: 1, locateanything: 1, sam3: 1 });
  assert.strictEqual(require("../src/core").validateLayoutRegions(aligned.regions).valid, true);
}

function testRestGraphqlFailedSampleBounds() {
  const layout = {
    family: "compare",
    regions: [
      { id: "title", role: "title", bounds: { x: 0.06, y: 0.06, width: 0.58, height: 0.08 } },
      { id: "region_module_1", role: "module", hotspotId: "module_1", bounds: { x: 0.06, y: 0.26, width: 0.4, height: 0.21 } },
      { id: "region_module_2", role: "module", hotspotId: "module_2", bounds: { x: 0.54, y: 0.26, width: 0.4, height: 0.21 } },
      { id: "region_module_3", role: "module", hotspotId: "module_3", bounds: { x: 0.06, y: 0.52, width: 0.4, height: 0.21 } },
      { id: "region_module_4", role: "module", hotspotId: "module_4", bounds: { x: 0.54, y: 0.52, width: 0.4, height: 0.21 } },
      { id: "region_module_5", role: "module", hotspotId: "module_5", bounds: { x: 0.18, y: 0.77, width: 0.64, height: 0.17 } }
    ]
  };
  const aligned = applyAlignmentsToLayout(layout, [
    { moduleId: "module_1", bounds: { x: 0.035, y: 0.13321997874601488, width: 0.15110047846889949, height: 0.27872476089266734 }, confidence: 0.899 },
    { moduleId: "module_2", bounds: { x: 0.6584354066985646, y: 0.035, width: 0.18675598086124406, height: 0.12000000000000002 }, confidence: 0.9 },
    { moduleId: "module_3", bounds: { x: 0.32410526315789473, y: 0.1385334750265675, width: 0.1873540669856459, height: 0.27341126461211473 }, confidence: 0.9 },
    { moduleId: "module_4", bounds: { x: 0.6506602870813397, y: 0.4222741764080765, width: 0.3137416267942584, height: 0.25109458023379383 }, confidence: 0.899 },
    { moduleId: "module_5", bounds: { x: 0.6500622009569378, y: 0.6985759829968119, width: 0.3143397129186603, height: 0.2614240170031881 }, confidence: 0.899 }
  ]);
  assert.strictEqual(aligned.validation.valid, true);
  assert.strictEqual(aligned.alignment.provider, "vision");
  assert.strictEqual(aligned.regions.filter((region) => region.role === "module" && region.alignedBy === "vision").length, 5);
  assert.ok(aligned.regions.find((region) => region.hotspotId === "module_2").bounds.height >= 0.12);
  assert.ok(aligned.regions.find((region) => region.hotspotId === "module_1").bounds.width > 0.14);
}

function testTransformerModuleTwoAdjacentOverlap() {
  const layout = {
    family: "hub",
    regions: [
      { id: "title", role: "title", bounds: { x: 0.06, y: 0.06, width: 0.58, height: 0.08 } },
      { id: "region_module_1", role: "module", hotspotId: "module_1", bounds: { x: 0.36, y: 0.36, width: 0.28, height: 0.25 } },
      { id: "region_module_2", role: "module", hotspotId: "module_2", bounds: { x: 0.08, y: 0.26, width: 0.24, height: 0.22 } },
      { id: "region_module_3", role: "module", hotspotId: "module_3", bounds: { x: 0.68, y: 0.26, width: 0.24, height: 0.22 } },
      { id: "region_module_4", role: "module", hotspotId: "module_4", bounds: { x: 0.14, y: 0.63, width: 0.26, height: 0.22 } },
      { id: "region_module_5", role: "module", hotspotId: "module_5", bounds: { x: 0.6, y: 0.63, width: 0.26, height: 0.22 } },
      { id: "region_aux_1", role: "auxiliary", hotspotId: "aux_1", bounds: { x: 0.06, y: 0.22, width: 0.25, height: 0.12 } }
    ]
  };
  const aligned = applyAlignmentsToLayout(layout, [
    { moduleId: "module_1", bounds: { x: 0.32, y: 0.288, width: 0.207, height: 0.327 }, confidence: 0.82, source: "locateanything" },
    { moduleId: "module_2", bounds: { x: 0.027, y: 0.427, width: 0.263, height: 0.252 }, confidence: 0.82, source: "locateanything" },
    { moduleId: "module_3", bounds: { x: 0.555, y: 0.43, width: 0.246, height: 0.188 }, confidence: 0.82, source: "locateanything" },
    { moduleId: "module_4", bounds: { x: 0.046, y: 0.703, width: 0.344, height: 0.297 }, confidence: 0.82, source: "locateanything" },
    { moduleId: "module_5", bounds: { x: 0.446, y: 0.697, width: 0.352, height: 0.303 }, confidence: 0.82, source: "locateanything" },
    { moduleId: "aux_1", bounds: { x: 0.06, y: 0.195, width: 0.25, height: 0.17 }, confidence: 0.5, source: "planned" }
  ]);
  const module2 = aligned.regions.find((region) => region.hotspotId === "module_2");
  const module4 = aligned.regions.find((region) => region.hotspotId === "module_4");
  assert.strictEqual(aligned.validation.valid, true);
  assert.strictEqual(require("../src/core").validateLayoutRegions(aligned.regions).valid, false);
  assert.strictEqual(module2.alignedBy, "locateanything");
  assert.strictEqual(module4.alignedBy, "locateanything");
  assert.ok(module4.bounds.y >= 0.63);
  assert.deepStrictEqual(aligned.alignment.sourceCounts, { locateanything: 5, planned: 1 });
}

function testNarrowLocateCardsDoNotExpandIntoStrictRepair() {
  const layout = {
    family: "grid",
    visualMode: "infographic",
    regions: [
      { id: "title", role: "title", bounds: { x: 0.06, y: 0.06, width: 0.7, height: 0.08 } },
      { id: "region_module_1", role: "module", hotspotId: "module_1", bounds: { x: 0.06, y: 0.39, width: 0.125833, height: 0.3 } },
      { id: "region_module_2", role: "module", hotspotId: "module_2", bounds: { x: 0.210833, y: 0.39, width: 0.125833, height: 0.3 } },
      { id: "region_module_3", role: "module", hotspotId: "module_3", bounds: { x: 0.361667, y: 0.39, width: 0.125833, height: 0.3 } },
      { id: "region_module_4", role: "module", hotspotId: "module_4", bounds: { x: 0.5125, y: 0.39, width: 0.125833, height: 0.3 } },
      { id: "region_module_5", role: "module", hotspotId: "module_5", bounds: { x: 0.663333, y: 0.39, width: 0.125833, height: 0.3 } },
      { id: "region_module_6", role: "module", hotspotId: "module_6", bounds: { x: 0.814167, y: 0.39, width: 0.125833, height: 0.3 } },
      { id: "region_aux_1", role: "auxiliary", hotspotId: "aux_1", bounds: { x: 0.06, y: 0.22, width: 0.2, height: 0.12 } }
    ]
  };
  const aligned = applyAlignmentsToLayout(layout, [
    { moduleId: "module_1", bounds: { x: 0.027, y: 0.3, width: 0.144, height: 0.474 }, confidence: 0.9, source: "locateanything" },
    { moduleId: "module_2", bounds: { x: 0.210833, y: 0.39, width: 0.125833, height: 0.3 }, confidence: 0.5, source: "planned" },
    { moduleId: "module_3", bounds: { x: 0.345, y: 0.294, width: 0.149, height: 0.483 }, confidence: 0.89, source: "locateanything" },
    { moduleId: "module_4", bounds: { x: 0.5125, y: 0.39, width: 0.125833, height: 0.3 }, confidence: 0.5, source: "planned" },
    { moduleId: "module_5", bounds: { x: 0.667, y: 0.293, width: 0.146, height: 0.484 }, confidence: 0.9, source: "locateanything" },
    { moduleId: "module_6", bounds: { x: 0.828, y: 0.293, width: 0.145, height: 0.484 }, confidence: 0.9, source: "locateanything" },
    { moduleId: "aux_1", bounds: { x: 0.06, y: 0.22, width: 0.2, height: 0.12 }, confidence: 0.5, source: "planned" }
  ]);
  assert.strictEqual(aligned.validation.valid, true);
  assert.ok(!aligned.alignment.strictRepairedModules || aligned.alignment.strictRepairedModules.length === 0);
  assert.strictEqual(aligned.regions.find((region) => region.hotspotId === "module_1").alignedBy, "locateanything");
  assert.strictEqual(aligned.regions.find((region) => region.hotspotId === "module_6").alignedBy, "locateanything");
  assert.deepStrictEqual(aligned.alignment.sourceCounts, { locateanything: 4, planned: 3 });
}

function testInfographicHeaderStripFallsBackToPlannedCard() {
  const layout = {
    family: "hub",
    layoutVariant: "asymmetric-focus-stack",
    visualMode: "infographic",
    regions: [
      { id: "title", role: "title", bounds: { x: 0.06, y: 0.06, width: 0.58, height: 0.08 } },
      { id: "summary", role: "summary", bounds: { x: 0.06, y: 0.15, width: 0.62, height: 0.07 } },
      { id: "region_module_1", role: "module", hotspotId: "module_1", bounds: { x: 0.06, y: 0.25, width: 0.26, height: 0.56 } },
      { id: "region_module_2", role: "module", hotspotId: "module_2", bounds: { x: 0.35, y: 0.25, width: 0.26, height: 0.56 } },
      { id: "region_module_3", role: "module", hotspotId: "module_3", bounds: { x: 0.65, y: 0.22, width: 0.29, height: 0.18 } },
      { id: "region_module_4", role: "module", hotspotId: "module_4", bounds: { x: 0.65, y: 0.45, width: 0.29, height: 0.18 } }
    ]
  };
  const aligned = applyAlignmentsToLayout(layout, [
    {
      moduleId: "module_3",
      label: "Service",
      bounds: { x: 0.46316, y: 0.035, width: 0.50184, height: 0.1632 },
      confidence: 0.82,
      source: "locateanything"
    }
  ]);
  const serviceRegion = aligned.regions.find((region) => region.hotspotId === "module_3");
  assert.strictEqual(aligned.validation.valid, true);
  assert.strictEqual(aligned.alignment.provider, "vision-fallback");
  assert.deepStrictEqual(serviceRegion.bounds, layout.regions.find((region) => region.hotspotId === "module_3").bounds);
  assert.strictEqual(serviceRegion.alignedBy, undefined);
  assert.strictEqual(aligned.alignment.rejectedModules.length, 1);
  assert.ok(
    ["candidate_looks_like_header_strip", "candidate_looks_like_cross_panel_strip"].includes(
      aligned.alignment.rejectedModules[0].reason
    )
  );
}

function createSpec() {
  return {
    modules: [
      { id: "module_1", title: "目标", imageText: "识别目标" },
      { id: "module_2", title: "路径", imageText: "执行路径" }
    ]
  };
}

function createLayout() {
  return {
    family: "grid",
    regions: [
      { id: "title", role: "title", bounds: { x: 0.06, y: 0.06, width: 0.5, height: 0.1 } },
      {
        id: "region_module_1",
        role: "module",
        hotspotId: "module_1",
        bounds: { x: 0.1, y: 0.2, width: 0.25, height: 0.22 }
      },
      {
        id: "region_module_2",
        role: "module",
        hotspotId: "module_2",
        bounds: { x: 0.5, y: 0.2, width: 0.25, height: 0.22 }
      }
    ]
  };
}

main();
