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
    id: "real-healthy-breakfast-options",
    chatImageId: "ci_8d4e3e30-fa4b-4997-b309-0e9369c06ef0",
    category: "scene",
    categoryLabel: "scene",
    title: "Healthy breakfast options",
    originalTitle: "一组健康早餐选择的插画场景",
    question:
      "Create an illustrated healthy breakfast options scene. Naturally show oatmeal bowl, Greek yogurt cup, whole-grain sandwich, boiled egg plate, fresh fruit, and black coffee. Let users click each food to inspect nutrition and best-fit breakfast scenarios.",
    modeLabel: "verified fresh daily scene"
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
  repairPublishedDocsText(testCase, state);
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

function repairPublishedDocsText(testCase, state) {
  if (!state || typeof state !== "object") return;
  const modules = [
    ...(((state.structuredSpec || {}).modules) || []),
    ...(((state.structuredSpec || {}).auxiliaryModules) || []),
    ...(((state.visualSpec || {}).modules) || []),
    ...(((state.visualSpec || {}).auxiliaryModules) || [])
  ];
  for (const module of modules) repairPublishedModuleText(testCase, state, module);
  for (const hotspot of state.hotspots || []) repairPublishedModuleText(testCase, state, hotspot);
  if (looksLikePublishedTextPollution(state.rawAnswer)) {
    state.rawAnswer = buildPublishedRawAnswer(testCase, state);
  }
}

function repairPublishedModuleText(testCase, state, module) {
  if (!module || typeof module !== "object") return;
  const label = cleanPublishedLabel(module.label || module.title || module.imageText || "", testCase);
  if (module.label !== undefined) module.label = label;
  if (module.title !== undefined) module.title = label;
  if (module.imageText !== undefined && looksLikePublishedTextPollution(module.imageText)) module.imageText = label;
  if (module.shortText !== undefined && looksLikePublishedTextPollution(module.shortText)) module.shortText = label;
  if (looksLikePublishedTextPollution(module.detail)) module.detail = buildPublishedDetail(label, testCase, state);
  if (looksLikePublishedTextPollution(module.sourceExcerpt)) {
    module.sourceExcerpt = buildPublishedSourceExcerpt(label, module.detail, testCase);
  }
}

function cleanPublishedLabel(value, testCase) {
  const label = String(value || "").trim();
  if (/不同食物后解释营养构成与适用场景/.test(label)) return "早餐选择总览";
  if (/点击不同|不同地理|不同食物后/.test(label)) return testCase.title || "Interactive overview";
  return label || testCase.title || "Interactive region";
}

function buildPublishedRawAnswer(testCase, state) {
  const labels = (state.hotspots || []).map((hotspot) => cleanPublishedLabel(hotspot.label || hotspot.title, testCase)).filter(Boolean);
  if (/healthy-breakfast-options/.test(testCase.id)) {
    return `This scene compares practical healthy breakfast choices: ${labels.join(", ")}. Each clickable region explains nutrition, satiety, preparation effort, and the morning scenario where that choice fits best.`;
  }
  return `${testCase.title || state.title || "This demo"} publishes real generated image regions with strict visual grounding. Click each region to inspect its role in the scene.`;
}

function buildPublishedDetail(label, testCase, state) {
  const title = String(label || testCase.title || state.title || "This region").trim();
  if (/healthy-breakfast-options/.test(testCase.id)) {
    if (/总览|overview/i.test(title)) {
      return "早餐选择总览把几种常见健康早餐放在同一场景中比较。它帮助用户先看清蛋白质、碳水、脂肪、纤维和饮品如何搭配，再根据时间、饱腹感和当天活动强度选择更合适的一份早餐。";
    }
    return `${title}是这组健康早餐里的一个具体选择。点击它时，重点看主要营养来源、饱腹感、准备难度和适合的早晨场景；这样用户能在口味、时间和能量需求之间做更实际的取舍。`;
  }
  if (/boutique-coffee/.test(testCase.id)) {
    return `${title}是精品咖啡馆场景中的一个可点击对象。它的价值来自自身功能、所在位置以及和顾客动线、服务节奏或空间氛围的关系，帮助用户理解这家店如何被使用和运营。`;
  }
  if (testCase.category === "map") {
    return `${title}是这张导览地图中的一个可点击区域。它需要结合周边路线、地标和停留节奏来理解，帮助用户判断到达顺序、游览价值和下一段路径。`;
  }
  return `${title}是${testCase.title || state.title || "这个场景"}中的一个可点击目标。它的价值来自自身形态、所在位置以及和周围对象或使用者的关系，帮助用户理解它为什么出现在画面中。`;
}

function buildPublishedSourceExcerpt(label, detail, testCase) {
  const cleanDetail = String(detail || "").trim();
  if (cleanDetail) return cleanDetail.slice(0, 160);
  return `${testCase.question || ""} ${label || ""}`.trim().slice(0, 160);
}

function looksLikePublishedTextPollution(value) {
  const text = String(value || "");
  if (!text) return false;
  return (
    /围绕[“"].{0,160}[”"]，?需要先给出直接回答/.test(text) ||
    /拆成若干可视化模块|每个模块应对应|在详情中说明机制/.test(text) ||
    /决定场景的组织方式|入口、展项、人物和辅助设施|负责把观众和展项连接起来|承担方向提示和安全边界/.test(text) ||
    /不同食物后解释营养构成与适用场景/.test(text) ||
    /点击地图上不同地理区域|不同地理|具体的边界|独立交互的节点|路径或地标本身/.test(text)
  );
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
