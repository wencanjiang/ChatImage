<!-- Logo / hero image — replace the src with your own asset when available -->
<p align="center">
  <img src="docs/assets/logo.svg" alt="ChatImage" width="120" />
</p>

# ChatImage

<p align="center">
  <!-- arXiv paper — source draft in Arxiv/chatimage_paper/; link activates when submitted -->
  <a href="Arxiv/chatimage_paper/chatimage.pdf"><img src="https://img.shields.io/badge/arXiv-Paper%20(draft)-b31b1b?style=flat-square&logo=arxiv" alt="arXiv Paper" /></a>
  <!-- Project / promo page -->
  <a href="docs/index.html"><img src="https://img.shields.io/badge/Project%20Page-Demo-1f6feb?style=flat-square&logo=googlechrome" alt="Project Page" /></a>
  <!-- Technical report -->
  <a href="docs/TECHNICAL_REPORT.md"><img src="https://img.shields.io/badge/Tech%20Report-Docs-25a36a?style=flat-square&logo=googledocs" alt="Tech Report" /></a>
  <a href="https://github.com/wencanjiang/ChatImage/actions"><img src="https://img.shields.io/badge/Tests-passing-2da44e?style=flat-square&logo=githubactions" alt="Tests" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square&logo=opensourceinitiative" alt="License" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=nodedotjs" alt="Node.js 18+" /></a>
</p>

> Turn a long-form LLM answer into an interactive visual image — structured infographics with clickable hotspots, per-region detail panels, and in-context follow-up threads.

<p align="center">
  <img src="docs/assets/hero.png" alt="ChatImage screenshot" width="760" />
</p>

English | [简体中文](README_CN.md)

## Features

- **Interactive image answers**: convert a natural-language question into a structured visual result with transparent, clickable regions overlaid on a generated image.
- **Per-region detail panels**: each hotspot keeps its own title, summary, detail text, and follow-up thread — click a region to drill in without leaving the image.
- **Vision-aligned hotspots**: in real-API mode, LocateAnything / MiMo-vision / local-OCR localize the actual visual regions so hotspots land on the right content, not on a hard-coded grid.
- **Provider-agnostic**: run fully in `mock` mode with no keys, or proxy real text, image, and vision providers through the backend so keys never touch the browser.
- **Local-first persistence**: generated ChatImages, hotspots, calibration data, and follow-up threads are stored in a local SQLite database.
- **File context**: attach text-oriented files (code, Markdown, CSV, JSON, logs, …) and include their contents as prompt context.
- **Zero-frontend-dependency build**: the browser layer is vanilla JS; a single dependency-free script concatenates and minifies assets into `dist/`.

## Paper & Technical Report

| Resource | Description |
| --- | --- |
| 📄 **[arXiv paper (draft)](Arxiv/chatimage_paper/chatimage.pdf)** | Technical paper draft covering the task, two-pass vision-alignment method, and a benchmark + human-evaluation framework. LaTeX source in [`Arxiv/chatimage_paper/`](Arxiv/chatimage_paper). |
| 📚 **[Technical report](docs/TECHNICAL_REPORT.md)** | In-depth system documentation: architecture, data flow, alignment pipeline, API reference, testing strategy, and known limits. |
| 🌐 **[Project page](docs/index.html)** | Interactive promo site with live demos (filterable by mode), lightbox viewer, and quick-start. |
| 🗄️ **[Archived notes](docs/archive/)** | Historical design docs, dev log, and audit reports kept for traceability. |

## Quick Start

The fastest way to try ChatImage is the no-key `mock` mode:

```bash
git clone https://github.com/wencanjiang/ChatImage.git
cd ChatImage
npm install
npm start
```

Then open:

```text
http://127.0.0.1:5178?provider=mock
```

To use real LLM / image / vision providers, copy the env example and fill in your keys (see [Configuration](#configuration)):

```bash
cp .env.example .env.local   # Windows: Copy-Item .env.example .env.local
npm start
```

## Prerequisites

- **Node.js** 18 or newer
- **npm**
- Optional: **Python 3.9+** if you enable local OCR or LocateAnything-based vision alignment
- Optional: a CUDA-capable GPU if you run LocateAnything / SAM3 workers locally

Verify your toolchain:

```bash
node -v   # v18 or newer
npm -v
git --version
python --version   # only if using local OCR / LocateAnything
```

## Build from source

```bash
npm install
npm run build      # outputs dist/ with hashed JS/CSS bundles
```

Serve the build through the local server:

```bash
# Unix
CHATIMAGE_STATIC_DIR=dist npm start
# Windows PowerShell
$env:CHATIMAGE_STATIC_DIR="dist"; npm start
```

## Configuration

Copy the example environment file and edit `.env.local`:

```bash
cp .env.example .env.local   # Windows: Copy-Item .env.example .env.local
```

Key variables (see `.env.example` for the full list):

| Variable | Purpose |
| --- | --- |
| `CHATIMAGE_PORT` | Local server port. Defaults to `5178`. |
| `CHATIMAGE_TEXT_API_KEY` | Text model API key. |
| `CHATIMAGE_TEXT_BASE_URL` | OpenAI-compatible text API base URL. |
| `CHATIMAGE_TEXT_MODEL` | Text model name. |
| `CHATIMAGE_API_KEY` | Image generation API key. |
| `CHATIMAGE_IMAGE_MODEL` | Image generation model name. |
| `CHATIMAGE_VISION_MODE` | Vision alignment mode: `local-ocr`, `locateanything`, `mimo-vision`, or `remote`. |
| `CHATIMAGE_LOCATEANYTHING_MODEL` | LocateAnything grounding model. |
| `CHATIMAGE_SAM3_ENABLED` | Enable optional SAM3 mask refinement. |
| `CHATIMAGE_DATABASE_PATH` | SQLite database path. Defaults to `tmp/chatimage.sqlite`. |
| `CHATIMAGE_STATIC_DIR` | Static directory served by the backend. |

Never commit `.env.local` or real API keys. The repository only includes `.env.example`.

## Demo Modes

| Mode | Requires keys | Behavior |
| --- | --- | --- |
| `mock` | No | Deterministic local providers + mock SVG output. Best for development. |
| `api` | Yes | Calls configured text, image, and vision providers through `server.js`. |
| `auto` | — | Frontend chooses based on backend configuration (default). |

Force a mode from the URL:

```text
http://127.0.0.1:5178?provider=mock
http://127.0.0.1:5178?provider=api
```

## Architecture

The generation pipeline:

1. The user submits a question in the browser.
2. The app gets or mocks a raw LLM answer.
3. The answer is normalized into a structured visual spec (`modules` + `auxiliaryModules`).
4. ChatImage plans a `LayoutSpec` with regions and normalized bounds.
5. An image prompt is generated from the structured content and layout intent.
6. The image provider creates the visual output.
7. In real-API mode, a vision/grounding step localizes the actual visual regions (LocateAnything → SAM3 refine).
8. The frontend overlays transparent hotspots on the image.
9. Clicking a hotspot opens its detail panel and follow-up thread.
10. Results and thread history are persisted locally.

Key modules:

| Path | Responsibility |
| --- | --- |
| `index.html` / `styles.css` | App shell and styling. |
| `src/app.js` | Browser orchestration and UI wiring. |
| `src/service.js` | Provider orchestration for generation and follow-up flows. |
| `src/structure.js` | Structured answer normalization + mock/fallback specs. |
| `src/layout.js` | Layout planning and hotspot geometry. |
| `src/alignment.js` | Vision alignment and hotspot calibration. |
| `src/render.js` | Result rendering utilities. |
| `src/preview-strategy.js` | Hotspot preview variant selection (cutout / organic / soft / masked). |
| `server.js` | Local HTTP server and runtime configuration. |
| `server/routes/` | API route handlers. |
| `server/store.js` | SQLite persistence. |
| `server/providers.js` | Upstream provider adapters. |
| `scripts/build.js` | Zero-dependency frontend build script. |
| `tests/` | Unit, integration, browser, and provider smoke tests. |
| `docs/TECHNICAL_REPORT.md` | Authoritative technical report. Historical notes in `docs/archive/`. |

## API Surface

| Endpoint | Description |
| --- | --- |
| `GET /api/config` | Runtime provider configuration visible to the frontend. |
| `POST /api/chatimages` | Generate and persist a ChatImage. |
| `GET /api/chatimages` | List recent ChatImages. |
| `GET /api/chatimages/:id` | Load a saved ChatImage. |
| `PATCH /api/chatimages/:id` | Update saved calibration data. |
| `POST /api/chatimages/:id/hotspots/:hotspotId/thread` | Continue a hotspot-specific follow-up thread. |
| `POST /api/llm` | Proxy text model requests. |
| `POST /api/image` | Proxy image generation requests. |
| `POST /api/vision` | Proxy vision alignment requests. |

Vision provider request / response details are documented in [`docs/archive/vision-endpoint-contract.md`](docs/archive/vision-endpoint-contract.md); the authoritative system reference is [`docs/TECHNICAL_REPORT.md`](docs/TECHNICAL_REPORT.md).

## Testing

Run the full local regression suite:

```bash
npm test
```

Run selected suites:

```bash
npm run test:core
npm run test:server
npm run test:browser
npm run test:structured-text
```

If the browser test launcher cannot find Chrome or Edge automatically:

```bash
# Unix
CHATIMAGE_BROWSER_PATH=/path/to/chrome npm run test:browser
# Windows PowerShell
$env:CHATIMAGE_BROWSER_PATH="C:\path\to\chrome.exe"; npm run test:browser
```

Real provider smoke tests are opt-in because they may call paid APIs:

```bash
CHATIMAGE_API_KEY=your_key_here npm run test:api
```

## Tech Stack

- **Frontend**: vanilla JS (browser globals), no framework, no bundler runtime
- **Backend**: Node.js HTTP server (no external web framework)
- **Persistence**: SQLite (via `better-sqlite3`)
- **Vision alignment**: LocateAnything (visual grounding), MiMo-vision, local OCR, optional SAM3 mask refinement
- **Build**: single zero-dependency concat/minify script → `dist/`
- **Testing**: Node `assert` + headless Chrome/CDP browser assertions

## Citation

If you find ChatImage useful in your research, please cite it. A technical paper draft is available in [`Arxiv/chatimage_paper/`](Arxiv/chatimage_paper) (PDF [here](Arxiv/chatimage_paper/chatimage.pdf)); the arXiv badge above will link to the published version once submitted.

```bibtex
@misc{chatimage2026,
  title  = {ChatImage: Turning Long-Form LLM Answers into Interactive Visual Images},
  author = {ChatImage Contributors},
  year   = {2026},
  url    = {https://github.com/wencanjiang/ChatImage}
}
```

## Security

- Keep all API keys in `.env.local`; never expose them in frontend code.
- The backend validates payload shape, image URL protocols, hotspot bounds, and route inputs.
- Upstream calls use configurable timeouts and a concurrency gate to avoid uncontrolled request buildup.
- Generated databases, screenshots, and diagnostics under `tmp/` are ignored by Git.

## Roadmap

- Export interactive ChatImages as shareable HTML packages.
- Richer document parsing for PDF, Word, PowerPoint, Excel, and image inputs.
- Cloud persistence and multi-device history sync.
- User-selectable visual templates and layout styles.
- Automated visual QA for generated images and hotspot accuracy.

## License

[MIT](LICENSE) © ChatImage Contributors
