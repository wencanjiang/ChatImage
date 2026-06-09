"use strict";

const assert = require("assert");
const {
  buildCalibratedResult,
  buildCalibrationComparison,
  buildCalibrationDriftReport,
  parseCalibration
} = require("../src/calibration");

function main() {
  const calibration = parseCalibration(
    JSON.stringify([
      { id: "module_1", label: "目标", bounds: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 } },
      { moduleId: "module_2", label: "路径", x: 0.5, y: 0.2, width: 0.2, height: 0.2 }
    ])
  );
  assert.strictEqual(calibration[1].id, "module_2");
  assert.strictEqual(calibration[0].bounds.width, 0.2);

  const result = createResult();
  const calibrated = buildCalibratedResult(result, calibration, { appliedAt: "2026-06-01T00:00:00.000Z" });
  assert.strictEqual(calibrated.hotspots[0].x, 0.1);
  assert.strictEqual(calibrated.layout.regions[0].bounds.x, 0.1);
  assert.strictEqual(calibrated.layout.regions[0].alignedBy, "manual");
  assert.strictEqual(calibrated.layout.validation.valid, true);
  assert.strictEqual(calibrated.layout.alignment.provider, "manual");
  assert.strictEqual(calibrated.alignmentRaw.provider, "manual-calibration");
  assert.strictEqual(calibrated.alignmentRaw.previous.provider, "vision-api-align");
  assert.strictEqual(result.hotspots[0].x, 0.08);
  const comparison = buildCalibrationComparison(calibrated);
  assert.strictEqual(comparison.available, true);
  assert.strictEqual(comparison.status, "warn");
  assert.strictEqual(comparison.moduleCount, 2);
  assert.strictEqual(comparison.maxCenterDistance, 0.0283);
  assert.strictEqual(comparison.maxSizeDelta, 0);
  assert.strictEqual(comparison.modules[0].delta.x, 0.02);
  assert.strictEqual(comparison.modules[0].iou, 0.6807);
  assert.deepStrictEqual(buildCalibrationDriftReport(calibrated), comparison);
  assert.strictEqual(buildCalibrationComparison(createResult()).available, false);
  assert.strictEqual(
    buildCalibrationComparison({ alignmentRaw: { provider: "manual-calibration", modules: calibration } }).reason,
    "missing previous alignment modules"
  );

  assert.throws(() => parseCalibration("{bad"), /无法解析/);
  assert.throws(() => parseCalibration("{}"), /必须是数组/);
  assert.throws(
    () => parseCalibration(JSON.stringify([{ id: "module_1", x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, { id: "module_1", x: 0.4, y: 0.1, width: 0.2, height: 0.2 }])),
    /重复 id/
  );
  assert.throws(
    () => parseCalibration(JSON.stringify([{ id: "module_1", x: 0.9, y: 0.1, width: 0.2, height: 0.2 }])),
    /超出图片范围/
  );
  assert.throws(
    () => buildCalibratedResult(createResult(), JSON.stringify([{ id: "module_1", x: 0.1, y: 0.2, width: 0.2, height: 0.2 }])),
    /缺少模块/
  );
  assert.throws(
    () =>
      buildCalibratedResult(
        createResult(),
        JSON.stringify([
          { id: "module_1", x: 0.01, y: 0.2, width: 0.2, height: 0.2 },
          { id: "module_2", x: 0.5, y: 0.2, width: 0.2, height: 0.2 }
        ])
      ),
    /布局校验/
  );

  console.log("calibration.test.js passed");
}

function createResult() {
  return {
    title: "测试",
    alignmentRaw: {
      provider: "vision-api-align",
      alignments: [
        { moduleId: "module_1", label: "目标", bounds: { x: 0.08, y: 0.18, width: 0.2, height: 0.2 } },
        { moduleId: "module_2", label: "路径", bounds: { x: 0.48, y: 0.18, width: 0.2, height: 0.2 } }
      ]
    },
    hotspots: [
      { id: "module_1", label: "目标", x: 0.08, y: 0.18, width: 0.2, height: 0.2 },
      { id: "module_2", label: "路径", x: 0.48, y: 0.18, width: 0.2, height: 0.2 }
    ],
    layout: {
      family: "grid",
      regions: [
        { id: "region_1", role: "module", hotspotId: "module_1", bounds: { x: 0.08, y: 0.18, width: 0.2, height: 0.2 } },
        { id: "region_2", role: "module", hotspotId: "module_2", bounds: { x: 0.48, y: 0.18, width: 0.2, height: 0.2 } }
      ]
    }
  };
}

main();
