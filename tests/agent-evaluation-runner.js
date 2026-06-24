"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createServer } = require("../server");
const { createRealInstanceServerConfig } = require("./real-browser-instance");
const {
  close,
  connectCdp,
  findChrome,
  getFreePort,
  listen,
  rmWithRetry,
  saveScreenshot,
  stopProcess,
  waitForWebSocketUrl
} = require("./browser.test");
const { getAgentEvaluationCases } = require("./agent-evaluation-cases");

async function runAgentEvaluation(options = {}) {
  const provider = options.provider || process.env.CHATIMAGE_AGENT_EVAL_PROVIDER || "mock";
  const failOnThreshold = options.failOnThreshold !== false;
  const includeRealOnly = provider !== "mock" || options.includeRealOnly;
  const cases = options.cases || getAgentEvaluationCases({ includeRealOnly, ids: parseCaseIds(process.env.CHATIMAGE_AGENT_EVAL_CASES) });
  const artifactDir = options.artifactDir || path.join(process.cwd(), "tmp", provider === "mock" ? "agent-evaluation-test" : "agent-evaluation");
  fs.mkdirSync(artifactDir, { recursive: true });

  const chromePath = findChrome();
  if (!chromePath) {
    const skipped = { skipped: true, reason: "Chrome or Edge was not found", cases: [] };
    writeReports(artifactDir, skipped);
    return skipped;
  }

  const apiKey = process.env.CHATIMAGE_API_KEY || process.env.WUYIN_API_KEY || "";
  if (provider !== "mock" && !apiKey) {
    const skipped = { skipped: true, reason: "CHATIMAGE_API_KEY or WUYIN_API_KEY is not set", cases: [] };
    writeReports(artifactDir, skipped);
    return skipped;
  }

  const serverConfig =
    provider === "mock"
      ? {
          port: 0,
          apiKey: "",
          textModel: "mock",
          imageModel: "mock",
          textEndpoint: "https://api.wuyinkeji.com/api/chat/index",
          imageEndpoint: "https://api.wuyinkeji.com/api/async/image_gpt",
          imageDetailEndpoint: "https://api.wuyinkeji.com/api/async/detail"
        }
      : createRealInstanceServerConfig(apiKey, process.env);
  const app = createServer(serverConfig);
  await listen(app);

  let browser = null;
  let profileDir = "";
  let chromeStderr = "";
  const report = {
    createdAt: new Date().toISOString(),
    provider,
    skipped: false,
    thresholds: createDefaultThresholds(),
    cases: []
  };

  try {
    const baseUrl = `http://127.0.0.1:${app.address().port}`;
    const debugPort = await getFreePort();
    profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatimage-agent-eval-"));
    browser = spawn(chromePath, [
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
    browser.stderr.on("data", (chunk) => {
      chromeStderr += chunk.toString();
    });
    const wsUrl = await waitForWebSocketUrl(debugPort, () => chromeStderr);
    const cdp = await connectCdp(wsUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 980,
      deviceScaleFactor: 1,
      mobile: false
    });

    for (const testCase of cases) {
      const caseReport = await runCaseWithFailureCapture(cdp, baseUrl, provider, testCase, artifactDir, options);
      report.cases.push(caseReport);
      const status = caseReport.status.toUpperCase();
      console.log(
        `${testCase.id}: ${status} / score=${caseReport.score} / mode=${caseReport.actual.visualMode} / hotspots=${caseReport.actual.hotspotCount}`
      );
    }
    await cdp.close();
  } finally {
    if (browser) await stopProcess(browser);
    await close(app);
    if (profileDir) await rmWithRetry(profileDir);
  }

  report.summary = summarizeReport(report.cases);
  writeReports(artifactDir, report);
  if (failOnThreshold) assertReportPasses(report);
  return report;
}

async function runCaseWithFailureCapture(cdp, baseUrl, provider, testCase, artifactDir, options) {
  try {
    return await runCase(cdp, baseUrl, provider, testCase, artifactDir, options);
  } catch (error) {
    const screenshotPath = path.join(artifactDir, `${testCase.id}-failed.png`);
    let pageState = null;
    try {
      pageState = await collectPageState(cdp);
      await saveScreenshot(cdp, screenshotPath);
    } catch {
      // Preserve the original case failure.
    }
    return {
      id: testCase.id,
      category: testCase.category,
      question: testCase.question,
      status: "fail",
      score: 0,
      durationMs: 0,
      screenshotPath: fs.existsSync(screenshotPath) ? screenshotPath : "",
      actual: {
        visualMode: pageState && pageState.structured ? pageState.structured.visualMode || "unknown" : "unknown",
        moduleCount: pageState && pageState.structured && Array.isArray(pageState.structured.modules) ? pageState.structured.modules.length : 0,
        hotspotCount: pageState && Array.isArray(pageState.hotspots) ? pageState.hotspots.length : 0,
        alignmentProvider: pageState && pageState.alignmentRaw ? String(pageState.alignmentRaw.provider || "") : "",
        imageSize: pageState ? `${pageState.imageNaturalWidth || 0}x${pageState.imageNaturalHeight || 0}` : "0x0",
        clickedHotspotId: ""
      },
      checks: [
        fail(
          "case_runtime",
          error.message || String(error),
          pageState
            ? {
                title: pageState.title,
                statusPill: pageState.statusPill,
                progress: pageState.progress,
                errorState: pageState.errorState,
                bodyText: String(pageState.bodyText || "").slice(0, 1000)
              }
            : null
        )
      ]
    };
  }
}

async function runCase(cdp, baseUrl, provider, testCase, artifactDir, options) {
  const startedAt = Date.now();
  await cdp.send("Page.navigate", { url: `${baseUrl}/?provider=${encodeURIComponent(provider)}` });
  await cdp.waitFor("Page.loadEventFired", 10000);
  await cdp.evaluate(`
    (() => {
      const input = document.querySelector("#questionInput");
      input.value = ${JSON.stringify(testCase.question)};
      input.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector("#questionForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    })()
  `);
  let beforeClick = null;
  try {
    await cdp.waitForFunction(
      `(() => {
        const image = document.querySelector(".image-stage img");
        const success = document.querySelectorAll("[data-hotspot-id]").length >= ${Number(testCase.minHotspots || 3)} &&
          image &&
          image.naturalWidth > 0 &&
          image.naturalHeight > 0;
        return Boolean(success || document.querySelector("#retryButton") || document.querySelector(".image-load-error"));
      })()`,
      Number(options.waitMs || process.env.CHATIMAGE_AGENT_EVAL_WAIT_MS || (provider === "mock" ? 120000 : 240000))
    );
    beforeClick = await collectPageState(cdp);
  } catch (error) {
    const lateState = await collectPageState(cdp);
    if (!isPageReadyForCase(lateState, testCase)) throw error;
    beforeClick = lateState;
  }
  if (beforeClick.errorState) {
    throw new Error(`Generation failed at ${beforeClick.progress.activeStep || "unknown"}: ${beforeClick.errorState.text}`);
  }
  const clickAudit = await auditHotspotClicks(cdp, beforeClick.hotspots);
  const clickTargetId = chooseClickTarget(beforeClick.hotspots, testCase);
  const clickTarget = (await getCurrentHotspotSnapshot(cdp, clickTargetId)) || beforeClick.hotspots.find((hotspot) => hotspot.id === clickTargetId);
  if (clickTarget && clickTarget.hitTargetId === clickTarget.id) {
    await clickHotspotAtCenter(cdp, clickTarget);
  } else {
    await cdp.evaluate(`document.querySelector(${JSON.stringify(`[data-hotspot-id='${cssEscape(clickTargetId)}']`)})?.click()`);
  }
  await cdp.waitForFunction(`!document.querySelector("#detailPanel").hidden && document.querySelector(".detail-content h2")`, 5000);
  const afterClick = await collectDetailState(cdp);
  const screenshotPath = path.join(artifactDir, `${testCase.id}.png`);
  await saveScreenshot(cdp, screenshotPath);

  const evaluated = evaluateCase({
    testCase,
    pageState: beforeClick,
    detailState: afterClick,
    clickAudit,
    clickTargetId,
    durationMs: Date.now() - startedAt,
    screenshotPath
  });
  return evaluated;
}

async function collectPageState(cdp) {
  return cdp.evaluate(`
    (() => {
      const pres = Array.from(document.querySelectorAll(".debug-grid pre")).map((node) => node.textContent || "");
      let structured = null;
      let layout = null;
      let alignmentRaw = null;
      try { structured = JSON.parse(pres[1] || "null"); } catch {}
      try { layout = JSON.parse(pres[2] || "null"); } catch {}
      try { alignmentRaw = JSON.parse(pres[5] || "null"); } catch {}
      const stageNode = document.querySelector(".image-stage");
      const imageNode = document.querySelector(".image-stage img");
      const stageRect = stageNode ? stageNode.getBoundingClientRect() : null;
      const imageRect = imageNode ? imageNode.getBoundingClientRect() : null;
      const progressSteps = Array.from(document.querySelectorAll(".progress-step")).map((node) => ({
        step: node.getAttribute("data-step") || "",
        active: node.classList.contains("active"),
        done: node.classList.contains("done"),
        text: node.textContent || ""
      }));
      const activeStep = progressSteps.find((step) => step.active);
      const errorNode = document.querySelector("#retryButton") ? document.querySelector(".empty-state") : document.querySelector(".image-load-error");
      const modules = [
        ...((structured && Array.isArray(structured.modules)) ? structured.modules : []),
        ...((structured && Array.isArray(structured.auxiliaryModules)) ? structured.auxiliaryModules : [])
      ];
      const moduleById = new Map(modules.map((module) => [module.id, module]));
      const hotspots = Array.from(document.querySelectorAll(".image-stage > [data-hotspot-id]")).map((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        const id = node.getAttribute("data-hotspot-id");
        const clickable = findClickablePoint(node, id);
        const module = moduleById.get(id) || {};
        return {
          id,
          ariaLabel: node.getAttribute("aria-label") || "",
          text: node.textContent || "",
          regionKind: module.regionKind || "",
          maskPolicy: module.maskPolicy || "",
          background: style.backgroundColor,
          borderTopWidth: style.borderTopWidth,
          zIndex: style.zIndex,
          hitTargetId: clickable.hitTargetId,
          clickPoint: clickable.point,
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          style: node.getAttribute("style") || ""
        };
      });
      function findClickablePoint(node, id) {
        const rect = node.getBoundingClientRect();
        const ratios = [
          [0.5, 0.5],
          [0.18, 0.18],
          [0.82, 0.18],
          [0.18, 0.82],
          [0.82, 0.82],
          [0.5, 0.18],
          [0.5, 0.82],
          [0.18, 0.5],
          [0.82, 0.5]
        ];
        let fallback = null;
        for (const [rx, ry] of ratios) {
          const point = { x: rect.left + rect.width * rx, y: rect.top + rect.height * ry };
          const hit = document.elementFromPoint(point.x, point.y);
          const hitHotspot = hit && hit.closest ? hit.closest("[data-hotspot-id]") : null;
          const hitTargetId = hitHotspot ? hitHotspot.getAttribute("data-hotspot-id") : "";
          fallback = fallback || { point, hitTargetId };
          if (hitTargetId === id) return { point, hitTargetId };
        }
        return fallback || { point: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, hitTargetId: "" };
      }
      return {
        title: document.querySelector(".result-header h2")?.textContent || "",
        summary: document.querySelector(".result-header p")?.textContent || "",
        statusPill: document.querySelector("#statusPill")?.textContent || "",
        progress: {
          hidden: Boolean(document.querySelector("#progress")?.hidden),
          activeStep: activeStep ? activeStep.step : "",
          steps: progressSteps
        },
        errorState: errorNode
          ? {
              title: errorNode.querySelector("h1, strong")?.textContent || "",
              text: errorNode.innerText || ""
            }
          : null,
        rawAnswer: pres[0] || "",
        imagePrompt: pres[3] || "",
        structured,
        layout,
        alignmentRaw,
        stageRect: stageRect ? { left: stageRect.left, top: stageRect.top, width: stageRect.width, height: stageRect.height } : null,
        imageRect: imageRect ? { left: imageRect.left, top: imageRect.top, width: imageRect.width, height: imageRect.height } : null,
        imageComplete: Boolean(imageNode && imageNode.complete),
        imageNaturalWidth: imageNode ? imageNode.naturalWidth : 0,
        imageNaturalHeight: imageNode ? imageNode.naturalHeight : 0,
        hotspots,
        bodyText: document.body.innerText
      };
    })()
  `);
}

async function auditHotspotClicks(cdp, hotspots) {
  const results = [];
  for (const hotspot of hotspots) {
    if (!hotspot || !hotspot.id) continue;
    const current = (await getCurrentHotspotSnapshot(cdp, hotspot.id)) || hotspot;
    if (current.hitTargetId !== current.id) {
      results.push({
        id: current.id,
        label: cleanHotspotLabel(current),
        status: isLowPriorityHotspot(current) ? "covered-low-priority" : "covered",
        hitTargetId: current.hitTargetId || ""
      });
      continue;
    }
    await clickHotspotAtCenter(cdp, current);
    try {
      await cdp.waitForFunction(`!document.querySelector("#detailPanel").hidden && document.querySelector(".detail-content h2")`, 3000);
      const detail = await collectDetailState(cdp);
      results.push({
        id: current.id,
        label: cleanHotspotLabel(current),
        status: "clicked",
        detailTitle: detail.title
      });
    } catch (error) {
      results.push({
        id: current.id,
        label: cleanHotspotLabel(current),
        status: "click-failed",
        error: error.message || String(error)
      });
    }
    await cdp.evaluate(`document.querySelector("#closeDetailButton")?.click()`);
    await cdp.waitForFunction(`document.querySelector("#detailPanel")?.hidden === true`, 2000).catch(() => {});
  }
  return results;
}

async function clickHotspotAtCenter(cdp, hotspot) {
  const current = hotspot && hotspot.id ? (await getCurrentHotspotSnapshot(cdp, hotspot.id)) || hotspot : hotspot;
  const point = current.clickPoint || {
    x: current.rect.left + current.rect.width / 2,
    y: current.rect.top + current.rect.height / 2
  };
  const x = point.x;
  const y = point.y;
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

async function getCurrentHotspotSnapshot(cdp, hotspotId) {
  return cdp.evaluate(`
    ((hotspotId) => {
      const node = Array.from(document.querySelectorAll(".image-stage > [data-hotspot-id]"))
        .find((item) => item.getAttribute("data-hotspot-id") === hotspotId);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const id = node.getAttribute("data-hotspot-id");
      const clickable = findClickablePoint(node, id);
      function findClickablePoint(node, id) {
        const rect = node.getBoundingClientRect();
        const ratios = [
          [0.5, 0.5],
          [0.18, 0.18],
          [0.82, 0.18],
          [0.18, 0.82],
          [0.82, 0.82],
          [0.5, 0.18],
          [0.5, 0.82],
          [0.18, 0.5],
          [0.82, 0.5]
        ];
        let fallback = null;
        for (const [rx, ry] of ratios) {
          const point = { x: rect.left + rect.width * rx, y: rect.top + rect.height * ry };
          const hit = document.elementFromPoint(point.x, point.y);
          const hitHotspot = hit && hit.closest ? hit.closest("[data-hotspot-id]") : null;
          const hitTargetId = hitHotspot ? hitHotspot.getAttribute("data-hotspot-id") : "";
          fallback = fallback || { point, hitTargetId };
          if (hitTargetId === id) return { point, hitTargetId };
        }
        return fallback || { point: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, hitTargetId: "" };
      }
      return {
        id,
        ariaLabel: node.getAttribute("aria-label") || "",
        text: node.textContent || "",
        background: style.backgroundColor,
        borderTopWidth: style.borderTopWidth,
        zIndex: style.zIndex,
        hitTargetId: clickable.hitTargetId,
        clickPoint: clickable.point,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        style: node.getAttribute("style") || ""
      };
    })(${JSON.stringify(String(hotspotId || ""))})
  `);
}

async function collectDetailState(cdp) {
  return cdp.evaluate(`
    (() => {
      const panel = document.querySelector("#detailPanel");
      return {
        hidden: panel ? panel.hidden : true,
        title: document.querySelector(".detail-content h2")?.textContent || "",
        summary: document.querySelector(".detail-summary")?.textContent || "",
        previewExists: Boolean(document.querySelector(".detail-preview-crop img")),
        text: panel ? panel.innerText : ""
      };
    })()
  `);
}

function evaluateCase({ testCase, pageState, detailState, clickAudit, clickTargetId, durationMs, screenshotPath }) {
  const structured = pageState.structured || {};
  const modules = Array.isArray(structured.modules) ? structured.modules : [];
  const auxiliaryModules = Array.isArray(structured.auxiliaryModules) ? structured.auxiliaryModules : [];
  const actual = {
    visualMode: structured.visualMode || "infographic",
    moduleCount: modules.length,
    auxiliaryModuleCount: auxiliaryModules.length,
    hotspotCount: pageState.hotspots.length,
    alignmentProvider: String((pageState.alignmentRaw && pageState.alignmentRaw.provider) || ""),
    alignment: summarizeAlignmentForReport(pageState),
    imageSize: `${pageState.imageNaturalWidth}x${pageState.imageNaturalHeight}`,
    clickedHotspotId: clickTargetId,
    clickAudit,
    moduleSummaries: modules.map(toModuleSummary),
    auxiliaryModuleSummaries: auxiliaryModules.map(toModuleSummary)
  };
  const checks = [
    checkVisualMode(testCase, actual.visualMode),
    checkKeywordCoverage(testCase, pageState),
    checkHotspotCoverage(testCase, pageState),
    checkHotspotClickAudit(testCase, clickAudit),
    checkClickDetail(testCase, pageState, detailState, clickTargetId),
    checkDetailQuality(testCase, modules),
    checkImageGeneration(testCase, pageState),
    checkAlignmentQuality(testCase, pageState, actual.alignment),
    checkDiversityFields(testCase, structured),
    checkTargetContract(testCase, structured)
  ];
  const failed = checks.filter((check) => check.status === "fail").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  const score = Math.round(
    (checks.reduce((total, check) => total + (check.status === "ok" ? 1 : check.status === "warn" ? 0.5 : 0), 0) /
      checks.length) *
      100
  );
  const result = {
    id: testCase.id,
    category: testCase.category,
    question: testCase.question,
    status: failed ? "fail" : warnings ? "warn" : "ok",
    score,
    durationMs,
    screenshotPath,
    actual,
    checks
  };
  if (process.env.CHATIMAGE_AGENT_EVAL_PRESERVE_STATE === "1") {
    result.state = {
      pageState,
      detailState,
      clickAudit
    };
  }
  return result;
}

function checkVisualMode(testCase, visualMode) {
  const expected = testCase.expectedVisualModes || ["infographic"];
  if (expected.includes(visualMode)) return ok("visual_mode", `visualMode=${visualMode}`);
  return fail("visual_mode", `expected ${expected.join("|")}, got ${visualMode}`);
}

function checkKeywordCoverage(testCase, pageState) {
  const keywords = testCase.expectedKeywords || [];
  if (!keywords.length) return ok("keyword_coverage", "no keyword expectation");
  const haystack = [
    pageState.title,
    pageState.summary,
    pageState.rawAnswer,
    JSON.stringify(pageState.structured || {}),
    pageState.bodyText
  ].join("\n");
  const hits = keywords.filter((keyword) => haystack.includes(keyword));
  const ratio = hits.length / keywords.length;
  const detail = `${hits.length}/${keywords.length}: ${hits.join(", ")}`;
  if (ratio >= Number(testCase.minKeywordCoverage || 0.7)) return ok("keyword_coverage", detail, { ratio, hits });
  return fail("keyword_coverage", detail, { ratio, hits, missing: keywords.filter((keyword) => !hits.includes(keyword)) });
}

function checkHotspotCoverage(testCase, pageState) {
  const stage = pageState.stageRect;
  if (!stage || stage.width <= 0 || stage.height <= 0) return fail("hotspot_coverage", "missing image stage");
  if (pageState.hotspots.length < Number(testCase.minHotspots || 3)) {
    return fail("hotspot_coverage", `only ${pageState.hotspots.length} hotspots`);
  }
  const problems = [];
  for (const hotspot of pageState.hotspots) {
    const rect = hotspot.rect;
    const areaRatio = (rect.width * rect.height) / (stage.width * stage.height);
    if (rect.left < stage.left - 1 || rect.top < stage.top - 1) problems.push(`${hotspot.id} starts outside stage`);
    if (rect.left + rect.width > stage.left + stage.width + 1) problems.push(`${hotspot.id} exceeds stage width`);
    if (rect.top + rect.height > stage.top + stage.height + 1) problems.push(`${hotspot.id} exceeds stage height`);
    if (areaRatio < 0.012) problems.push(`${hotspot.id} area too small (${areaRatio.toFixed(3)})`);
    if (hotspot.borderTopWidth !== "0px") problems.push(`${hotspot.id} is not visually transparent`);
    if (hotspot.background !== "rgba(0, 0, 0, 0)") problems.push(`${hotspot.id} has visible background`);
    if (!isLowPriorityHotspot(hotspot) && hotspot.hitTargetId && hotspot.hitTargetId !== hotspot.id) {
      problems.push(`${hotspot.id} center is covered by ${hotspot.hitTargetId}`);
    }
  }
  const optionalIou = evaluateOptionalBoundsIou(testCase, pageState);
  if (problems.length) return fail("hotspot_coverage", problems.join("; "), optionalIou);
  if (optionalIou && optionalIou.minIou < 0.55) return warn("hotspot_coverage", `manual bounds IoU is low: ${optionalIou.minIou}`, optionalIou);
  return ok("hotspot_coverage", `${pageState.hotspots.length} transparent hotspots fit inside stage`, optionalIou);
}

function checkHotspotClickAudit(testCase, clickAudit) {
  if (!Array.isArray(clickAudit) || !clickAudit.length) return fail("hotspot_click_audit", "no hotspot click audit");
  const problems = [];
  for (const item of clickAudit) {
    if (item.status === "covered" || item.status === "click-failed") {
      problems.push(`${item.id} ${item.status}${item.hitTargetId ? ` by ${item.hitTargetId}` : ""}`);
      continue;
    }
    if (item.status !== "clicked") continue;
    const label = String(item.label || "").trim();
    const title = String(item.detailTitle || "").trim();
    if (label && title && !title.includes(label) && !label.includes(title)) {
      problems.push(`${item.id} opened ${title || "empty detail"} instead of ${label}`);
    }
  }
  if (problems.length) return fail("hotspot_click_audit", problems.join("; "), { clickAudit });
  return ok("hotspot_click_audit", `${clickAudit.filter((item) => item.status === "clicked").length} hotspot centers open matching details`, { clickAudit });
}

function evaluateOptionalBoundsIou(testCase, pageState) {
  if (!Array.isArray(testCase.expectedBounds)) return null;
  const hotspotById = new Map(pageState.hotspots.map((hotspot) => [hotspot.id, hotspot]));
  const values = testCase.expectedBounds
    .map((expected) => {
      const actual = hotspotById.get(expected.id);
      if (!actual) return null;
      return { id: expected.id, iou: roundMetric(intersectionOverUnion(normalizeRect(actual.rect, pageState.stageRect), expected.bounds)) };
    })
    .filter(Boolean);
  if (!values.length) return null;
  return {
    minIou: Math.min(...values.map((item) => item.iou)),
    modules: values
  };
}

function checkClickDetail(testCase, pageState, detailState, clickTargetId) {
  if (detailState.hidden) return fail("click_detail", "detail panel did not open");
  const hotspot = pageState.hotspots.find((item) => item.id === clickTargetId);
  const expectedLabel = hotspot ? hotspot.ariaLabel.replace(/^查看/, "").replace(/详情$/, "").trim() : "";
  if (expectedLabel && !detailState.title.includes(expectedLabel) && !expectedLabel.includes(detailState.title)) {
    return warn("click_detail", `clicked ${clickTargetId}, detail title=${detailState.title}, hotspot label=${expectedLabel}`);
  }
  if (!detailState.previewExists) return warn("click_detail", "detail opened but hotspot preview is missing");
  return ok("click_detail", `clicked ${clickTargetId} and opened ${detailState.title}`);
}

function checkDetailQuality(testCase, modules) {
  if (!modules.length) return fail("detail_quality", "structured modules missing");
  const lengths = modules.map((module) => String(module.detail || "").length);
  const average = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
  const thin = modules.filter((module) => String(module.detail || "").length < Number(testCase.minAverageDetailChars || 70) * 0.55);
  if (average < Number(testCase.minAverageDetailChars || 70)) {
    return fail("detail_quality", `average detail length ${Math.round(average)} is too thin`);
  }
  if (thin.length) return warn("detail_quality", `${thin.length} modules have thin details`, { average: roundMetric(average) });
  return ok("detail_quality", `average detail length ${Math.round(average)}`, { average: roundMetric(average) });
}

function checkImageGeneration(testCase, pageState) {
  if (pageState.imageNaturalWidth <= 0 || pageState.imageNaturalHeight <= 0) {
    return fail("image_generation", "image did not load");
  }
  const title = String(pageState.title || "");
  const forbidden = testCase.forbiddenTitleFragments || [];
  const leaked = forbidden.find((fragment) => title.includes(fragment));
  if (leaked) return fail("image_generation", `title leaks raw question fragment: ${leaked}`);
  if (imagePromptVisibleFieldsContain(pageState.imagePrompt, testCase.question.slice(0, 18))) {
    return warn("image_generation", "visible image text fields contain raw question prefix; check title distillation");
  }
  return ok("image_generation", `image loaded ${pageState.imageNaturalWidth}x${pageState.imageNaturalHeight}`);
}

function imagePromptVisibleFieldsContain(imagePrompt, fragment) {
  const target = String(fragment || "").trim();
  if (!target) return false;
  const prompt = String(imagePrompt || "");
  return prompt
    .split(/\r?\n/)
    .some((line) => {
      const source = line.trim();
      if (!source.includes(target)) return false;
      return /^(Title|Summary|Distilled title|title|text|visibleLabel|cardNumber)\b/i.test(source) ||
        /^"(title|text|visibleLabel|imageText|summary)"\s*:/i.test(source);
    });
}

function checkAlignmentQuality(testCase, pageState, alignmentSummary) {
  const raw = pageState.alignmentRaw || {};
  const provider = String(raw.provider || "");
  if (!provider || provider === "mock-alignment") return ok("alignment_quality", `provider=${provider || "none"}`);
  if (provider === "alignment-fallback") {
    return fail("alignment_quality", `alignment-fallback: ${raw.error || "unknown error"}`, {
      previousProvider: raw.previous && raw.previous.provider,
      previousChain: raw.previous && raw.previous.providerChain,
      previousSourceCounts: raw.previous && raw.previous.sourceCounts
    });
  }
  const total = Number(alignmentSummary.totalModules || 0);
  if (!total) return warn("alignment_quality", `provider=${provider}, no module diagnostics`, alignmentSummary);
  const chain = alignmentSummary.providerChain.join(">");
  const maskRatio = alignmentSummary.maskCount / total;
  const plannedRatio = alignmentSummary.plannedCount / total;
  if (alignmentSummary.providerChain.includes("sam3") && maskRatio < 0.7) {
    return fail("alignment_quality", `SAM3 mask coverage too low: ${alignmentSummary.maskCount}/${total}`, alignmentSummary);
  }
  if (plannedRatio >= 0.9 && !alignmentSummary.maskCount) {
    return fail("alignment_quality", `all or nearly all hotspots are planned without masks: ${alignmentSummary.plannedCount}/${total}`, alignmentSummary);
  }
  if (plannedRatio >= Number(testCase.plannedAlignmentWarnRatio || 0.75)) {
    return warn(
      "alignment_quality",
      `semantic locator weak; planned=${alignmentSummary.plannedCount}/${total}, mask=${alignmentSummary.maskCount}/${total}, chain=${chain}`,
      alignmentSummary
    );
  }
  return ok("alignment_quality", `provider=${provider}, chain=${chain || "none"}, mask=${alignmentSummary.maskCount}/${total}`, alignmentSummary);
}

function summarizeAlignmentForReport(pageState) {
  const raw = pageState.alignmentRaw || {};
  const layoutRegions = pageState.layout && Array.isArray(pageState.layout.regions) ? pageState.layout.regions : [];
  const moduleRegions = layoutRegions.filter((region) => region && region.hotspotId);
  const sourceCounts = raw.sourceCounts && typeof raw.sourceCounts === "object" ? raw.sourceCounts : {};
  return {
    provider: String(raw.provider || ""),
    effectiveProvider: String(raw.effectiveProvider || ""),
    providerChain: Array.isArray(raw.providerChain) ? raw.providerChain.map(String) : [],
    sourceCounts,
    totalModules: moduleRegions.length || pageState.hotspots.length,
    plannedCount:
      Number(sourceCounts.planned || 0) ||
      moduleRegions.filter((region) => String(region.alignedBy || "planned").toLowerCase().includes("planned")).length,
    locateAnythingCount:
      Number(sourceCounts.locateanything || 0) +
      Number(sourceCounts["locateanything-crop"] || 0) +
      Number(sourceCounts["layout-guided-locateanything"] || 0) +
      Number(sourceCounts["mimo-vision"] || 0),
    localOcrCount: Number(sourceCounts["local-ocr"] || 0),
    maskCount: moduleRegions.filter((region) => region && region.mask && region.mask.bounds).length,
    acceptedSam3Count: Array.isArray(raw.acceptedSam3Modules) ? raw.acceptedSam3Modules.length : 0,
    rejectedSam3Count: Array.isArray(raw.rejectedSam3Modules) ? raw.rejectedSam3Modules.length : 0,
    fallbackCount: Array.isArray(raw.fallbackModules) ? raw.fallbackModules.length : 0,
    warnings: Array.isArray(raw.warnings) ? raw.warnings : []
  };
}

function checkDiversityFields(testCase, structured) {
  const semanticModules = [...(structured.modules || []), ...(structured.auxiliaryModules || [])];
  const kinds = new Set(semanticModules.map((module) => module.regionKind).filter(Boolean));
  if (testCase.expectedRegionKinds && testCase.expectedRegionKinds.length) {
    const missing = testCase.expectedRegionKinds.filter((kind) => !kinds.has(kind));
    if (missing.length) return fail("diversity_fields", `missing regionKind: ${missing.join(", ")}`);
  }
  if (testCase.allowedRegionKinds && testCase.allowedRegionKinds.length) {
    const allowed = new Set(testCase.allowedRegionKinds);
    const matched = Array.from(kinds).filter((kind) => allowed.has(kind));
    const minimum = Number(testCase.minDistinctRegionKinds || 1);
    if (matched.length < minimum) {
      return fail("diversity_fields", `only ${matched.length}/${minimum} expected region kind groups: ${matched.join(", ")}`);
    }
    return ok("diversity_fields", `region kind groups: ${matched.join(", ")}`);
  }
  if (!testCase.expectedRegionKinds || !testCase.expectedRegionKinds.length) return ok("diversity_fields", "no region kind expectation");
  return ok("diversity_fields", `region kinds: ${Array.from(kinds).join(", ")}`);
}

function checkTargetContract(testCase, structured) {
  const modules = [...(structured.modules || []), ...(structured.auxiliaryModules || [])];
  if (!modules.length) return fail("target_contract", "structured modules missing");
  const visualMode = String(structured.visualMode || "infographic");
  const problems = [];
  const expectedPolicies = new Set(testCase.expectedMaskPolicies || []);
  const seenPolicies = new Set();
  for (const module of modules) {
    const id = module.id || module.title || "module";
    const policy = String(module.maskPolicy || "");
    if (policy) seenPolicies.add(policy);
    if (!module.regionKind) problems.push(`${id} missing regionKind`);
    if (!policy) problems.push(`${id} missing maskPolicy`);
    if (!Array.isArray(module.visualEvidence) || !module.visualEvidence.length) problems.push(`${id} missing visualEvidence`);
    if (!Array.isArray(module.locatorQueries) || !module.locatorQueries.length) problems.push(`${id} missing locatorQueries`);
    if ((module.regionKind === "object-with-label" || policy === "subject-with-label") && (!Array.isArray(module.componentHints) || module.componentHints.length < 2)) {
      problems.push(`${id} missing object-with-label componentHints`);
    }
  }
  const missingPolicies = Array.from(expectedPolicies).filter((policy) => !seenPolicies.has(policy));
  if (missingPolicies.length) problems.push(`missing maskPolicy groups: ${missingPolicies.join(", ")}`);
  if (problems.length) {
    const status = visualMode === "infographic" && !testCase.expectedMaskPolicies ? "warn" : "fail";
    return status === "fail"
      ? fail("target_contract", problems.join("; "), { seenPolicies: Array.from(seenPolicies) })
      : warn("target_contract", problems.join("; "), { seenPolicies: Array.from(seenPolicies) });
  }
  return ok("target_contract", `mask policies: ${Array.from(seenPolicies).join(", ") || "none"}`);
}

function toModuleSummary(module) {
  return {
    id: module.id,
    title: module.title,
    regionKind: module.regionKind,
    regionPrompt: module.regionPrompt
  };
}

function summarizeReport(cases) {
  const failed = cases.filter((item) => item.status === "fail").length;
  const warnings = cases.filter((item) => item.status === "warn").length;
  const averageScore = cases.length
    ? Math.round(cases.reduce((sum, item) => sum + item.score, 0) / cases.length)
    : 0;
  return {
    status: failed ? "fail" : warnings ? "warn" : "ok",
    caseCount: cases.length,
    failed,
    warnings,
    averageScore
  };
}

function assertReportPasses(report) {
  assert.strictEqual(report.skipped, false, report.reason || "agent evaluation skipped");
  assert.ok(report.cases.length >= 3, "agent evaluation should cover at least three offline cases");
  assert.strictEqual(report.summary.status, "ok", JSON.stringify(report.summary, null, 2));
  assert.ok(report.summary.averageScore >= 90, `average score ${report.summary.averageScore} < 90`);
}

function writeReports(artifactDir, report) {
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, "agent-evaluation-report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(artifactDir, "agent-evaluation-report.md"), formatMarkdownReport(report));
}

function formatMarkdownReport(report) {
  if (report.skipped) return `# ChatImage Agent Evaluation\n\nSkipped: ${report.reason}\n`;
  const lines = [
    "# ChatImage Agent Evaluation",
    "",
    `- Provider: ${report.provider}`,
    `- Status: ${report.summary.status}`,
    `- Cases: ${report.summary.caseCount}`,
    `- Average score: ${report.summary.averageScore}`,
    "",
    "| Case | Category | Status | Score | Mode | Hotspots | Screenshot |",
    "| --- | --- | --- | ---: | --- | ---: | --- |"
  ];
  for (const item of report.cases) {
    lines.push(
      `| ${item.id} | ${item.category} | ${item.status} | ${item.score} | ${item.actual.visualMode} | ${item.actual.hotspotCount} | ${item.screenshotPath || ""} |`
    );
  }
  lines.push("", "## Checks");
  for (const item of report.cases) {
    lines.push("", `### ${item.id}`);
    for (const check of item.checks) {
      lines.push(`- ${check.status.toUpperCase()} ${check.id}: ${check.detail}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function createDefaultThresholds() {
  return {
    minAverageScore: 90,
    minKeywordCoverage: 0.6,
    minHotspotAreaRatio: 0.012,
    optionalBoundsWarnIou: 0.55
  };
}

function chooseClickTarget(hotspots, testCase) {
  if (testCase.clickHotspotId && hotspots.some((hotspot) => hotspot.id === testCase.clickHotspotId)) {
    return testCase.clickHotspotId;
  }
  const middle = hotspots[Math.floor(hotspots.length / 2)];
  return (middle && middle.id) || (hotspots[0] && hotspots[0].id);
}

function cleanHotspotLabel(hotspot) {
  return String((hotspot && hotspot.ariaLabel) || "")
    .replace(/^查看/, "")
    .replace(/详情$/, "")
    .trim();
}

function isLowPriorityHotspot(hotspot) {
  const kind = String((hotspot && hotspot.regionKind) || "").toLowerCase();
  const policy = String((hotspot && hotspot.maskPolicy) || "").toLowerCase();
  return kind === "background" || policy === "full-region" || ["water", "mountain", "foreground", "panel"].includes(kind);
}

function isPageReadyForCase(pageState, testCase) {
  return Boolean(
    pageState &&
      Array.isArray(pageState.hotspots) &&
      pageState.hotspots.length >= Number(testCase.minHotspots || 3) &&
      pageState.imageNaturalWidth > 0 &&
      pageState.imageNaturalHeight > 0
  );
}

function cssEscape(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function normalizeRect(rect, stage) {
  return {
    x: (rect.left - stage.left) / stage.width,
    y: (rect.top - stage.top) / stage.height,
    width: rect.width / stage.width,
    height: rect.height / stage.height
  };
}

function intersectionOverUnion(a, b) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const areaA = Math.max(0, a.width) * Math.max(0, a.height);
  const areaB = Math.max(0, b.width) * Math.max(0, b.height);
  const union = areaA + areaB - intersection;
  return union > 0 ? intersection / union : 0;
}

function roundMetric(value) {
  return Number(Number(value || 0).toFixed(4));
}

function parseCaseIds(value) {
  const ids = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return ids.length ? ids : null;
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

module.exports = {
  evaluateCase,
  formatMarkdownReport,
  getAgentEvaluationCases,
  runAgentEvaluation,
  summarizeReport
};
