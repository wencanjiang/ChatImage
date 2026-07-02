"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { createConfig, createStore } = require("../server");
const { enforceStrictVisualAlignment } = require("../server/sam3");

const rootDir = path.join(__dirname, "..");
const outputDir = path.join(rootDir, "docs", "assets", "demos");
const cacheDir = path.join(rootDir, "tmp", "image-cache");
const DISPLAY_ORDER = [
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
  },
  {
    id: "real-poet-comparison-li-bai-shakespeare",
    chatImageId: "ci_332089c0-eb10-4177-a948-1f01d1347205",
    category: "comparison",
    categoryLabel: "comparison",
    title: "Li Bai and Shakespeare comparison",
    originalTitle: "Li Bai and Shakespeare comparison",
    question:
      "Create a refined illustrated comparison scene between Li Bai and William Shakespeare. Li Bai was a Tang dynasty Chinese poet, 701-762. William Shakespeare was an English poet and playwright, 1564-1616. The only clickable targets are Li Bai, Moonlit Mountains, Wine Cup and Travel Scroll, Shakespeare, Theatre and Manuscript, and Shared Literary Legacy. Each clickable target should explain its factual role, literary theme, and why the visual comparison is meaningful without inventing false historical contact.",
    modeLabel: "strict literary comparison",
    publishedHotspotLabels: [
      "Li Bai",
      "Moonlit Mountains",
      "Wine Cup and Travel Scro",
      "Shakespeare",
      "Theatre and Manuscript",
      "Shared Literary Legacy"
    ],
    publishedHotspotLabelReplacements: {
      "Wine Cup and Travel Scro": "Wine Cup and Travel Scroll"
    }
  },
  {
    id: "real-transformer-development-timeline",
    chatImageId: "ci_37e23691-ce9a-41b0-aff3-01de3373a723",
    category: "academic",
    categoryLabel: "academic",
    title: "Transformer development timeline",
    originalTitle: "Transformer development timeline",
    question:
      "Create a refined academic poster timeline of Transformer-based language model development. The only clickable milestones are 2017 Transformer, 2018 GPT, 2018 BERT, 2019 GPT-2, 2020 GPT-3, and 2022 ChatGPT. Each clickable milestone should explain the technical contribution, model family relationship, and why it matters in the development loop from architecture to pretraining, scaling, instruction tuning, and interactive use.",
    modeLabel: "strict academic timeline",
    publishedHotspotText: {
      "2017 Transformer": {
        shortText: "Attention-based architecture",
        detail:
          "The Transformer introduced a sequence model built around self-attention, replacing recurrent processing with a parallel architecture that became the foundation for modern large language models."
      },
      "2018 GPT": {
        shortText: "Autoregressive pretraining",
        detail:
          "GPT showed how a Transformer decoder trained with next-token prediction could transfer to downstream language tasks, establishing a practical loop from large-scale pretraining to task adaptation."
      },
      "2018 BERT": {
        shortText: "Bidirectional language encoding",
        detail:
          "BERT used masked language modeling with bidirectional Transformer encoders, making contextual representations stronger for understanding tasks such as classification, retrieval, and question answering."
      },
      "2019 GPT-2": {
        shortText: "Scaling and zero-shot behavior",
        detail:
          "GPT-2 made scaling effects visible by showing that a larger autoregressive model could perform useful tasks from natural-language context, reducing the need for task-specific training examples."
      },
      "2020 GPT-3": {
        shortText: "Few-shot prompting at scale",
        detail:
          "GPT-3 extended the scaling trajectory and popularized few-shot prompting, where examples inside the prompt guide behavior without updating model weights."
      },
      "2022 ChatGPT": {
        shortText: "Instruction-tuned interaction",
        detail:
          "ChatGPT turned large language models into an interactive assistant format by combining instruction tuning, dialogue behavior, and human feedback into a user-facing conversation loop."
      }
    }
  },
  {
    id: "real-zju-yuquan-campus-map",
    chatImageId: "ci_4bf22693-6d1d-43b0-8818-79e4f04c88f0",
    category: "map",
    categoryLabel: "map",
    title: "Zhejiang University Yuquan campus map",
    originalTitle: "Zhejiang University Yuquan campus map",
    question:
      "Create a refined hand-drawn scenic orientation map of Zhejiang University Yuquan Campus. Fact anchors: Yuquan Campus is at 38 Zheda Road, Xihu District, Hangzhou; it backs onto Laohe Mountain; it is next to Hangzhou Botanical Garden; Yuquan Library is a real campus library; the campus has a strong engineering and teaching identity. The only clickable regions are Zheda Road 38 Address Edge, Campus Main Walk, Engineering Teaching Zone, Yuquan Library, Hangzhou Botanical Garden Edge, and Laohe Mountain Backdrop.",
    modeLabel: "strict campus orientation map",
    publishedHotspotLabelReplacements: {
      "Zheda Road 38 Entrance": "Zheda Road 38 Address Edge",
      "Engineering Teaching": "Engineering Teaching Zone",
      "Teaching and Engineering": "Engineering Teaching Zone",
      "Hangzhou Botanical Garde": "Hangzhou Botanical Garden Edge",
      "Laohe Mountain Green Bac": "Laohe Mountain Backdrop",
      "Laohe Mountain Green Backdrop": "Laohe Mountain Backdrop"
    },
    publishedHotspotText: {
      "Zheda Road 38 Address Edge": {
        shortText: "Address-side orientation",
        detail:
          "The Zheda Road 38 address edge gives the guide a stable public-facing reference for Zhejiang University's Yuquan Campus in Xihu District, helping visitors orient themselves before moving into the campus."
      },
      "Campus Main Walk": {
        shortText: "Campus movement spine",
        detail:
          "The main walk organizes movement through the illustrated campus guide, linking academic buildings, study areas, and landscape context into an easy-to-follow route."
      },
      "Engineering Teaching Zone": {
        shortText: "Engineering academic core",
        detail:
          "The engineering teaching zone represents Yuquan's academic identity, emphasizing engineering education, laboratories, and classroom activity without naming unsupported individual buildings."
      },
      "Yuquan Library": {
        shortText: "Study landmark",
        detail:
          "Yuquan Library is presented as a study-oriented campus landmark, giving visitors a recognizable academic destination within the orientation map."
      },
      "Hangzhou Botanical Garden Edge": {
        shortText: "Nearby orientation context",
        detail:
          "The Botanical Garden edge provides nearby orientation context, showing how Yuquan sits close to the greenery and walking routes of the West Lake area."
      },
      "Laohe Mountain Backdrop": {
        shortText: "Mountain setting",
        detail:
          "The Laohe Mountain green backdrop places the campus in its hillside setting and explains why Yuquan's environment feels closely connected to the surrounding landscape."
      }
    }
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
    const orderedDemos = orderDemosForShowcase(demos);
    const manifest = {
      generatedAt: new Date().toISOString(),
      source: "real-chatimage-curated-runs",
      demoCount: orderedDemos.length,
      notes: [
        "Every published demo passed the current strict visual-alignment gate at export time.",
        "Each hotspot must have a LocateAnything or MiMo primary source plus SAM mask, cutout, organic preview, and expanded organic bounds.",
        "Cases that fail the current gate are skipped instead of being refreshed into the public showcase."
      ],
      demos: orderedDemos
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
  filterPublishedHotspots(testCase, state);
  normalizePublishedHotspotLabels(testCase, state);
  repairPublishedDocsText(testCase, state);
  applyPublishedHotspotText(testCase, state);
  replacePublishedStrings(testCase, state);
  const image = exportImage(testCase.id, result.imageUrl);
  try {
    repairStateMaskAssets(testCase.id, state, path.join(rootDir, "docs", image));
    applyPublishedHotspotText(testCase, state);
    replacePublishedStrings(testCase, state);
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

function orderDemosForShowcase(demos) {
  const rank = new Map(DISPLAY_ORDER.map((id, index) => [id, index]));
  return demos.slice().sort((a, b) => {
    const aRank = rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER;
    const bRank = rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER;
    return aRank - bRank;
  });
}

function filterPublishedHotspots(testCase, state) {
  const labels = Array.isArray(testCase.publishedHotspotLabels) ? testCase.publishedHotspotLabels : [];
  if (!labels.length || !state || !Array.isArray(state.hotspots)) return;
  const allowed = new Set(labels.map((label) => String(label).trim()));
  const allowedIds = new Set();
  state.hotspots = state.hotspots.filter((hotspot) => {
    const keep = allowed.has(String((hotspot && hotspot.label) || "").trim());
    if (keep && hotspot && hotspot.id) allowedIds.add(hotspot.id);
    return keep;
  });
  const filterModules = (modules) =>
    Array.isArray(modules)
      ? modules.filter((module) => allowedIds.has(module && module.id) || allowed.has(String((module && (module.title || module.label)) || "").trim()))
      : modules;
  if (state.structuredSpec) state.structuredSpec.modules = filterModules(state.structuredSpec.modules);
  if (state.visualSpec) state.visualSpec.modules = filterModules(state.visualSpec.modules);
  if (state.layout && Array.isArray(state.layout.regions)) {
    state.layout.regions = state.layout.regions.filter((region) => allowedIds.has(region && (region.hotspotId || region.id)));
  }
}

function applyPublishedHotspotText(testCase, state) {
  const textMap = testCase && testCase.publishedHotspotText && typeof testCase.publishedHotspotText === "object"
    ? testCase.publishedHotspotText
    : {};
  if (!Object.keys(textMap).length || !state || typeof state !== "object") return;
  const patch = (module) => {
    if (!module || typeof module !== "object") return;
    const label = String(module.label || module.title || module.imageText || "").trim();
    const text = textMap[label];
    if (!text) return;
    if (module.shortText !== undefined) module.shortText = text.shortText || label;
    if (module.detail !== undefined) module.detail = text.detail || module.detail;
    if (module.sourceExcerpt !== undefined) module.sourceExcerpt = text.detail || module.sourceExcerpt;
  };
  for (const hotspot of state.hotspots || []) patch(hotspot);
  for (const module of (state.structuredSpec && state.structuredSpec.modules) || []) patch(module);
  for (const module of (state.visualSpec && state.visualSpec.modules) || []) patch(module);
}

function replacePublishedStrings(testCase, value) {
  const replacements =
    testCase && testCase.publishedHotspotLabelReplacements && typeof testCase.publishedHotspotLabelReplacements === "object"
      ? testCase.publishedHotspotLabelReplacements
      : {};
  const entries = Object.entries(replacements);
  if (!entries.length || !value || typeof value !== "object") return value;
  const replaceText = (text) => {
    let next = String(text);
    for (const [from, to] of entries) {
      if (next === from) {
        next = to;
      } else if (from === "Zheda Road 38 Entrance") {
        next = next.replace(/Zheda Road 38 Entrance/g, to);
      } else if (from === "Engineering Teaching") {
        next = next.replace(/Engineering Teaching(?! Zone)/g, to);
      } else if (from === "Teaching and Engineering") {
        next = next.replace(/Teaching and Engineering(?! Buildings)/g, to);
      } else if (from === "Hangzhou Botanical Garde") {
        next = next.replace(/Hangzhou Botanical Garde(?!n)/g, to);
      } else if (from === "Laohe Mountain Green Bac") {
        next = next.replace(/Laohe Mountain Green Bac(?!k)/g, to);
      } else if (from === "Laohe Mountain Green Backdrop") {
        next = next.replace(/Laohe Mountain Green Backdrop/g, to);
      } else if (from === "Wine Cup and Travel Scro") {
        next = next.replace(/Wine Cup and Travel Scro(?!ll)/g, to);
      }
    }
    return next;
  };
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string") {
      value[key] = replaceText(child);
    } else if (child && typeof child === "object") {
      replacePublishedStrings(testCase, child);
    }
  }
  return value;
}

function normalizePublishedHotspotLabels(testCase, state) {
  const replacements =
    testCase && testCase.publishedHotspotLabelReplacements && typeof testCase.publishedHotspotLabelReplacements === "object"
      ? testCase.publishedHotspotLabelReplacements
      : {};
  const replacementEntries = Object.entries(replacements);
  if (!replacementEntries.length || !state || typeof state !== "object") return;

  const replaceLabel = (value) => {
    const text = String(value || "").trim();
    return replacements[text] || text;
  };
  const patchModule = (module) => {
    if (!module || typeof module !== "object") return;
    if (module.label !== undefined) module.label = replaceLabel(module.label);
    if (module.title !== undefined) module.title = replaceLabel(module.title);
    if (module.imageText !== undefined) module.imageText = replaceLabel(module.imageText);
  };

  for (const hotspot of state.hotspots || []) patchModule(hotspot);
  for (const module of (state.structuredSpec && state.structuredSpec.modules) || []) patchModule(module);
  for (const module of (state.visualSpec && state.visualSpec.modules) || []) patchModule(module);
  for (const region of (state.layout && state.layout.regions) || []) patchModule(region);
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
  const structuredSpec = JSON.parse(JSON.stringify(result.structuredSpec || {}));
  const state = {
    id: result.id || "",
    question: result.question || "",
    title: result.title || "",
    summary: result.summary || "",
    structuredSpec,
    visualSpec: structuredSpec,
    layout: normalizeLayout(result.layout),
    hotspots: JSON.parse(JSON.stringify(result.hotspots || [])),
    imageWidth: result.imageWidth || null,
    imageHeight: result.imageHeight || null,
    createdAt: result.createdAt || "",
    updatedAt: result.updatedAt || ""
  };
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
    id: layout.id || "",
    family: layout.family || "",
    layoutFamily: layout.layoutFamily || layout.family || "",
    visualMode: layout.visualMode || "",
    layoutVariant: layout.layoutVariant || "",
    aspectRatio: layout.aspectRatio || "",
    canvas: layout.canvas || null,
    clickBoundsSource: layout.clickBoundsSource || "",
    regions: layout.regions.map((region) => ({
      id: region.id || "",
      hotspotId: region.hotspotId || "",
      type: region.type || "",
      role: region.role || "",
      label: region.label || region.title || "",
      zIndex: region.zIndex || 0,
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
