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
