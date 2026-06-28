# ChatImage Real Demo Expansion Findings

## Existing Real Run Findings
- Real API text and image smoke passed.
- Existing successful artifacts:
  - West Lake map: `ci_656c1418-06bf-40ff-b547-43775450873d`, 9 hotspots, `mimo-vision` source, no contamination.
  - Future museum scene: `ci_97e23852-2a5f-4893-824c-3fa9371e0f98`, 4 hotspots, `mimo-vision` source, no contamination.
  - Campus map: `ci_3cb69180-ebe6-4992-961d-4d7039bee375`, 6 hotspots, but all `planned`; not a strong demo candidate until manually verified or rerun with better visual alignment.
- SAM3 repeatedly timed out during full real-case runs, so demo promotion should not rely on SAM mask success unless the result artifact proves it.

## Demo Selection Bias
- Prefer everyday cases that produce clean infographic/card-like layouts because they are more likely to align reliably.
- Keep a few semantic visual works such as map/scene only when visual alignment is confirmed.

## Pipeline Contract
- `scripts/generate-real-demo-cases.js` contains the runnable real-case pool and supports `CHATIMAGE_REAL_DEMO_CASES`.
- `scripts/generate-doc-demos.js` exports only hardcoded curated `chatImageId` values from the SQLite store into `docs/assets/demos`.
- Promotion flow must therefore be: add case, run real generation, audit artifact, then add the winning `chatImageId` to `generate-doc-demos.js`.

## Common Case Batch A
- Run directory: `tmp/real-demo-run-20260625-common-a`.
- `household-budget-plan`: generated, `ci_62aebdae-4001-4d01-b761-fd58e805d43e`, 7 hotspots. It was a temporary candidate under the older no-planned rule, but is rejected under the current strict SAM gate because it lacks SAM mask assets and has four unknown alignment sources.
- `weekly-meal-prep-plan`: failed, wait predicate timeout.
- `electric-toothbrush-comparison`: failed, image task timeout / wait predicate timeout.
- `ielts-study-roadmap`: generated, `ci_66df88f0-b248-4b87-b731-1f7448159ae0`, but labels are generic and source is `local-ocr:2, planned:3`; reject for showcase.

## Common Case Batch B
- Run directory: `tmp/real-demo-run-20260625-common-b`.
- `react-performance-debug-flow`: failed after image/alignment because `/api/chatimages` returned 413 request body too large; likely oversized result payload from masks/alignment data. Rerun may need higher `CHATIMAGE_MAX_JSON_BODY_BYTES` or payload trimming.
- `interview-prep-plan`: generated, `ci_a57ab1f3-2573-4c99-af45-3ae79aad2ccb`, but all hotspots were `planned`; reject for showcase.
- `home-moving-checklist`: failed in this batch with a wait predicate timeout.

## Common Case Batch C
- Run directory: `tmp/real-demo-run-20260625-common-c`.
- Raised default JSON body limit to 32 MB before rerun; this fixed the React save failure.
- `react-performance-debug-flow`: generated, `ci_44d90e56-eb2f-4f61-8575-688cfed4d5fe`, 7 hotspots, no detail contamination or bad bounds; accepted as a technical workflow demo after manual screenshot check.
- `weekend-hangzhou-itinerary`: generated, `ci_13495a8c-22aa-4344-b6e8-b99841072493`, 13 hotspots, mostly visual-aligned, but one label leaked a truncated prompt fragment; reject for showcase.
- `home-moving-checklist`: generated, `ci_47bea92b-e6c6-424d-be9e-edde4f3536a6`, but only 3 generic fallback labels; reject for showcase.

## Promoted Docs Demos
- `real-west-lake-tour-map`: regenerated as `ci_2e77c4cd-1f49-405f-832f-b3f6af1a0d74`; nine hotspots pass the current strict SAM gate.
- `real-smart-home-living-room`: `ci_3f5f7110-a7e8-46f2-b9a4-20c4911d25fe`.
- `real-boutique-coffee-scene`: `ci_b7051ddb-7cf9-49ec-8bc7-d6c22fb39d1f`.
- `real-sunny-reading-nook`: `ci_7318affc-7a63-44b1-9bbb-97d93165a630`.
- `real-record-store-corner`: `ci_0a52d845-827e-4b3f-ad08-8b8d4d1943a8`.
- `real-plant-care-corner`: `ci_1a6baf46-031e-40ae-9e08-76941ac395f1`.
- Removed the old `real-west-lake-tour-map` export, `real-household-budget-plan`, and `real-future-museum-scene` from the current docs showcase because they lacked SAM mask/cutout/organic preview assets under the current strict gate.
- Removed `real-react-performance-debug-flow`, `real-oauth2-flow`, `real-ecommerce-funnel`, and `real-kubernetes-architecture` from the docs showcase because they included `planned` or `sam3-refined-planned` hotspot sources and are not reliable enough for visual-alignment proof.

## 2026-06-25 Alignment Re-audit
- User reported some docs demos still had failed visual alignment.
- Tightened promotion rule at that time to reject `planned` source keys. This was later found insufficient because old demos could have visual sources but no SAM mask assets.
- Current strict promoted source counts are recomputed from hotspot `alignmentSource`:
  - West Lake: `mimo-vision:9`
  - Smart home: `mimo-vision:5, locateanything-crop:1`
  - Boutique coffee: `mimo-vision:5, locateanything-crop:1`
  - Sunny reading nook: `locateanything:1, mimo-vision:4`
  - Record store corner: `mimo-vision:5`
  - Plant care corner: `mimo-vision:5`
- Generated overlay audit sheet at `tmp/demo-alignment-audit-strict/contact-sheet.jpg`.

## 2026-06-25 Fresh Daily Case Expansion
- Added fresh non-flowchart cases to the real generator: compact home office desk, capsule wardrobe flatlay, family emergency kit, smartphone photography corner, fridge meal-prep shelf, bike commuter maintenance, skincare shelf routine, and farmers market shopping map.
- Strict visual alignment health check passed after environment repair: LocateAnything ok, SAM ok, CUDA ok, checkpoint present.
- Fresh batch A first case `compact-home-office-desk` failed and was rejected:
  - Run dir: `tmp/real-demo-run-20260625-fresh-a`.
  - Failure: every module failed strict visual alignment.
  - Root cause 1: SAM environment initially lacked `cv2`, so masks were rejected.
  - Root cause 2: LocateAnything did not locate the desktop objects and fell back to `mimo-vision`/`planned`.
- Repaired SAM environment by installing `opencv-python-headless==4.10.0.84` and restoring `numpy==1.26.4`, because latest OpenCV had pulled incompatible `numpy==2.5.0`.
- Fresh batch C rejected:
  - `farmers-market-shopping-map`: rejected. Several modules lacked real SAM mask images or fell back to `sam3-refined-planned`; one truncated prompt-fragment module leaked into the structure.
  - `home-kitchen-cooking-zones`: rejected. All modules were `sam3-refined-planned`, meaning SAM tightened planned areas but no primary visual locator succeeded.
  - `acoustic-guitar-anatomy`: rejected. Part-level targets fell back to `mimo-vision` and lacked SAM masks.
  - `neighborhood-library-map`: rejected. Mimo/planned fallback and truncated prompt fragments remained before the truncation-filter fix.
- Fixed strict primary-source policy to match the current demo curation rule: `locateanything` and `mimo-vision` may be accepted as primary visual grounding sources, but `planned` and `sam3-refined-planned` are rejected. A real SAM mask image and organic preview are still required.
- Fixed the truncated-question filter after review: legal object titles that appear in the user prompt are kept; only strong prompt-fragment signals such as leading `-` fragments and imperative prompt starts like `Create a ...` are removed.
- Fresh batch D2 accepted after the fixes:
  - `sunny-reading-nook`: `ci_7318affc-7a63-44b1-9bbb-97d93165a630`, 5 hotspots, `locateanything:1, mimo-vision:4`, all hotspot regions have mask and organic preview, no visible detail contamination found.
  - `record-store-corner`: `ci_0a52d845-827e-4b3f-ad08-8b8d4d1943a8`, 5 hotspots, `mimo-vision:5`, all hotspot regions have mask and organic preview, no visible detail contamination found.
  - `plant-care-corner`: `ci_1a6baf46-031e-40ae-9e08-76941ac395f1`, 5 hotspots, `mimo-vision:5`, all hotspot regions have mask and organic preview, no visible detail contamination found.
- Docs showcase now exports 6 strict SAM-backed demos: West Lake, smart home, boutique coffee, sunny reading nook, record store corner, and indoor plant care corner.

## 2026-06-26 Strict Export Correction
- Connected `scripts/generate-doc-demos.js` to the current strict visual-alignment gate. Export now skips any stored ChatImage whose hotspots lack primary visual grounding plus SAM mask, cutout, organic preview, and expanded organic bounds.
- The old West Lake, household budget, and future museum exports were rejected by this gate and removed from the public showcase.
- A new West Lake run, `ci_2e77c4cd-1f49-405f-832f-b3f6af1a0d74`, passed the current gate and restored West Lake as the homepage hero.
- Manifest `sourceCounts` are recomputed from hotspot `alignmentSource` values, with missing values counted as `unknown` during validation rather than inherited from stale `alignmentRaw.sourceCounts`.
- The homepage hero uses the regenerated strict West Lake demo.

## 2026-06-28 Paper completion audit
- `chatimage.tex` abstract still contains `\tbd{N}` for benchmark size, while `sec/4_experiment.tex` describes a 30-question benchmark.
- `sec/4_experiment.tex` benchmark prose still lists `smart-home living room`, but the current docs showcase replaced it with `healthy-breakfast-options`.
- `table/main_results.tex`, `table/ablation_results.tex`, and `table/task_breakdown.tex` still contain `\tbd{XX...}` placeholders for IQ/AA/Navigability and ablation scores.
- Table captions still mention a manual alignment "range" even though the latest user-confirmed figure is a single success rate: `17/24 (70.8%)`.
- Existing figures: `demo1.pdf`, `model.pdf`, and `Qualitative_Analysis.pdf`. Need decide whether to refresh qualitative figure from current demo assets or generate a new figure via ChatImage/image API.

## 2026-06-28 Paper completion resolution
- No local human-eval scores are available: `tmp/instance-experiment/scoring-sheet.csv` has empty human-score fields, so IQ/AA/Navigability tables should not claim annotator means.
- The final supported experiment numbers are:
  - real-provider benchmark size: 30 questions.
  - generated completion: 15/30 (50.0%).
  - strict case-level visual-alignment gate: 4/30 (13.3%).
  - manual visible-hotspot alignment audit: 17/24 (70.8%).
  - generated hotspot total: 90.
- Per-mode supported breakdown:
  - Infographic: 15 questions, 6/15 generated, 0/15 strict, 30 generated hotspots.
  - Map: 5 questions, 3/5 generated, 1/5 strict, 24 generated hotspots.
  - Scene: 10 questions, 6/10 generated, 3/10 strict, 36 generated hotspots.
- Alignment source distribution over 90 generated hotspots:
  - MiMo-Vision: 50 (55.6%).
  - LocateAnything layout-guided: 9 (10.0%).
  - LocateAnything crop: 2 (2.2%).
  - SAM3-refined planned: 16 (17.8%).
  - Planned fallback: 11 (12.2%).
  - Local OCR support: 2 (2.2%).
- Updated qualitative figure uses current docs demo assets, including `real-healthy-breakfast-options`, so it matches the latest public showcase.
