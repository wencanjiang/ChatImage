# Contributing to ChatImage

Thanks for helping improve ChatImage. The project is moving toward a public research/demo release, so the most valuable contributions are focused, testable, and honest about visual quality.

## Local Setup

```bash
npm install
npm start
```

Open the curated showcase. It contains selected outputs from the same ChatImage workflow, saved for quick inspection:

```text
http://127.0.0.1:5178/docs/index.html
```

Generate a new ChatImage with local mock providers:

```text
http://127.0.0.1:5178?provider=mock
```

Real provider mode requires `.env.local`; copy `.env.example` and add your own keys. Do not commit `.env.local`, generated databases, provider logs, screenshots, or model checkpoints.

## What To Work On

- Fix bugs in the structure, generation, alignment, mask, preview, and interaction pipeline.
- Improve the curated demo page without weakening the strict demo gate.
- Add tests that catch regressions in hotspot alignment, mask quality, detail-panel text, and local deployment.
- Improve technical documentation and the arXiv draft when implementation details change.

## Demo Quality Rules

Published demos must represent real generated quality. Do not hand-place hotspots or publish stale cases that fail the current gate.

Before adding a demo to `docs/assets/demos/`, verify:

- Every hotspot has a real primary visual source (`locateanything`, `locateanything-crop`, or `mimo-vision`).
- Every hotspot has SAM mask data, `cutoutImage`, `organicImage`, and expanded organic bounds.
- Mask previews are solid inside the selected region and do not contain large hollow fragments.
- Clicking a hotspot updates the right-side region-detail panel with text about that region, not the original prompt.
- The floating preview and final panel preview use the same preview strategy and do not visibly jump.

Record rejected cases and reasons in `docs/demo-eligibility.md`.

## Tests

Run targeted checks before opening a pull request:

```bash
node tests/docs-demos.test.js
node tests/docs-demo-interaction.test.js
node tests/sam3.test.js
npm run build
```

Run the full suite when changing shared behavior:

```bash
npm test
```

Real provider smoke tests are opt-in and may call paid APIs:

```bash
CHATIMAGE_API_KEY=your_key_here npm run test:api
```

## Pull Request Checklist

- The change is scoped to one concern.
- Public docs do not contain API keys, local absolute paths, or private provider logs.
- Demo manifest entries match the actual exported JSON hotspot data.
- The arXiv draft and technical report are updated if method claims, demo examples, or benchmark framing changed.
- Tests above pass, or the PR explains why a check could not be run.
