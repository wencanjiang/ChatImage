"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function main() {
  testWorkerKeepsSingleSemanticHintImplementation();
  const probe = runWorkerProbe();
  testInfographicPhrases(probe);
  testCardHintAvoidsExplanationKeywordDrift(probe);
  testCandidateScoringRejectsHeaderStrip(probe);
  testSubjectScoringRejectsTinyLabel(probe);
  testRouteScoringAllowsThinRoute(probe);
  testCropPromptKeepsChineseTarget(probe);
  testTokenizerSafeFallback(probe);
  testLayoutGuidedConfidenceMapping(probe);
  console.log("locateanything-worker.test.js passed");
}

function testWorkerKeepsSingleSemanticHintImplementation() {
  const workerPath = path.join(process.cwd(), "scripts", "locateanything_worker.py");
  const source = fs.readFileSync(workerPath, "utf8");
  const matches = source.match(/^def build_semantic_hint\(module\):/gm) || [];
  assert.strictEqual(matches.length, 1);
  assert.doesNotMatch(source, /_build_semantic_hint_from_text/);
}

function runWorkerProbe() {
  const workerPath = path.join(process.cwd(), "scripts", "locateanything_worker.py");
  const code = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("locate_worker", ${JSON.stringify(workerPath)})
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

card_module = {
    "moduleId": "module_1",
    "label": "Pod runtime unit",
    "text": "containers share lifecycle",
    "detail": "\\u5065\\u5eb7\\u68c0\\u67e5 and restart policy are explanation text, not a sensor target",
    "regionKind": "area",
    "maskPolicy": "card",
    "visualMode": "infographic",
    "plannedBounds": {"x": 0.10, "y": 0.20, "width": 0.30, "height": 0.50},
}
service_module = {
    "moduleId": "module_3",
    "label": "Service \\u4e0e Ingress",
    "text": "stable access and load balancing",
    "regionKind": "area",
    "maskPolicy": "card",
    "visualMode": "infographic",
    "plannedBounds": {"x": 0.62, "y": 0.17, "width": 0.30, "height": 0.28},
}
card_phrase = {"kind": "test", "text": "Locate the complete card"}
card_boxes = [
    {"x1": 60, "y1": 180, "x2": 640, "y2": 280},
    {"x1": 100, "y1": 200, "x2": 410, "y2": 690},
    {"x1": 120, "y1": 220, "x2": 180, "y2": 270},
]
card_candidates = worker.build_locate_candidates(card_boxes, 1000, 1000, card_module, card_phrase, source="locateanything", strategy="full-image:test")
best_card = worker.choose_best_locate_candidate(card_candidates, card_module)

route_module = {
    "moduleId": "module_route",
    "label": "\\u9633\\u5149\\u6d77\\u5cb8\\u6808\\u9053",
    "regionKind": "route",
    "maskPolicy": "route",
    "visualMode": "map",
    "regionPrompt": "\\u4e1c\\u4fa7\\u5c71\\u810a\\u4e0a\\u7684\\u7ec6\\u957f\\u6808\\u9053\\u8def\\u7ebf",
    "plannedBounds": {"x": 0.10, "y": 0.45, "width": 0.60, "height": 0.08},
}
route_candidates = worker.build_locate_candidates(
    [{"x1": 120, "y1": 460, "x2": 670, "y2": 510}],
    1000,
    1000,
    route_module,
    {"kind": "route", "text": "route"},
    source="locateanything",
    strategy="full-image:route",
)

subject_module = {
    "moduleId": "module_subject",
    "label": "Guide robot",
    "text": "AI guide",
    "regionKind": "object-with-label",
    "maskPolicy": "subject-with-label",
    "visualMode": "scene",
    "regionPrompt": "guide robot body plus attached AI personalized guide label",
    "visualEvidence": ["visible robot body", "attached AI label"],
    "plannedBounds": {"x": 0.06, "y": 0.28, "width": 0.42, "height": 0.26},
}
subject_candidates = worker.build_locate_candidates(
    [
        {"x1": 188, "y1": 268, "x2": 277, "y2": 340},
        {"x1": 120, "y1": 330, "x2": 320, "y2": 900},
    ],
    1000,
    1000,
    subject_module,
    {"kind": "semantic-region", "text": "guide robot"},
    source="locateanything",
    strategy="full-image:semantic-region",
)
best_subject = worker.choose_best_locate_candidate(subject_candidates, subject_module)

map_module = {
    "moduleId": "module_map",
    "label": "\\u4e09\\u6f6d\\u5370\\u6708",
    "regionKind": "landmark",
    "maskPolicy": "full-region",
    "visualMode": "map",
    "regionPrompt": "\\u6e56\\u5fc3\\u5c0f\\u5c9b\\u4e0e\\u4e09\\u5ea7\\u77f3\\u5854",
    "plannedBounds": {"x": 0.42, "y": 0.52, "width": 0.16, "height": 0.13},
}

print(json.dumps({
    "cardHint": worker.build_semantic_hint(card_module),
    "cardPhrases": worker.build_module_phrases(service_module, 2),
    "cardCandidates": card_candidates,
    "bestCard": best_card,
    "routeCandidate": route_candidates[0],
    "subjectCandidates": subject_candidates,
    "bestSubject": best_subject,
    "cropPrompt": worker.build_crop_module_phrase(map_module, "\\u5b9a\\u4f4d\\u4e09\\u6f6d\\u5370\\u6708"),
    "safeText": worker.sanitize_tokenizer_safe_text("abc\\ufffddef"),
    "asciiFallback": worker.sanitize_tokenizer_ascii_fallback("\\u5b9a\\u4f4d\\u4e09\\u6f6d\\u5370\\u6708 Pod 02"),
    "confidence": {
        "normalLow": worker.confidence_from_score(0, "locateanything"),
        "normalHigh": worker.confidence_from_score(1, "locateanything"),
        "layoutLow": worker.confidence_from_score(0, "layout-guided-locateanything"),
        "layoutMid": worker.confidence_from_score(0.5, "layout-guided-locateanything"),
        "layoutHigh": worker.confidence_from_score(1, "layout-guided-locateanything")
    },
}, ensure_ascii=True))
`;
  const result = spawnSync("python", ["-c", code], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    shell: false
  });
  if (result.status !== 0) {
    throw new Error(`Python worker probe failed:\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function testInfographicPhrases(probe) {
  assert.ok(probe.cardPhrases.length >= 3);
  assert.strictEqual(probe.cardPhrases[0].kind, "numbered-card");
  assert.match(probe.cardPhrases[0].text, /complete separated infographic card/);
  assert.match(probe.cardPhrases[0].text, /Service/);
  assert.match(probe.cardPhrases[1].text, /full panel boundary/);
}

function testCardHintAvoidsExplanationKeywordDrift(probe) {
  assert.match(probe.cardHint, /infographic card|Pod runtime unit/);
  assert.doesNotMatch(probe.cardHint, /health sensor/);
}

function testCandidateScoringRejectsHeaderStrip(probe) {
  assert.ok(probe.bestCard);
  assert.deepStrictEqual(probe.bestCard.bounds, { x: 0.1, y: 0.2, width: 0.31, height: 0.49 });
  const header = probe.cardCandidates.find((candidate) => candidate.bounds.width === 0.58);
  assert.ok(header.score < probe.bestCard.score, `header score ${header.score} should be below best ${probe.bestCard.score}`);
  assert.ok(header.reasons.some((reason) => /strip|too-large/.test(reason)), header.reasons.join(", "));
}

function testSubjectScoringRejectsTinyLabel(probe) {
  assert.ok(probe.bestSubject);
  assert.deepStrictEqual(probe.bestSubject.bounds, { x: 0.12, y: 0.33, width: 0.2, height: 0.57 });
  const tinyLabel = probe.subjectCandidates.find((candidate) => candidate.bounds.width === 0.089);
  assert.ok(tinyLabel.score < probe.bestSubject.score, `tiny label score ${tinyLabel.score} should be below subject ${probe.bestSubject.score}`);
  assert.ok(tinyLabel.reasons.some((reason) => /tiny-subject|too-small-for-subject|dimension/.test(reason)), tinyLabel.reasons.join(", "));
}

function testRouteScoringAllowsThinRoute(probe) {
  assert.ok(probe.routeCandidate.score > 0.6, `route score ${probe.routeCandidate.score} should remain acceptable`);
  assert.ok(probe.routeCandidate.reasons.includes("route-like-aspect"));
}

function testCropPromptKeepsChineseTarget(probe) {
  assert.match(probe.cropPrompt, /\u4e09\u6f6d\u5370\u6708/);
  assert.match(probe.cropPrompt, /\u6e56\u5fc3\u5c0f\u5c9b/);
}

function testTokenizerSafeFallback(probe) {
  assert.doesNotMatch(probe.safeText, /\ufffd/);
  assert.strictEqual(probe.asciiFallback, "Pod 02");
}

function testLayoutGuidedConfidenceMapping(probe) {
  assert.strictEqual(probe.confidence.normalLow, 0.48);
  assert.strictEqual(probe.confidence.normalHigh, 0.91);
  assert.strictEqual(probe.confidence.layoutLow, 0.4);
  assert.strictEqual(probe.confidence.layoutMid, 0.53);
  assert.strictEqual(probe.confidence.layoutHigh, 0.66);
  assert.ok(probe.confidence.layoutLow < probe.confidence.layoutMid);
  assert.ok(probe.confidence.layoutMid < probe.confidence.layoutHigh);
  assert.ok(probe.confidence.layoutHigh < probe.confidence.normalHigh);
}

main();
