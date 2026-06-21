# Task Plan: ChatImage UI and Prompt Polish

## Objective

Implement the requested UI and prompt improvements:

- Progress stepper only visible while generating, then fade/collapse after completion.
- Hide full stepper when restoring history.
- Replace text "放大 / 保存" actions with icon-only buttons and tooltips.
- Improve history list hierarchy.
- Strengthen image prompt hierarchy and anti-template constraints.
- Improve image frame presentation with background band, shadow, and selected hotspot state.

## Phases

1. Inspect current render/app/style/test dependencies. `complete`
2. Implement UI behavior and styling changes. `complete`
3. Strengthen prompt constraints and tests. `complete`
4. Run targeted unit/browser/build tests and inspect screenshot. `complete`

## Notes

- Keep edits scoped to existing zero-dependency frontend.
- Preserve accessibility labels for icon-only buttons.
- Do not alter backend persistence unless needed.

## Completed

- Progress stepper now appears during generation, marks completion briefly, then fades/collapses.
- History restore explicitly hides the full progress stepper.
- Result actions are icon-only zoom/download buttons with tooltips and aria labels.
- Image frame uses a non-layout-affecting visual background band and shadow.
- Active hotspot is visually selected without affecting normalized bounds.
- History list has index badges, stronger active state, and two-line metadata.
- Style image prompt now reinforces information hierarchy and anti-template composition.
- Tests passed after fixing an image height rounding regression by making images fill the aspect-ratio stage.

## Completed: History Actions and Visual Composition

- Added full-stack history metadata actions:
  - `DELETE /api/chatimages/:id` removes a saved result and cascades hotspot threads.
  - `PATCH /api/chatimages/:id` supports `title` rename and `pinned` toggle.
  - SQLite now has `pinned_at`; history lists pinned records first.
- Frontend history list now renders action buttons for pin/unpin, rename, and delete.
- Persistence adapter and API client now support `PATCH` and `DELETE`.
- Added `visualComposition` to the structure prompts and normalized visual spec.
- Image prompts now include the model-selected composition type, visual focus, primary/secondary modules, and density strategy before rendering.
- Tests covering API client, service persistence, server routes, store behavior, render output, structure prompt, layout prompt, browser flow, browser history, browser dist, build, and security passed.

## Completed: Quality Probe Attempt

- Added `tests/real-quality-samples.js` and `npm run probe:quality`.
- The probe can run multiple questions through the browser flow and save screenshots plus `tmp/quality-samples/quality-samples-report.json`.
- A full real API run was retried after permissions were relaxed. The browser flow now reaches the upstream API, but the text endpoint returns `Text API error: 请求失败，该接口正在维护`, so full end-to-end image quality cannot currently be evaluated through the normal text-first flow.
- Ran 3 local mock samples using `CHATIMAGE_QUALITY_PROVIDER=mock`; all completed and confirmed that `visualComposition` reaches debug output and image prompts.
- Improved image prompts further by passing each module's `detailContext` into the prompt as visual design context, while instructing the model to compress it into short chips/callouts rather than printing paragraphs.
- Added tests asserting `detailContext`, `primaryModules`, and hierarchy/anti-template constraints remain in prompts.

## Completed: Real Image Quality Retry

- Verified the real image endpoint independently with `CHATIMAGE_TEST_TEXT=0 CHATIMAGE_TEST_IMAGE=1 npm run test:api`; image generation and artifact download succeeded.
- Added `tests/real-image-quality-samples.js` and `npm run probe:image-quality` to test real image quality without depending on the currently maintained text endpoint.
- Shortened `buildStyleImagePrompt` into a denser design brief. It keeps the key requirements for `visualComposition`, information hierarchy, content density, primary/secondary modules, OCR anchors, and anti-template composition while reducing redundant wording.
- Generated 3 real image samples:
  - `tmp/image-quality-samples/agent-workflow.png`
  - `tmp/image-quality-samples/rest-graphql.png`
  - `tmp/image-quality-samples/http-render.png`
- Observed improvement versus the earlier rough outputs: higher module density, richer chips/status labels, stronger visual hierarchy, and less empty card-and-arrow composition. Remaining limitations: Chinese microtext can still distort, and the image model still often uses cards as the base visual container.

## Completed: MiMo Text API and Structured Cases

- Replaced the default text API path with an OpenAI-compatible MiMo configuration:
  - default endpoint: `https://api.xiaomimimo.com/v1/chat/completions`
  - default model: `mimo-v2.5-pro`
  - independent `CHATIMAGE_TEXT_API_KEY`, so image generation can keep using the existing image key.
- Added text request configuration for base URL, request format, system prompt, token budget, temperature, top-p, JSON response mode, and MiMo thinking mode.
- Set MiMo `thinking.type=disabled` after observing that thinking mode could consume the response budget in `reasoning_content` and leave `message.content` empty.
- Added `tests/structured-text-cases.json` and `npm run test:structured-text`.
- The structured case runner validates raw answer length, relation type, module count, required keywords, visual composition, module detail density, and generated image prompt constraints. It writes artifacts to `tmp/structured-text-cases`.
- Real MiMo validation passed for all 5 structured cases:

## In Progress: Visual Target Contract and Mask Preview Quality

- Add explicit interactive target fields on visual modules without breaking existing saved results:
  - `visualEvidence`
  - `maskPolicy`
  - `spatialHint`
  - `locatorQueries`
  - `components`
- Propagate these fields through structure normalization, image prompts, alignment payloads, LocateAnything/MiMo prompts, and SAM3 refinement.
- Keep existing `modules`/`hotspots` interfaces compatible so frontend history, follow-up threads, and persistence continue to work.
- Add tests for map routes, scene object-with-label targets, prompt propagation, LocateAnything normalization, and SAM3 component masks.
  - `agent_workflow`
  - `rest_graphql_compare`
  - `http_render_timeline`
  - `product_growth_metrics`
  - `tcp_failure_diagnosis`
- Default full test suite passed after updating old local mock tests to explicitly use `textRequestFormat: "wuyin-form"`.

---

# Task Plan: Interactive Visual Works Modes

## Objective

Expand ChatImage from card-style infographics into interactive visual works. The first target is a hand-drawn map use case such as "手绘地图，西湖": generate a painterly map-like image, bind clickable semantic geographic regions, and show region-specific explanations and previews.

## Scope Guardrails

- Preserve the current stable infographic template and existing features.
- Do not replace LocateAnything/local-ocr/planned fallback chain yet.
- Do not require perfect mask segmentation in phase 1; use semantic regions with planned/box hotspots first.
- Keep normal hotspots transparent.
- Keep the fixed local service at `http://127.0.0.1:5178/`.
- Do not change the current font.

## Architecture Plan

1. `visualMode` introduction
   - Add visual modes: `infographic`, `map`, `poster`, `scene`.
   - Default remains `infographic`.
   - Infer `map` for prompts containing map/地图/手绘地图/西湖/景区/地理/路线.

2. Semantic region model
   - Keep existing `modules` for compatibility.
   - Add optional fields on modules:
     - `regionKind`: `landmark | water | route | district | building | mountain | annotation | object | area`
     - `regionPrompt`: visual grounding description for locating the region.
   - Existing hotspot shape remains rect for phase 1.

3. Prompt and layout split
   - `infographic`: current card/flow/matrix behavior.
   - `map`: painterly illustrated map, landmarks, terrain/water/route cues, no card-number requirement.
   - `poster`: visual poster with semantic objects/areas, not card modules.
   - `scene`: scene illustration with objects/areas.

4. Alignment strategy phase 1
   - Use planned semantic regions for initial hotspots.
   - LocateAnything queries should use `regionPrompt` and module title, not only numeric card anchors.
   - If visual alignment is weak, keep planned layout and expose diagnostics.

5. Mask strategy later
   - Add `shape: polygon | mask`.
   - Use grounding/segmentation to convert text region to mask.
   - Crop/mask the selected area into the detail panel preview.
   - This requires a separate provider evaluation and should not block phase 1.

## Execution Phases

1. Stable push. `complete`
   - Commit and push current stable adaptive-module template to `origin/main`.

2. Plan and discovery. `complete`
   - Inspect structure/layout/prompt/render chain for extension points.
   - Record implementation boundaries.

3. Phase 1 implementation. `complete`
   - Add `visualMode` normalization and inference.
   - Add semantic region fields.
   - Split image prompt behavior for map/poster/scene vs infographic.
   - Add map-oriented fallback spec for West Lake.
   - Update thought-process wording to avoid implying every result is a flow/card infographic.

4. Verification. `complete`
   - Add focused tests for `visualMode=map`, West Lake fallback, prompt constraints, and existing infographic compatibility.
   - Run `npm.cmd test`.
   - Restart only `127.0.0.1:5178`.

## Risks

- Current layout regions are rectangular; map landmarks may still be coarse until mask/polygon lands.
- Image model may still draw labels or card-like callouts unless map prompt strongly forbids infographic cards.
- LocateAnything can ground semantic regions but accuracy is not guaranteed; diagnostics must stay visible.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| None yet | N/A | N/A |

---

# Task Plan: MiMo Vision + Box/Mask Quality

## Objective

继续优化语义定位和抠图效果：

- 接入 MiMo 视觉模型 `mimo-v2.5`，复用现有 MiMo key 和 base URL。
- 让 MiMo 视觉作为语义定位 provider，补 LocateAnything 对中文地图/海报区域理解弱的问题。
- 保持职责清楚：视觉/Locate 负责出 box，SAM3 负责在 box 里精细抠 mask。
- 建立可复跑测试和可视化审计。
- 写一份大白话 Markdown 过程记录。

## Phases

1. Inspect current vision config and provider chain. `complete`
2. Add MiMo vision defaults/provider mode. `complete`
3. Add MiMo vision into alignment fallback chain without removing LocateAnything/SAM3. `complete`
4. Improve audit/report wording for boxSource vs maskSource. `complete`
5. Run targeted tests and one real audit. `complete`
6. Write plain-language Markdown record. `complete`

## Guardrails

- Do not expose API keys in docs or logs.
- Keep service fixed at `http://127.0.0.1:5178/`.
- Do not change font.
- Do not treat layout-guided boxes as true semantic locate success.

## Completed

- Added `CHATIMAGE_VISION_FALLBACK_MODE=mimo-vision`.
- Kept `CHATIMAGE_VISION_MODE=locateanything` as the main chain so SAM3 still runs.
- MiMo vision now fills or replaces weak layout-guided boxes before local OCR/planned fallback.
- MiMo vision defaults to `mimo-v2.5` and can reuse `CHATIMAGE_TEXT_API_KEY`.
- Real West Lake audit improved from layout-guided boxes to `sourceCounts={"mimo-vision":7,"locateanything":1}` with `mask=8/8`.
- Added plain-language record: `docs/mimo-vision-sam3-progress.md`.
- Full `npm.cmd test` passed after integration.
- Fixed service remains on `http://127.0.0.1:5178/` with `visionMode=locateanything`, `visionFallbackMode=mimo-vision`, and `visionModel=mimo-v2.5`.

## Completed: Online Hotspot Coverage Pass

- Fixed alignment post-processing so reasonable partial overlap no longer causes whole groups of good vision boxes/masks to be reverted to planned layout.
- Strict repair is now reserved for heavy overlap; hit-test decides whether partially overlapping semantic regions are still usable.
- Added tests for preserving unaffected aligned modules, preserving partial-overlap boxes, and keeping heavy-overlap repair.
- Added a Windows keep-alive cleanup fix to `tests/build.test.js`, so the full test suite no longer hangs at build serving tests.
- Online real cases were generated and saved in the fixed 5178 history:
  - Kubernetes 部署架构
  - RAG 检索增强流程
  - 西湖手绘旅游地图
  - 未来博物馆沉浸式场景
- Browser audit restored those four history items, clicked every hotspot, and saved screenshots/report under `tmp/online-audit`.
- `npm.cmd test` passed after the changes.

---

# Task Plan: Real Visual Acceptance and Map Target Fixes

## Objective

Improve the real visual chain for map/scene outputs without breaking the stable infographic path:

- Sanqing Mountain map targets should be separately represented and separately clickable.
- Hotspot previews should show the clicked target, not an unrelated nearby crop.
- SAM audit previews should show actual cutouts when masks exist.
- Real acceptance must run against the fixed `http://127.0.0.1:5178/` service.

## Phases

1. Fix map target semantics. `complete`
   - Route direction should prioritize title, regionPrompt, and spatialHint over long detail text.
   - West Coast and Sunshine Coast routes must not collapse into the same west-side target.

2. Improve audit previews. `complete`
   - Use mask PNG data to render transparent cutout previews when SAM3 returns a mask image.
   - Keep rectangular preview only as fallback for routes/regions without mask images.

3. Add fixed-server real acceptance. `complete`
   - Add `npm.cmd run test:real-visual-acceptance`.
   - It reuses `127.0.0.1:5178`, submits real prompts, clicks target hotspots, saves previews, and asks MiMo vision to judge full-image and preview correctness.

4. Verify and iterate. `complete`
   - Run focused local tests first.
   - Restart only 5178 after code changes.
   - Run at least `sanqing-map` real acceptance; expand to West Lake and museum scene if the first case is stable.

## Current Cases

- `sanqing-map`: Sanqing tourist map with West Coast trail, Sunshine Coast trail, cableway entrance, mountain lodging.
- `westlake-map`: West Lake hand-drawn geographic map.
- `museum-scene`: future museum scene with guide robot and attached `AI 个性化导览` label.

## Guardrails

- Do not change the font.
- Do not remove existing functions.
- Do not open extra ChatImage frontend service ports.
- Do not claim visual success unless the generated image, clicked preview, and visual judge report support it.

## Latest Verification

- `npm.cmd test` passed.
- Real visual acceptance passed for `sanqing-map`, `westlake-map`, and `museum-scene`.
- Current service remains fixed at `http://127.0.0.1:5178/`.

---

# Task Plan: Map/Scene Preview Cutout Regression Fix

## Objective

Fix the "分割变巨差" regression where map/scene hotspots (宝石山, 曲院风荷, 柳浪闻莺) were shredded into text fragments and tree dots because the preview wrongly used a transparent SAM3 cutout instead of an original-image context crop.

## Root Cause

`buildHotspotPreview` decided context-crop vs cutout using only `hotspot.regionKind`. SAM3 produces a mask + cutoutImage for every hotspot in map/scene images, so a hotspot missing `regionKind` (old data / model gap) fell through to the cutout path.

## Phases

1. Preview strategy whole-image fallback. `complete`
   - New `src/preview-strategy.js` with pure `inferPreviewStrategy(result, hotspot)`.
   - map/scene/poster → context crop unless regionKind ∈ {object, object-with-label, person, product}.
   - Region kind recovered from `structuredSpec.modules` when hotspot lacks it.

2. Wire `src/app.js` to the shared module. `complete`
   - `buildHotspotPreview` + `hydrateHotspotCutoutPreview` use the strategy.
   - Skip cutout generation for context-crop previews.

3. Mojibake cleanup. `complete`
   - `src/service.js`, `src/structure.js`, `tests/browser-history.test.js`.

4. Rule-assertion unit tests. `complete`
   - `tests/preview-strategy.test.js` (16 scenarios).

5. Harden `rmWithRetry` on Windows. `complete`
   - EPERM no longer aborts `npm test`.

## Guardrails

- Do not change the LocateAnything / MiMo vision / SAM3 provider chain.
- Do not change the font.
- Do not open extra ports; service fixed at 5178.
- Do not change `deriveHotspots` data shape (keep old history compatible).

## Latest Verification

- `node --check` on all changed files passed.
- `npm.cmd run test:preview-strategy` passed (16/16).
- `npm.cmd run build` rebuilt with the new module.
- `npm.cmd test` → `All tests passed.`

---

# Task Plan: Semantic Locate Hit Quality Pass

## Objective

Improve semantic box hit quality before SAM3 masking:

- LocateAnything should not accept the largest returned box by default.
- Infographic modules should prefer complete card footprints, not header strips, number badges, arrows, or neighboring panels.
- Map/scene modules should preserve original target names and region descriptions in crop prompts.
- Diagnostics should show which phrase strategy and candidate score produced the accepted box.

## Phases

1. Inspect LocateAnything worker root causes. `complete`
   - Found duplicate `build_semantic_hint` definitions.
   - Found single-query + largest-box selection.

2. Implement multi-query candidate scoring. `complete`
   - Added numbered-card/title-card/semantic-region/crop phrase strategies.
   - Added geometric scoring against planned bounds without treating planned as semantic success.
   - Penalized header strips, cross-panel strips, tiny cards, and oversized boxes.

3. Preserve diagnostics through Node normalization. `complete`
   - Keep `phraseKind`, `candidateScore`, and `candidateDiagnostics`.

4. Add focused worker tests. `complete`
   - Test prompt generation, Chinese crop target preservation, card keyword drift, header-strip rejection, and thin route acceptance.

5. Full verification and online sample. `complete`
   - Run `npm.cmd test`.
   - Restart fixed `http://127.0.0.1:5178/`.
   - Run one online semantic case if the local suite passes.

## Latest Verification

- `npm.cmd test` passed.
- Fixed service is running at `http://127.0.0.1:5178/`.
- Online Kubernetes sample generated in the frontend and is visible in history.
- Reused that real image for `/api/vision` rerun after the worker fixes:
  - provider chain: `locateanything > mimo-vision > sam3`
  - source counts: `{"mimo-vision":3,"locateanything":3}`
  - fallback modules: `[]`
  - worker warnings: `[]`
  - strict repaired modules after applying frontend layout: `[]`

---

# Task Plan: Security Hardening Gap Closure

## Objective

Finish the security hardening work handed over in the pasted log without disturbing the active visual pipeline, font, or fixed `http://127.0.0.1:5178/` service.

## Gap Check

1. Image API key handling. `complete`
   - Query-string key is now behind `CHATIMAGE_IMAGE_KEY_IN_QUERY=1`.
   - Default path uses the upstream-required bare `Authorization: <key>` header, not `Bearer`.
   - No unconditional `url.searchParams.set("key", ...)` remains for image calls.

2. CSRF/Sec-Fetch-Site hardening. `complete`
   - Cross-site requests with missing Origin/Referer but `Sec-Fetch-Site: cross-site` are rejected.
   - Local tooling and Node tests with no browser headers remain compatible.

3. Dist asset caching. `complete`
   - Only hash-named `dist/` assets are immutable.
   - Non-hash dist files and source maps remain `no-cache`.

4. Tests and verification. `complete`
   - Focused server/security/proxy/file tests passed.
   - `npm.cmd test` and `npm.cmd run build` passed.
   - Runtime code changed, so restart only 5178.

5. Remaining P0/P1 gap scan. `complete`
   - `.env.local` can override `.env` while shell env wins.
   - SQLite writes use explicit transactions and rollback.
   - Request-level errors and process-level fatal errors now log stack/context.
   - `SIGTERM`/`SIGINT` use graceful shutdown with idle/all-connection cleanup.
   - Browser fallback attachment IDs now prefer `crypto.getRandomValues()`.

## Guardrails

- Do not change font or frontend functionality.
- Do not alter LocateAnything/MiMo/SAM3 behavior in this pass.
- Keep local tool/API test compatibility.
- Do not open additional ChatImage frontend ports.
