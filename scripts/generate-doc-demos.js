"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { createConfig, createStore } = require("../server");
const { enforceStrictVisualAlignment } = require("../server/sam3");

const rootDir = path.join(__dirname, "..");
const outputDir = path.join(rootDir, "docs", "assets", "demos");
const cacheDir = path.join(rootDir, "tmp", "image-cache");

const CASES = [
  {
    id: "real-west-lake-tour-map",
    chatImageId: "ci_2e77c4cd-1f49-405f-832f-b3f6af1a0d74",
    category: "map",
    categoryLabel: "map",
    title: "West Lake hand-drawn tour map",
    originalTitle: "West Lake hand-drawn tour map",
    question:
      "Create a hand-drawn West Lake tour map as one coherent landscape image. Do not draw numbered pins, a right-side attraction list, or pre-split region borders. Let users click natural scenic areas to inspect their travel value.",
    modeLabel: "verified real generated map"
  },
  {
    id: "real-smart-home-living-room",
    chatImageId: "ci_3f5f7110-a7e8-46f2-b9a4-20c4911d25fe",
    category: "scene",
    categoryLabel: "scene",
    title: "Smart home living room",
    originalTitle: "Smart home living room",
    question:
      "Create an isometric smart-home living room scene. Let users click the sofa area, TV wall, robot vacuum, smart speaker, window plants, and entrance area to inspect their role in the home experience.",
    modeLabel: "verified visual scene"
  },
  {
    id: "real-boutique-coffee-scene",
    chatImageId: "ci_b7051ddb-7cf9-49ec-8bc7-d6c22fb39d1f",
    category: "scene",
    categoryLabel: "scene",
    title: "Boutique coffee shop scene",
    originalTitle: "Boutique coffee shop scene",
    question:
      "Create an isometric boutique coffee shop scene. Let users click the barista, espresso machine, pastry case, window seating, pickup shelf, and entrance queue to inspect how the space works.",
    modeLabel: "verified visual scene"
  },
  {
    id: "real-sunny-reading-nook",
    chatImageId: "ci_7318affc-7a63-44b1-9bbb-97d93165a630",
    category: "scene",
    categoryLabel: "scene",
    title: "Sunny reading nook",
    originalTitle: "Sunny reading nook",
    question:
      "Create a cozy illustrated reading nook scene. Let users click the armchair, bookshelf, floor lamp, window, and side table with tea to inspect comfort and placement choices.",
    modeLabel: "verified fresh daily scene"
  },
  {
    id: "real-record-store-corner",
    chatImageId: "ci_0a52d845-827e-4b3f-ad08-8b8d4d1943a8",
    category: "scene",
    categoryLabel: "scene",
    title: "Independent record store corner",
    originalTitle: "Independent record store corner",
    question:
      "Create an illustrated independent record store corner. Let users click the listening station, vinyl bins, staff counter, new arrivals wall, and poster display.",
    modeLabel: "verified fresh daily scene"
  },
  {
    id: "real-plant-care-corner",
    chatImageId: "ci_1a6baf46-031e-40ae-9e08-76941ac395f1",
    category: "scene",
    categoryLabel: "scene",
    title: "Indoor plant care corner",
    originalTitle: "Indoor plant care corner",
    question:
      "Create an illustrated indoor plant care corner. Let users click the monstera plant, watering can, grow light, potting bench, and humidity tray.",
    modeLabel: "verified fresh daily scene"
  }
];

function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  removeStaleDemoArtifacts();

  const store = createStore(createConfig().databasePath);
  try {
    const demos = [];
    const rejected = [];
    for (const testCase of CASES) {
      try {
        demos.push(exportCase(testCase, store));
      } catch (error) {
        rejected.push({ id: testCase.id, reason: error.message || String(error) });
      }
    }
    if (!demos.length) {
      throw new Error("No demos passed the strict docs demo gate.");
    }
    const manifest = {
      generatedAt: new Date().toISOString(),
      source: "real-chatimage-curated-runs",
      demoCount: demos.length,
      notes: [
        "Every published demo passed the current strict visual-alignment gate at export time.",
        "Each hotspot must have a LocateAnything or MiMo primary source plus SAM mask, cutout, organic preview, and expanded organic bounds.",
        "Cases that fail the current gate are skipped instead of being refreshed into the public showcase."
      ],
      demos
    };
    fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log(`Exported ${demos.length} curated real demos to ${path.relative(rootDir, outputDir)}`);
    if (rejected.length) {
      console.log("Rejected demos:");
      for (const item of rejected) {
        console.log(`- ${item.id}: ${item.reason}`);
      }
    }
  } finally {
    store.close();
  }
}

function exportCase(testCase, store) {
  const saved = store.getChatImage(testCase.chatImageId);
  if (!saved || !saved.result) throw new Error(`${testCase.id}: chat image not found: ${testCase.chatImageId}`);
  const result = saved.result;
  const state = normalizeStateForDocs(result);
  const image = exportImage(testCase.id, result.imageUrl);
  try {
    repairStateMaskAssets(testCase.id, state, path.join(rootDir, "docs", image));
    enforceDocsStrictVisualAlignment(testCase.id, state);
  } catch (error) {
    fs.rmSync(path.join(rootDir, "docs", image), { force: true });
    throw error;
  }
  const sourceCounts = countHotspotSources(state.hotspots);
  const demo = {
    id: testCase.id,
    chatImageId: result.id,
    title: testCase.title || result.title || testCase.id,
    originalTitle: testCase.originalTitle || result.title || "",
    category: testCase.category,
    categoryLabel: testCase.categoryLabel,
    question: testCase.question || result.question || "",
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
    sourceCounts,
    state
  };
  fs.writeFileSync(path.join(outputDir, `${testCase.id}.json`), `${JSON.stringify(demo, null, 2)}\n`, "utf8");
  return manifestEntry(demo);
}

function repairStateMaskAssets(id, state, imagePath) {
  const tempDir = path.join(rootDir, "tmp");
  fs.mkdirSync(tempDir, { recursive: true });
  const statePath = path.join(tempDir, `docs-demo-mask-repair-${process.pid}-${id}.json`);
  fs.writeFileSync(statePath, JSON.stringify(state), "utf8");
  try {
    const scriptPath = path.join(rootDir, "scripts", "repair_demo_mask_assets.py");
    const result = spawnSync("python", [scriptPath, statePath, imagePath], {
      cwd: rootDir,
      encoding: "utf8",
      maxBuffer: 80 * 1024 * 1024
    });
    if (result.status !== 0) {
      throw new Error([result.stderr, result.stdout].filter(Boolean).join("\n").trim() || `exit ${result.status}`);
    }
    const repaired = JSON.parse(fs.readFileSync(statePath, "utf8"));
    Object.keys(state).forEach((key) => {
      delete state[key];
    });
    Object.assign(state, repaired);
  } catch (error) {
    throw new Error(`${id}: failed to repair SAM mask assets before export: ${error.message || String(error)}`);
  } finally {
    fs.rmSync(statePath, { force: true });
  }
}

function enforceDocsStrictVisualAlignment(id, state) {
  const modules = (state.hotspots || []).map((hotspot) => ({
    moduleId: hotspot.id,
    label: hotspot.label,
    source: hotspot.alignmentSource,
    mask: hotspot.mask
  }));
  try {
    enforceStrictVisualAlignment({ strictVisualAlignment: true }, { modules });
  } catch (error) {
    const detail = error && error.message ? error.message : String(error);
    throw new Error(`${id}: rejected by strict docs demo gate: ${detail}`);
  }
}

function countHotspotSources(hotspots) {
  const counts = {};
  for (const hotspot of hotspots || []) {
    const source = String((hotspot && hotspot.alignmentSource) || "").trim() || "unknown";
    counts[source] = (counts[source] || 0) + 1;
  }
  return counts;
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
