# ChatImage Agent Evaluation

This suite evaluates ChatImage as a general interactive visual agent, not only a flowchart generator.

## What It Tests

Each case follows the same flow:

1. Open the app in a real browser.
2. Input the user question.
3. Wait for image generation and hotspots.
4. Collect structured spec, layout, image prompt, alignment diagnostics, DOM hotspot rectangles, and image dimensions.
5. Click one hotspot.
6. Verify the detail panel opens, contains the expected region, and shows a hotspot preview.
7. Score the result and write JSON/Markdown reports.

## Automatic Metrics

- `visual_mode`: whether the result selected an expected visual mode, such as `infographic`, `map`, `poster`, or `scene`.
- `keyword_coverage`: whether the structured answer, raw answer, and visible result cover case-specific concepts.
- `hotspot_coverage`: whether transparent hotspots stay inside the rendered image stage, have usable area, and are not visibly painted.
- `click_detail`: whether a simulated hotspot click opens the correct detail panel and preview.
- `detail_quality`: whether module details are sufficiently explanatory instead of thin labels.
- `image_generation`: whether the image loads and avoids obvious raw-question title leakage.
- `diversity_fields`: whether semantic-region cases include expected fields such as `regionKind`.

## Optional Manual Accuracy

Cases may include `expectedBounds`:

```js
expectedBounds: [
  { id: "module_1", bounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.25 } }
]
```

When present, the evaluator computes IoU between rendered hotspot bounds and the annotated bounds. This is the bridge toward later polygon/mask evaluation.

## Commands

Offline, no real API cost:

```powershell
npm.cmd run test:agent-eval
```

Real model probe:

```powershell
npm.cmd run probe:agent-eval
```

Limit real probe cases:

```powershell
$env:CHATIMAGE_AGENT_EVAL_CASES="west-lake-map,museum-scene"
npm.cmd run probe:agent-eval
```

Reports are written to:

- `tmp/agent-evaluation-test/agent-evaluation-report.json`
- `tmp/agent-evaluation-test/agent-evaluation-report.md`
- `tmp/agent-evaluation/agent-evaluation-report.json`
- `tmp/agent-evaluation/agent-evaluation-report.md`

## Current Case Coverage

- Flow/process infographic: Agent workflow.
- Comparison infographic: REST vs GraphQL.
- Hand-drawn map: West Lake clickable geographic regions.
- Poster: Low-carbon city poster.
- Illustrated scene: Future museum scene.
- Product diagram: Smart watch exploded view.

The default CI-style test uses only offline-safe cases. Real poster/scene/product cases run through `probe:agent-eval`.
