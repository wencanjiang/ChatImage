# Demo Eligibility Notes

## Purpose
Record which everyday ChatImage prompts are suitable for strict visual grounding demos. A public demo must pass real generation plus strict visual alignment: LocateAnything first, then SAM mask refinement with no internal holes and an outward-expanded preview.

## Accepted Task Families
- Coherent spaces with medium or large objects, such as cafes, museums, kitchens, living rooms, classrooms, studios, and markets.
- Hand-drawn maps with large named regions, paths, buildings, water, or landmarks remain promising, but old map exports must be regenerated under the current SAM gate before publication.
- Single large object breakdowns where parts are visually prominent remain promising, but guitar/camera-style part labels still need strict grounding validation before publication.
- Sparse explanatory diagrams with few large regions and concrete visual targets remain candidates only when every region is visibly grounded and SAM-backed.

## Accepted Current Demos
- `west-lake-tour-map`: accepted after regeneration on 2026-06-26. Nine map hotspots have visual grounding sources plus SAM mask, cutout, organic preview, and expanded organic bounds.
- `smart-home-living-room`: accepted. Six hotspots have visual grounding sources plus SAM mask, cutout, organic preview, and expanded organic bounds.
- `boutique-coffee-scene`: accepted. Six cafe-space hotspots pass the current strict export gate.
- `sunny-reading-nook`: accepted. Five medium/large visible objects pass the current strict export gate.
- `record-store-corner`: accepted. Five record-store regions pass the current strict export gate.
- `plant-care-corner`: accepted. Five plant-care objects pass the current strict export gate.

## Risky Task Families
- Dense flat-lay many-small-item scenes, such as emergency kits, fridge containers, skincare bottles, stationery, and small tools.
- Prompts that invite helper panels, legends, notes, input context, external tools, source context, or other non-visual scaffold modules.
- Generic planning boards where modules are abstract actions instead of visible objects.

## Observed Failures
- Old `west-lake-tour-map` export `ci_656c1418-06bf-40ff-b547-43775450873d`: rejected under the current strict export gate. It had visual sources but no SAM mask/cutout/organic preview for its nine hotspots. Replaced by regenerated `ci_2e77c4cd-1f49-405f-832f-b3f6af1a0d74`.
- `household-budget-plan`: rejected under the current strict export gate. Four hotspots had empty grounding source values and all hotspots lacked SAM mask assets.
- `future-museum-scene`: rejected under the current strict export gate. The old export lacked SAM mask assets for its four hotspots.
- `compact-home-office-desk`: rejected. LocateAnything fell back to Mimo/planned, and the first run exposed a SAM environment issue before `cv2` was installed.
- `family-emergency-kit`: rejected. SAM could refine planned boxes, but LocateAnything did not first localize several dense small objects.
- `fridge-meal-prep-shelf`: rejected. Structure added scaffold modules (`Input context`, `External tools`, `Legend`) and LocateAnything fell back to Mimo for real fridge zones.
- `farmers-market-shopping-map`: rejected. Several modules lacked real SAM mask output or fell to planned-derived sources.
- `home-kitchen-cooking-zones`: rejected. Modules were refined from planned boxes rather than primary visual grounding.
- `acoustic-guitar-anatomy`: rejected. Part-level targets did not pass the strict primary grounding plus SAM mask chain.
- `neighborhood-library-map`: rejected. The run included Mimo/planned fallback and prompt-fragment artifacts before the truncation filter fix.

## Pipeline Fixes
- Added a hard scaffold-module filter after structure generation and before layout/grounding.
- The filter removes meta modules such as `Legend`, `Input context`, `External tools`, `Notes`, `Reference`, `Source`, `Disclaimer`, and abstract panel prompts.
- Fixed an over-aggressive truncated-question filter: legal object titles that also appear in the user question must be kept. Only strong prompt-fragment signals such as leading `-` fragments or imperative prompt starts like `Create a ...` are removed.
- Repaired the SAM Python environment with `opencv-python-headless==4.10.0.84` and `numpy==1.26.4`.
- Connected `scripts/generate-doc-demos.js` to the current strict visual-alignment gate. Any stale stored ChatImage that lacks SAM mask/cutout/organic assets is now skipped instead of refreshed into `docs/assets/demos`.
- Manifest `sourceCounts` are now recomputed from exported hotspot `alignmentSource` values, with missing values counted as `unknown`.
