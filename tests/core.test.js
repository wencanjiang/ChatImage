"use strict";

const assert = require("assert");
const {
  chooseFamily,
  iconGlyph,
  inferRelationType,
  overlapArea,
  validateLayoutRegions
} = require("../src/core");

function main() {
  assert.strictEqual(inferRelationType("请对比 A 和 B 的优缺点"), "compare");
  assert.strictEqual(inferRelationType("说明完整流程和步骤"), "flow");
  assert.strictEqual(inferRelationType("大模型 Agent 工作流怎么运转"), "flow");
  assert.strictEqual(inferRelationType("梳理发展时间线"), "timeline");
  assert.strictEqual(inferRelationType("用矩阵分析优先级"), "matrix");
  assert.strictEqual(inferRelationType("介绍一下产品价值"), "hierarchy");

  assert.strictEqual(chooseFamily({ relationType: "flow", modules: [] }), "flow");
  assert.strictEqual(chooseFamily({ relationType: "compare", modules: [] }), "compare");
  assert.strictEqual(chooseFamily({ relationType: "hierarchy", modules: Array.from({ length: 5 }) }), "hub");
  assert.strictEqual(chooseFamily({ relationType: "hierarchy", modules: Array.from({ length: 4 }) }), "grid");

  assert.strictEqual(iconGlyph("risk"), "RK");
  assert.strictEqual(iconGlyph("STEP"), "ST");
  assert.strictEqual(iconGlyph("unknown"), "CI");

  assert.ok(
    Math.abs(
      overlapArea(
        { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        { x: 0.2, y: 0.2, width: 0.2, height: 0.2 }
      ) - 0.01
    ) < 0.000001
  );

  const valid = validateLayoutRegions([
    {
      id: "a",
      role: "module",
      hotspotId: "module_1",
      bounds: { x: 0.06, y: 0.2, width: 0.2, height: 0.2 }
    },
    {
      id: "b",
      role: "module",
      hotspotId: "module_2",
      bounds: { x: 0.4, y: 0.2, width: 0.2, height: 0.2 }
    }
  ]);
  assert.strictEqual(valid.valid, true);

  const invalid = validateLayoutRegions([
    {
      id: "a",
      role: "module",
      hotspotId: "module_1",
      bounds: { x: 0.01, y: 0.2, width: 0.08, height: 0.2 }
    },
    {
      id: "b",
      role: "module",
      hotspotId: "module_1",
      bounds: { x: 0.02, y: 0.22, width: 0.2, height: 0.2 }
    }
  ]);
  assert.strictEqual(invalid.valid, false);
  assert.match(invalid.errors.join("\n"), /duplicated/);
  assert.match(invalid.errors.join("\n"), /safe margin/);
  assert.match(invalid.errors.join("\n"), /minimum click area/);
  assert.match(invalid.errors.join("\n"), /overlaps/);

  const freeformOverlap = validateLayoutRegions([
    {
      id: "route",
      role: "module",
      hotspotId: "module_route",
      shape: "freeform",
      bounds: { x: 0.12, y: 0.18, width: 0.5, height: 0.12 }
    },
    {
      id: "mountain",
      role: "module",
      hotspotId: "module_mountain",
      shape: "freeform",
      bounds: { x: 0.36, y: 0.2, width: 0.26, height: 0.24 }
    }
  ]);
  assert.strictEqual(freeformOverlap.valid, true);

  console.log("core.test.js passed");
}

main();
