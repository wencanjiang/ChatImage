"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createConfig, createServer } = require("../server");
const { applyTextBudgets, buildStyleImagePrompt, createLayout } = require("../src/layout");
const {
  buildAnswerStructurePrompt,
  normalizeAnswerStructure,
  parseJsonFromText
} = require("../src/structure");

const CASES_PATH = path.join(__dirname, "structured-text-cases.json");

async function main() {
  const textApiKey = process.env.CHATIMAGE_TEXT_API_KEY || process.env.CHATIMAGE_API_KEY || process.env.WUYIN_API_KEY;
  if (!textApiKey) {
    console.log("structured-text-cases.js skipped: CHATIMAGE_TEXT_API_KEY or CHATIMAGE_API_KEY is not set");
    return;
  }

  const cases = selectCases(loadCases(), process.env);
  const artifactDir = path.join(process.cwd(), "tmp", "structured-text-cases");
  fs.mkdirSync(artifactDir, { recursive: true });

  const server = createServer(
    createConfig({
      port: 0,
      databasePath: path.join(artifactDir, "structured-text-cases.sqlite")
    })
  );
  await listen(server);

  const report = {
    checkedAt: new Date().toISOString(),
    textModel: process.env.CHATIMAGE_TEXT_MODEL || "mimo-v2.5-pro",
    count: cases.length,
    cases: []
  };

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const config = await getJson(`${baseUrl}/api/llm/health`);
    assert.strictEqual(config.configured, true);

    for (const testCase of cases) {
      const artifact = await runStructuredCase(baseUrl, artifactDir, testCase, process.env);
      report.cases.push(artifact);
      if (artifact.ok) {
        console.log(
          `${testCase.id}: ok / ${artifact.relationType} / modules=${artifact.moduleCount} / raw=${artifact.rawAnswerLength} / attempts=${artifact.attempts}`
        );
      } else {
        console.log(`${testCase.id}: failed / ${artifact.error}`);
      }
    }
  } finally {
    fs.writeFileSync(path.join(artifactDir, "structured-text-report.json"), JSON.stringify(report, null, 2));
    await close(server);
  }

  const failures = report.cases.filter((item) => !item.ok);
  if (failures.length) {
    throw new Error(`${failures.length} structured text case(s) failed`);
  }
}

async function runStructuredCase(baseUrl, artifactDir, testCase, env) {
  const maxRetries = Math.max(0, Math.min(Number(env.CHATIMAGE_STRUCTURED_CASE_RETRIES || 1), 3));
  const startedAt = Date.now();
  const errors = [];
  let lastContent = "";

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await postJson(`${baseUrl}/api/llm`, {
        purpose: "answer_structure",
        responseFormat: "json",
        content: buildAnswerStructurePrompt(testCase.question)
      });
      lastContent = response.content || "";
      const parsed = parseJsonFromText(lastContent);
      const normalized = normalizeAnswerStructure(parsed, testCase.question);
      const layout = createLayout(normalized.visualSpec, { uid: createUidFactory(testCase.id) });
      const budgetedSpec = applyTextBudgets(normalized.visualSpec, layout);
      const imagePrompt = buildStyleImagePrompt(budgetedSpec, layout);

      validateCase(testCase, normalized, imagePrompt);

      writeCaseArtifact(artifactDir, testCase.id, normalized, imagePrompt, lastContent);
      return {
        id: testCase.id,
        ok: true,
        attempts: attempt + 1,
        durationMs: Date.now() - startedAt,
        rawAnswerLength: normalized.rawAnswer.length,
        relationType: normalized.visualSpec.relationType,
        moduleCount: normalized.visualSpec.modules.length,
        title: normalized.visualSpec.title,
        summary: normalized.visualSpec.summary,
        visualComposition: normalized.visualSpec.visualComposition,
        modules: normalized.visualSpec.modules.map((module) => ({
          id: module.id,
          title: module.title,
          imageText: module.imageText,
          detailLength: module.detail.length
        })),
        imagePromptLength: imagePrompt.length
      };
    } catch (error) {
      errors.push(error.message);
    }
  }

  writeFailedCaseArtifact(artifactDir, testCase.id, lastContent, errors);
  return {
    id: testCase.id,
    ok: false,
    attempts: maxRetries + 1,
    durationMs: Date.now() - startedAt,
    error: errors[errors.length - 1] || "unknown failure",
    errors
  };
}

function loadCases() {
  return JSON.parse(fs.readFileSync(CASES_PATH, "utf8"));
}

function selectCases(cases, env) {
  const requestedId = String(env.CHATIMAGE_STRUCTURED_CASE_ID || "").trim();
  let selected = requestedId ? cases.filter((item) => item.id === requestedId) : cases.slice();
  const limit = Number(env.CHATIMAGE_STRUCTURED_CASE_LIMIT || 0);
  if (Number.isFinite(limit) && limit > 0) selected = selected.slice(0, limit);
  if (requestedId && selected.length === 0) throw new Error(`Unknown structured case id: ${requestedId}`);
  return selected;
}

function validateCase(testCase, normalized, imagePrompt) {
  assert.ok(normalized.rawAnswer.length >= 180, `${testCase.id}: rawAnswer is too short`);
  const spec = normalized.visualSpec;
  assert.ok(spec.title && spec.title.length <= 24, `${testCase.id}: title must be concise`);
  assert.doesNotMatch(spec.title, /\.{3,}|…/, `${testCase.id}: title must not be truncated with ellipses`);
  assert.doesNotMatch(spec.title, /可以从|五个角度|背景.*现状.*驱动/, `${testCase.id}: title looks template-like`);
  assert.ok(spec.summary && spec.summary.length <= 80, `${testCase.id}: summary must be concise`);
  assert.ok(
    testCase.acceptedRelationTypes.includes(spec.relationType),
    `${testCase.id}: unexpected relationType ${spec.relationType}`
  );
  assert.ok(
    spec.modules.length >= testCase.minModules && spec.modules.length <= testCase.maxModules,
    `${testCase.id}: module count ${spec.modules.length} is outside expected range`
  );
  assert.ok(spec.visualComposition, `${testCase.id}: visualComposition is required`);
  assert.ok(spec.visualComposition.compositionType, `${testCase.id}: compositionType is required`);
  assert.ok(spec.visualComposition.visualFocus, `${testCase.id}: visualFocus is required`);
  assert.ok(spec.visualComposition.densityStrategy, `${testCase.id}: densityStrategy is required`);
  assert.ok(spec.visualComposition.layoutVariant, `${testCase.id}: layoutVariant is required`);
  assert.ok(
    ["compare-matrix", "compare-split", "asymmetric-focus-stack", "swimlane-flow", "timeline", "grid", "map", "scene", "poster"].includes(
      spec.visualComposition.layoutVariant
    ),
    `${testCase.id}: unexpected layoutVariant ${spec.visualComposition.layoutVariant}`
  );
  assert.ok(
    Array.isArray(spec.visualComposition.primaryModules) && spec.visualComposition.primaryModules.length >= 1,
    `${testCase.id}: primaryModules is required`
  );

  const joined = [
    normalized.rawAnswer,
    spec.title,
    spec.summary,
    spec.visualComposition.compositionType,
    spec.visualComposition.layoutVariant,
    spec.visualComposition.visualFocus,
    spec.visualComposition.densityStrategy,
    ...spec.modules.flatMap((module) => [module.title, module.imageText, module.detail])
  ].join("\n");

  for (const keyword of testCase.requiredKeywords) {
    assert.ok(joined.includes(keyword), `${testCase.id}: missing keyword ${keyword}`);
  }
  for (const group of testCase.requiredKeywordGroups || []) {
    assert.ok(
      group.some((keyword) => joined.includes(keyword)),
      `${testCase.id}: missing keyword group ${group.join("|")}`
    );
  }
  assert.ok(
    testCase.expectedCompositionKeywords.some((keyword) => joined.includes(keyword)),
    `${testCase.id}: visualComposition does not reflect expected composition keywords`
  );

  for (const module of spec.modules) {
    assert.ok(module.title.length >= 2, `${testCase.id}/${module.id}: title is too short`);
    assert.ok(module.imageText.length >= 4, `${testCase.id}/${module.id}: imageText is too short`);
    assert.ok(module.detail.length >= 90, `${testCase.id}/${module.id}: detail is too thin`);
    assert.ok(module.sourceExcerpt.length >= 8, `${testCase.id}/${module.id}: sourceExcerpt is too thin`);
  }

  assert.match(imagePrompt, /视觉构图决策/, `${testCase.id}: image prompt must contain visual composition`);
  if (testCase.id === "rest_graphql_compare") {
    const genericTitles = ["背景基础", "当前现状", "核心驱动", "主要挑战", "未来趋势"];
    assert.ok(
      spec.modules.filter((module) => genericTitles.includes(module.title)).length < 3,
      `${testCase.id}: modules still use generic five-part framework`
    );
    assert.ok(
      ["compare-matrix", "compare-split"].includes(spec.visualComposition.layoutVariant),
      `${testCase.id}: comparison should use a compare layout variant`
    );
  }

  assert.match(imagePrompt, /detailContext/, `${testCase.id}: image prompt must contain detailContext`);
  assert.match(imagePrompt, /禁止模板感/, `${testCase.id}: image prompt must contain anti-template guidance`);
}

function writeCaseArtifact(artifactDir, id, normalized, imagePrompt, rawContent) {
  const caseDir = path.join(artifactDir, id);
  fs.mkdirSync(caseDir, { recursive: true });
  fs.writeFileSync(path.join(caseDir, "llm-content.txt"), rawContent);
  fs.writeFileSync(path.join(caseDir, "normalized.json"), JSON.stringify(normalized, null, 2));
  fs.writeFileSync(path.join(caseDir, "image-prompt.txt"), imagePrompt);
}

function writeFailedCaseArtifact(artifactDir, id, rawContent, errors) {
  const caseDir = path.join(artifactDir, id);
  fs.mkdirSync(caseDir, { recursive: true });
  fs.writeFileSync(path.join(caseDir, "failed-content.txt"), rawContent || "");
  fs.writeFileSync(path.join(caseDir, "errors.json"), JSON.stringify(errors, null, 2));
}

function createUidFactory(seed) {
  let index = 0;
  return (prefix) => `${prefix}_${seed}_${++index}`;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    if (!server || !server.listening) {
      resolve();
      return;
    }
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function getJson(url) {
  const response = await fetch(url);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `GET ${url} failed with ${response.status}`);
  return json;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `POST ${url} failed with ${response.status}`);
  return json;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  loadCases,
  selectCases,
  validateCase
};
