"use strict";

// Instance experiment harness for the ChatImage paper.
//
// Runs a fixed set of real cases N times each through the real generation +
// strict visual-alignment pipeline (reusing scripts/generate-real-demo-cases.js),
// then reports two success rates per case and overall:
//   1. basic generation success  - generated a valid result with enough hotspots
//   2. strict visual-alignment    - every hotspot passes the published strict gate
// It also emits a human-evaluation scoring sheet (CSV) plus the rendered
// page.png per run so the user can score quality by hand.
//
// Env overrides (for piloting):
//   EXP_CASES   comma-separated case ids (default: the 30 curated ids below)
//   EXP_REPEATS repeats per case        (default: 3)
//   EXP_DIR     output dir              (default: tmp/instance-experiment)

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { enforceStrictVisualAlignment } = require("../server/sam3");

// 30 cases balanced across map / technical / business / scene. All ids must
// exist in scripts/generate-real-demo-cases.js CASES.
const DEFAULT_CASES = [
  // map (5)
  "west-lake-tour-map", "campus-handdrawn-map", "weekend-hangzhou-itinerary",
  "farmers-market-shopping-map", "neighborhood-library-map",
  // technical (6)
  "oauth2-flow", "ielts-study-roadmap", "react-performance-debug-flow",
  "japanese-ramen-cooking", "coffee-brewing-methods", "git-conflict-resolution",
  // business (9)
  "ecommerce-funnel", "household-budget-plan", "weekly-fitness-plan",
  "personal-finance-roadmap", "career-transition-plan", "online-shopping-decision",
  "running-marathon-prep", "language-learning-routine", "interview-prep-plan",
  // scene (10)
  "smart-home-living-room", "boutique-coffee-scene", "sunny-reading-nook",
  "record-store-corner", "plant-care-corner", "future-museum-scene",
  "healthy-breakfast-options", "compact-home-office-desk", "garden-balcony-layout",
  "newborn-care-day"
];

const MIN_HOTSPOTS = Number(process.env.EXP_MIN_HOTSPOTS || 3);
const REPEATS = Number(process.env.EXP_REPEATS || 3);
const EXP_DIR = process.env.EXP_DIR || path.join(process.cwd(), "tmp", "instance-experiment");
const CASES = String(process.env.EXP_CASES || DEFAULT_CASES.join(","))
  .split(",").map((s) => s.trim()).filter(Boolean);

function runRepeat(repeat) {
  const runDir = path.join(EXP_DIR, `run-${repeat}`);
  fs.mkdirSync(runDir, { recursive: true });
  const env = {
    ...process.env,
    CHATIMAGE_REAL_DEMO_CASES: CASES.join(","),
    CHATIMAGE_REAL_DEMO_RUN_DIR: runDir,
    // Disable strict enforcement during generation so a run never aborts (422)
    // when some region falls back to planned/sam3-refined-planned. The strict
    // gate is then evaluated post-hoc per run, which lets us report both the
    // basic-generation success rate and the strict-alignment pass rate.
    CHATIMAGE_STRICT_VISUAL_ALIGNMENT: "false"
  };
  console.log(`\n=== repeat ${repeat}/${REPEATS}: ${CASES.length} cases -> ${runDir} ===`);
  const res = spawnSync(process.execPath, [path.join("scripts", "generate-real-demo-cases.js")], {
    stdio: "inherit",
    env
  });
  if (res.status !== 0) console.warn(`repeat ${repeat} runner exited with status ${res.status}`);
  cleanupStrayBrowsers();
  return runDir;
}

// Belt-and-suspenders: kill any leftover headless browser trees from the runner
// so they cannot accumulate across repeats and exhaust the machine. The runner's
// own cleanup (taskkill /T) should handle this, but a late-spawned child can
// survive; this never touches a normal (non-headless) browser the user has open.
function cleanupStrayBrowsers() {
  if (process.platform !== "win32") return;
  try {
    const ps = "Get-CimInstance Win32_Process -Filter \"name='msedge.exe' or name='chrome.exe'\" | "
      + "Where-Object { $_.CommandLine -like '*chatimage-real-demo*' -or $_.CommandLine -like '*--headless*' } | "
      + "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
    spawnSync("powershell.exe", ["-NoProfile", "-Command", ps], { stdio: "ignore" });
  } catch (error) {
    /* best effort */
  }
}

function loadRunReport(runDir) {
  const p = path.join(runDir, "real-demo-run-report.json");
  if (!fs.existsSync(p)) return { cases: [] };
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return { cases: [] }; }
}

function strictPasses(resultPath) {
  if (!resultPath || !fs.existsSync(resultPath)) return false;
  let result;
  try { result = JSON.parse(fs.readFileSync(resultPath, "utf8")); } catch { return false; }
  const hotspots = (result.hotspots) || (result.state && result.state.hotspots) || [];
  if (!hotspots.length) return false;
  const modules = hotspots.map((h) => ({
    moduleId: h.id, label: h.label, source: h.alignmentSource, mask: h.mask
  }));
  try {
    enforceStrictVisualAlignment({ strictVisualAlignment: true }, { modules });
    return true;
  } catch { return false; }
}

function csvCell(value) {
  const s = String(value == null ? "" : value);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function main() {
  fs.mkdirSync(EXP_DIR, { recursive: true });
  const startedAt = new Date().toISOString();

  const runDirs = [];
  for (let r = 1; r <= REPEATS; r += 1) runDirs.push(runRepeat(r));

  // Aggregate: per case x repeat.
  const perCase = new Map();
  CASES.forEach((id) => perCase.set(id, { id, category: "", runs: [] }));

  runDirs.forEach((runDir, idx) => {
    const repeat = idx + 1;
    const report = loadRunReport(runDir);
    for (const c of report.cases || []) {
      const entry = perCase.get(c.id);
      if (!entry) continue;
      entry.category = c.category || entry.category;
      const basic = c.status === "generated" && Number(c.hotspotCount || 0) >= MIN_HOTSPOTS;
      const strict = basic && strictPasses(c.resultPath);
      entry.runs.push({
        repeat,
        status: c.status,
        hotspotCount: c.hotspotCount || 0,
        basic,
        strict,
        screenshot: c.screenshot || "",
        chatImageId: c.chatImageId || "",
        error: c.error || ""
      });
    }
  });

  // Build CSV scoring sheet + summary.
  const rows = [["case_id", "category", "repeat", "status", "hotspots", "basic_success", "strict_success", "screenshot", "human_score_1to5", "human_notes"]];
  const summaryRows = [["case_id", "category", "basic_success_rate", "strict_success_rate", "runs"]];
  let totalRuns = 0, totalBasic = 0, totalStrict = 0;

  for (const id of CASES) {
    const entry = perCase.get(id);
    const runs = entry.runs;
    const basicN = runs.filter((x) => x.basic).length;
    const strictN = runs.filter((x) => x.strict).length;
    totalRuns += runs.length; totalBasic += basicN; totalStrict += strictN;
    for (const run of runs) {
      rows.push([id, entry.category, run.repeat, run.status, run.hotspotCount, run.basic ? 1 : 0, run.strict ? 1 : 0, run.screenshot, "", ""]);
    }
    summaryRows.push([id, entry.category, runs.length ? (basicN / runs.length).toFixed(2) : "0", runs.length ? (strictN / runs.length).toFixed(2) : "0", runs.length]);
  }

  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    repeats: REPEATS,
    caseCount: CASES.length,
    totalRuns,
    basicSuccessRate: totalRuns ? Number((totalBasic / totalRuns).toFixed(4)) : 0,
    strictSuccessRate: totalRuns ? Number((totalStrict / totalRuns).toFixed(4)) : 0,
    perCase: Object.fromEntries([...perCase].map(([id, e]) => [id, {
      category: e.category,
      basic: e.runs.filter((x) => x.basic).length,
      strict: e.runs.filter((x) => x.strict).length,
      runs: e.runs.length
    }]))
  };

  fs.writeFileSync(path.join(EXP_DIR, "experiment-summary.json"), JSON.stringify(summary, null, 2), "utf8");
  fs.writeFileSync(path.join(EXP_DIR, "scoring-sheet.csv"), rows.map((r) => r.map(csvCell).join(",")).join("\n"), "utf8");
  fs.writeFileSync(path.join(EXP_DIR, "success-rates.csv"), summaryRows.map((r) => r.map(csvCell).join(",")).join("\n"), "utf8");

  console.log("\n=== EXPERIMENT DONE ===");
  console.log(`cases=${CASES.length} repeats=${REPEATS} totalRuns=${totalRuns}`);
  console.log(`basic success rate  = ${(summary.basicSuccessRate * 100).toFixed(1)}%`);
  console.log(`strict success rate = ${(summary.strictSuccessRate * 100).toFixed(1)}%`);
  console.log(`wrote ${path.relative(process.cwd(), path.join(EXP_DIR, "experiment-summary.json"))}`);
  console.log(`wrote ${path.relative(process.cwd(), path.join(EXP_DIR, "scoring-sheet.csv"))} (human-eval sheet)`);
}

main();
