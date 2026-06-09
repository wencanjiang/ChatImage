# Progress: Interactive Visual Works Modes

## 2026-06-09

- Pushed current stable adaptive-module template:
  - Commit: `a31e037 Make visual module count adaptive`
  - Remote: `origin/main`
- Created a new plan section in `task_plan.md` for interactive visual works modes.
- Created `findings.md` and this `progress.md` for the new effort.
- Implemented phase 1 interactive visual works support:
  - Added `visualMode` normalization/inference for `infographic`, `map`, `poster`, and `scene`.
  - Added semantic `regionKind` and `regionPrompt` fields through structure, layout prompt, alignment prompt, service payloads, local OCR, and LocateAnything worker inputs.
  - Added a West Lake hand-drawn map fallback spec.
  - Added map layout regions and non-card image prompt branch for map/poster/scene.
  - Added map-like mock SVG rendering for local/mock generation.
  - Updated generation-process wording so non-infographic modes say visual regions/visual works instead of only infographic modules.
- Verification passed:
  - `node --check src/structure.js`
  - `node --check src/layout.js`
  - `node --check src/alignment.js`
  - `node --check src/mock-svg.js`
  - `node --check src/render.js`
  - `node --check server/locateanything.js`
  - `node --check server/local-ocr.js`
  - `python -m py_compile scripts/locateanything_worker.py`
  - `npm.cmd run test:structure`
  - `npm.cmd run test:layout`
  - `npm.cmd run test:mock-svg`
  - `npm.cmd run test:render`
  - `npm.cmd test`
