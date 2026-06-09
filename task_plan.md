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
