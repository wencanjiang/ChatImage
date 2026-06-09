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
