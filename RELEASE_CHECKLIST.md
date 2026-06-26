# ChatImage Release Checklist

Use this checklist before tagging a public release or sharing the repository broadly.

## Demo Integrity

- `node scripts/generate-doc-demos.js` completes without publishing rejected cases.
- `docs/assets/demos/manifest.json` contains only demos that pass the current strict visual-alignment gate.
- Every published hotspot has SAM mask data, `cutoutImage`, `organicImage`, and expanded organic bounds.
- `node tests/docs-demos.test.js` passes.
- `node tests/docs-demo-interaction.test.js` passes.
- The homepage hero demo is clickable and opens the same verified lightbox flow as the gallery.

## Local Deployment

- `npm install` succeeds from a clean clone.
- `npm start` serves `http://127.0.0.1:5178/docs/index.html` without API keys.
- `http://127.0.0.1:5178?provider=mock` generates a new ChatImage with local mock providers.
- `npm run build` succeeds.
- `CHATIMAGE_STATIC_DIR=dist npm start` serves the production build.

## Documentation

- `README.md` and `README_CN.md` explain that the showcase contains selected outputs from the same ChatImage workflow, while the app entry can generate new results.
- `.env.example` contains placeholders only.
- `CONTRIBUTING.md` describes demo quality rules.
- `SECURITY.md` describes private vulnerability reporting.
- `docs/demo-eligibility.md` records accepted and rejected demo cases.
- The arXiv draft examples match the current public demo manifest or clearly describe benchmark-only tasks.

## Safety

- No API keys, cookies, provider logs, local database files, screenshots, or machine-specific absolute paths are staged.
- `git status --short` is reviewed before commit.
- Large generated assets are intentional and referenced by the demo manifest.

## Suggested Verification Commands

```bash
node tests/docs-demos.test.js
node tests/docs-demo-interaction.test.js
node tests/sam3.test.js
npm run build
```
