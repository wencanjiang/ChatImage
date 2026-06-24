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

## 2026-06-11

- Started MiMo vision integration and box/mask quality work.
- Confirmed current remote vision adapter already supports OpenAI-style `messages[].content` with `image_url`.
- Decided minimal integration path:
  - add `mimo-vision` defaults that reuse MiMo base URL/key and model `mimo-v2.5`
  - insert remote MiMo vision into the locate fallback chain before local OCR/planned
  - keep SAM3 strictly as mask refinement after boxes are chosen
- Current target chain:
  - `LocateAnything -> MiMo vision -> local-ocr -> planned -> SAM3`
- Implemented first pass:
  - `CHATIMAGE_VISION_MODE=mimo-vision` defaults to model `mimo-v2.5`.
  - MiMo vision reuses `CHATIMAGE_TEXT_API_KEY` when no dedicated vision key is set.
  - LocateAnything fallback chain now tries MiMo vision before local OCR/planned.
  - Added unit coverage for “Locate misses one module, MiMo vision fills it”.
- Corrected the chain config:
  - keep `CHATIMAGE_VISION_MODE=locateanything`
  - set `CHATIMAGE_VISION_FALLBACK_MODE=mimo-vision`
  - this keeps LocateAnything for coarse locate, MiMo vision for missed semantic boxes, and SAM3 for masks.

## 2026-06-13

- Implemented the first pass of the explicit visual target contract:
  - `visualEvidence`
  - `maskPolicy`
  - `spatialHint`
  - `locatorQueries`
  - `componentHints`
- The fields are now normalized on both model output and fallback specs, then propagated into:
  - visual-work image prompts
  - generic vision alignment prompts
  - LocateAnything/MiMo vision target descriptions
  - SAM3 refinement context
- Hotspot preview now keeps the target/mask crop shape instead of forcing a broad generic aspect ratio, so previews stay closer to the clicked target.
- Agent evaluation now checks target-contract quality in addition to visual mode, keyword coverage, hotspot transparency, detail quality, image loading, alignment quality, and diversity fields.
- Verification:
  - `npm.cmd run test:structure`
  - `npm.cmd run test:layout`
  - `npm.cmd run test:locateanything`
  - `npm.cmd run test:sam3`
  - `npm.cmd run test:render`
  - `npm.cmd run test:agent-eval`
  - `npm.cmd test`
- Full test suite result: `All tests passed.`
- Finished verification:
  - `npm.cmd test` passed.
  - `http://127.0.0.1:5178/api/vision/health` reports `visionMode=locateanything`, `visionFallbackMode=mimo-vision`, `visionModel=mimo-v2.5`, and CUDA-ready LocateAnything/SAM3.
  - Real West Lake audit chain is `locateanything>mimo-vision>sam3`, with `sourceCounts={"mimo-vision":7,"locateanything":1}` and `mask=8/8`.

## 2026-06-13 Visual Acceptance Fixes

- Fixed semantic visual layouts being strict-repaired back to grid/planned bounds:
  - `layout.visualMode` is preserved.
  - `scene` and `poster` are valid semantic layout variants.
  - `map/scene/poster` overlap is accepted when coarse bounds represent semantic regions and SAM3 masks provide the precise shape.
- Fixed SAM3 cutout loss:
  - `parseAlignmentResponse()` preserves `mask.cutoutImage`.
  - Hotspot preview can use server-side transparent SAM3 cutouts instead of broad rectangular crops.
- Improved scene/map title cleanup:
  - Removes request verbs like draw/generate/create and tails like "user can click..." or "I want to visit...".
  - Museum scene titles no longer look like raw prompt fragments.
- Improved West Lake map detail text so clicked regions have richer explanations while keeping 160 chars as a soft quality goal, not a hard failure.
- Updated the quality panel:
  - Semantic visual works no longer fail because coarse boxes overlap.
  - Semantic prompts are checked for target contracts and segmentation constraints instead of infographic card constraints.
- Real visual acceptance:
  - `sanqing-map`: OK, score 100, `map`, chain `locateanything > mimo-vision > sam3`, mask `7/7`.
  - `westlake-map`: OK, score 100, `map`, chain `locateanything > mimo-vision > sam3`, mask `6/6`.
  - `museum-scene`: OK, score 100, `scene`, chain `locateanything > mimo-vision > sam3`, mask `4/4`, guide robot preview uses transparent cutout.
- Full local suite:
  - `npm.cmd test` passed.

## 2026-06-14 West Lake Hotspot Coverage Fix

- Fixed the hotspot preview caption mojibake:
  - `涓讳綋鎶犲浘棰勮` is now rendered as `主体抠图预览`.
  - Map and route previews now use `区域上下文预览` / `路线区域预览` where a contextual crop is clearer than a transparent cutout.
- Expanded West Lake map fallback from a fixed small set to 9 concrete regions:
  - 西湖水域
  - 白堤断桥
  - 苏堤春晓
  - 三潭印月
  - 雷峰塔
  - 孤山
  - 宝石山
  - 曲院风荷
  - 柳浪闻莺
- Changed map structure limits so map-style outputs can use up to 12 clickable regions instead of being forced toward 5 or 6 modules.
- Added a West Lake completion pass in structure normalization: if the text model returns only part of the obvious West Lake regions, the missing named regions are appended before layout and alignment.
- Added semantic map layout slots for 孤山、宝石山、曲院风荷、柳浪闻莺 so planned fallback and visual prompts point to the right part of the map.
- Fixed LocateAnything semantic hints so detail words such as “说明” no longer misclassify landmarks as legend panels.
- Verification:
  - `npm.cmd test` passed.
  - Added a structure regression case where the model returns only 5 West Lake modules; normalization now expands it to 9.
  - Latest stored West Lake sample `ci_6411ca71-42e9-4819-a99e-21313d07b667` has 9 modules and 9 hotspots.
  - Provider chain is `locateanything > mimo-vision > sam3`.
  - Latest sample alignment warnings are empty.

## 2026-06-14 Organic Feathered Region Previews

- User feedback after the first fix: the rectangular context crop was still not good enough. Clicking 三潭印月 should show “just that island + its label”, as an **irregular shape** that hugs the region contour with a small adaptive buffer, not a flat rectangle and not a shredded transparent cutout. Three decisions confirmed with the user: (1) original-image fill + feathered soft edge, (2) buffer scales with mask area (√area × 15%), (3) the clickable hotspot itself should also use the mask polygon outline.
- Key finding: the data was already there. The SAM3 worker already extracts a real contour polygon (`cv2.findContours` + `approxPolyDP`) and a bounds-cropped alpha PNG for every region. The SVG polygon hotspot layer (`renderHotspotLayer` → `buildHotspotPolygonPoints`) already renders irregular clickable shapes. The only missing piece was the *preview*: it was forcing a hard rectangle.
- Implemented the organic feathered preview in `src/app.js`:
  - New `createOrganicPreview(result, hotspot, maskBounds, maskImage)`: draws the original image into a padded crop window, places the alpha mask proportionally, dilates it outward, then applies a `ctx.filter = blur(...)` for a feathered halo, and composites with `destination-in`. Result is an opaque, irregularly-shaped region image with a soft edge — the visual focus stays on 三潭印月 itself.
  - Buffer is adaptive: `bufferRatio = clamp(√(maskArea) × 0.15, 0.04, 0.22)`, so small regions get a minimum margin and huge regions don't bleed across the map.
  - Helpers: `dilateMaskAlpha` (cheap 8-direction stacked draw), `padNormalizedBounds`, `computeOrganicCropBounds`.
- `buildHotspotPreview` now has three branches: transparent cutout (independent subjects), organic feathered preview (map/scene regions with a mask, once the async canvas build finishes), and a mask-CSS fallback while the organic preview is still generating (already irregular via CSS `mask-image`, just hard-edged). It no longer blanks `maskImage` for context crops.
- `hydrateHotspotCutoutPreview` now generates either an organic preview or a transparent cutout depending on `strategy.preferContextCrop`; the cache key includes the kind so the two do not collide.
- `src/render.js` `renderHotspotPreview` gained an `organicUrl` branch rendering `.detail-preview-organic` (transparent container, `drop-shadow` so the soft halo reads against the panel).
- Polygon hotspot layer was already correct and untouched — `region.mask.polygon` flows through `deriveHotspots` to `hotspot.mask.polygon`, and `renderHotspotLayer` renders it as an SVG `<polygon>`. Verified the chain is intact.
- `styles.css`: added `.detail-preview-organic` / `.detail-preview-organic-image` styling.
- Verification:
  - `node --check src/app.js src/render.js src/preview-strategy.js` passed.
  - `npm.cmd run test:preview-strategy` passed (16/16).
  - `npm.cmd run build` rebuilt the bundle.
  - `npm.cmd test` → `All tests passed.`
  - 5178 serving the new code confirmed (`/src/app.js` contains `createOrganicPreview` and `organicUrl`).

## 2026-06-14 Organic Preview Regression Fix

- Continued after the previous agent's organic-preview pass and verified the real UI in the browser.
- Found two concrete regressions:
  - `preview-strategy` treated `maskPolicy=subject` as an independent transparent cutout. That is wrong for maps because 三潭印月、雷峰塔、宝石山 and similar map regions often use subject masks but should still render as organic region previews.
  - `.detail-preview-crop img` had higher CSS specificity than `.detail-preview-organic-image`, so the already-generated organic PNG was incorrectly positioned like the full source image. The result was a huge off-screen image and a mostly blank/rectangular preview.
- Fixes:
  - Transparent cutouts are now allowed only for explicit independent `regionKind` values: `object`, `object-with-label`, `person`, `product`.
  - Map `landmark/building/mountain` regions with `maskPolicy=subject` now stay on the context/organic preview path.
  - Organic preview CSS now uses `.detail-preview-organic .detail-preview-organic-image` so it overrides the generic crop rule.
- Added regression coverage:
  - `tests/preview-strategy.test.js` now covers map subject masks and missing regionKind + subject mask.
  - `tests/render.test.js` now covers the `organicUrl` render branch.
  - `tests/browser.test.js` now checks computed CSS for organic preview images, specifically `position: static` and `max-width: 100%`.
- Browser verification:
  - Opened `http://127.0.0.1:5178/`, restored the latest West Lake history item, clicked 三潭印月.
  - Detail preview rendered as `.detail-preview-organic`, not `.detail-preview-cutout`.
  - Organic image source was a generated `data:image/png`, and computed layout was `position: static` with normal dimensions.
- Verification:
  - `npm.cmd run test:preview-strategy` passed.
  - `npm.cmd run test:render` passed.
  - `npm.cmd run test:browser` passed.
  - `npm.cmd run build` passed.
  - `npm.cmd test` passed.


## 2026-06-15 Continued Real Visual QA

- Resumed from an unfinished edit where `src/app.js` had duplicate `normalizeBounds` / `padNormalizedBounds` declarations after extracting preview helpers. Fixed the syntax break first.
- Tightened organic preview feathering so previews are less rectangular while keeping soft edges.
- Improved map route previews by using the union of SAM mask bounds, SAM input bounds, and planned layout bounds. This keeps route labels and a little terrain context in the preview.
- Changed Sanqing lodging from a generic legend target into an `object-with-label` target: visible house/bed/hotel marker plus a short lodging label. Map `object-with-label` previews use organic context previews, while scene `object-with-label` targets such as the guide robot still use transparent cutouts.
- Added SAM3 fallbacks:
  - very low confidence route masks fall back to semantic corridor bounds;
  - low confidence lodging object masks fall back to semantic bounds;
  - landmark text containing “桥” no longer triggers route fallback unless the module is actually route/axis.
- Strengthened route labels so exact target titles like `阳光海岸栈道` must remain visible, not be replaced by vague aliases.
- Verification:
  - `sanqing-map`: OK / score 100.
  - `westlake-map`: OK / score 100.
  - `museum-scene`: OK / score 100.
  - `npm.cmd test`: passed.
  - `npm.cmd run build`: passed.
- Note: one all-cases serial real visual run timed out before writing a case result, likely due a slow upstream real generation. The same three cases were then run individually and all passed.


## 2026-06-16 Semantic Locate Hit Quality Pass

- Implemented LocateAnything worker multi-query candidate selection:
  - card modules now try numbered-card, title-card, and semantic-card prompts;
  - map/scene modules keep semantic-region, regionPrompt, target-contract, and locator-query prompts;
  - crop prompts now preserve original Chinese `label` and `regionPrompt`.
- Added candidate scoring before accepting a box:
  - rewards planned-region overlap and center proximity as a soft prior;
  - penalizes header strips, cross-panel strips, tiny cards, oversized card boxes, and huge non-route regions;
  - allows thin route boxes when the module is route-like.
- Preserved `phraseKind`, `candidateScore`, and `candidateDiagnostics` through `server/locateanything.js`.
- Added `tests/locateanything-worker.test.js` and `npm run test:locateanything-worker`.
- Verification so far:
  - `python -m py_compile scripts/locateanything_worker.py` passed.
  - `npm.cmd run test:locateanything-worker` passed.
  - `npm.cmd run test:locateanything` passed.
- One useful failed test occurred before the crop prompt fix: the crop prompt did not include 三潭映月. Fixed by explicitly adding target name and original visual description.
- Online Kubernetes sample #1:
  - Generated successfully in the fixed frontend service.
  - `sourceCounts={"locateanything":3,"planned":4}`.
  - Center-click audit had no misses.
  - Found two remaining root causes: `TextEncodeInput` for two LocateAnything modules, and strict repair reverting high-score narrow cards.
- Fixes after online sample #1:
  - Added LocateAnything processor retry path for `TextEncodeInput`.
  - Added tokenizer-safe Unicode cleanup and ASCII last-resort prompt.
  - Fixed worker stdout/stderr/JSONL encoding for Windows.
  - Changed `repairClickableBounds` so valid semantic boxes are not padded wider than necessary.
  - Added `testNarrowLocateCardsDoNotExpandIntoStrictRepair`.
- Reused the real Kubernetes image for `/api/vision` after fixes:
  - `providerChain=["locateanything","mimo-vision","sam3"]`.
  - `sourceCounts={"mimo-vision":3,"locateanything":3}`.
  - `fallbackModules=[]`.
  - `warnings=[]`.
  - Applying the returned alignments to frontend layout produced `strictRepairedModules=[]`.
- Final verification:
  - `npm.cmd test` passed.
  - Fixed service remains on `http://127.0.0.1:5178/`.

## 2026-06-16 Online Coverage and Preview QA

- Fixed a second-stage alignment regression found in real Kubernetes/RAG samples:
  - vision providers and SAM3 were returning usable bounds/masks;
  - frontend strict repair used the tiny `core.validateLayoutRegions` overlap threshold and reverted good neighboring boxes back to planned bounds;
  - strict repair now only runs when semantic alignment validation fails with heavy overlap, so reasonable partial overlap is kept and later verified by hit-test.
- Added regression coverage:
  - partial overlap is preserved for hit-test based persistence;
  - true heavy overlap still triggers local strict repair;
  - unaffected aligned modules and masks are preserved when one conflicting module is repaired.
- Fixed `tests/build.test.js` hanging on Windows/Node keep-alive sockets by closing idle/all server connections in the test helper.
- Online cases generated through the fixed `http://127.0.0.1:5178` service and saved to history:
  - `ci_7796c1db-2086-4555-9fb4-81699ce923d8`: Kubernetes 部署架构, 5/5 visual boxes, 5/5 masks, hit-test OK.
  - `ci_384b76a3-39bb-401c-b1eb-66ee4dcad848`: RAG 检索增强流程, 8 hotspots, 8/8 masks, hit-test OK.
  - `ci_a1396acd-de94-4ec3-a229-e113306bf8db`: 西湖手绘旅游地图, 9 hotspots including 柳浪闻莺/孤山/宝石山/曲院风荷, 9/9 masks, hit-test OK.
  - `ci_32433547-07a9-4b73-9ffc-e508dde4e317`: 未来博物馆场景, 4/4 visual boxes, 4/4 masks, guide robot uses cutout preview.
- Browser audit clicked every hotspot in those four saved results:
  - all details opened successfully;
  - detail text was consistently >600 chars in the audited cases;
  - map/infographic region previews render as organic/soft-edge previews, and independent scene subjects render as cutouts.
- Verification:
  - `npm.cmd test` passed.
  - Fixed service was restarted only on `http://127.0.0.1:5178/`.

## 2026-06-16 SAM Input Context Expansion

- Root cause from the latest visual review: several incomplete previews were not caused by SAM3 itself. LocateAnything/MiMo vision sometimes gave a box that touched only the visible core of the target, so SAM3 had too little surrounding context to include attached labels, edges, or nearby route text.
- Fix: keep the stable click bounds unchanged, but expand the bounds passed into SAM3 before segmentation.
  - routes/axes get more vertical and horizontal context;
  - `object-with-label` / `subject-with-label` get extra room for the subject plus attached short label;
  - landmarks, buildings, mountains, water, and full regions get moderate organic-region context;
  - explicit component hints are expanded too, so `robot + AI label` style targets do not get clipped before SAM3 sees them.
- Added regression coverage to verify:
  - click bounds stay equal to the original LocateAnything/vision bounds;
  - SAM input bounds become larger than click bounds;
  - fallback masks use the expanded SAM input bounds;
  - explicit object + label components are expanded in the full refine path.
- Verification:
  - `node .\tests\sam3.test.js` passed.
  - `node .\tests\locateanything.test.js` passed.
  - `node .\tests\preview-strategy.test.js` passed.
  - `node .\tests\alignment.test.js` passed.
  - `npm.cmd test` passed.
  - Fixed service restarted at `http://127.0.0.1:5178/`.
  - Online scene case `ci_4e587574-5dbb-4b71-a00e-d62c25c57f6a` generated successfully with `providerChain=["locateanything","mimo-vision","sam3"]`, 4/4 masks, and hit-test OK.

## 2026-06-16 LocateAnything Subject Scoring and Online Audit

- Found two remaining locate-quality issues from real samples:
  - LocateAnything could score a tiny attached label as a strong `object-with-label` result because it overlapped the planned area.
  - `scene/map/poster` candidates were always sent to MiMo vision fallback, so even good LocateAnything results were overwritten.
- Fixes:
  - Penalize subject-like candidates that are too small, too narrow, or much smaller than the planned semantic region.
  - Delay early return for weak subject candidates so crop search gets a chance to find the full object.
  - Keep high-quality LocateAnything scene/map/poster candidates; call MiMo only for low-score, layout-guided, tiny-subject, or huge non-background candidates.
  - Updated the online audit script to click each hotspot's backend `clickablePoint` instead of blindly clicking the center. This matters for large map/background regions that intentionally overlap foreground landmarks.
- Verification:
  - `python -m py_compile .\scripts\locateanything_worker.py` passed.
  - `node .\tests\locateanything-worker.test.js` passed.
  - `node .\tests\locateanything.test.js` passed.
  - `node .\tests\sam3.test.js`, `alignment.test.js`, and `preview-strategy.test.js` passed.
  - `npm.cmd test` passed before online testing.
  - Reused real museum image `ci_4e587574-5dbb-4b71-a00e-d62c25c57f6a` for `/api/vision`: LocateAnything now keeps `导览机器人` and `核心展品`; the old tiny robot-label candidate is scored `0`.
  - Reused real West Lake image `ci_a1396acd-de94-4ec3-a229-e113306bf8db` for `/api/vision`: 8/8 masks, no planned fallback.
  - Generated new visible online map case `ci_b6301c2c-065a-4216-9802-8e94ff1f24ba`: 9 hotspots, 9 masks, hit-test OK, no warnings.
  - Browser audit clicked all 9 saved hotspots using `clickablePoint`: 9/9 opened their own detail title, all previews used `detail-preview-organic`, detail text was about 650+ chars each.
  - Fixed service remains only on `http://127.0.0.1:5178/`.

## 2026-06-16 Security Hardening Gap Closure

- Checked the handoff notes and closed the remaining hardening/test gaps without changing the visual pipeline or font.
- Image API key handling:
  - default image calls no longer put `key` in the URL query string;
  - upstream-required auth remains the bare `Authorization: <key>` header;
  - `CHATIMAGE_IMAGE_KEY_IN_QUERY=1` keeps a compatibility switch for legacy upstream behavior.
- CSRF/origin:
  - cross-site browser requests with missing `Origin`/`Referer` but `Sec-Fetch-Site: cross-site` are rejected;
  - local tooling requests without browser headers still work.
- Static cache:
  - only hash-named `dist/` assets get long immutable cache;
  - non-hash files and source maps stay `no-cache`.
- Reliability:
  - request errors already logged with method/path/status;
  - added process-level logging for `unhandledRejection` and `uncaughtException`;
  - improved graceful shutdown by closing idle connections and forcing remaining HTTP connections before exit;
  - attachment ID fallback now uses `crypto.getRandomValues()` when `randomUUID()` is unavailable.
- Tests fixed/updated:
  - updated proxy integration expectations after removing query-string image keys;
  - hardened server close helpers in tests to avoid Windows keep-alive hangs.
- Verification:
  - `node .\tests\proxy-integration.test.js` passed.
  - `node .\tests\server.test.js` passed.
  - `node .\tests\server-modules.test.js` passed.
  - `node .\tests\files.test.js` passed.
  - `npm.cmd test` passed.
  - `npm.cmd run build` passed.

## 2026-06-17 Hotspot Preview Offset Fix

- Fixed a preview-layer offset issue without changing hotspot click bounds or the LocateAnything/SAM3 provider chain.
- Root cause:
  - Some detail previews were built from an already-cropped organic/cutout PNG, but the render layer still carried original-image crop variables. That made tests and some UI states treat a finished preview as if it were still a full-image crop.
  - For map/scene targets, SAM3 can return a usable but smaller mask inside a larger semantic hotspot. If the preview follows only that small shifted mask, the detail preview looks offset or incomplete even though the click area is correct.
- Changes:
  - Finished `organicUrl` and `cutoutUrl` previews now render with a neutral `{x:0,y:0,width:1,height:1}` crop, so the UI does not double-crop an already-cropped PNG.
  - Map/scene/poster context previews now union the mask bounds, hotspot bounds, SAM input bounds, and layout bounds when choosing the preview source area.
  - If a map/scene mask is much smaller than the hotspot or its center is noticeably shifted, the preview falls back to a soft contextual shape instead of exposing the small shifted mask.
  - Added a browser regression case for a map hotspot whose mask is small and offset.
- Verification:
  - `node .\tests\browser.test.js` passed.
  - `node .\tests\preview-strategy.test.js` passed.
  - `node .\tests\render.test.js` passed.
  - `node .\tests\service.test.js` passed.
  - `npm.cmd test` passed.
  - `npm.cmd run build` passed.

## 2026-06-17 Backend Bug Hardening Pass

- Continued the bug audit handoff and fixed high-confidence reliability/security issues without changing frontend features or fonts.
- Fixes:
  - `readJson()` now stops accumulating oversized request bodies once the 413 limit is hit, clears buffered data, and destroys the request.
  - Upstream non-OK and non-JSON provider errors no longer echo raw upstream response bodies back through error messages.
  - Frontend progress/status updates now tolerate missing status/progress DOM nodes instead of throwing a null-reference error.
  - LocateAnything worker keeps a single public `build_semantic_hint()` implementation, with a regression test to prevent future accidental overrides.
- Previously confirmed fixes in this pass:
  - local OCR temp directories are cleaned in `finally`;
  - LocateAnything and SAM3 request timeouts no longer kill the shared long-lived worker;
  - worker stdin writes are guarded when the child process is unavailable.
- Verification:
  - `node .\tests\server-modules.test.js` passed.
  - `node .\tests\api-adapter.test.js` passed.
  - `node .\tests\locateanything-worker.test.js` passed.
  - `node .\tests\locateanything.test.js` passed.
  - `node .\tests\sam3.test.js` passed.
  - `node .\tests\browser.test.js` passed.
  - `node .\tests\browser-api-alignment.test.js` passed.
  - `node .\tests\security.test.js` passed.
  - `npm.cmd test` passed.
  - `npm.cmd run build` passed.

## 2026-06-17 Online Multi-Case Visual Regression Pass

- Continued online testing on the fixed service `http://127.0.0.1:5178/`; the service was restarted in place only, and SAM3/LocateAnything stayed resident after restart.
- Online cases generated and browser-audited successfully:
  - `ci_b437fe71-f010-47fe-bcea-ada525fdf272`: container vs VM comparison, fixed title and modules (`隔离模型`, `启动速度`, `资源占用`, `运维方式`, `适用场景`), 5/5 hotspot clicks passed.
  - `ci_a2119f43-bbd1-4ec0-9d51-0d47594639aa`: campus hand-drawn map, fixed explicit clicked regions (`图书馆`, `体育馆`, `学生宿舍`, `食堂`, `湖边草坪`, `校史馆`), 6/6 hotspot clicks passed.
  - `ci_58269c33-eb74-45cb-918b-8a897dd00bfd`: smart factory safety scene, 6/6 hotspot clicks passed; `应急出口` preview now includes the exit sign and doorway instead of a broken partial sign.
  - Re-audited prior successful architecture/funnel cases: `ci_65bfb019-d921-40fb-8cf9-74e29f79c39b`, `ci_cb1ba4d6-0d20-4b15-9c12-4d0cb293fb01`.
- Fixes from this pass:
  - Generic comparison questions with explicit dimensions now use a compare-matrix fallback instead of the five-part `背景/现状/驱动/挑战/趋势` template.
  - Map/poster/scene target extraction now recognizes `点击 A、B、C 可以看详情` and `需要展示 A、B、C`, and no longer splits words like `柔和光晕`.
  - Known map templates such as West Lake keep their richer full template before generic target-list fallback.
  - Scene targets such as `导览机器人`, `应急出口`, `入口`, and signage now prefer `subject-with-label` so SAM3 keeps the object plus nearby label/sign.
- Known remaining issue:
  - The smart sleep lamp poster case failed twice during image generation with local `fetch failed` before alignment. Structure extraction is now correct, but the upstream image request path still needs better logging/retry diagnosis.
- Verification:
  - `node .\tests\structure.test.js` passed.
  - `node .\tests\service.test.js` passed.
  - `node .\tests\preview-strategy.test.js` passed.
  - `node .\tests\agent-evaluation.test.js` passed with all 13 cases at score 100.
  - `npm.cmd run build` passed.
  - `npm.cmd test` passed.

## 2026-06-19 Composer, Title Cleanup, and Online Recovery Pass

- Continued from a handoff where three visible issues remained: submitted prompts had weak feedback, scene titles could leak instruction wording, and the detail panel could sit too low near the composer.
- Fixes:
  - Submitted prompts now clear the composer immediately, auto-resize the textarea, and render a small submitted-question bubble during generation and on completed results.
  - Scene/map/poster fallback summaries no longer prepend the title, fixing strings like `用横切面剖视图用可点击对象...`.
  - Instruction-style titles now strip leading `用...` where it means “use this visual form”, and `用横切面剖视图展示智能仓库` becomes a subject title like `智能仓库横切面剖视图`.
  - Explicit target extraction now removes backdrop subjects from both comma-click prompts and colon-list prompts, so `展示城堡：城墙、瞭望塔...` no longer creates a giant `城堡内部结构` hotspot.
  - Image task creation and image detail polling now retry transient upstream payload failures such as `Connection timed out` and `Operation timed out`, instead of treating the first gateway timeout as final.
- Online test notes:
  - Real image generation on `http://127.0.0.1:5178/` was attempted repeatedly with the castle cross-section case, but the upstream image gateway returned repeated 30s CURL connection timeouts before producing a task id.
  - A server-visible fallback result was saved for inspection: `ci_online_mock_1781865626762`.
  - Browser audit restored that result from the real history list and clicked all 6 hotspot centers (`城墙`, `瞭望塔`, `礼拜堂`, `大厅`, `地牢`, `马厩与水井`); all opened the matching detail panel, the panel stayed above the composer, and previews rendered with `detail-preview-organic`.
- Verification:
  - `node .\tests\structure.test.js` passed.
  - `node .\tests\render.test.js` passed.
  - `node .\tests\error-paths.test.js` passed.
  - `node .\tests\server.test.js` passed.
  - `node .\tests\browser.test.js` passed.
  - `node .\tests\browser-api-alignment.test.js` passed.
  - `npm.cmd run build` passed.

## 2026-06-19 Online Multi-Case Instance Testing Pass

- Continued online testing directly against the fixed service `http://127.0.0.1:5178/`; no extra frontend ports were started.
- Real online cases now visible in Recent and audited:
  - `ci_3034dc27-c2fe-4d3f-959e-f3da47c69dd9`: airport terminal guide, 6/6 hotspot clicks passed, LocateAnything + SAM3 used with no fallbacks.
  - `ci_452d2f5e-995d-4f2e-962f-95b4d1f135bd`: public health poster, 5/5 hotspot clicks passed, LocateAnything + SAM3 used with no fallbacks.
  - `ci_4f0df626-6c49-41dd-82df-e99a814c3c04`: smart home scene, 6/6 hotspot clicks passed, remote vision + SAM3 previews rendered.
  - `ci_5916cc10-8578-419e-a5b8-0c7e7bfff4d4`: SQL vs NoSQL comparison, 6/6 hotspot clicks passed; visual alignment fell back to planned for all regions, so this is an interaction pass rather than a visual-locate pass.
  - `ci_e45c4038-cbda-4bf7-89e2-0be9e4adff1c`: OAuth 2.0 authorization-code flow, generated successfully after image-prompt safety rewrite; restored from history and audited 5/5 hotspot clicks.
  - `ci_a81db6cb-afc5-44c7-a9d1-58e2047dad5a`: ecommerce conversion funnel, 5/5 hotspot clicks passed; all regions used planned layout.
  - `ci_3f518825-84a7-4d88-a02e-31564447fdbb`: Kubernetes deployment architecture, generated after safe prompt fallback and ambiguous 400 retry; restored from history and audited 5/5 hotspot clicks.
- Fixes from this pass:
  - Image API requests now always use the configured upstream-supported size (`CHATIMAGE_IMAGE_API_SIZE`, default `1024x1024`) instead of leaking layout dimensions like `1600x900`.
  - Added compact API image prompts for normal generation, while keeping richer style prompts available elsewhere.
  - Added safety rewrites for image-only prompts: OAuth/auth flows use a proven minimal login-collaboration prompt; Kubernetes/container orchestration uses a neutral system-component prompt. User-facing titles/details remain domain-specific.
  - Image task creation now retries ambiguous bare `code=400` payloads, while still not retrying clear parameter/model/auth errors.
  - K8s module titles were shortened (`服务入口`, `配置密钥`) to avoid text-budget failures.
  - Online click auditing now scrolls each hotspot into view, checks `elementFromPoint`, records center-hit diagnostics, and can restore/audit an existing history item without regenerating.
  - Browser image-error test now uses a local 404 image URL instead of depending on `example.com`.
- Known remaining issues:
  - Coffee scene and campus-map prompts are still unstable with the upstream image service; campus sometimes accepts the task but times out. These should stay in the online regression pool but should not be marked as passed yet.
  - Some comparison/funnel cases are interaction-correct but rely on planned hotspots rather than successful visual locating. This is acceptable as a fallback, but not evidence that semantic visual alignment is solved.
- Verification:
  - `node .\tests\structure.test.js` passed.
  - `node .\tests\layout.test.js` passed.
  - `node .\tests\error-paths.test.js` passed.
  - `node .\tests\browser-history.test.js` passed.
  - `node .\tests\browser-image-error.test.js` passed.
  - `npm.cmd test` passed.
  - `npm.cmd run build` passed.
  - Final service restart confirmed `http://127.0.0.1:5178/` is listening with LocateAnything and SAM3 resident models loaded.

## 2026-06-22 Explicit Target Cleanup Pass

- Continued from the latest online instance test where the airport-terminal guide was technically clickable but had two wrong hotspots: `查看说明` and `要求`.
- Root cause:
  - The explicit-target extractor treated `点击查看说明` as a visual target.
  - The colon-list parser stripped `要求每个区域...` too late, leaving a dangling `要求` item after list splitting.
  - Existing online checks only verified that hotspots could be clicked, so semantically wrong but clickable targets slipped through.
- Fixes in progress:
  - Instruction-only target labels such as `查看说明`, `查看详情`, `要求`, `详情`, `每个区域` are now dropped during explicit target normalization.
  - Map/scene/poster model-returned modules are filtered for instruction-only fake targets before layout and hotspot alignment.
  - If a model omits explicit user targets after filtering, the structure layer fills missing targets with semantic target modules.
- Verification so far:
  - `node --check src\structure.js` passed.
  - `npm.cmd run test:structure` passed, including the airport guide regression.

## 2026-06-22 Partial Alignment and Online Instance Pass

- Continued the explicit-target cleanup and online validation on the fixed service `http://127.0.0.1:5178/`; no extra frontend ports were started.
- Fixes:
  - Added title cleanup for `手绘一张...` / `绘制一张...`, so prompts like `手绘一张大学校园导览地图...` now save as `大学校园导览地图` instead of copying the raw instruction into the title.
  - Added a regression test for the hand-drawn campus-map title.
  - Increased bottom safe spacing around the fixed composer so lower hotspots are not hidden behind the input bar during click audits or normal interaction.
  - Fixed alignment parsing so one low-confidence module no longer throws away the entire visual alignment result. Low-confidence modules are recorded in `rejectedModules` and fall back individually, while successful LocateAnything/SAM3 modules keep their grounded boxes and masks.
  - Updated the online runner with stricter semantic target checks for airport/campus and added scene/map cases (`museum-scene`, `west-lake-map`).
- Online instance results:
  - `campus-guide-map`: OK, score 100, 7 hotspots, title `大学校园导览地图`; report at `tmp/online-common-case-test-campus-after-restart/online-common-case-report.md`.
  - `museum-scene`: initially failed at score 90 because `观众` low confidence caused global `alignment-fallback`; after the parser fix it passed score 100 with `provider=locateanything`, chain `locateanything > mimo-vision > sam3`, 4/4 masks; report at `tmp/online-common-case-test-museum-after-partial-align-fix/online-common-case-report.md`.
  - `airport-terminal-guide`: one run timed out at image generation, then rerun passed score 100, 6 hotspots, title `机场航站楼指引图`; report at `tmp/online-common-case-test-airport-after-partial-align-fix/online-common-case-report.md`.
  - `trading-agent`: OK, score 100, 6 hotspots; report at `tmp/online-common-case-test-expanded-after-restart/online-common-case-report.md`.
  - `west-lake-map`: OK, score 100, 9 hotspots, `provider=locateanything`; report at `tmp/online-common-case-test-expanded-after-restart/online-common-case-report.md`.
- Verification:
  - `node --check src\structure.js` passed.
  - `node --check src\alignment.js` passed.
  - `node --check src\service.js` passed.
  - `npm.cmd run test:structure` passed.
  - `npm.cmd run test:layout` passed.
  - `npm.cmd run test:quality` passed.
  - `npm.cmd run test:agent-eval` passed with all 13 cases at score 100.
  - `npm.cmd run test:alignment` passed.
  - `npm.cmd run test:service` passed.
  - `npm.cmd run test:sam3` passed.
  - `npm.cmd run test:browser-api-alignment` passed.
  - `npm.cmd run test:browser` passed; the logged 503 is the expected missing-key error-path case inside that test.
- Current service:
  - Final restart confirmed PID `159872` listening on `127.0.0.1:5178`.
  - LocateAnything and SAM3 resident models loaded successfully.

## 2026-06-22 Detail Preview and Overlap Hit-Test Pass

- Fixed the missing "区域上下文预览" issue in the hotspot detail panel.
  - Root cause: context previews could receive an empty/invalid CSS mask, producing `mask-image: url("")` and making the loaded image invisible.
  - Fix: map/scene context preview fallbacks now render a soft original-image crop first and never depend on CSS masks; invalid preview masks are rejected in `renderHotspotPreview`.
- Improved overlapping hotspot behavior.
  - New results now preserve module `priority` on hotspots.
  - Hit-test z-index repair no longer lets overlapping peers keep raising each other until a later/background module wins.
  - Existing history results are improved at render time: z-index now combines semantic layer, module order, and only a small explicit z-index bonus.
  - Landmark/building `full-region` hotspots now render above water/background regions instead of being treated as background.
- Updated tests and audit tooling.
  - Browser/render tests now cover invalid mask fallback and map context preview visibility.
  - Agent evaluation and online/history audit tools now use 9-point click sampling, matching the product rule that partial overlap is allowed as long as each hotspot has a reachable clickable area.
- Online/visual verification on fixed `http://127.0.0.1:5178/`:
  - History audit `tmp/history-preview-audit-20260622-final`: 西湖 9/9, 未来博物馆 4/4, 机场 6/6, 未来博物馆 4/4 all passed; no empty mask preview.
  - New online generation `tmp/online-single-museum-after-preview-zfix`: future museum scene generated, saved to Recent as `ci_e576425d-13b9-4903-b648-426577d18687`; 4/4 hotspot clicks passed, previews visible. Report status is warn only because the alignment summary still counts some layout-guided LocateAnything modules as planned-like.
- Verification:
  - `npm.cmd run test:render` passed.
  - `npm.cmd run test:layout` passed.
  - `npm.cmd run test:browser` passed.
  - `npm.cmd run test:browser-api-alignment` passed.
  - `npm.cmd run test:agent-eval` passed.
  - `npm.cmd test` passed.
- Current service:
  - PID `11020` is listening on `http://127.0.0.1:5178/`.
  - `CHATIMAGE_VISION_MODE=locateanything`; LocateAnything and SAM3 are configured.

## 2026-06-23 Demo Refresh and Latest Multi-Instance QA

- Fixed the showcase page so demos are truly interactive instead of static lightbox screenshots.
  - `docs/index.html` now loads per-demo JSON, draws clickable hotspot overlays, and updates a region-specific detail panel.
  - Replaced the broken/garbled public examples with 7 curated demos: agent workflow, RAG pipeline, OAuth2 flow, West Lake map, future museum scene, smartwatch exploded view, and ecommerce funnel.
  - `scripts/generate-doc-demos.js` now writes reusable SVG + JSON state plus `docs/assets/demos/manifest.json`.
- Added regression coverage:
  - `tests/docs-demos.test.js` verifies all public demo JSON/SVG references exist, hotspot state is complete, and the docs page is interactive.
  - `tests/structure.test.js` now prevents campus-map prompts from turning `点击区域后解释用途和风貌` into a fake hotspot.
- Latest preserved multi-instance run:
  - Artifact: `tmp/latest-multi-instance-analysis-20260623-212957-selected`
  - 9/9 selected cases passed at average score 100.
  - Each case has `state.json`, `summary.json`, and screenshot under `cases/<case-id>/`.
- Verification:
  - `npm run test:structure` passed.
  - `npm run test:agent-eval` passed with all 13 cases at score 100.
  - `npm run test:docs-demos` passed.
  - `npm run test:browser` passed; the logged `/api/llm -> 503` is the expected missing-key error-path case.
  - `npm run test:render` passed.
  - `npm run test:sam3` passed.
  - `npm run test:preview-strategy` passed.
  - `npm run build` passed.
