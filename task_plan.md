# ChatImage Real Demo Expansion Plan

## Goal
Add broader daily-dialog real test cases, run real generation/alignment, and promote only good, attractive, correctly aligned cases to the docs demo page.

## Phases
1. [complete] Set up planning files and inspect current generator/docs pipeline.
2. [complete] Add common daily-dialog cases to `scripts/generate-real-demo-cases.js`.
3. [complete] Run selected real cases into dated artifact directories.
4. [complete] Audit generated results for visible quality, detail contamination, hotspot bounds, and alignment source.
5. [complete] Promote selected good cases to `docs/assets/demos` and update `docs/index.html`.
6. [complete] Run verification tests and summarize residual risks.

## Quality Gate For Demo Promotion
- Generated from a real run, not mock data.
- At least 3 clickable hotspots.
- No detail-panel contamination phrases.
- Hotspot bounds are finite and inside the image.
- Every hotspot must have a primary visual grounding source (`locateanything` or `mimo-vision`) plus SAM mask/organic preview output.
- Reject `planned`, `sam3-refined-planned`, and mask-only previews for published demos.
- Visual screenshot is aesthetically acceptable and not dominated by masks, numbered markers, right-side lists, or broken text.

## Errors Encountered
| Error | Attempt | Resolution |
| --- | --- | --- |
| Existing real campus/museum run hit `undefined.createLayout` | Previous real run | Fixed service layout model fallback in `src/service.js`; service/browser-dist tests passed. |
| LocateAnything/SAM3 timeouts on map/scene cases | Previous real run | Logged as residual alignment stability risk; prefer cases whose artifacts pass visual audit. |
| Extra `},` after inserting new cases | Generator syntax check | Fixed object separator and re-ran `node --check scripts/generate-real-demo-cases.js`. |
| `/api/chatimages` returned 413 for a real React run | Batch B | Raised default JSON body limit to 32 MB and kept explicit limit coverage in `tests/server-modules.test.js`; React rerun saved successfully. |
| Demo card click did not open interactive viewer | Docs interaction smoke | Added whole-card keyboard/mouse opening while preserving Copy button behavior. |
| PowerShell rejected Unix heredoc syntax | 2026-06-25 fresh health check | Switched to `node -e` for LocateAnything/SAM health check. |

## 2026-06-25 Fresh Expansion Request

### Goal
Add more non-flowchart, daily-life real test cases, run them through strict LocateAnything + SAM visual alignment, manually inspect each generated candidate, and promote only visually attractive, correctly aligned, interactive examples to the docs demo page.

### Phases
1. [complete] Re-read current real demo pipeline and prior findings.
2. [complete] Add a broader, non-flowchart daily case batch to `scripts/generate-real-demo-cases.js`.
3. [complete] Run selected fresh cases through real generation with strict visual alignment enabled.
4. [complete] Inspect every generated candidate: source counts, hotspot bounds, screenshots, prompt/detail contamination, and click interaction.
5. [complete] Promote only accepted candidates to `scripts/generate-doc-demos.js` and regenerate docs demo assets.
6. [complete] Run docs/demo/build verification and record accepted/rejected cases.

## 2026-06-26 Open Source Launch Readiness

### Goal
Prepare ChatImage for public open-source release with a reliable best-case demo showcase, clear local deployment path, and a technical article/arXiv draft that matches the current implementation.

### Phases
1. [complete] Audit current repository state, docs, launch blockers, and existing tests.
2. [complete] Update launch-facing README and local deployment instructions.
3. [complete] Add or complete open-source hygiene files (`CONTRIBUTING.md`, `SECURITY.md`, release checklist).
4. [complete] Verify the curated docs demo page only publishes strict best-case demos and works locally.
5. [complete] Review arXiv draft alignment with current demo manifest and method claims.
6. [in_progress] Run targeted release verification and record residual risks.

### Release Gate
- `npm start` must let a no-key user inspect the selected best-case demo page.
- README must explain that showcased demos are selected outputs from the same ChatImage workflow, while local app entry can generate new results.
- No stale rejected demo should appear in `docs/assets/demos` or `docs/index.html`.
- No API keys or local absolute paths may appear in public docs/config examples.
- Tests for docs demos, interaction, SAM mask quality, and build must pass before release.

## 2026-06-26 Instance Experiment (paper sec/4)

### Goal
Run a 30-case x3-repeat instance study on the real generation + strict
visual-alignment pipeline, report two success rates, and export a human-eval
scoring sheet for the user to grade quality.

### Design (user-approved)
- 30 cases, balanced: 5 map, 6 technical, 9 business, 10 scene (reused from the
  existing `scripts/generate-real-demo-cases.js` pool of 48).
- 3 repeats each => 90 real API + GPU runs.
- Two reported metrics per run:
  - basic generation success: result generated with >= 3 valid hotspots.
  - strict visual-alignment: every hotspot passes `enforceStrictVisualAlignment`
    (primary grounding + SAM mask + cutout + organic preview; no planned /
    sam3-refined-planned), same gate as the published demos.
- Harness: `scripts/run-instance-experiment.js` re-invokes the existing runner 3x
  (via `CHATIMAGE_REAL_DEMO_CASES`), reads each run's `result.json`/report,
  evaluates both metrics, and writes `experiment-summary.json`,
  `scoring-sheet.csv` (per-run rows with an empty human_score column +
  page.png path), and `success-rates.csv` (per-case rates).
- Human evaluation: the user grades each run's rendered `page.png` 1-5; success
  rates are objective, quality scores are the user's.

### Steps
1. [in_progress] Build harness + select 30 cases; pilot 1 case x1 to validate.
2. [pending] Launch full 30x3 background run.
3. [pending] Aggregate two success rates + export human-eval scoring sheet.
4. [pending] Write results into sec/4_experiment and recompile the PDF (#10).

## 2026-06-28 Paper Completion Pass

### Goal
Polish the arXiv paper so the experiment section, result tables, qualitative figures, and narrative are internally consistent, credible, and publication-ready for the current ChatImage implementation.

### Phases
1. [complete] Audit current paper text, tables, figures, and generated experiment artifacts.
2. [complete] Decide the final experiment numbers and table layout from local artifacts; identify gaps requiring user input.
3. [complete] Improve experiment prose, limitations, captions, and table wording.
4. [complete] Refresh or generate paper figures if existing visuals are weak or stale.
5. [complete] Recompile PDF, run relevant tests/scans, and commit changes if requested.

### Open Questions
- Human-evaluated IQ/AA/Navigability values are not present locally; the paper now avoids claiming those scores until the user supplies completed annotations.
- Confirm whether the paper should report only the final post-fix run or also mention the pre-fix failure/root-cause study.
