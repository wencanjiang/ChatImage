"use strict";

const fs = require("fs");
const path = require("path");
const { createConfig, createStore } = require("../server");

const rootDir = path.join(__dirname, "..");
const outputDir = path.join(rootDir, "docs", "assets", "demos");
const cacheDir = path.join(rootDir, "tmp", "image-cache");

const CASES = [
  {
    id: "real-west-lake-tour-map",
    chatImageId: "ci_82e903b7-5298-409a-a982-052b216db821",
    category: "map",
    categoryLabel: "map",
    title: "West Lake tour map",
    modeLabel: "new real generated map"
  },
  {
    id: "real-future-museum-scene",
    chatImageId: "ci_c07278d0-f188-46f5-8e7f-b195ff5e7a83",
    category: "scene",
    categoryLabel: "scene",
    title: "Future museum scene",
    modeLabel: "new real generated scene"
  },
  {
    id: "real-oauth2-flow",
    chatImageId: "ci_c9cd1be8-72c7-4292-814c-a35912078de3",
    category: "technical",
    categoryLabel: "technical",
    title: "OAuth 2.0 authorization code flow",
    modeLabel: "new real generated flow"
  },
  {
    id: "real-kubernetes-architecture",
    chatImageId: "ci_9901346f-ef6e-47e3-a184-350d72efa5af",
    category: "technical",
    categoryLabel: "technical",
    title: "Kubernetes deployment architecture",
    modeLabel: "real generated architecture"
  },
  {
    id: "real-ecommerce-funnel",
    chatImageId: "ci_1e84e498-15b2-493c-9edf-c3b737298671",
    category: "business",
    categoryLabel: "business",
    title: "E-commerce conversion funnel",
    modeLabel: "real generated business graphic"
  }
];

function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  removeStaleDemoArtifacts();

  const store = createStore(createConfig().databasePath);
  try {
    const demos = CASES.map((testCase) => exportCase(testCase, store));
    const manifest = {
      generatedAt: new Date().toISOString(),
      source: "real-chatimage-curated-runs",
      demoCount: demos.length,
      notes: [
        "West Lake, museum, and OAuth demos were regenerated on 2026-06-24.",
        "Campus, smart-home retry, coffee retry, and ecommerce retry exposed generation or alignment issues; see tmp/real-demo-run for run artifacts.",
        "Airport terminal, public-health poster, coffee, and smart-home demos were removed from the docs showcase because alignment or detail text quality was not reliable enough."
      ],
      demos
    };
    fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log(`Exported ${demos.length} curated real demos to ${path.relative(rootDir, outputDir)}`);
  } finally {
    store.close();
  }
}

function exportCase(testCase, store) {
  const saved = store.getChatImage(testCase.chatImageId);
  if (!saved || !saved.result) throw new Error(`${testCase.id}: chat image not found: ${testCase.chatImageId}`);
  const result = saved.result;
  const image = exportImage(testCase.id, result.imageUrl);
  const state = normalizeStateForDocs(result);
  const demo = {
    id: testCase.id,
    chatImageId: result.id,
    title: testCase.title || result.title || testCase.id,
    originalTitle: result.title || "",
    category: testCase.category,
    categoryLabel: testCase.categoryLabel,
    question: result.question || "",
    image,
    thumbnail: image,
    visualMode: state.structuredSpec && state.structuredSpec.visualMode ? state.structuredSpec.visualMode : "",
    layoutFamily: state.layout && state.layout.layoutFamily ? state.layout.layoutFamily : "",
    layoutVariant: state.layout && state.layout.layoutVariant ? state.layout.layoutVariant : "",
    modeLabel: testCase.modeLabel,
    hotspotCount: state.hotspots.length,
    source: "real-chatimage-curated-runs",
    generatedAt: result.createdAt || "",
    alignmentProvider: result.alignmentRaw && result.alignmentRaw.provider ? result.alignmentRaw.provider : "",
    sourceCounts: result.alignmentRaw && result.alignmentRaw.sourceCounts ? result.alignmentRaw.sourceCounts : {},
    state
  };
  fs.writeFileSync(path.join(outputDir, `${testCase.id}.json`), `${JSON.stringify(demo, null, 2)}\n`, "utf8");
  return manifestEntry(demo);
}

function normalizeStateForDocs(result) {
  const state = JSON.parse(JSON.stringify(result));
  state.visualSpec = state.structuredSpec;
  state.hotspots = (state.hotspots || []).map((hotspot) => {
    const bounds = normalizeBounds({
      x: hotspot.x,
      y: hotspot.y,
      width: hotspot.width,
      height: hotspot.height
    });
    return {
      ...hotspot,
      bounds
    };
  });
  state.layout = normalizeLayout(state.layout);
  return state;
}

function normalizeLayout(layout) {
  if (!layout || !Array.isArray(layout.regions)) return layout || {};
  return {
    ...layout,
    regions: layout.regions.map((region) => ({
      ...region,
      bounds: normalizeBounds(region.bounds)
    }))
  };
}

function normalizeBounds(bounds) {
  const x = clamp01(bounds && bounds.x);
  const y = clamp01(bounds && bounds.y);
  const width = Math.max(0.001, Math.min(1 - x, Number(bounds && bounds.width) || 0.001));
  const height = Math.max(0.001, Math.min(1 - y, Number(bounds && bounds.height) || 0.001));
  return {
    x: round(x),
    y: round(y),
    width: round(width),
    height: round(height)
  };
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function round(value) {
  return Number(Number(value).toFixed(6));
}

function exportImage(id, imageUrl) {
  const filename = `${id}.png`;
  const outputPath = path.join(outputDir, filename);
  const sourcePath = resolveCachedImagePath(imageUrl);
  fs.copyFileSync(sourcePath, outputPath);
  return `assets/demos/${filename}`;
}

function resolveCachedImagePath(imageUrl) {
  const source = String(imageUrl || "");
  const match = source.match(/\/image-cache\/([^/?#]+\.png)/i);
  if (!match) throw new Error(`demo image is not a local cached image: ${source}`);
  const filePath = path.join(cacheDir, match[1]);
  if (!fs.existsSync(filePath)) throw new Error(`cached image missing: ${filePath}`);
  return filePath;
}

function manifestEntry(demo) {
  return {
    id: demo.id,
    chatImageId: demo.chatImageId,
    title: demo.title,
    originalTitle: demo.originalTitle,
    category: demo.category,
    categoryLabel: demo.categoryLabel,
    question: demo.question,
    image: demo.image,
    thumbnail: demo.thumbnail,
    json: `assets/demos/${demo.id}.json`,
    visualMode: demo.visualMode,
    layoutFamily: demo.layoutFamily,
    layoutVariant: demo.layoutVariant,
    modeLabel: demo.modeLabel,
    hotspotCount: demo.hotspotCount,
    source: demo.source,
    alignmentProvider: demo.alignmentProvider,
    sourceCounts: demo.sourceCounts,
    generatedAt: demo.generatedAt
  };
}

function removeStaleDemoArtifacts() {
  for (const name of fs.readdirSync(outputDir, { withFileTypes: true })) {
    if (!name.isFile()) continue;
    if (!/^real-.*\.(?:png|json)$/i.test(name.name)) continue;
    fs.rmSync(path.join(outputDir, name.name));
  }
}

if (require.main === module) {
  main();
}
