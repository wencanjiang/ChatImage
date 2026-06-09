"use strict";

const assert = require("assert");
const { renderSvg } = require("../src/mock-svg");

function main() {
  const svg = renderSvg(
    {
      title: "Test<script>",
      summary: "Summary & info",
      modules: [
        {
          id: "module_1",
          title: "Risk scan<script>",
          imageText: "This is a long text used to check wrapping and escaping inside a card.",
          iconHint: "risk"
        },
        {
          id: "module_2",
          title: "Execution steps",
          imageText: "Second module.",
          iconHint: "step"
        }
      ],
      auxiliaryModules: [
        {
          id: "aux_1",
          title: "External tools",
          imageText: "Search and calculators",
          iconHint: "tool"
        }
      ]
    },
    {
      family: "flow",
      canvas: { width: 1600, height: 900 },
      regions: [
        { id: "title", role: "title", bounds: { x: 0.06, y: 0.06, width: 0.58, height: 0.08 } },
        { id: "summary", role: "summary", bounds: { x: 0.06, y: 0.15, width: 0.62, height: 0.07 } },
        {
          id: "region_module_1",
          role: "module",
          hotspotId: "module_1",
          bounds: { x: 0.08, y: 0.35, width: 0.18, height: 0.28 },
          shape: "rect",
          zIndex: 2
        },
        {
          id: "region_module_2",
          role: "module",
          hotspotId: "module_2",
          bounds: { x: 0.55, y: 0.35, width: 0.34, height: 0.28 },
          shape: "rect",
          zIndex: 2
        },
        {
          id: "region_aux_1",
          role: "auxiliary",
          hotspotId: "aux_1",
          bounds: { x: 0.68, y: 0.15, width: 0.27, height: 0.18 },
          shape: "rect",
          zIndex: 4
        }
      ]
    }
  );

  assert.match(svg, /<svg/);
  assert.match(svg, /Flow/);
  assert.match(svg, /RK/);
  assert.match(svg, /ST/);
  assert.match(svg, /TL/);
  assert.match(svg, /External/);
  assert.match(svg, /Test&lt;script&gt;/);
  assert.doesNotMatch(svg, /Test<script>/);
  assert.doesNotMatch(svg, /<script>/);
  assert.doesNotMatch(svg, /wrapping and escaping inside a card/);

  console.log("mock-svg.test.js passed");
}

main();
