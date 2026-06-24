"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function main() {
  const root = process.cwd();
  const docsDir = path.join(root, "docs");
  const html = fs.readFileSync(path.join(docsDir, "index.html"), "utf8");
  const manifest = readJson(path.join(docsDir, "assets", "demos", "manifest.json"));
  assert.strictEqual(manifest.demoCount, 5, "showcase should publish five curated real demos");
  assert.strictEqual(manifest.demos.length, 5, "manifest demo list should match demoCount");
  assert.strictEqual(manifest.source, "real-chatimage-curated-runs", "showcase should be exported from curated real ChatImage runs");
  assert.match(html, /interactive-viewer/, "docs page should include the interactive demo viewer");
  assert.match(html, /demoHotspots/, "docs page should render hotspot overlays");
  assert.doesNotMatch(html, /Open full image/, "showcase should not be a static image lightbox");
  assert.doesNotMatch(html, /demo-[a-z0-9-]+\.svg/, "showcase cards should not use mock SVG demos");
  assert.doesNotMatch(html, /hero\.svg/, "hero should use a real generated image");
  assert.match(html, /real-west-lake-tour-map\.png/, "hero should use the West Lake tour map");
  assert.doesNotMatch(html, /real-airport-terminal-map/, "airport terminal demo should not be shown");
  assert.doesNotMatch(html, /real-public-health-poster/, "public health poster demo should not be shown");
  assert.doesNotMatch(html, /content:attr\(data-index\)/, "hotspot dots should not render numeric labels on top of the image");
  assert.match(html, /\.demo-hotspot::before\{\s*content:"";\s*display:none;\s*\}/, "hotspot markers should stay invisible on the image");
  assert.match(html, /\.demo-hotspot::after\{\s*content:"";\s*display:none;\s*\}/, "hotspot labels should stay invisible on the image");
  assert.doesNotMatch(html, /demoRegionList|demo-region-button/, "viewer should not add a right-side scenic spot list");
  assert.doesNotMatch(html, /demo-kubernetes-architecture/, "old static Kubernetes demo should not be shown");

  const categories = new Set();
  const modes = new Set();
  let totalHotspots = 0;
  const visiblePollution = /需要先给出直接回答|拆成若干可视化模块|每个模块应对应|用户需求|提示词|whole prompt|entire prompt/i;
  for (const entry of manifest.demos) {
    categories.add(entry.category);
    assert.ok(html.includes(`data-demo="${entry.json}"`), `docs page missing ${entry.json}`);
    assert.strictEqual(entry.source, "real-chatimage-curated-runs", `${entry.id} should be sourced from curated real runs`);
    assert.ok(entry.chatImageId, `${entry.id} should preserve its source chatImageId`);
    assert.match(entry.image, /\.png$/, `${entry.id} should use an actual generated PNG`);
    const imagePath = path.join(docsDir, entry.image);
    const jsonPath = path.join(docsDir, entry.json);
    assert.ok(fs.existsSync(imagePath), `${entry.id} image is missing`);
    assert.ok(fs.existsSync(jsonPath), `${entry.id} json is missing`);
    const demo = readJson(jsonPath);
    assert.strictEqual(demo.source, "real-chatimage-curated-runs", `${entry.id} json should be sourced from curated real runs`);
    assert.strictEqual(demo.image, entry.image, `${entry.id} image path mismatch`);
    assert.ok(demo.state && demo.state.visualSpec, `${entry.id} should preserve visualSpec`);
    assert.ok(demo.state && demo.state.layout, `${entry.id} should preserve layout`);
    const hotspots = demo.state && Array.isArray(demo.state.hotspots) ? demo.state.hotspots : [];
    modes.add(demo.visualMode);
    totalHotspots += hotspots.length;
    assert.strictEqual(hotspots.length, demo.hotspotCount, `${entry.id} hotspot count mismatch`);
    assert.ok(hotspots.length >= 3, `${entry.id} should have at least three reusable hotspots`);
    for (const hotspot of hotspots) {
      assert.ok(hotspot.label, `${entry.id} hotspot missing label`);
      assert.ok(hotspot.shortText, `${entry.id} hotspot missing shortText`);
      assert.ok(hotspot.detail, `${entry.id} hotspot missing detail`);
      assert.doesNotMatch(
        `${hotspot.label}\n${hotspot.shortText}\n${hotspot.detail}`,
        visiblePollution,
        `${entry.id}/${hotspot.id} visible region detail is polluted`
      );
      assert.ok(hotspot.bounds, `${entry.id} hotspot missing bounds`);
      assert.ok(hotspot.bounds.width > 0 && hotspot.bounds.height > 0, `${entry.id} hotspot has invalid size`);
      assert.ok(hotspot.bounds.x >= 0 && hotspot.bounds.y >= 0, `${entry.id} hotspot has negative origin`);
      assert.ok(hotspot.bounds.x + hotspot.bounds.width <= 1.05, `${entry.id} hotspot exceeds x bounds`);
      assert.ok(hotspot.bounds.y + hotspot.bounds.height <= 1.05, `${entry.id} hotspot exceeds y bounds`);
    }
  }
  for (const category of ["technical", "map", "scene", "business"]) {
    assert.ok(categories.has(category), `missing ${category} showcase category`);
  }
  assert.ok(modes.has("map"), "showcase should include a map visual mode");
  assert.ok(modes.has("scene"), "showcase should include a scene visual mode");
  assert.ok(totalHotspots >= 30, "showcase should preserve a rich set of clickable regions");

  console.log("docs-demos.test.js passed");
}

main();
