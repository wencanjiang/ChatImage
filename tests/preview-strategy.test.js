"use strict";

const assert = require("assert");
const {
  inferPreviewStrategy,
  CONTEXT_CROP_REGION_KINDS,
  INDEPENDENT_SUBJECT_KINDS,
  SUBJECT_WITH_LABEL_KINDS,
  MAP_LIKE_VISUAL_MODES,
  isInfographicCardLike,
  shouldUseContextPreviewShape
} = require("../src/preview-strategy");

// Unit tests for the preview decision logic that guards the
// "宝石山被抠成碎片" regression. The rule: map/scene/poster hotspots must use
// original-image context crops unless the hotspot is an explicitly independent
// subject (object/person/product), even when regionKind is missing on old data.
function main() {
  testMapRegionWithoutRegionKindUsesContextCrop();
  testMapLandmarkRegionUsesContextCrop();
  testMapSubjectMaskDoesNotOverrideContextRegion();
  testMapMissingKindSubjectMaskStillUsesContextCrop();
  testMapWaterRegionUsesContextCrop();
  testMapMountainRegionUsesContextCrop();
  testRouteRegionUsesRouteCaption();
  testSceneGuideRobotUsesSubjectWithLabelPreview();
  testMapLodgingMarkerUsesContextPreview();
  testLegendSubjectWithLabelUsesContextCrop();
  testSceneProductKeepsTransparentCutout();
  testScenePersonKeepsTransparentCutout();
  testInfographicCardDoesNotForceContextCrop();
  testSceneWithoutRegionKindDefaultsToContextCrop();
  testPosterWithoutRegionKindDefaultsToContextCrop();
  testLowConfidenceFullRegionForcesContextCrop();
  testRegionKindResolvedFromStructuredSpecWhenHotspotLacksIt();
  testMaskPolicyResolvedFromStructuredSpecWhenHotspotLacksIt();
  testAuxiliaryFlowStripResolvedFromStructuredSpec();
  testAuxiliaryFlowStripDetectedFromText();
  testEveryContextCropKindForcesContextCrop();
  testEveryIndependentSubjectKindKeepsCutout();
  testEverySubjectWithLabelKindUsesContextCrop();
  testInfographicCardUsesContextPreviewShape();
  testInfographicObjectUsesCardPreviewShape();
  testInfographicObjectWithLabelUsesCardPreviewShape();

  console.log("preview-strategy.test.js passed");
}

function testMapRegionWithoutRegionKindUsesContextCrop() {
  // This is the exact regression case: old saved data where regionKind was
  // lost. The whole-image fallback must still produce a context crop.
  const result = {
    structuredSpec: {
      visualMode: "map",
      modules: [{ id: "m_baoshi", title: "宝石山" }]
    }
  };
  const hotspot = { id: "m_baoshi" };
  const strategy = inferPreviewStrategy(result, hotspot);
  assert.strictEqual(strategy.preferContextCrop, true, "map hotspot without regionKind must use context crop");
  assert.strictEqual(strategy.caption, "区域上下文预览");
  assert.strictEqual(strategy.independentSubject, false);
}

function testMapLandmarkRegionUsesContextCrop() {
  const result = {
    structuredSpec: {
      visualMode: "map",
      modules: [{ id: "m1", regionKind: "landmark", maskPolicy: "full-region" }]
    }
  };
  const hotspot = { id: "m1", regionKind: "landmark" };
  const strategy = inferPreviewStrategy(result, hotspot);
  assert.strictEqual(strategy.preferContextCrop, true);
  assert.strictEqual(strategy.caption, "区域上下文预览");
}

function testMapSubjectMaskDoesNotOverrideContextRegion() {
  const result = {
    structuredSpec: {
      visualMode: "map",
      modules: [
        { id: "m_landmark", regionKind: "landmark", maskPolicy: "subject" },
        { id: "m_building", regionKind: "building", maskPolicy: "subject" },
        { id: "m_mountain", regionKind: "mountain", maskPolicy: "subject" }
      ]
    }
  };
  for (const id of ["m_landmark", "m_building", "m_mountain"]) {
    const module = result.structuredSpec.modules.find((item) => item.id === id);
    const strategy = inferPreviewStrategy(result, {
      id,
      regionKind: module.regionKind,
      maskPolicy: module.maskPolicy
    });
    assert.strictEqual(strategy.preferContextCrop, true, `${module.regionKind} subject masks in maps must stay contextual`);
    assert.strictEqual(strategy.independentSubject, false);
    assert.strictEqual(strategy.caption, "区域上下文预览");
  }
}

function testMapMissingKindSubjectMaskStillUsesContextCrop() {
  const result = {
    structuredSpec: {
      visualMode: "map",
      modules: [{ id: "m1", title: "三潭印月", maskPolicy: "subject" }]
    }
  };
  const strategy = inferPreviewStrategy(result, { id: "m1", maskPolicy: "subject" });
  assert.strictEqual(strategy.preferContextCrop, true);
  assert.strictEqual(strategy.independentSubject, false);
  assert.strictEqual(strategy.caption, "区域上下文预览");
}

function testMapWaterRegionUsesContextCrop() {
  const result = {
    structuredSpec: {
      visualMode: "map",
      modules: [{ id: "m1", regionKind: "water" }]
    }
  };
  const strategy = inferPreviewStrategy(result, { id: "m1", regionKind: "water" });
  assert.strictEqual(strategy.preferContextCrop, true);
}

function testMapMountainRegionUsesContextCrop() {
  const result = {
    structuredSpec: {
      visualMode: "map",
      modules: [{ id: "m1", regionKind: "mountain" }]
    }
  };
  const strategy = inferPreviewStrategy(result, { id: "m1", regionKind: "mountain" });
  assert.strictEqual(strategy.preferContextCrop, true);
}

function testRouteRegionUsesRouteCaption() {
  const result = {
    structuredSpec: {
      visualMode: "map",
      modules: [{ id: "m1", regionKind: "route", maskPolicy: "route" }]
    }
  };
  const strategy = inferPreviewStrategy(result, { id: "m1", regionKind: "route", maskPolicy: "route" });
  assert.strictEqual(strategy.preferContextCrop, true);
  assert.strictEqual(strategy.route, true);
  assert.strictEqual(strategy.caption, "路线区域预览");
}

function testSceneGuideRobotUsesSubjectWithLabelPreview() {
  // The museum guide robot label is part of the target, but the preview should
  // still keep organic surrounding context instead of exposing a raw SAM cutout.
  const result = {
    structuredSpec: {
      visualMode: "scene",
      modules: [
        {
          id: "m_robot",
          regionKind: "object-with-label",
          maskPolicy: "subject-with-label"
        }
      ]
    }
  };
  const strategy = inferPreviewStrategy(result, {
    id: "m_robot",
    regionKind: "object-with-label",
    maskPolicy: "subject-with-label"
  });
  assert.strictEqual(strategy.preferContextCrop, true);
  assert.strictEqual(strategy.independentSubject, false);
  assert.strictEqual(strategy.subjectWithLabel, true);
  assert.strictEqual(shouldUseContextPreviewShape(strategy), true);
}

function testMapLodgingMarkerUsesContextPreview() {
  const result = {
    structuredSpec: {
      visualMode: "map",
      modules: [
        {
          id: "m_lodging_marker",
          regionKind: "object-with-label",
          maskPolicy: "subject-with-label"
        }
      ]
    }
  };
  const strategy = inferPreviewStrategy(result, {
    id: "m_lodging_marker",
    regionKind: "object-with-label",
    maskPolicy: "subject-with-label"
  });
  assert.strictEqual(strategy.preferContextCrop, true);
  assert.strictEqual(strategy.independentSubject, false);
  assert.strictEqual(strategy.subjectWithLabel, true);
  assert.strictEqual(strategy.caption, "区域上下文预览");
}

function testLegendSubjectWithLabelUsesContextCrop() {
  const result = {
    structuredSpec: {
      visualMode: "map",
      modules: [
        {
          id: "m_lodging",
          regionKind: "legend",
          maskPolicy: "subject-with-label"
        }
      ]
    }
  };
  const strategy = inferPreviewStrategy(result, {
    id: "m_lodging",
    regionKind: "legend",
    maskPolicy: "subject-with-label"
  });
  assert.strictEqual(strategy.preferContextCrop, true);
  assert.strictEqual(strategy.subjectWithLabel, undefined);
  assert.strictEqual(strategy.independentSubject, false);
  assert.strictEqual(strategy.caption, "区域上下文预览");
}

function testSceneProductKeepsTransparentCutout() {
  const result = {
    structuredSpec: {
      visualMode: "scene",
      modules: [{ id: "m1", regionKind: "product", maskPolicy: "subject" }]
    }
  };
  const strategy = inferPreviewStrategy(result, { id: "m1", regionKind: "product" });
  assert.strictEqual(strategy.preferContextCrop, false);
  assert.strictEqual(strategy.independentSubject, true);
}

function testScenePersonKeepsTransparentCutout() {
  const result = {
    structuredSpec: {
      visualMode: "scene",
      modules: [{ id: "m1", regionKind: "person", maskPolicy: "subject" }]
    }
  };
  const strategy = inferPreviewStrategy(result, { id: "m1", regionKind: "person" });
  assert.strictEqual(strategy.preferContextCrop, false);
  assert.strictEqual(strategy.independentSubject, true);
}

function testInfographicCardDoesNotForceContextCrop() {
  // Infographic cards must keep their existing behavior (SAM3 mask preview),
  // not be forced into context crops.
  const result = {
    structuredSpec: {
      visualMode: "infographic",
      modules: [{ id: "m1", regionKind: "card" }]
    }
  };
  const strategy = inferPreviewStrategy(result, { id: "m1", regionKind: "card" });
  assert.strictEqual(strategy.preferContextCrop, false);
  assert.strictEqual(strategy.caption, "");
}

function testInfographicCardUsesContextPreviewShape() {
  const result = {
    structuredSpec: {
      visualMode: "infographic",
      modules: [{ id: "m1", regionKind: "card", maskPolicy: "full-region" }]
    }
  };
  const strategy = inferPreviewStrategy(result, { id: "m1", regionKind: "card", maskPolicy: "full-region" });
  assert.strictEqual(isInfographicCardLike(strategy), true);
  assert.strictEqual(shouldUseContextPreviewShape(strategy), true);
}

function testInfographicObjectUsesCardPreviewShape() {
  const result = {
    structuredSpec: {
      visualMode: "infographic",
      modules: [{ id: "m1", regionKind: "object", maskPolicy: "subject" }]
    }
  };
  const strategy = inferPreviewStrategy(result, { id: "m1", regionKind: "object", maskPolicy: "subject" });
  assert.strictEqual(strategy.independentSubject, false);
  assert.strictEqual(isInfographicCardLike(strategy), true);
  assert.strictEqual(shouldUseContextPreviewShape(strategy), true);
}

function testInfographicObjectWithLabelUsesCardPreviewShape() {
  const result = {
    structuredSpec: {
      visualMode: "infographic",
      modules: [{ id: "m1", regionKind: "object-with-label", maskPolicy: "subject-with-label" }]
    }
  };
  const strategy = inferPreviewStrategy(result, {
    id: "m1",
    regionKind: "object-with-label",
    maskPolicy: "subject-with-label"
  });
  assert.strictEqual(strategy.independentSubject, false);
  assert.strictEqual(strategy.subjectWithLabel, true);
  assert.strictEqual(isInfographicCardLike(strategy), true);
  assert.strictEqual(shouldUseContextPreviewShape(strategy), true);
}

function testSceneWithoutRegionKindDefaultsToContextCrop() {
  // A scene hotspot that lost its regionKind must not fall through to a
  // transparent cutout just because SAM3 produced a mask.
  const result = {
    structuredSpec: {
      visualMode: "scene",
      modules: [{ id: "m1", title: "展品区域" }]
    }
  };
  const strategy = inferPreviewStrategy(result, { id: "m1" });
  assert.strictEqual(strategy.preferContextCrop, true);
  assert.strictEqual(strategy.caption, "区域上下文预览");
}

function testPosterWithoutRegionKindDefaultsToContextCrop() {
  const result = {
    structuredSpec: {
      visualMode: "poster",
      modules: [{ id: "m1", title: "主视觉" }]
    }
  };
  const strategy = inferPreviewStrategy(result, { id: "m1" });
  assert.strictEqual(strategy.preferContextCrop, true);
}

function testLowConfidenceFullRegionForcesContextCrop() {
  // Even in infographic mode, a full-region mask with a low SAM3 score should
  // fall back to a context crop rather than showing a broken cutout.
  const result = {
    structuredSpec: {
      visualMode: "infographic",
      modules: [{ id: "m1", regionKind: "card", maskPolicy: "full-region" }]
    }
  };
  const hotspot = {
    id: "m1",
    regionKind: "card",
    maskPolicy: "full-region",
    mask: { score: 0.2 }
  };
  const strategy = inferPreviewStrategy(result, hotspot);
  assert.strictEqual(strategy.preferContextCrop, true);
}

function testRegionKindResolvedFromStructuredSpecWhenHotspotLacksIt() {
  // Old hotspot objects may not carry regionKind, but the structuredSpec
  // modules do. The resolver must recover the kind from the spec.
  const result = {
    structuredSpec: {
      visualMode: "map",
      modules: [{ id: "m1", regionKind: "mountain" }]
    }
  };
  const hotspot = { id: "m1" }; // no regionKind on hotspot itself
  const strategy = inferPreviewStrategy(result, hotspot);
  assert.strictEqual(strategy.regionKind, "mountain");
  assert.strictEqual(strategy.preferContextCrop, true);
}

function testMaskPolicyResolvedFromStructuredSpecWhenHotspotLacksIt() {
  const result = {
    structuredSpec: {
      visualMode: "scene",
      modules: [{ id: "m1", regionKind: "object-with-label", maskPolicy: "subject-with-label" }]
    }
  };
  const hotspot = { id: "m1" };
  const strategy = inferPreviewStrategy(result, hotspot);
  assert.strictEqual(strategy.maskPolicy, "subject-with-label");
  assert.strictEqual(strategy.preferContextCrop, true);
  assert.strictEqual(strategy.subjectWithLabel, true);
  assert.strictEqual(strategy.independentSubject, false);
  assert.strictEqual(shouldUseContextPreviewShape(strategy), true);
}

function testAuxiliaryFlowStripResolvedFromStructuredSpec() {
  const result = {
    structuredSpec: {
      visualMode: "infographic",
      modules: [],
      auxiliaryModules: [
        {
          id: "aux_1",
          regionKind: "flow-strip",
          maskPolicy: "full-region"
        }
      ]
    }
  };
  const strategy = inferPreviewStrategy(result, { id: "aux_1" });
  assert.strictEqual(strategy.preferContextCrop, true);
  assert.strictEqual(strategy.flowStrip, true);
  assert.strictEqual(shouldUseContextPreviewShape(strategy), true);
}

function testAuxiliaryFlowStripDetectedFromText() {
  const result = {
    structuredSpec: {
      visualMode: "infographic",
      modules: [],
      auxiliaryModules: [
        {
          id: "aux_1",
          title: "Resource collaboration workflow",
          imageText: "Deployment -> ReplicaSet -> Pod -> Service -> Ingress"
        }
      ]
    }
  };
  const strategy = inferPreviewStrategy(result, {
    id: "aux_1",
    label: "Resource collaboration workflow",
    detail: "Complete end-to-end resource flow across all nodes."
  });
  assert.strictEqual(strategy.preferContextCrop, true);
  assert.strictEqual(strategy.flowStrip, true);
  assert.strictEqual(shouldUseContextPreviewShape(strategy), true);
}

function testEveryContextCropKindForcesContextCrop() {
  const result = (regionKind) => ({
    structuredSpec: { visualMode: "map", modules: [{ id: "m1", regionKind }] }
  });
  for (const regionKind of CONTEXT_CROP_REGION_KINDS) {
    if (INDEPENDENT_SUBJECT_KINDS.includes(regionKind)) continue;
    const strategy = inferPreviewStrategy(result(regionKind), { id: "m1", regionKind });
    assert.strictEqual(
      strategy.preferContextCrop,
      true,
      `regionKind=${regionKind} should force context crop`
    );
  }
}

function testEveryIndependentSubjectKindKeepsCutout() {
  const result = (regionKind) => ({
    structuredSpec: { visualMode: "scene", modules: [{ id: "m1", regionKind }] }
  });
  for (const regionKind of INDEPENDENT_SUBJECT_KINDS) {
    const strategy = inferPreviewStrategy(result(regionKind), { id: "m1", regionKind });
    assert.strictEqual(
      strategy.preferContextCrop,
      false,
      `independent subject kind=${regionKind} should keep cutout`
    );
    assert.strictEqual(strategy.independentSubject, true);
  }
}

function testEverySubjectWithLabelKindUsesContextCrop() {
  const result = (regionKind) => ({
    structuredSpec: { visualMode: "scene", modules: [{ id: "m1", regionKind, maskPolicy: "subject-with-label" }] }
  });
  for (const regionKind of SUBJECT_WITH_LABEL_KINDS) {
    const strategy = inferPreviewStrategy(result(regionKind), {
      id: "m1",
      regionKind,
      maskPolicy: "subject-with-label"
    });
    assert.strictEqual(strategy.preferContextCrop, true);
    assert.strictEqual(strategy.subjectWithLabel, true);
    assert.strictEqual(strategy.independentSubject, false);
    assert.strictEqual(shouldUseContextPreviewShape(strategy), true);
  }
}

main();
