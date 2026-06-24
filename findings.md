# Findings: Interactive Visual Works Modes

## 2026-06-09

- Current stable template has been pushed to `origin/main` at commit `a31e037`.
- The current system already supports variable module counts from 3 to 6 after the latest stable commit.
- Existing data path is:
  - `src/structure.js` creates `visualSpec`.
  - `src/layout.js` derives rectangular regions and image prompts.
  - `src/alignment.js` and server vision providers align hotspots.
  - `src/render.js` displays thought process, image, hotspots, debug output, and details.
- The current image prompt is primarily infographic/card-oriented and still references cards, card numbers, OCR anchors, and module cards.
- To support hand-drawn maps/posters/scenes without breaking current behavior, the safest extension point is a new `visualMode` field with mode-specific prompt wording.
- Mask/polygon interaction should be a later phase. Phase 1 can preserve rectangular hotspots while using semantic `regionKind` and `regionPrompt` for better grounding.

## 2026-06-11

- MiMo `mimo-v2.5` can be used as a visual model through the same MiMo base URL/key family as `mimo-v2.5-pro`.
- Existing remote vision code already supports OpenAI-style chat messages with `image_url`, so the likely minimal integration is config/defaults plus provider-chain wiring, not a new HTTP adapter from scratch.
- Current strict audit correctly separates:
  - true semantic box source (`locateanything`, `locateanything-crop`, remote vision)
  - layout-guided box source
  - SAM3 mask source
- The key quality target is not just “有框”，而是 “box 是否语义上框中目标，SAM3 mask 是否在 box 内抠出主体”。
- Correct deployment shape is not `CHATIMAGE_VISION_MODE=mimo-vision` for the full chain, because that would skip LocateAnything/SAM3. For the intended chain, keep `CHATIMAGE_VISION_MODE=locateanything` and set `CHATIMAGE_VISION_FALLBACK_MODE=mimo-vision`.
- In the current West Lake audit, MiMo vision filled most semantic boxes while SAM3 produced masks for every region. This is progress over planned fallback, but visual review of overlays/previews should remain part of the test flow because a box can exist and still be semantically wrong.

## 2026-06-14

- The "分割变巨差" regression is **not** a SAM3 quality problem. SAM3 dutifully produces a mask and a cutoutImage for every hotspot in map/scene images because it is asked to. The bug is in the *preview* layer: `buildHotspotPreview` decided context-crop vs cutout using only `hotspot.regionKind`, so any hotspot that lost its `regionKind` (old saved data, model not emitting the field) fell through to the transparent cutout, shredding 宝石山 into fragments.
- Correct division of labor confirmed by this fix:
  - LocateAnything / MiMo vision → produce the box (where the target is).
  - SAM3 → refine the mask inside the box.
  - Preview layer (`inferPreviewStrategy`) → decide *how to show* the preview: transparent cutout only for independent subjects (object/person/product), context crop for everything else in map/scene/poster.
- The decision function must be whole-image aware, not just per-hotspot. A single missing `regionKind` must not opt a hotspot into the cutout path when the whole output is a map/scene.
- `inferPreviewStrategy` is now a pure function in `src/preview-strategy.js` (UMD: `module.exports` + `window.ChatImagePreviewStrategy`), so it is unit-testable in Node without a browser. This is the right home for any future preview-policy logic.
- The preview caption (主体抠图预览 / 区域上下文预览 / 路线区域预览) is recomputed by `buildHotspotPreview` on every render from the strategy, so old saved captions (including the mojibake `涓讳綋鎶犲浘棰勮`) are overwritten in the UI without needing a DB migration.
- Windows `rmWithRetry` EPERM: the Chrome subprocess can keep profile file handles open for >2s after `kill()`. Throwing on cleanup failure is wrong — leftover temp dirs are not a test failure. Degrade to a warning on win32.

## 2026-06-14 Organic Feathered Previews

- The first "context crop" fix was only a stopgap. A flat rectangle still dilutes the visual focus and looks bad. The user's real ask: an **irregular shape** that hugs the region contour, with original-image fill and a soft feathered edge, plus a small adaptive buffer so a bit of surrounding context is visible.
- Critical realization: **the mask data was already correct end-to-end**. SAM3 worker runs `cv2.findContours` + `approxPolyDP` to extract a real polygon (up to 96 points) plus a bounds-cropped alpha PNG for every region. The SVG polygon hotspot layer already renders irregular clickable areas. The whole problem was confined to the preview renderer.
- The preview now has three modes, decided by `inferPreviewStrategy` + mask availability:
  1. Transparent SAM3 cutout — independent subjects only (object/person/product).
  2. Organic feathered preview — map/scene/poster regions with a mask. Built on a client canvas: original image + dilated+blurred alpha mask via `destination-in`. Buffer scales as `√(maskArea) × 0.15` (clamped 4–22%).
  3. Mask-CSS fallback — while the organic canvas is still rendering, the preview is already irregular via CSS `mask-image` (hard-edged), then swaps to the soft organic version.
- `ctx.filter = "blur(Npx)"` on a copy-back draw is the cheapest reliable feather in canvas2d; no extra dependency. Pair it with a cheap 8-direction dilate so the silhouette grows before blurring, otherwise blur alone just erodes the edge.
- The organic preview is async (image decode + canvas work), so the first render uses the CSS-mask fallback and hydrate re-renders once the organic PNG is cached. Cache key includes the kind (`organic` vs `cutout`) so the same mask data doesn't collide between the two builders.
- Polygon hotspot layer and preview are now visually consistent: both follow the SAM3 contour. No data-shape changes, so old saved history is repaired on the fly.


## 2026-06-16 Semantic Locate Hit Quality

- LocateAnything worker had a real root-cause issue: it queried each module with one phrase, parsed every returned box, then chose the largest box. This explains failures where a top header strip, a cross-panel strip, or a neighboring module was accepted even though a better card-sized box existed.
- The worker also had multiple `build_semantic_hint` definitions. The later simplified definition overrode the earlier card-aware definition, so explanatory words like "health check" could bias an infographic card toward a sensor/object target instead of "the complete card".
- Crop-stage grounding dropped original Chinese target names in practice because the prompt leaned on English semantic hints. For maps, the crop prompt must explicitly carry `label` and `regionPrompt`; otherwise targets such as 三潭映月, 柳浪闻莺, or 曲院风荷 can drift even inside a planned crop.
- Better LocateAnything usage is not just "more fallback". The improved approach is: ask several targeted queries, score every returned box, penalize known bad shapes, keep planned bounds as a geometry prior, and only then pass the chosen box to SAM3 for mask refinement.
- Windows worker JSONL output must not depend on GBK. A real rerun produced a model answer containing `U+FFFD`, and `print(json.dumps(..., ensure_ascii=False))` failed before Node could parse the worker result. Fix: reconfigure stdout/stderr to UTF-8 and emit JSON with `ensure_ascii=True`.
- Frontend strict repair was overcorrecting good LocateAnything boxes. `repairClickableBounds` expanded every box narrower than `0.22` by `0.06`; real K8s cards around `0.145` wide were already clickable, but expansion made adjacent columns overlap and triggered `planned-strict-repair`. Fix: only pad boxes that are below the actual minimum click size.

## 2026-06-16 Strict Repair Root Cause

- The latest coverage failures were not simply "LocateAnything/SAM3 failed". In the Kubernetes and RAG real samples, the alignment response contained usable MiMo/Locate bounds and SAM3 masks, but `applyAlignmentsToLayout()` then ran `enforceStrictLayoutRegions()` against `core.validateLayoutRegions()`.
- `core.validateLayoutRegions()` uses a very small absolute overlap threshold (`0.002`). That is useful for planned grid boxes, but too strict for real vision boxes that naturally overlap a little at card shadows, labels, routes, or soft map regions.
- The correct quality gate is now split:
  - `validateAlignmentRegions()` rejects only heavy semantic overlap or unsafe bounds.
  - `auditHotspotHitTest()` verifies every hotspot still has a clickable sample point.
  - Server persistence allows overlap when `clickBoundsSource=hotspot-derived` and hit-test is OK.
- Result: keep good visual boxes and masks when overlap is reasonable; only locally repair modules that create heavy overlap or steal every clickable point.
- Browser audit is necessary because source counts alone can lie. A result can show `mask=9/9` but still have a bad preview policy; the audit now clicks every hotspot and records preview class, detail length, and screenshot artifacts.

## 2026-06-16 Locate Box vs SAM Mask Boundary

- The latest incomplete cutout cases point to a box-context issue, not a pure segmentation issue. SAM3 can only segment what it is shown; if the LocateAnything/MiMo box is tight around the body or text core, labels and edge details are easy to miss.
- The correct fix is not to enlarge the frontend click rectangle. Click bounds should stay stable for hit-testing and overlap control.
- The better fix is to enlarge only the SAM3 input bounds:
  - click area = original semantic box;
  - SAM input area = semantic box plus adaptive context;
  - preview mask = SAM result inside the larger input area.
- This keeps interaction predictable while giving SAM3 enough pixels to capture complete subjects, attached labels, route names, and organic region edges.

## 2026-06-16 Subject Box Scoring and Audit Accuracy

- LocateAnything can return a plausible but incomplete box for scene subjects, especially a short label next to an object. If the box is near the planned area, overlap scoring alone can make that tiny label look like a good semantic hit.
- Subject-like modules (`object-with-label`, `subject-with-label`, `object`, `person`, `product`) need their own size checks. A candidate that is tiny, has a very small side, or is far smaller than the planned semantic region should not end the search early.
- MiMo vision fallback should be a reviewer/corrector, not an unconditional override for every `scene/map/poster`. Good LocateAnything boxes should remain the primary model result; MiMo should step in for low-score, layout-guided, tiny-subject, or obviously huge non-background candidates.
- Test audits must not click only the center of each hotspot. Map/background/water areas can legitimately overlap landmarks, so the center may belong to a foreground hotspot. The correct audit point is `alignmentRaw.hitTest.modules[].clickablePoint`.

## 2026-06-16 Security Handoff Gap Scan

- The image API does require a bare `Authorization: <key>` header. Using `Bearer` would break upstream compatibility, but putting the same key in `?key=` by default is unnecessary leakage. The correct default is header-only auth with an explicit legacy query switch.
- `.env.local` override behavior is fixed by preserving the original shell environment keys before loading `.env`, then loading `.env.local` with overwrite enabled but still preserving shell-provided values.
- SQLite consistency risk is already addressed by wrapping chat image/thread writes in `begin immediate transaction` with rollback on failure. The duplicate-message regression test confirms failed thread writes do not erase the previous valid thread.
- `no-store` on every static asset was too conservative for the built app. The safer split is long immutable cache only for hash-named `dist/` assets, with HTML/JSON/source maps/non-hash files staying `no-cache`.
- Request-level logging is not enough for production debugging. Process-level `unhandledRejection` and `uncaughtException` handlers should log stack/context at the main entry point, while still letting uncaught exceptions terminate the process.

## 2026-06-23 Showcase and Campus Target Cleanup

- The public docs demo was wrong in a separate way from the main app: it only opened static screenshots, so users could not verify hotspot/detail behavior. The fix is to publish reusable demo state (`visualSpec`, layout, and hotspots) as JSON next to each SVG and let the docs page render the same clickable hotspot model.
- Campus-map prompts exposed a structural parsing edge case: `点击区域后解释用途和风貌` matched the generic `点击 X` extractor, creating a fake target named `区域后解释用途和风貌`. Filtering instruction tails must happen both before list splitting and again on individual labels.
- The latest multi-instance artifact should include campus-guide-map in addition to scenic/map/product/technical/business cases, because it directly guards the prior 图书馆 alignment/semantic-target issue.
