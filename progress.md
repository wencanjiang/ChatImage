# ChatImage Real Demo Expansion Progress

## 2026-06-25
- Started expanded real-case testing and demo curation task.
- Planning files created.
- Inspected `scripts/generate-real-demo-cases.js` and `scripts/generate-doc-demos.js`.
- Found docs promotion is explicit whitelist by `chatImageId`, not automatic from latest run output.
- Added 8 daily-dialog real cases to `scripts/generate-real-demo-cases.js`.
- Verified generator syntax with `node --check scripts\generate-real-demo-cases.js`.
- Re-ran `npm run test:real-scripts`, passed.
- Ran Batch A: `household-budget-plan`, `weekly-meal-prep-plan`, `electric-toothbrush-comparison`, `ielts-study-roadmap`.
- Batch A candidate accepted for further curation: `household-budget-plan`.
- Batch A rejected: `weekly-meal-prep-plan` timeout, `electric-toothbrush-comparison` image timeout, `ielts-study-roadmap` generic labels and mostly planned alignment.
- Current working tree already contains prior fixes:
  - `src/structure.js` detail contamination vocabulary.
  - `src/app.js` animatePreview preview flight.
  - `scripts/sam3_worker.py` postprocess warnings.
  - `src/service.js` layout model fallback.
- Fixed real-result persistence 413 by raising default JSON request limit to 32 MB and updating the explicit body-limit unit test.
- Improved `scripts/generate-real-demo-cases.js` failure diagnostics by capturing browser fetch/runtime diagnostics.
- Ran Batch C: `react-performance-debug-flow`, `weekend-hangzhou-itinerary`, `home-moving-checklist`; all generated.
- Accepted Batch C React case; rejected Hangzhou due leaked prompt-fragment label and moving checklist due generic fallback labels.
- Updated docs showcase to 6 curated real demos: West Lake, household budget, future museum, React performance debugging, OAuth 2.0, ecommerce funnel.
- Exported docs assets with `node scripts\generate-doc-demos.js`.
- Added `tests/docs-demo-interaction.test.js` to verify the docs viewer opens and hotspot clicks update the detail panel.
- Verification passed: `node tests\docs-demos.test.js`, `node tests\docs-demo-interaction.test.js`, `node tests\real-scripts.test.js`, `node tests\server-modules.test.js`, `npm run test:service`, `npm run build`.
- Re-audited docs demos after visual-alignment complaint.
- Removed all promoted demos that had planned-derived hotspot sources: React performance, OAuth 2.0, and ecommerce funnel.
- Promoted strict zero-planned replacements: smart-home living room and boutique coffee shop.
- Regenerated docs assets and strict overlay audit sheet.
- Added `tests/docs-demos.test.js` assertion that no published demo may include planned hotspot source keys.
- Re-verified with `node tests\docs-demos.test.js`, `node tests\docs-demo-interaction.test.js`, and `npm run build`.
- Started fresh daily/non-flowchart case expansion requested by user.
- Confirmed real API, LocateAnything, SAM, CUDA, and strict visual alignment are enabled from local `.env.local`.
- Added 8 fresh non-flowchart daily cases to `scripts/generate-real-demo-cases.js`.
- Hit and fixed a temporary syntax error in the generator after insertion.
- Verified `node --check scripts\generate-real-demo-cases.js` and `node tests\real-scripts.test.js`.
- Ran fresh batch A with `compact-home-office-desk`, `family-emergency-kit`, `smartphone-photography-corner`, and `fridge-meal-prep-shelf`; stopped after first case failed strict alignment.
- Diagnosed SAM Python missing `cv2`; installed `opencv-python-headless==4.10.0.84` and restored `numpy==1.26.4`.
- Verified SAM health again after dependency repair.
- Fixed over-aggressive truncated-question module filtering that would remove valid object titles if they appeared in the original prompt.
- Added regression coverage for scaffold filtering: `Barista`, `Espresso machine`, `Pastry case`, `Window seating`, and `Entrance queue` are preserved, while `Create a h` and `-drawn neighborhood libr` are removed.
- Synchronized Arxiv section 4 benchmark examples with the current curated demo manifest.
- Ran fresh batch D2 after repairs and accepted three daily scene demos: `sunny-reading-nook`, `record-store-corner`, and `plant-care-corner`.
- Verified the accepted D2 artifacts have zero `planned` / `sam3-refined-planned` hotspot sources, masks and organic previews for every hotspot, and no scaffold/detail contamination.
- Promoted the three accepted real cases to the docs showcase, regenerated `docs/assets/demos`, and updated the static interactive demo cards.
- Verification passed: `node tests\service.test.js`, `node tests\sam3.test.js`, `node tests\docs-demos.test.js`, `node tests\docs-demo-interaction.test.js`, and `npm run build`.

## 2026-06-26
- Reviewed the docs demo export against the latest strict SAM gate and found three stale published demos were invalid under the current rules: `west-lake-tour-map`, `household-budget-plan`, and `future-museum-scene`.
- Fixed `scripts/generate-doc-demos.js` so export now calls the strict visual-alignment gate before writing PNG/JSON assets. Failed cases are skipped and printed with rejection reasons.
- Changed manifest `sourceCounts` to be recomputed from exported hotspot `alignmentSource` values instead of trusting stale `alignmentRaw.sourceCounts`.
- Regenerated `docs/assets/demos`; the public showcase first contained five strict SAM-backed demos: smart-home, boutique-coffee, sunny-reading-nook, record-store-corner, and plant-care-corner.
- Regenerated the West Lake map case as `ci_2e77c4cd-1f49-405f-832f-b3f6af1a0d74`; all nine hotspots have visual grounding plus SAM mask, cutout, organic preview, and organic bounds.
- Updated `scripts/generate-doc-demos.js` to use the regenerated West Lake ID, re-exported six strict demos, and restored the homepage hero to the strict West Lake demo.
- Updated `docs/demo-eligibility.md` with current accepted and rejected cases.
- Started open-source launch readiness work.
- Updated `README.md` and `README_CN.md` so `/docs/index.html` is framed as selected outputs from the same ChatImage workflow, while `?provider=mock` remains the local entry for generating new ChatImages.
- Added a curated demo showcase section listing the six currently published strict demos and the visual-alignment criteria used before publication.
- Added `CONTRIBUTING.md` with local setup, demo quality rules, and release-test expectations.
- Added `SECURITY.md` with private vulnerability reporting guidance and key-handling expectations.
- Added `RELEASE_CHECKLIST.md` covering demo integrity, local deployment, documentation, safety, and verification commands.
- Verification passed after the launch-doc updates: `node tests\docs-demos.test.js`, `node tests\docs-demo-interaction.test.js`, `node tests\sam3.test.js`, and `npm run build`.
- Corrected launch documentation wording: the showcase is now described as selected high-quality outputs from the same ChatImage generation/alignment workflow, not a separate product path from generating new ChatImages.
- Synchronized `Arxiv/chatimage_paper/sec/4_experiment.tex` with the current six-demo public showcase and removed rejected/obsolete examples from the experiment narrative.
- Re-verified after the wording and paper update: `node tests\docs-demos.test.js`, `node tests\docs-demo-interaction.test.js`, and `npm run build`.
- Found and fixed a launch-readiness privacy issue: `/api/config` no longer exposes the local `sam3Checkpoint` absolute path to the browser. The endpoint now keeps SAM state as booleans such as `sam3Configured` and `strictVisualAlignment`.
- Verification passed for the config privacy fix: `node tests\sam3.test.js`, `node tests\server.test.js`, plus a live `npm start` check on port 5183 showing `hasSam3Checkpoint=False`.

## 2026-06-26 (session 2: launch hardening)
- Ran full `npm test` and found 3 stale assertions: `docs.test.js` (x2) and `real-browser-instance.js` still referenced `docs/vision-endpoint-contract.md`, which had moved to `docs/archive/`. Updated all three paths.
- Removed two dead curated entries (`real-household-budget-plan`, `real-future-museum-scene`) from `scripts/generate-doc-demos.js`; they are rejected by the strict gate and their assets were already deleted.
- Security/privacy scan (codex + manual): no API keys in tracked files; `.env.local`/`tmp/`/`*.log` confirmed gitignored. Fixed one tracked leak — `docs/archive/vision-endpoint-contract.md` exposed `C:\Users\YOUR_NAME\...`, genericized. PDF author metadata (`Rinke`) in `chatimage.pdf`, `fig/demo1.pdf`, `fig/Qualitative_Analysis.pdf` stripped via pikepdf + a clean MiKTeX rebuild; `scripts/render_alignment_audit.py` hardcoded `C:\code_all\LxgwWenKai\...` font path replaced with a repo-relative `assets/fonts/` path. No personal info remains in tracked files.
- Fixed `sanqing-map` mock agent-evaluation regression (rendered 4 hotspots, needed >=5): `src/service.js` `isScaffoldPrompt` treated any regionPrompt containing "图例"/"legend" as scaffold, dropping the concrete `交通索道入口` transport legend. Added `isConcreteLegendTarget()` guard (transport/lodging keywords, matching the legend slots in `src/layout.js`) so real transport/lodging legends survive. All 13 eval cases now score 100.
- Frontend UI audit (codex static + manual repro). Fixed 7 issues: experience-page modal `z-index` 20→100 (was under composer/sidebar); mobile `.detail-panel` re-centered with `left:50%` (was offset by desktop sidebar width and overflowing); promo copy button now has a `.catch()` → textarea fallback; sidebar `localStorage` get/set wrapped in try/catch; error-state partial result now binds zoom/save buttons; footer `arXiv` placeholder link `XXXX.XXXXX` → GitHub paper draft; removed residual museum/budget i18n entries. Deferred: lightbox focus trap, `window.ChatImageTestHooks` exposure (3 browser tests depend on it), English provider labels.
- Demo page QA: all 6 published demos pass. Hotspots land on correct regions; every hotspot has an `organicImage`, so the page never falls back to the fragmented raw cutout. Sampled organic previews (coffee/west-lake/smart-home) are visually coherent and attractive. Caveat: raw masks are heavily fragmented (componentCount up to 351, `contiguous=false`) — feathering/hole-fill hides this in the organic preview, but it is a latent quality risk to watch in the 30-case instance experiment.
- Full `npm test` green (45 suites) and `npm run build` OK after all fixes.
- Replanned the paper experiment per user: 30 cases x3 repeats, report both strict-gate pass rate and basic-generation success rate; export a human-eval scoring sheet for the user. Reuse and extend the existing case pool to 30.
- Built the experiment harness `scripts/run-instance-experiment.js` (runs the runner N times, evaluates basic + post-hoc strict success, writes success-rates.csv + scoring-sheet.csv) and `scripts/build-eval-sheet.js` (HTML scoring page over the page.png renders).
- Experiment design correction: the server default `CHATIMAGE_STRICT_VISUAL_ALIGNMENT=true` makes generation abort (422) when a region only gets a planned/sam3-refined-planned fallback. The harness sets it false and evaluates the strict gate post-hoc, so both success rates are measurable.
- Infrastructure bug found + fixed: `stopProcess` in tests/browser.test.js used child.kill(), which on Windows leaks the headless Edge child process tree (renderer/gpu/utility/crashpad). Across repeated runner invocations these accumulated to ~1162 stray processes and thrashed the machine (the first experiment attempt stalled because of this). Switched to taskkill /T and added a stray-browser cleanup in the harness. Committed.
- Clean-clone verification (#6) found a real launch blocker: the backend uses Node's built-in `node:sqlite` (DatabaseSync, needs Node 22.5+), but README/README_CN/showcase/technical-report claimed Node 18+ and persistence "via better-sqlite3" (an unused dep). A Node 18/20 user would crash on startup. Corrected the version to 22.5+ and the engine to node:sqlite everywhere, and added an engines field to package.json. The project has zero npm dependencies; a fresh clone installs, builds, serves both pages (200), and a no-key user gets mock mode.
- Instance experiment running (30x1) and healthy after the leak fix; first cases generate cleanly (e.g. west-lake 9 hotspots, all mimo-vision).

## 2026-06-27 Instance experiment results (stopped at 28/30) + root cause
- The 30x1 run was stopped at 28/30. Salvaged results from the run report + post-hoc strict eval:
  - basic generation success: 22/28 = 78.6%
  - strict visual-alignment (per case, all hotspots): 1/28 = 3.6%; per hotspot: 4/131 = 3.1%
  - hotspot alignment source distribution (131 hotspots): planned 65%, mimo-vision 26%, sam3-refined-planned 5%, local-ocr 4%, locateanything 0%.
- ROOT CAUSE (from west-lake alignmentRaw.warnings): the LocateAnything worker timed out after 240000ms and SAM3 refine timed out after 120000ms. So in batch runs both grounding workers time out, grounding degrades to mimo-vision then planned, and the strict gate (needs primary grounding + SAM mask + organic preview) almost never passes. The published demos were curated runs where these did NOT time out.
- The timeout is hit because each align request processes all modules serially (9 modules x multi-pass crop-and-reground), which exceeds the 240s per-request budget. This re-validates lever #2 (batching) as high value: it is not just speed, it lets LocateAnything finish within the timeout so grounding actually works.
- User chose to implement lever #2 (batch inference) to fix the root cause. Generated a human-eval scoring page at tmp/instance-experiment/eval-sheet.html (28 runs).
- Found `try_batch_align` already defined in scripts/locateanything_worker.py but never called and only prompt-level (one prompt -> N boxes), which is unreliable. True tensor-level batching is not implemented; LocateAnything-3B uses a custom trust_remote_code generate, so batch support must be probed on GPU first.
- GPU probe: LocateAnything-3B's custom generate hard-asserts batch_size==1, so tensor batching is impossible. max_new_tokens cap made no difference on an easy short-output phrase. But instrumenting a real west-lake run (added opt-in la_timing to the worker) showed the real cause: 4 of 9 "hard" regions (landmark/building/mountain) each ran 16-31s with unbounded generation (the model rambles after emitting the short box) while easy ones ran ~1s; align total was 116s, which times out under contention.
- FIX: cap max_new_tokens to 256 by default in server.js. Re-running west-lake with the cap dropped the hard regions to ~3.6s and align total from 116s to 28s (4.2x). Box accuracy unaffected (answer decided in the first ~50 tokens). Committed.
- VALIDATION (4 hard cases re-run with the fix): basic 4/4=100%, strict 3/4=75% (vs 3.6% before), grounding source distribution mimo-vision 84% / locateanything 12% / sam3-refined-planned 4% / pure planned 0% (vs 70% planned-class before). The token cap restores real visual grounding. The 30-case experiment can be re-run with confidence for the paper.

## 2026-06-28 Paper completion pass
- Started a full paper polish task covering experiment prose, tables, and figures.
- Current git tree was clean at start; latest commit already contains demo showcase replacement and `17/24 (70.8%)` metric correction.
- Audited local experiment artifacts and found no completed human IQ/AA/Navigability scores; `scoring-sheet.csv` human score fields are blank.
- Initial paper pass rewrote the experiment section around local artifacts; later user corrections superseded the first-pass 15/30 and 4/30 framing.
- Replaced placeholder human-eval/ablation/per-mode tables with objective pipeline, source-distribution, and per-mode result tables.
- Updated abstract, introduction contribution, and conclusion language from "human evaluation" to real-provider evaluation plus grounding audit.
- Regenerated `Arxiv/chatimage_paper/fig/Qualitative_Analysis.pdf` from current docs demo assets, including the new healthy-breakfast showcase.
- Revised paper metric framing per user correction: generation is reported as 30/30 (100.0%) under valid API runs, API quota interruptions are not counted as model/pipeline failures, strict gate is reported as 17/24 (70.8%), and the manual audit section/row was removed.
- Added the SAM segmentation completeness metric to the paper: 13/24 (54.2%) checked hotspots have complete SAM masks without holes or empty cavities.
- Replaced `Experiment_Summary.pdf` with a conference-style vector figure for Section 4, visualizing 30/30 generation, 17/24 strict gate, 13/24 SAM completeness, and the 90-hotspot alignment-source distribution.
- Started a full paper-figure redraw pass: replaced placeholder-looking `demo1.pdf`, `model.pdf`, and `Experiment_Summary.pdf` with a unified vector style generated by `fig/make_paper_figures.py`.
- Reworked the figure pass to use real image-2api outputs as visual backgrounds for Figures 1, 2, and the experiment summary, then overlaid exact labels and metrics locally to avoid generated-text/data errors.

## 2026-06-29 Paper content calibration
- Started a pass to make the paper read more like a technical blog/article while keeping the experimental numbers and implementation claims aligned with the code.
- Initial constraint from user: avoid concrete implementation filenames such as `.py` workers in the prose, because they make the article feel hard to follow.
- Rewrote the abstract, introduction, method, experiment narrative, and conclusion around the user-facing system idea: generate the image first, then ground clickable regions on the rendered result.
- Checked the paper against the current implementation: Node.js 22.5+ with built-in SQLite persistence, provider-agnostic mock/API modes, LocateAnything/MiMo/local-OCR/SAM-style grounding, strict demo gating, preview masks, rectangular click hit-testing, and per-hotspot follow-up threads.
- Removed source-file and worker-script references from the paper prose; a source scan no longer finds `.py`, concrete source paths, or stale metrics such as 15/30, 4/30, 29.2%, or manual-audit claims in the paper sources.
- Recompiled `Arxiv/chatimage_paper/chatimage.pdf` successfully to 10 pages and visually checked representative pages after the rewrite; the LaTeX log has no fatal errors or overfull boxes.
- Ran a writing-audit pass over the full paper sources. Replaced the experiment-section rhetorical question framing with two measurable evaluation axes, tightened abstract/introduction/method/conclusion wording, and removed several presentation-like phrases such as "wall of text", "surprisingly old-fashioned", "key idea is simple", and "only get better".
- Recompiled the paper after the writing pass. The log remains clean except for existing font substitution warnings; a punctuation-gate check passes on the experiment and conclusion files, while remaining warnings in other TeX files are LaTeX macro/citation false positives.
- Revised the experiment tables per user feedback: Table 1 now reports scenario coverage and alignment stress by mode, Table 2 uses a shared 24-item denominator for all three reported rates, and the former per-mode generation table was removed as redundant. Regenerated the experiment summary figure so its outcome panel also uses 24/24 for the generated subset while the text still states the full 30/30 benchmark completion result.
- Demoted generated-completion success from the main result table and figure because 100% completion is only a valid-run sanity check, not the main quality result. Table 2 now focuses on strict-gate/SAM pass and failure rates, Figure 4 panel A shows hotspot-quality diagnostics, and Table 3 no longer displays a decorative 100% total row.
