"use strict";

const assert = require("assert");
const { buildQualityReport, formatQualitySummary, parseAspectRatio } = require("../src/quality");

function main() {
  assert.strictEqual(parseAspectRatio("16:9").toFixed(3), "1.778");
  assert.strictEqual(parseAspectRatio("bad"), null);

  const report = buildQualityReport(createResult());
  assert.strictEqual(report.status, "ok");
  assert.strictEqual(report.score, 100);
  assert.strictEqual(report.canRegenerate, false);
  assert.strictEqual(report.summary, "6 项检查全部通过。");
  assert.strictEqual(report.checks.length, 6);
  assert.ok(report.checks.every((check) => check.status === "ok"));
  assert.match(formatQualitySummary(1, 2, 5), /1 项失败/);

  const auxResult = createResult();
  auxResult.layout.regions.push({
    id: "region_aux_1",
    role: "auxiliary",
    hotspotId: "aux_1",
    bounds: { x: 0.1, y: 0.88, width: 0.3, height: 0.08 },
    shape: "rect",
    zIndex: 3
  });
  auxResult.hotspots.push({
    ...buildHotspot("aux_1", 0.1, 0.88),
    width: 0.3,
    height: 0.08
  });
  const auxReport = buildQualityReport(auxResult);
  assert.strictEqual(auxReport.checks.find((check) => check.id === "hotspot_bindings").status, "ok");

  const badBinding = createResult();
  badBinding.hotspots[0].x = 0.2;
  const badBindingReport = buildQualityReport(badBinding);
  assert.strictEqual(badBindingReport.status, "fail");
  assert.strictEqual(badBindingReport.canRegenerate, true);
  assert.match(
    badBindingReport.checks.find((check) => check.id === "hotspot_bindings").detail,
    /不一致/
  );

  const oldHistory = createResult();
  oldHistory.hotspots.forEach((hotspot) => delete hotspot.textBudget);
  const oldHistoryReport = buildQualityReport(oldHistory);
  assert.strictEqual(oldHistoryReport.status, "warn");
  assert.strictEqual(oldHistoryReport.canRegenerate, true);
  assert.strictEqual(oldHistoryReport.checks.find((check) => check.id === "text_budgets").status, "warn");

  const badPrompt = createResult();
  badPrompt.imagePrompt = "Create image";
  const badPromptReport = buildQualityReport(badPrompt);
  assert.strictEqual(badPromptReport.status, "warn");
  assert.strictEqual(badPromptReport.checks.find((check) => check.id === "image_prompt").status, "warn");

  const semanticScene = createResult();
  semanticScene.structuredSpec = { visualMode: "scene" };
  semanticScene.layout.visualMode = "scene";
  semanticScene.layout.layoutVariant = "scene";
  semanticScene.alignmentRaw = { provider: "locateanything", layoutProvider: "vision", sourceCounts: { "mimo-vision": 3 } };
  semanticScene.imagePrompt = "Target semantic regions visualEvidence maskPolicy locatorQueries easy to segment later";
  semanticScene.layout.regions[1].bounds = { x: 0.18, y: 0.24, width: 0.36, height: 0.34 };
  semanticScene.hotspots[1].x = 0.18;
  semanticScene.hotspots[1].y = 0.24;
  semanticScene.hotspots[1].width = 0.36;
  semanticScene.hotspots[1].height = 0.34;
  const semanticSceneReport = buildQualityReport(semanticScene);
  assert.strictEqual(semanticSceneReport.status, "ok");
  assert.strictEqual(semanticSceneReport.checks.find((check) => check.id === "layout_validation").status, "ok");
  assert.strictEqual(semanticSceneReport.checks.find((check) => check.id === "image_prompt").status, "ok");

  const badLayout = createResult();
  badLayout.layout.regions[0].bounds.width = 0.02;
  const badLayoutReport = buildQualityReport(badLayout);
  assert.strictEqual(badLayoutReport.status, "fail");
  assert.strictEqual(badLayoutReport.checks.find((check) => check.id === "layout_validation").status, "fail");

  const badAlignment = createResult();
  badAlignment.alignmentRaw = {
    provider: "alignment-fallback",
    fallback: "planned-layout",
    error: "region_module_1 overlaps region_module_2",
    previous: { provider: "locateanything" }
  };
  const badAlignmentReport = buildQualityReport(badAlignment);
  assert.strictEqual(badAlignmentReport.status, "fail");
  assert.strictEqual(badAlignmentReport.checks.find((check) => check.id === "alignment_provider").status, "fail");

  const repairedAlignment = createResult();
  repairedAlignment.alignmentRaw = {
    provider: "locateanything",
    layoutProvider: "vision-fallback",
    rejectedModules: [{ moduleId: "module_1" }]
  };
  const repairedAlignmentReport = buildQualityReport(repairedAlignment);
  assert.strictEqual(repairedAlignmentReport.status, "warn");
  assert.strictEqual(repairedAlignmentReport.checks.find((check) => check.id === "alignment_provider").status, "warn");

  console.log("quality.test.js passed");
}

function createResult() {
  return {
    title: "测试图",
    summary: "测试摘要",
    imageUrl: "data:image/svg+xml,test",
    imageWidth: 1600,
    imageHeight: 900,
    imagePrompt:
      "Module regions with normalized bounds\ntextBudget\nLeave enough visual separation so transparent hotspots can align with each module.",
    layout: {
      family: "grid",
      aspectRatio: "16:9",
      regions: [
        {
          id: "region_module_1",
          role: "module",
          hotspotId: "module_1",
          bounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.3 },
          shape: "rect",
          zIndex: 2
        },
        {
          id: "region_module_2",
          role: "module",
          hotspotId: "module_2",
          bounds: { x: 0.5, y: 0.2, width: 0.3, height: 0.3 },
          shape: "rect",
          zIndex: 2
        },
        {
          id: "region_module_3",
          role: "module",
          hotspotId: "module_3",
          bounds: { x: 0.1, y: 0.58, width: 0.3, height: 0.3 },
          shape: "rect",
          zIndex: 2
        }
      ]
    },
    hotspots: [
      buildHotspot("module_1", 0.1, 0.2),
      buildHotspot("module_2", 0.5, 0.2),
      buildHotspot("module_3", 0.1, 0.58)
    ]
  };
}

function buildHotspot(id, x, y) {
  return {
    id,
    label: "标题",
    shortText: "短文本",
    detail: "详情",
    iconHint: "idea",
    textBudget: {
      titleLineChars: 6,
      titleMaxLines: 1,
      titleMaxChars: 6,
      imageTextLineChars: 8,
      imageTextMaxLines: 1,
      imageTextMaxChars: 8
    },
    x,
    y,
    width: 0.3,
    height: 0.3
  };
}

main();
