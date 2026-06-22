"use strict";

const assert = require("assert");
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { createConfig, createStore } = require("../server");
const alignmentModel = require("../src/alignment");

async function main() {
  const baseUrl = process.env.CHATIMAGE_ALIGNMENT_AUDIT_BASE_URL || "http://127.0.0.1:5178";
  const outputDir = process.env.CHATIMAGE_ALIGNMENT_AUDIT_DIR || path.join(process.cwd(), "tmp", "real-alignment-audit");
  fs.mkdirSync(outputDir, { recursive: true });

  const store = createStore(createConfig().databasePath);
  const items = store.listChatImages();
  const targetId = process.env.CHATIMAGE_ALIGNMENT_AUDIT_ID || "";
  const targetTitle = process.env.CHATIMAGE_ALIGNMENT_AUDIT_TITLE || "";
  const item =
    (targetId && items.find((candidate) => candidate.id === targetId)) ||
    (targetTitle && items.find((candidate) => String(candidate.title || "").includes(targetTitle))) ||
    items[0];
  if (!item) {
    store.close();
    throw new Error("No saved chat image found for real alignment audit.");
  }
  const { result } = store.getChatImage(item.id);
  store.close();

  const modules = buildModules(result);
  const imagePath = path.join(outputDir, "original.png");
  await downloadImage(result.imageUrl, imagePath);

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/vision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageUrl: result.imageUrl,
      imageWidth: result.imageWidth,
      imageHeight: result.imageHeight,
      visualMode: result.structuredSpec && result.structuredSpec.visualMode,
      modules
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `/api/vision failed with ${response.status}`);
  }

  const parsed = JSON.parse(body.content || "{}");
  fs.writeFileSync(path.join(outputDir, "vision-raw.json"), JSON.stringify(parsed, null, 2));
  const targetModules = modules.map((module) => ({ id: module.moduleId, title: module.label }));
  const normalized = alignmentModel.parseAlignmentResponse(JSON.stringify(parsed), targetModules);
  const alignedLayout = alignmentModel.applyAlignmentsToLayout(result.layout, normalized.alignments);
  const visualArtifacts = renderVisualArtifacts({ imagePath, alignedLayout, outputDir });
  const report = buildReport({ result, parsed, alignedLayout, outputDir, visualArtifacts });
  fs.writeFileSync(path.join(outputDir, "real-alignment-audit-report.json"), JSON.stringify(report, null, 2));

  assert.notStrictEqual(report.provider, "alignment-fallback", "alignment should not fall back to planned layout globally");
  assert.strictEqual(report.layoutValidationValid, true, "aligned layout must validate");
  assert.ok(report.totalModules >= 1, "audit target must have modules");
  assert.ok(report.maskCoverageRatio >= Number(process.env.CHATIMAGE_ALIGNMENT_AUDIT_MIN_MASK_RATIO || 0.7), `mask coverage too low: ${report.maskCoverageRatio}`);
  if (report.providerChain.includes("sam3")) {
    assert.ok(report.acceptedSam3Count >= Math.ceil(report.totalModules * 0.7), "SAM3 accepted module count is too low");
  }
  if (report.plannedRatio >= 0.9) {
    console.warn(`real-alignment-audit warning: semantic locator is weak; plannedRatio=${report.plannedRatio}`);
  }
  if (report.fullImageBoxRejectCount > 0) {
    console.warn(`real-alignment-audit warning: LocateAnything returned ${report.fullImageBoxRejectCount} full-image boxes`);
  }
  assert.strictEqual(
    report.stripeLikePolygonCount,
    0,
    `SAM3 polygon contains scanline-like contours; overlay=${report.visualArtifacts.overlayPath}`
  );
  if (process.env.CHATIMAGE_ALIGNMENT_AUDIT_STRICT === "1") {
    const minSemanticRatio = Number(process.env.CHATIMAGE_ALIGNMENT_AUDIT_MIN_SEMANTIC_RATIO || 0.5);
    assert.ok(
      report.semanticLocatorRatio >= minSemanticRatio,
      `semantic locator ratio too low: ${report.semanticLocatorRatio}; overlay=${report.visualArtifacts.overlayPath}`
    );
    assert.strictEqual(
      report.fullImageBoxRejectCount,
      0,
      `LocateAnything returned full-image boxes; overlay=${report.visualArtifacts.overlayPath}`
    );
  }
  console.log(
    [
      `real-alignment-audit passed: ${result.title}`,
      `provider=${report.provider}`,
      `chain=${report.providerChain.join(">")}`,
      `sourceCounts=${JSON.stringify(report.sourceCounts)}`,
      `mask=${report.maskCount}/${report.totalModules}`,
      `plannedRatio=${report.plannedRatio}`,
      `semanticRatio=${report.semanticLocatorRatio}`,
      `layoutGuidedRatio=${report.layoutGuidedRatio}`,
      `boxCoverageRatio=${report.boxCoverageRatio}`,
      `overlay=${report.visualArtifacts.overlayPath}`
    ].join(" / ")
  );
}

function buildModules(result) {
  const structured = result.structuredSpec || {};
  const modules = [...(structured.modules || []), ...(structured.auxiliaryModules || [])];
  return modules.map((module, index) => {
    const region = (result.layout.regions || []).find((item) => item.hotspotId === module.id);
    return {
      moduleId: module.id,
      label: module.title,
      order: index + 1,
      text: module.imageText || "",
      regionKind: module.regionKind || "area",
      regionPrompt: module.regionPrompt || module.title,
      detail: module.detail || "",
      sourceExcerpt: module.sourceExcerpt || "",
      plannedBounds: region && region.bounds ? region.bounds : null
    };
  });
}

function buildReport({ result, parsed, alignedLayout, outputDir, visualArtifacts }) {
  const regions = (alignedLayout.regions || []).filter((region) => region.hotspotId);
  const sourceCounts = parsed.sourceCounts || {};
  const maskCount = regions.filter((region) => region.mask && region.mask.bounds).length;
  const totalModules = regions.length;
  const plannedCount = Number(sourceCounts.planned || 0);
  const semanticSourceCount = regions.filter((region) => {
    const source = String(region.alignedBy || "");
    return source === "locateanything" || source === "locateanything-crop" || source === "mimo-vision" || source === "local-ocr";
  }).length;
  const layoutGuidedCount = regions.filter((region) => String(region.alignedBy || "") === "layout-guided-locateanything").length;
  const boxCoverageCount = regions.filter((region) => String(region.alignedBy || "") !== "planned").length;
  const report = {
    createdAt: new Date().toISOString(),
    chatImageId: result.id,
    title: result.title,
    imageUrl: result.imageUrl,
    provider: parsed.provider || "",
    effectiveProvider: parsed.effectiveProvider || "",
    providerChain: Array.isArray(parsed.providerChain) ? parsed.providerChain : [],
    sourceCounts,
    totalModules,
    plannedCount,
    plannedRatio: totalModules ? roundMetric(plannedCount / totalModules) : 0,
    semanticLocatorCount: semanticSourceCount,
    semanticLocatorRatio: totalModules ? roundMetric(semanticSourceCount / totalModules) : 0,
    layoutGuidedCount,
    layoutGuidedRatio: totalModules ? roundMetric(layoutGuidedCount / totalModules) : 0,
    boxCoverageCount,
    boxCoverageRatio: totalModules ? roundMetric(boxCoverageCount / totalModules) : 0,
    fullImageBoxRejectCount: countFullImageBoxRejects(parsed.rejectedModules),
    stripeLikePolygonCount: countStripeLikePolygons(regions),
    maskCount,
    maskCoverageRatio: totalModules ? roundMetric(maskCount / totalModules) : 0,
    acceptedLocateAnythingModules: parsed.acceptedLocateAnythingModules || [],
    acceptedLayoutGuidedModules: parsed.acceptedLayoutGuidedModules || [],
    acceptedMimoVisionModules: parsed.acceptedMimoVisionModules || [],
    acceptedLocalOcrModules: parsed.acceptedLocalOcrModules || [],
    acceptedSam3Count: Array.isArray(parsed.acceptedSam3Modules) ? parsed.acceptedSam3Modules.length : 0,
    rejectedSam3Modules: parsed.rejectedSam3Modules || [],
    fallbackModules: parsed.fallbackModules || [],
    layoutProvider: alignedLayout.alignment && alignedLayout.alignment.provider,
    layoutValidationValid: Boolean(alignedLayout.validation && alignedLayout.validation.valid),
    modules: regions.map((region) => ({
      id: region.hotspotId,
      alignedBy: region.alignedBy || "planned",
      bounds: region.bounds,
      mask: region.mask || null,
      polygonPointCount:
        region.mask && Array.isArray(region.mask.polygon) ? region.mask.polygon.length : 0,
      stripeLikePolygon:
        region.mask && Array.isArray(region.mask.polygon) ? isStripeLikePolygon(region.mask.polygon) : false
    })),
    visualArtifacts
  };
  report.artifactDir = outputDir;
  return report;
}

async function downloadImage(imageUrl, filePath) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Image artifact download failed (${response.status}): ${imageUrl}`);
  }
  const contentType = response.headers.get("content-type") || "";
  assert.match(contentType, /^image\//i);
  fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
}

function renderVisualArtifacts({ imagePath, alignedLayout, outputDir }) {
  const inputPath = path.join(outputDir, "visual-audit-input.json");
  const overlayPath = path.join(outputDir, "overlay.png");
  const previewsDir = path.join(outputDir, "previews");
  const modules = (alignedLayout.regions || [])
    .filter((region) => region.hotspotId)
    .map((region) => ({
      id: region.hotspotId,
      label: region.label || region.hotspotId,
      alignedBy: region.alignedBy || "planned",
      bounds: region.bounds,
      mask: region.mask || null
    }));
  fs.writeFileSync(
    inputPath,
    JSON.stringify(
      {
        imagePath,
        overlayPath,
        previewsDir,
        modules
      },
      null,
      2
    )
  );
  const result = spawnSync("python", [path.join(process.cwd(), "scripts", "render_alignment_audit.py"), inputPath], {
    encoding: "utf8",
    cwd: process.cwd(),
    timeout: 60_000
  });
  if (result.error || result.status !== 0) {
    throw new Error(`visual audit render failed: ${result.error ? result.error.message : result.stderr || result.stdout}`);
  }
  let rendered = {};
  try {
    rendered = JSON.parse(String(result.stdout || "{}"));
  } catch {}
  return {
    originalPath: imagePath,
    overlayPath,
    previewsDir,
    renderOutput: rendered
  };
}

function countFullImageBoxRejects(rejectedModules) {
  return (rejectedModules || []).filter((item) => {
    const bounds = item && item.bounds;
    if (!bounds) return false;
    const area = Number(bounds.width || 0) * Number(bounds.height || 0);
    return area >= 0.88;
  }).length;
}

function countStripeLikePolygons(regions) {
  return (regions || []).filter((region) => {
    const polygon = region && region.mask && region.mask.polygon;
    return Array.isArray(polygon) && isStripeLikePolygon(polygon);
  }).length;
}

function isStripeLikePolygon(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 24) return false;
  let longEdges = 0;
  let horizontalScanEdges = 0;
  for (let index = 1; index < polygon.length; index += 1) {
    const previous = polygon[index - 1] || {};
    const current = polygon[index] || {};
    const dx = Math.abs(Number(current.x) - Number(previous.x));
    const dy = Math.abs(Number(current.y) - Number(previous.y));
    if (dx > 0.035) {
      longEdges += 1;
      if (dy < 0.006) horizontalScanEdges += 1;
    }
  }
  return longEdges >= 8 && horizontalScanEdges / longEdges >= 0.65;
}

function roundMetric(value) {
  return Number(Number(value).toFixed(4));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
