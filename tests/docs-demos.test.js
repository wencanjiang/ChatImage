"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function main() {
  const root = process.cwd();
  const docsDir = path.join(root, "docs");
  const html = fs.readFileSync(path.join(docsDir, "index.html"), "utf8");
  const manifest = readJson(path.join(docsDir, "assets", "demos", "manifest.json"));
  const expectedDemoOrder = [
    "real-west-lake-tour-map",
    "real-poet-comparison-li-bai-shakespeare",
    "real-zju-yuquan-campus-map",
    "real-transformer-development-timeline",
    "real-healthy-breakfast-options",
    "real-boutique-coffee-scene",
    "real-sunny-reading-nook",
    "real-record-store-corner",
    "real-plant-care-corner"
  ];
  assert.strictEqual(manifest.demoCount, 9, "showcase should publish nine curated real demos");
  assert.strictEqual(manifest.demos.length, 9, "manifest demo list should match demoCount");
  assert.deepStrictEqual(manifest.demos.map((entry) => entry.id), expectedDemoOrder, "manifest order should match the showcase display order");
  const htmlDemoOrder = Array.from(html.matchAll(/<article class="demo reveal"[\s\S]*?data-demo="assets\/demos\/(real-[^"]+)\.json"/g)).map((match) => match[1]);
  assert.deepStrictEqual(htmlDemoOrder, expectedDemoOrder, "docs page should render demos in the requested display order");
  assert.match(
    manifest.source,
    /^real-chatimage-curated-runs/,
    "showcase should be exported from curated real ChatImage runs"
  );
  assert.match(html, /interactive-viewer/, "docs page should include the interactive demo viewer");
  assert.match(html, /href="chatImage\.pdf"/, "docs page should link the technical report PDF directly");
  assert.doesNotMatch(html, /href="TECHNICAL_REPORT\.md"/, "docs page should not link the markdown technical report");
  assert.match(html, /demoHotspots/, "docs page should render hotspot overlays");
  assert.match(html, /id="demoDetail"/, "docs lightbox should include a stable side detail panel");
  assert.match(html, /id="demoDetailPreview"/, "docs lightbox should include a stable preview slot");
  assert.match(html, /assets\/demo-locales\.js/, "docs page should load localized hotspot copy for dynamic demo regions");
  assert.doesNotMatch(html, /Open full image/, "showcase should not be a static image lightbox");
  assert.doesNotMatch(html, /demo-[a-z0-9-]+\.svg/, "showcase cards should not use mock SVG demos");
  assert.doesNotMatch(html, /hero\.svg/, "hero should use a real generated image");
  assert.match(html, /real-west-lake-tour-map\.png/, "hero should use the regenerated strict West Lake tour map");
  assert.match(html, /real-healthy-breakfast-options\.png/, "showcase should include the new strict healthy breakfast demo");
  assert.match(html, /real-poet-comparison-li-bai-shakespeare\.png/, "showcase should include the strict poet comparison demo");
  assert.match(html, /real-transformer-development-timeline\.png/, "showcase should include the strict Transformer timeline demo");
  assert.match(html, /real-zju-yuquan-campus-map\.png/, "showcase should include the strict Yuquan campus map demo");
  assert.doesNotMatch(html, /real-smart-home-living-room/, "weaker smart-home demo should be replaced in the showcase");
  assert.doesNotMatch(html, /real-airport-terminal-map/, "airport terminal demo should not be shown");
  assert.doesNotMatch(html, /real-public-health-poster/, "public health poster demo should not be shown");
  assert.doesNotMatch(html, /content:attr\(data-index\)/, "hotspot dots should not render numeric labels on top of the image");
  assert.match(html, /\.demo-hotspot::before\{\s*content:"";\s*display:none;\s*\}/, "hotspot markers should stay invisible on the image");
  assert.match(html, /\.demo-hotspot::after\{\s*content:"";\s*display:none;\s*\}/, "hotspot labels should stay invisible on the image");
  assert.doesNotMatch(html, /demoRegionList|demo-region-button/, "viewer should not add a right-side scenic spot list");
  assert.doesNotMatch(html, /id="demoPopoverTitle"|id="demoPopoverDetail"/, "demo lightbox should not use an on-image detail popover");
  assert.doesNotMatch(html, /real-react-performance-debug-flow|real-oauth2-flow|real-ecommerce-funnel/, "planned-source demos should not be shown");

  const categories = new Set();
  const modes = new Set();
  let totalHotspots = 0;
  const visiblePollutionSubstrings = [
    "whole prompt",
    "entire prompt",
    "Create a weekend Hangzhou",
    "Each clickable region",
      "prompt fragment",
      "user request",
      "targetDescription",
      "providerRaw",
      "alignmentRaw",
      "承担海报中的一段叙事任务"
  ];
  const visiblePollutionPatterns = [
    /Hangzhou Botanical Garde(?!n)/i,
    /Laohe Mountain Green Bac(?!k)/i,
    /Wine Cup and Travel Scro(?!ll)/i
  ];
  const hasVisiblePollution = (value) => {
    const text = String(value || "");
    const lower = text.toLowerCase();
    return (
      visiblePollutionSubstrings.some((pattern) => lower.includes(pattern.toLowerCase())) ||
      visiblePollutionPatterns.some((pattern) => pattern.test(text))
    );
  };
  const genericLabels = new Set([
    "\u95ee\u9898\u5b9a\u4e49",
    "\u5173\u952e\u8981\u7d20",
    "\u8fd0\u4f5c\u903b\u8f91",
    "\u4f7f\u7528\u573a\u666f",
    "\u884c\u52a8\u5efa\u8bae"
  ]);

  for (const entry of manifest.demos) {
    categories.add(entry.category);
    assert.ok(html.includes(`data-demo="${entry.json}"`), `docs page missing ${entry.json}`);
    assert.strictEqual(entry.source, "real-chatimage-curated-runs", `${entry.id} should be sourced from curated real runs`);
    assert.ok(entry.chatImageId, `${entry.id} should preserve its source chatImageId`);
    assert.match(entry.image, /\.png$/, `${entry.id} should use an actual generated PNG`);
    const recomputedSourceCounts = {};
    for (const source of Object.keys(entry.sourceCounts || {})) {
      assert.doesNotMatch(source, /planned/i, `${entry.id} should not publish planned hotspot sources`);
    }

    const imagePath = path.join(docsDir, entry.image);
    const jsonPath = path.join(docsDir, entry.json);
    assert.ok(fs.existsSync(imagePath), `${entry.id} image is missing`);
    assert.ok(fs.existsSync(jsonPath), `${entry.id} json is missing`);
    const demo = readJson(jsonPath);
    const serializedDemo = JSON.stringify(demo);
    assert.doesNotMatch(
      serializedDemo,
      /"targetDescription"|"providerRaw"|"alignmentRaw"/,
      `${entry.id} should not publish raw provider debug payloads`
    );
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
      assert.ok(!genericLabels.has(hotspot.label), `${entry.id}/${hotspot.id} uses a generic fallback label`);
      assert.ok(hotspot.shortText, `${entry.id} hotspot missing shortText`);
      assert.ok(hotspot.detail, `${entry.id} hotspot missing detail`);
      assert.ok(
        !hasVisiblePollution(`${hotspot.label}\n${hotspot.shortText}\n${hotspot.detail}`),
        `${entry.id}/${hotspot.id} visible region detail is polluted`
      );
      assert.ok(hotspot.bounds, `${entry.id} hotspot missing bounds`);
      assert.ok(hotspot.bounds.width > 0 && hotspot.bounds.height > 0, `${entry.id} hotspot has invalid size`);
      assert.ok(hotspot.bounds.x >= 0 && hotspot.bounds.y >= 0, `${entry.id} hotspot has negative origin`);
      assert.ok(hotspot.bounds.x + hotspot.bounds.width <= 1.05, `${entry.id} hotspot exceeds x bounds`);
      assert.ok(hotspot.bounds.y + hotspot.bounds.height <= 1.05, `${entry.id} hotspot exceeds y bounds`);
      const source = String(hotspot.alignmentSource || "").trim() || "unknown";
      recomputedSourceCounts[source] = (recomputedSourceCounts[source] || 0) + 1;
      assert.match(source, /locateanything|mimo-vision/i, `${entry.id}/${hotspot.id} should have a strict primary grounding source`);
      assert.ok(hotspot.mask && hotspot.mask.provider === "sam3", `${entry.id}/${hotspot.id} missing SAM mask`);
      assert.ok(hotspot.mask.image, `${entry.id}/${hotspot.id} missing SAM mask image`);
      assert.ok(hotspot.mask.cutoutImage, `${entry.id}/${hotspot.id} missing SAM cutout preview`);
      assert.ok(hotspot.mask.organicImage, `${entry.id}/${hotspot.id} missing SAM organic preview`);
      assert.ok(hotspot.mask.organicBounds, `${entry.id}/${hotspot.id} missing SAM organic bounds`);
    }
    assert.deepStrictEqual(entry.sourceCounts, recomputedSourceCounts, `${entry.id} manifest sourceCounts should match hotspot alignmentSource values`);
  }

  assert.ok(categories.has("scene"), "missing scene showcase category");
  assert.ok(categories.has("map"), "missing map showcase category");
  assert.ok(categories.has("comparison"), "missing comparison showcase category");
  assert.ok(categories.has("academic"), "missing academic showcase category");
  assert.ok(!categories.has("business"), "business demos must stay unpublished until strict SAM gating passes");
  assert.ok(modes.has("map"), "showcase should include a map visual mode");
  assert.ok(modes.has("scene"), "showcase should include a scene visual mode");
  assert.ok(modes.has("poster"), "showcase should include a poster visual mode");
  assert.ok(totalHotspots >= 50, "showcase should preserve a rich set of clickable regions");
  assertNoPublishedMaskHoles(root);

  console.log("docs-demos.test.js passed");
}

function assertNoPublishedMaskHoles(root) {
  const script = String.raw`
import base64, io, json
from pathlib import Path
from PIL import Image
import numpy as np
import cv2

def alpha_from_data_url(value):
    if not isinstance(value, str) or "," not in value:
        return None
    raw = base64.b64decode(value.split(",", 1)[1])
    image = Image.open(io.BytesIO(raw)).convert("RGBA")
    return np.array(image)[:, :, 3]

def count_holes(alpha, threshold=32):
    binary = ((alpha > threshold).astype(np.uint8) * 255)
    _, hierarchy = cv2.findContours(binary, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is None:
        return 0
    return sum(1 for item in hierarchy[0] if int(item[3]) >= 0)

bad = []
for path in sorted(Path("docs/assets/demos").glob("real-*.json")):
    data = json.loads(path.read_text(encoding="utf-8"))
    for hotspot in data.get("state", {}).get("hotspots", []):
        mask = hotspot.get("mask") or {}
        for field in ["image", "cutoutImage", "organicImage"]:
            alpha = alpha_from_data_url(mask.get(field, ""))
            if alpha is None:
                continue
            holes = count_holes(alpha)
            if holes:
                bad.append([path.name, hotspot.get("id"), hotspot.get("label"), field, holes])
if bad:
    print(json.dumps(bad[:80], ensure_ascii=True))
    raise SystemExit(1)
`;
  const result = spawnSync("python", ["-c", script], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  assert.strictEqual(result.status, 0, result.stdout || result.stderr);
}

main();
