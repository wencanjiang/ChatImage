"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { callVisionApi, createConfig } = require("../server");
const {
  connectCdp,
  findChrome,
  getFreePort,
  rmWithRetry,
  saveScreenshot,
  stopProcess,
  waitForWebSocketUrl
} = require("./browser.test");

const DEFAULT_BASE_URL = "http://127.0.0.1:5178";

async function main() {
  const baseUrl = String(process.env.CHATIMAGE_REAL_VISUAL_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const artifactDir = process.env.CHATIMAGE_REAL_VISUAL_DIR || path.join(process.cwd(), "tmp", "real-visual-acceptance");
  fs.mkdirSync(artifactDir, { recursive: true });

  const config = await fetchJson(`${baseUrl}/api/config`);
  assert.strictEqual(config.realApiAvailable, true, "fixed 5178 service must have real API configured");
  assert.ok(["locateanything", "mimo-vision", "local-ocr", "remote"].includes(String(config.visionMode || "")), "vision mode is missing");

  const chromePath = findChrome();
  if (!chromePath) {
    console.log("real-visual-acceptance.js skipped: Chrome or Edge was not found");
    return;
  }

  const cases = selectCases();
  const browser = await launchBrowser(chromePath);
  const report = {
    createdAt: new Date().toISOString(),
    baseUrl,
    config: {
      visionMode: config.visionMode,
      visionFallbackMode: config.visionFallbackMode,
      visionModel: config.visionModel,
      locateAnythingConfigured: Boolean(config.locateAnythingConfigured),
      sam3Configured: Boolean(config.sam3Configured)
    },
    cases: []
  };

  try {
    const cdp = await connectBrowser(browser);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 980,
      deviceScaleFactor: 1,
      mobile: false
    });

    for (const testCase of cases) {
      const caseReport = await runCase(cdp, baseUrl, artifactDir, testCase);
      report.cases.push(caseReport);
      console.log(
        `${testCase.id}: ${caseReport.status.toUpperCase()} / score=${caseReport.score} / mode=${caseReport.actual.visualMode} / alignment=${caseReport.actual.alignmentProvider}`
      );
    }

    await cdp.close();
  } finally {
    await stopProcess(browser.process);
    await rmWithRetry(browser.profileDir);
  }

  report.summary = summarize(report.cases);
  fs.writeFileSync(path.join(artifactDir, "real-visual-acceptance-report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(artifactDir, "real-visual-acceptance-report.md"), formatMarkdownReport(report));

  if (process.env.CHATIMAGE_REAL_VISUAL_ACCEPTANCE_SOFT !== "1") {
    assert.strictEqual(report.summary.failed, 0, JSON.stringify(report.summary, null, 2));
  }
}

function selectCases() {
  const selected = String(process.env.CHATIMAGE_REAL_VISUAL_CASES || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const selectedSet = selected.length ? new Set(selected) : null;
  return REAL_VISUAL_CASES.filter((testCase) => !selectedSet || selectedSet.has(testCase.id));
}

const REAL_VISUAL_CASES = [
  {
    id: "sanqing-map",
    category: "tourist-map",
    question:
      "生成三清山的地理风貌图，我下周想去游玩。画在一张图上，不要流程图。请包含南清园核心景区、西海岸栈道、阳光海岸栈道、交通索道入口、山上住宿点，点击区域后解释具体风貌和游玩建议。",
    expectedVisualMode: "map",
    expectedKeywords: ["三清山", "南清园", "西海岸", "阳光海岸", "索道", "住宿"],
    expectedTargets: [
      {
        label: "西海岸栈道",
        evidence: ["西侧", "栈道", "云海"],
        targetType: "route"
      },
      {
        label: "阳光海岸栈道",
        evidence: ["东侧", "阳光海岸", "栈道"],
        targetType: "route"
      },
      {
        label: "山上住宿点",
        evidence: ["住宿", "房屋", "床位", "宾馆"],
        targetType: "legend"
      }
    ],
    minHotspots: 5,
    minMaskRatio: 0.65
  },
  {
    id: "westlake-map",
    category: "hand-drawn-map",
    question:
      "手绘地图，西湖，画在一张图上。点击交互地理区域，可以呈现具体的地理风貌，不要流程图，要像一幅旅游地图。",
    expectedVisualMode: "map",
    expectedKeywords: ["西湖", "白堤", "苏堤", "三潭印月", "雷峰塔", "孤山", "宝石山", "曲院风荷", "柳浪闻莺"],
    expectedTargets: [
      {
        label: "白堤断桥",
        evidence: ["白堤", "断桥", "北侧"],
        targetType: "route"
      },
      {
        label: "三潭印月",
        evidence: ["湖心岛", "石塔", "水面"],
        targetType: "landmark"
      },
      {
        label: "孤山",
        evidence: ["山岛", "湖岸", "北侧"],
        targetType: "landmark"
      },
      {
        label: "曲院风荷",
        evidence: ["荷塘", "曲桥", "近岸"],
        targetType: "landmark"
      },
      {
        label: "柳浪闻莺",
        evidence: ["柳树", "园路", "南岸"],
        targetType: "landmark"
      }
    ],
    minHotspots: 8,
    minMaskRatio: 0.65
  },
  {
    id: "museum-scene",
    category: "illustrated-scene",
    question:
      "画一个未来博物馆的沉浸式插画场景，用户可以点击展品、观众、导览机器人、空间结构来了解细节。导览机器人旁边要有 AI 个性化导览 的短标签。",
    expectedVisualMode: "scene",
    expectedKeywords: ["博物馆", "展品", "观众", "机器人", "AI个性化导览"],
    expectedTargets: [
      {
        label: "导览机器人",
        evidence: ["机器人", "AI个性化导览", "短标签"],
        targetType: "subject-with-label"
      }
    ],
    minHotspots: 4,
    minMaskRatio: 0.65
  }
];

async function runCase(cdp, baseUrl, artifactDir, testCase) {
  const caseDir = path.join(artifactDir, testCase.id);
  fs.mkdirSync(caseDir, { recursive: true });
  await cdp.send("Page.navigate", { url: `${baseUrl}/?provider=api&realVisualCase=${encodeURIComponent(testCase.id)}` });
  await cdp.waitFor("Page.loadEventFired", 10000);
  await submitQuestion(cdp, testCase.question);
  await waitForGeneratedResult(cdp, testCase);
  const pageState = await collectPageState(cdp);
  await saveScreenshot(cdp, path.join(caseDir, "result.png"));
  fs.writeFileSync(path.join(caseDir, "page-state.json"), JSON.stringify(pageState, null, 2));

  const targetReports = [];
  for (const target of testCase.expectedTargets) {
    const clicked = await clickTargetAndCapturePreview(cdp, caseDir, pageState, target);
    targetReports.push(clicked);
  }

  const visualJudgements = await runVisualJudgements(pageState, targetReports, testCase);
  const checks = evaluateCase(testCase, pageState, targetReports, visualJudgements);
  const score = Math.round(
    (checks.reduce((total, check) => total + (check.status === "ok" ? 1 : check.status === "warn" ? 0.5 : 0), 0) /
      checks.length) *
      100
  );
  const status = checks.some((check) => check.status === "fail") ? "fail" : checks.some((check) => check.status === "warn") ? "warn" : "ok";
  const caseReport = {
    id: testCase.id,
    category: testCase.category,
    question: testCase.question,
    status,
    score,
    actual: {
      visualMode: pageState.structured.visualMode || "",
      title: pageState.title,
      hotspotCount: pageState.hotspots.length,
      alignmentProvider: pageState.alignmentRaw.provider || "",
      alignment: summarizeAlignment(pageState)
    },
    targets: targetReports,
    visualJudgements,
    checks,
    artifactDir: caseDir
  };
  fs.writeFileSync(path.join(caseDir, "case-report.json"), JSON.stringify(caseReport, null, 2));
  return caseReport;
}

async function submitQuestion(cdp, question) {
  await cdp.evaluate(`
    (() => {
      const input = document.querySelector("#questionInput");
      input.value = ${JSON.stringify(question)};
      input.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector("#questionForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    })()
  `);
}

async function waitForGeneratedResult(cdp, testCase) {
  await cdp.waitForFunction(
    `(() => {
      const image = document.querySelector(".image-stage img");
      const enoughHotspots = document.querySelectorAll("[data-hotspot-id]").length >= ${Number(testCase.minHotspots || 3)};
      const complete = image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && enoughHotspots;
      const failed = document.querySelector("#retryButton") || document.querySelector(".image-load-error");
      return Boolean(complete || failed);
    })()`,
    Number(process.env.CHATIMAGE_REAL_VISUAL_WAIT_MS || 420000)
  );
  const failure = await cdp.evaluate(`
    (() => {
      const failed = document.querySelector("#retryButton") || document.querySelector(".image-load-error");
      return failed ? document.body.innerText.slice(0, 2000) : "";
    })()
  `);
  if (failure) throw new Error(`generation failed or image failed to load:\n${failure}`);
}

async function collectPageState(cdp) {
  return cdp.evaluate(`
    (() => {
      const pres = Array.from(document.querySelectorAll(".debug-grid pre")).map((node) => node.textContent || "");
      let structured = {};
      let layout = {};
      let alignmentRaw = {};
      try { structured = JSON.parse(pres[1] || "{}"); } catch {}
      try { layout = JSON.parse(pres[2] || "{}"); } catch {}
      try { alignmentRaw = JSON.parse(pres[5] || "{}"); } catch {}
      const stageNode = document.querySelector(".image-stage");
      const imageNode = document.querySelector(".image-stage img");
      const stageRect = stageNode ? stageNode.getBoundingClientRect() : null;
      const hotspots = Array.from(document.querySelectorAll(".image-stage > [data-hotspot-id]")).map((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          id: node.getAttribute("data-hotspot-id") || "",
          label: node.getAttribute("aria-label") || "",
          text: node.textContent || "",
          background: style.backgroundColor,
          borderTopWidth: style.borderTopWidth,
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          style: node.getAttribute("style") || ""
        };
      });
      return {
        title: document.querySelector(".result-header h2")?.textContent || "",
        summary: document.querySelector(".result-header p")?.textContent || "",
        imageUrl: imageNode ? imageNode.src : "",
        imageNaturalWidth: imageNode ? imageNode.naturalWidth : 0,
        imageNaturalHeight: imageNode ? imageNode.naturalHeight : 0,
        rawAnswer: pres[0] || "",
        imagePrompt: pres[3] || "",
        structured,
        layout,
        alignmentRaw,
        stageRect: stageRect ? { left: stageRect.left, top: stageRect.top, width: stageRect.width, height: stageRect.height } : null,
        hotspots,
        bodyText: document.body.innerText
      };
    })()
  `);
}

async function clickTargetAndCapturePreview(cdp, caseDir, pageState, target) {
  const hotspotId = chooseHotspotId(pageState, target);
  assert.ok(hotspotId, `could not find hotspot for target ${target.label}`);
  await cdp.evaluate(`
    (() => {
      const node = document.querySelector(${JSON.stringify(`[data-hotspot-id='${cssEscape(hotspotId)}']`)});
      if (!node) throw new Error("hotspot not found: ${cssEscape(hotspotId)}");
      node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    })()
  `);
  await cdp.waitForFunction(`!document.querySelector("#detailPanel").hidden && document.querySelector(".detail-content h2")`, 5000);
  await cdp.waitForFunction(
    `Boolean(document.querySelector(".detail-preview-cutout-image") || document.querySelector(".detail-preview-organic-image") || document.querySelector(".detail-preview-crop"))`,
    12000
  );
  await cdp
    .waitForFunction(
      `Boolean(document.querySelector(".detail-preview-cutout-image") || document.querySelector(".detail-preview-organic-image"))`,
      Number(process.env.CHATIMAGE_REAL_VISUAL_PREVIEW_WAIT_MS || 18000)
    )
    .catch(() => {});
  const detailState = await cdp.evaluate(`
    (() => {
      const panel = document.querySelector("#detailPanel");
      const preview = document.querySelector(".detail-preview-crop");
      const cutout = document.querySelector(".detail-preview-cutout-image");
      const organic = document.querySelector(".detail-preview-organic-image");
      const maskedImage = document.querySelector(".detail-preview-crop.has-mask img");
      const style = preview ? getComputedStyle(preview) : null;
      const imageStyle = maskedImage ? getComputedStyle(maskedImage) : null;
      return {
        title: document.querySelector(".detail-content h2")?.textContent || "",
        text: panel ? panel.innerText : "",
        previewExists: Boolean(preview),
        cutoutSrc: cutout ? cutout.src : "",
        organicSrc: organic ? organic.src : "",
        previewClass: preview ? preview.className : "",
        maskImage: imageStyle ? imageStyle.getPropertyValue("--mask-image") : "",
        cropStyle: style
          ? {
              cropX: style.getPropertyValue("--crop-x"),
              cropY: style.getPropertyValue("--crop-y"),
              cropW: style.getPropertyValue("--crop-w"),
              cropH: style.getPropertyValue("--crop-h"),
              aspectRatio: preview.getBoundingClientRect().width / Math.max(1, preview.getBoundingClientRect().height)
            }
          : null
      };
    })()
  `);
  const previewMetrics = await measurePreviewAlpha(cdp);
  const previewPath = path.join(caseDir, `preview-${safeName(target.label)}.png`);
  const previewDataUrl = detailState.cutoutSrc || detailState.organicSrc || "";
  if (previewDataUrl && previewDataUrl.startsWith("data:image/png;base64,")) {
    saveDataUrl(previewDataUrl, previewPath);
  } else {
    await saveElementScreenshot(cdp, ".detail-preview-crop", previewPath);
  }
  return {
    ...target,
    hotspotId,
    detailTitle: detailState.title,
    detailTextLength: String(detailState.text || "").length,
    previewExists: detailState.previewExists,
    previewClass: detailState.previewClass,
    previewPath,
    hasCutout: Boolean(detailState.cutoutSrc),
    hasOrganic: Boolean(detailState.organicSrc),
    hasMaskFallback: /\bhas-mask\b/.test(detailState.previewClass || ""),
    maskImage: detailState.maskImage,
    previewMetrics,
    cropStyle: detailState.cropStyle
  };
}

async function measurePreviewAlpha(cdp) {
  return cdp.evaluate(`
    (async () => {
      const image = document.querySelector(".detail-preview-cutout-image, .detail-preview-organic-image");
      const maskedCrop = document.querySelector(".detail-preview-crop.has-mask");
      let sourceImage = image || null;
      if (!sourceImage && maskedCrop) {
        const maskedImage = document.querySelector(".detail-preview-crop.has-mask img");
        const maskImage = maskedImage ? getComputedStyle(maskedImage).getPropertyValue("--mask-image") || "" : "";
        const match = maskImage.match(/url\\((["']?)(.*?)\\1\\)/);
        if (match && match[2]) {
          sourceImage = new Image();
          await new Promise((resolve, reject) => {
            sourceImage.onload = resolve;
            sourceImage.onerror = reject;
            sourceImage.src = match[2];
          });
        }
      }
      if (!sourceImage || !sourceImage.complete || !sourceImage.naturalWidth || !sourceImage.naturalHeight) return null;
      const canvas = document.createElement("canvas");
      canvas.width = sourceImage.naturalWidth;
      canvas.height = sourceImage.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(sourceImage, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let nonTransparent = 0;
      let opaque = 0;
      let cornerMaxAlpha = 0;
      const cornerOpaque = [false, false, false, false];
      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = -1;
      let maxY = -1;
      const cornerSize = Math.max(4, Math.floor(Math.min(canvas.width, canvas.height) * 0.12));
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const alpha = pixels[(y * canvas.width + x) * 4 + 3];
          if (alpha > 8) {
            nonTransparent += 1;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
          if (alpha > 240) opaque += 1;
          const cornerIndex =
            x < cornerSize && y < cornerSize
              ? 0
              : x >= canvas.width - cornerSize && y < cornerSize
                ? 1
                : x < cornerSize && y >= canvas.height - cornerSize
                  ? 2
                  : x >= canvas.width - cornerSize && y >= canvas.height - cornerSize
                    ? 3
                    : -1;
          if (cornerIndex >= 0) {
            cornerMaxAlpha = Math.max(cornerMaxAlpha, alpha);
            if (alpha > 245) cornerOpaque[cornerIndex] = true;
          }
        }
      }
      const total = canvas.width * canvas.height;
      const bboxWidth = maxX >= minX ? maxX - minX + 1 : 0;
      const bboxHeight = maxY >= minY ? maxY - minY + 1 : 0;
      const bboxArea = bboxWidth * bboxHeight;
      return {
        width: canvas.width,
        height: canvas.height,
        nonTransparentRatio: total ? nonTransparent / total : 0,
        opaqueRatio: total ? opaque / total : 0,
        fillInAlphaBoxRatio: bboxArea ? nonTransparent / bboxArea : 0,
        cornerMaxAlpha,
        cornerOpaqueCount: cornerOpaque.filter(Boolean).length,
        bbox: { x: minX, y: minY, width: bboxWidth, height: bboxHeight }
      };
    })()
  `);
}

function chooseHotspotId(pageState, target) {
  const modules = [...(pageState.structured.modules || []), ...(pageState.structured.auxiliaryModules || [])];
  const ranked = modules
    .map((item) => ({ module: item, match: scoreTargetModule(target, item) }))
    .filter((item) => item.match.matched)
    .sort((a, b) => b.match.score - a.match.score);
  const module = ranked.length ? ranked[0].module : null;
  if (module && pageState.hotspots.some((hotspot) => hotspot.id === module.id)) return module.id;
  const label = normalizeForMatch(target.label);
  const hotspot = pageState.hotspots.find((item) => {
    const hotspotText = normalizeForMatch(item.label || item.text || "");
    return label && hotspotText.includes(label);
  });
  return hotspot ? hotspot.id : "";
}

function targetMatchesModule(target, module) {
  return scoreTargetModule(target, module).matched;
}

function scoreTargetModule(target, module) {
  const label = normalizeForMatch(target && target.label);
  const title = normalizeForMatch(module && module.title);
  const primaryFields = [
    module && module.title,
    module && module.imageText,
    module && module.regionPrompt
  ].map(normalizeForMatch);
  const secondaryFields = [
    ...(Array.isArray(module && module.visualEvidence) ? module.visualEvidence : []),
    ...(Array.isArray(module && module.locatorQueries) ? module.locatorQueries : [])
  ].map(normalizeForMatch);
  const haystack = primaryFields.concat(secondaryFields).join("\n");
  let score = 0;
  const reasons = [];
  if (label && title && title === label) {
    score += 140;
    reasons.push("exact-title");
  } else if (label && title && (title.includes(label) || label.includes(title))) {
    score += 115;
    reasons.push("title-contains-label");
  }
  if (label && primaryFields.some((field) => field && field.includes(label))) {
    score += 95;
    reasons.push("primary-label");
  } else if (label && secondaryFields.some((field) => field && field.includes(label))) {
    score += 75;
    reasons.push("secondary-label");
  }
  const evidenceHits = Array.isArray(target && target.evidence)
    ? target.evidence
        .map((item) => normalizeForMatch(item))
        .filter((item) => item && haystack.includes(item))
    : [];
  const distinctiveHits = evidenceHits.filter((item) => !isGenericEvidenceToken(item));
  if (distinctiveHits.length >= 2) {
    score += 55 + distinctiveHits.length * 10;
    reasons.push(`distinctive-evidence:${distinctiveHits.length}`);
  } else if (distinctiveHits.length === 1 && score >= 75) {
    score += 20;
    reasons.push("supporting-evidence");
  }
  return {
    matched: score >= 70,
    score,
    reasons,
    evidenceHits
  };
}

function normalizeForMatch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s"'“”‘’`.,，。:：;；!?！？()[\]{}<>《》、|/\\_-]+/g, "");
}

function isGenericEvidenceToken(value) {
  const token = normalizeForMatch(value);
  return new Set([
    "栈道",
    "路线",
    "路径",
    "区域",
    "地图",
    "地理",
    "标签",
    "短标签",
    "图标",
    "文字",
    "模块",
    "主体",
    "对象",
    "物体",
    "景区",
    "landmark",
    "route",
    "label",
    "icon",
    "object",
    "region"
  ]).has(token);
}

async function runVisualJudgements(pageState, targetReports, testCase) {
  if (process.env.CHATIMAGE_REAL_VISUAL_JUDGE === "0") return [];
  const serverConfig = createVisualJudgeConfig();
  if (!serverConfig.visionEndpoint || !(serverConfig.visionApiKey || serverConfig.textApiKey || serverConfig.apiKey)) {
    return [
      {
        status: "warn",
        target: "all",
        reason: "visual judge skipped: missing MiMo vision endpoint/key"
      }
    ];
  }
  const judgements = [];
  for (const target of targetReports) {
    const mainPrompt = buildVisualJudgePrompt({
      testCase,
      target,
      mode: "full-image"
    });
    judgements.push({
      target: target.label,
      image: "full",
      ...(await callVisualJudge(serverConfig, mainPrompt, pageState.imageUrl))
    });
    const previewDataUrl = fileToDataUrl(target.previewPath);
    const previewPrompt = buildVisualJudgePrompt({
      testCase,
      target,
      mode: "preview"
    });
    judgements.push({
      target: target.label,
      image: "preview",
      ...(await callVisualJudge(serverConfig, previewPrompt, previewDataUrl))
    });
  }
  return judgements;
}

function createVisualJudgeConfig() {
  const config = createConfig({
    visionMode: "mimo-vision",
    visionFallbackMode: "mimo-vision",
    visionModel: process.env.CHATIMAGE_VISION_JUDGE_MODEL || process.env.CHATIMAGE_VISION_MODEL || "mimo-v2.5",
    visionApiKey: process.env.CHATIMAGE_VISION_API_KEY || "",
    textApiKey: process.env.CHATIMAGE_TEXT_API_KEY || process.env.CHATIMAGE_API_KEY || process.env.WUYIN_API_KEY || "",
    apiKey: process.env.CHATIMAGE_API_KEY || process.env.WUYIN_API_KEY || "",
    apiRequestTimeoutMs: Number(process.env.CHATIMAGE_REAL_VISUAL_JUDGE_TIMEOUT_MS || 120000)
  });
  if (!config.visionEndpoint) {
    const base = String(process.env.CHATIMAGE_VISION_BASE_URL || process.env.CHATIMAGE_TEXT_BASE_URL || "https://api.xiaomimimo.com/v1").replace(/\/+$/, "");
    config.visionEndpoint = `${base}/chat/completions`;
  }
  return config;
}

function buildVisualJudgePrompt({ testCase, target, mode }) {
  const isPreview = mode === "preview";
  return [
    "Inspect the supplied image as a strict visual QA judge for an interactive image product.",
    "Return JSON only. Do not include Markdown.",
    `Case: ${testCase.id}`,
    `Target: ${target.label}`,
    `Target type: ${target.targetType}`,
    `Required visual evidence: ${target.evidence.join(", ")}`,
    isPreview
      ? "This is a hotspot preview/cutout. The target should be centered and clearly visible. Small surrounding context is acceptable for routes or regions, but the preview must not mainly show another target."
      : "This is the full generated image. The target must visibly exist in the image, not only in hidden metadata or explanation text.",
    'Return exactly: {"targetPresent":true,"targetClear":true,"wrongTarget":false,"score":0.0,"problems":[],"description":"short"}',
    "Use score 0.8-1 when the target and required evidence are clearly visible; 0.5 when partially visible; below 0.5 when missing or confused with another area."
  ].join("\n");
}

async function callVisualJudge(serverConfig, prompt, imageUrl) {
  try {
    const content = await callVisionApi(serverConfig, {
      content: prompt,
      imageUrl,
      model: serverConfig.visionModel,
      purpose: "real_visual_acceptance",
      responseFormat: "json"
    });
    const parsed = parseJsonFromText(content);
    return {
      status: parsed.targetPresent && parsed.targetClear && !parsed.wrongTarget && Number(parsed.score) >= 0.55 ? "ok" : "fail",
      parsed
    };
  } catch (error) {
    return {
      status: "warn",
      error: error.message || String(error)
    };
  }
}

function evaluateCase(testCase, pageState, targetReports, visualJudgements) {
  return [
    checkVisualMode(testCase, pageState),
    checkKeywords(testCase, pageState),
    checkHotspots(testCase, pageState),
    checkAlignment(testCase, pageState),
    checkTargets(testCase, pageState, targetReports),
    checkDetails(targetReports),
    checkPreviews(targetReports),
    checkVisualJudgements(visualJudgements)
  ];
}

function checkVisualMode(testCase, pageState) {
  const actual = String(pageState.structured.visualMode || "");
  if (actual === testCase.expectedVisualMode) return ok("visual_mode", `visualMode=${actual}`);
  return fail("visual_mode", `expected ${testCase.expectedVisualMode}, got ${actual}`);
}

function checkKeywords(testCase, pageState) {
  const haystack = [
    pageState.title,
    pageState.summary,
    pageState.rawAnswer,
    pageState.imagePrompt,
    JSON.stringify(pageState.structured || {})
  ].join("\n");
  const hits = testCase.expectedKeywords.filter((keyword) => haystack.includes(keyword));
  const ratio = hits.length / testCase.expectedKeywords.length;
  if (ratio >= 0.8) return ok("keyword_coverage", `${hits.length}/${testCase.expectedKeywords.length}: ${hits.join(", ")}`);
  return fail("keyword_coverage", `${hits.length}/${testCase.expectedKeywords.length}`, {
    missing: testCase.expectedKeywords.filter((keyword) => !hits.includes(keyword))
  });
}

function checkHotspots(testCase, pageState) {
  if (pageState.hotspots.length < Number(testCase.minHotspots || 3)) {
    return fail("hotspot_count", `only ${pageState.hotspots.length} hotspots`);
  }
  const visible = pageState.hotspots.filter((item) => item.background !== "rgba(0, 0, 0, 0)" || item.borderTopWidth !== "0px");
  if (visible.length) return fail("hotspot_transparency", `${visible.length} hotspots are visibly styled`);
  return ok("hotspot_count", `${pageState.hotspots.length} transparent hotspots`);
}

function checkAlignment(testCase, pageState) {
  const summary = summarizeAlignment(pageState);
  if (summary.provider === "alignment-fallback") return fail("alignment", "global alignment fallback", summary);
  if (summary.total && summary.maskRatio < Number(testCase.minMaskRatio || 0.65)) {
    return fail("alignment", `mask ratio too low ${summary.maskCount}/${summary.total}`, summary);
  }
  if (summary.total && summary.plannedRatio >= 0.8 && summary.maskRatio < 0.7) {
    return warn("alignment", `semantic locator weak planned=${summary.plannedCount}/${summary.total}`, summary);
  }
  return ok("alignment", `provider=${summary.provider}, mask=${summary.maskCount}/${summary.total}`, summary);
}

function checkTargets(testCase, pageState, targetReports) {
  const modules = [...(pageState.structured.modules || []), ...(pageState.structured.auxiliaryModules || [])];
  const missing = testCase.expectedTargets.filter((target) => !modules.some((module) => targetMatchesModule(target, module)));
  const unclicked = targetReports.filter((target) => !target.hotspotId);
  if (missing.length || unclicked.length) {
    return fail("target_contract", `missing=${missing.map((item) => item.label).join(", ")} unclicked=${unclicked.map((item) => item.label).join(", ")}`);
  }
  return ok("target_contract", `${targetReports.length} expected targets are represented and clickable`);
}

function checkDetails(targetReports) {
  const tooThin = targetReports.filter((target) => target.detailTextLength < 120);
  if (tooThin.length) return fail("detail_quality", `${tooThin.length} clicked targets have very thin detail text`, tooThin);
  const thin = targetReports.filter((target) => target.detailTextLength < 160);
  if (thin.length) return warn("detail_quality", `${thin.length} clicked targets could use richer detail text`, thin);
  return ok("detail_quality", "clicked target detail text is substantial");
}

function checkPreviews(targetReports) {
  const missing = targetReports.filter((target) => !target.previewExists || !fs.existsSync(target.previewPath));
  if (missing.length) return fail("preview_capture", `${missing.length} previews missing`, missing);
  const withoutSubjectLabelPreview = targetReports.filter(
    (target) => target.targetType === "subject-with-label" && !target.hasCutout && !target.hasOrganic
  );
  if (withoutSubjectLabelPreview.length) {
    return fail(
      "preview_capture",
      `subject-with-label target lacks subject+label preview: ${withoutSubjectLabelPreview.map((item) => item.label).join(", ")}`
    );
  }
  const irregularTargets = targetReports.filter((target) => target.requireIrregularPreview || ["landmark", "subject-with-label"].includes(target.targetType));
  const rectangular = irregularTargets.filter((target) => {
    const metrics = target.previewMetrics;
    if (!metrics) return true;
    return metrics.nonTransparentRatio > 0.92 || metrics.fillInAlphaBoxRatio > 0.95 || Number(metrics.cornerOpaqueCount || 0) >= 3;
  });
  if (rectangular.length) {
    return fail(
      "preview_shape",
      `${rectangular.length} target previews are still rectangular or missing alpha shape`,
      rectangular.map((target) => ({
        label: target.label,
        hotspotId: target.hotspotId,
        hasCutout: target.hasCutout,
        hasOrganic: target.hasOrganic,
        previewMetrics: target.previewMetrics
      }))
    );
  }
  return ok("preview_capture", `${targetReports.length} previews saved`);
}

function checkVisualJudgements(visualJudgements) {
  if (!visualJudgements.length) return warn("visual_judge", "visual judge did not run");
  const failures = visualJudgements.filter((item) => item.status === "fail");
  const warnings = visualJudgements.filter((item) => item.status === "warn");
  if (failures.length) return fail("visual_judge", `${failures.length} visual checks failed`, failures);
  if (warnings.length) return warn("visual_judge", `${warnings.length} visual checks warned`, warnings);
  return ok("visual_judge", `${visualJudgements.length} visual checks passed`);
}

function summarizeAlignment(pageState) {
  const raw = pageState.alignmentRaw || {};
  const regions = (pageState.layout.regions || []).filter((region) => region.hotspotId);
  const sourceCounts = raw.sourceCounts || {};
  const total = regions.length || pageState.hotspots.length;
  const maskCount = regions.filter((region) => region.mask && region.mask.bounds).length;
  const plannedCount =
    Number(sourceCounts.planned || 0) ||
    regions.filter((region) => String(region.alignedBy || "").toLowerCase().includes("planned")).length;
  return {
    provider: String(raw.provider || ""),
    providerChain: Array.isArray(raw.providerChain) ? raw.providerChain : [],
    sourceCounts,
    total,
    maskCount,
    maskRatio: total ? round(maskCount / total) : 0,
    plannedCount,
    plannedRatio: total ? round(plannedCount / total) : 0,
    acceptedSam3Count: Array.isArray(raw.acceptedSam3Modules) ? raw.acceptedSam3Modules.length : 0,
    warnings: Array.isArray(raw.warnings) ? raw.warnings : []
  };
}

async function launchBrowser(chromePath) {
  const debugPort = await getFreePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-real-visual-"));
  const browserProcess = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--disable-features=VizDisplayCompositor",
    "--disable-extensions",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${debugPort}`,
    "about:blank"
  ]);
  let stderr = "";
  browserProcess.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  return { process: browserProcess, profileDir, debugPort, getStderr: () => stderr };
}

async function connectBrowser(browser) {
  const wsUrl = await waitForWebSocketUrl(browser.debugPort, browser.getStderr);
  return connectCdp(wsUrl);
}

async function saveElementScreenshot(cdp, selector, filePath) {
  const rect = await cdp.evaluate(`
    (() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    })()
  `);
  if (!rect || rect.width <= 0 || rect.height <= 0) return;
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    clip: {
      x: Math.max(0, rect.x),
      y: Math.max(0, rect.y),
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
      scale: 1
    }
  });
  fs.writeFileSync(filePath, Buffer.from(result.data, "base64"));
}

async function fetchJson(url) {
  const response = await fetch(url);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `GET ${url} failed with ${response.status}`);
  return json;
}

function parseJsonFromText(text) {
  const source = String(text || "").trim();
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : source;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`visual judge returned non-JSON: ${source.slice(0, 200)}`);
  return JSON.parse(candidate.slice(start, end + 1));
}

function saveDataUrl(dataUrl, filePath) {
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) throw new Error("preview is not a PNG data URL");
  fs.writeFileSync(filePath, Buffer.from(dataUrl.slice(prefix.length), "base64"));
}

function fileToDataUrl(filePath) {
  const data = fs.readFileSync(filePath);
  return `data:image/png;base64,${data.toString("base64")}`;
}

function safeName(value) {
  return String(value || "target").replace(/[^\p{Letter}\p{Number}_-]+/gu, "_").slice(0, 80);
}

function cssEscape(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function ok(id, detail, data) {
  return { id, status: "ok", detail, ...(data ? { data } : {}) };
}

function warn(id, detail, data) {
  return { id, status: "warn", detail, ...(data ? { data } : {}) };
}

function fail(id, detail, data) {
  return { id, status: "fail", detail, ...(data ? { data } : {}) };
}

function summarize(cases) {
  const failed = cases.filter((item) => item.status === "fail").length;
  const warnings = cases.filter((item) => item.status === "warn").length;
  const averageScore = cases.length ? Math.round(cases.reduce((sum, item) => sum + item.score, 0) / cases.length) : 0;
  return {
    status: failed ? "fail" : warnings ? "warn" : "ok",
    caseCount: cases.length,
    failed,
    warnings,
    averageScore
  };
}

function formatMarkdownReport(report) {
  const lines = [
    "# Real Visual Acceptance",
    "",
    `- Base URL: ${report.baseUrl}`,
    `- Status: ${report.summary.status}`,
    `- Cases: ${report.summary.caseCount}`,
    `- Average score: ${report.summary.averageScore}`,
    "",
    "| Case | Status | Score | Mode | Alignment | Artifact |",
    "| --- | --- | ---: | --- | --- | --- |"
  ];
  for (const item of report.cases) {
    lines.push(
      `| ${item.id} | ${item.status} | ${item.score} | ${item.actual.visualMode} | ${item.actual.alignmentProvider} | ${item.artifactDir} |`
    );
  }
  lines.push("", "## Checks");
  for (const item of report.cases) {
    lines.push("", `### ${item.id}`);
    for (const check of item.checks) {
      lines.push(`- ${check.status.toUpperCase()} ${check.id}: ${check.detail}`);
    }
    for (const target of item.targets) {
      lines.push(`- TARGET ${target.label}: hotspot=${target.hotspotId}, preview=${target.previewPath}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function round(value) {
  return Number(Number(value || 0).toFixed(4));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  REAL_VISUAL_CASES,
  runVisualAcceptance: main
};
