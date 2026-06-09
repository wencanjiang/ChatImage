# ChatImage

ChatImage turns a long-form LLM answer into an interactive visual image. It generates a structured infographic, overlays transparent clickable hotspots, and lets users continue asking follow-up questions inside each visual region.

The project is built as a lightweight web application with a vanilla frontend and a local Node.js server. It can run fully in mock mode for development, or proxy real text, image, and vision/OCR providers through the backend so API keys never need to live in browser code.

## Highlights

- Interactive image answers: convert a prompt into a structured visual result with clickable regions.
- Hotspot detail panels: each region keeps its own title, summary, detail text, and follow-up thread.
- Provider modes: use mock providers locally, or enable real LLM, image, and vision alignment APIs.
- Vision alignment: real image mode can use OCR/vision localization to align hotspots with generated image regions.
- Local persistence: generated ChatImages, hotspots, and follow-up messages are stored in SQLite.
- File context: upload text-friendly files and include their contents as prompt context.
- Build output: ship a static `dist/` bundle with hashed JS/CSS assets.
- Test coverage: core logic, layout, alignment, server routes, security checks, browser smoke tests, and API adapters.

## Demo Modes

ChatImage supports two main runtime modes:

- `mock`: no API keys required. The app uses deterministic local providers and mock SVG output.
- `api`: calls configured upstream services through `server.js`.

You can force a mode from the URL:

```text
http://127.0.0.1:5178?provider=mock
http://127.0.0.1:5178?provider=api
```

When no provider is specified, the frontend uses `auto` and chooses the available runtime path based on backend configuration.

## Quick Start

### Requirements

- Node.js 18 or newer
- npm
- Optional: Python, if you enable local OCR or LocateAnything-based alignment

### Install

```powershell
npm install
```

### Run Locally

```powershell
npm start
```

Open:

```text
http://127.0.0.1:5178
```

For a no-key local demo, open the app with:

```text
http://127.0.0.1:5178?provider=mock
```

### Build

```powershell
npm run build
```

Build artifacts are written to `dist/`.

To serve the build through the local server:

```powershell
$env:CHATIMAGE_STATIC_DIR="dist"
npm start
```

## Configuration

Copy the example environment file:

```powershell
Copy-Item .env.example .env.local
```

Then edit `.env.local` with your own keys and endpoints.

Important variables:

| Variable | Purpose |
| --- | --- |
| `CHATIMAGE_PORT` | Local server port. Defaults to `5178`. |
| `CHATIMAGE_API_KEY` | Shared fallback API key for upstream providers. |
| `CHATIMAGE_TEXT_API_KEY` | Text model API key. |
| `CHATIMAGE_TEXT_BASE_URL` | OpenAI-compatible text API base URL. |
| `CHATIMAGE_TEXT_ENDPOINT` | Explicit text endpoint override. |
| `CHATIMAGE_TEXT_MODEL` | Text model name. |
| `CHATIMAGE_TEXT_REQUEST_FORMAT` | `openai-chat` or provider-specific format. |
| `CHATIMAGE_IMAGE_MODEL` | Image generation model name. |
| `CHATIMAGE_VISION_MODE` | Vision alignment mode, such as `local-ocr` or provider-backed alignment. |
| `CHATIMAGE_VISION_ENDPOINT` | Vision model endpoint for image-region localization. |
| `CHATIMAGE_VISION_API_KEY` | Vision provider API key. |
| `CHATIMAGE_LOCAL_OCR_PYTHON` | Python executable for local OCR worker. |
| `CHATIMAGE_LOCATEANYTHING_PYTHON` | Python executable for LocateAnything worker. |
| `CHATIMAGE_DATABASE_PATH` | SQLite database path. Defaults to `tmp/chatimage.sqlite`. |
| `CHATIMAGE_STATIC_DIR` | Static directory served by the backend. Defaults to the project root. |
| `CHATIMAGE_MAX_UPSTREAM_REQUESTS` | In-process concurrency limit for upstream API calls. |

Never commit `.env.local` or real API keys. The repository only includes `.env.example`.

## Architecture

The generation pipeline is:

1. The user submits a question in the browser.
2. The app gets or mocks a raw LLM answer.
3. The answer is normalized into a visual content structure.
4. ChatImage plans a `LayoutSpec` with regions and normalized bounds.
5. An image prompt is generated from the structured content and layout intent.
6. The image provider creates the visual output.
7. In real API mode, a vision/OCR step localizes the actual visual regions.
8. The frontend overlays transparent hotspots on the image.
9. Clicking a hotspot opens its detail and follow-up thread.
10. Results and thread history are persisted locally.

Key modules:

| Path | Responsibility |
| --- | --- |
| `index.html` | Main app shell. |
| `styles.css` | Application styling. |
| `src/app.js` | Browser orchestration and UI wiring. |
| `src/service.js` | Provider orchestration for generation and follow-up flows. |
| `src/structure.js` | Structured answer normalization. |
| `src/layout.js` | Layout planning and hotspot geometry. |
| `src/alignment.js` | Vision alignment and hotspot calibration helpers. |
| `src/render.js` | Result rendering utilities. |
| `server.js` | Local HTTP server and runtime configuration. |
| `server/routes/` | API route handlers. |
| `server/store.js` | SQLite persistence. |
| `server/providers.js` | Upstream provider adapters. |
| `scripts/build.js` | Zero-dependency frontend build script. |
| `tests/` | Unit, integration, browser, and provider smoke tests. |
| `docs/` | Product, technical, and API contract notes. |

## API Surface

The local server exposes these main endpoints:

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
| `GET /api/llm/health` | Check text provider configuration. |
| `POST /api/vision/health` | Verify that the vision provider can inspect an image. |

For the vision contract, see `docs/vision-endpoint-contract.md`.

## File Upload Support

The browser can read text-oriented files and attach their contents as prompt context.

Supported examples include:

- Text and markup: `.txt`, `.md`, `.markdown`, `.rst`, `.adoc`
- Data: `.csv`, `.tsv`, `.json`, `.jsonl`, `.yaml`, `.yml`, `.toml`, `.ipynb`
- Web formats: `.html`, `.htm`, `.xml`, `.svg`
- Logs and config: `.log`, `.ini`, `.conf`, `.properties`, `.env`
- Common source code formats: `.js`, `.ts`, `.tsx`, `.jsx`, `.py`, `.java`, `.go`, `.rs`, `.cpp`, `.cs`, `.php`, `.rb`, `.swift`, `.kt`, `.sh`, `.ps1`, `.sql`, `.graphql`

Current limits:

- Up to 5 files per request
- Up to 512 KB per file
- Binary documents such as PDF, Word, PowerPoint, Excel, images, and archives are not parsed in the MVP

## Testing

Run the full local regression suite:

```powershell
npm test
```

Run selected suites:

```powershell
npm run test:core
npm run test:server
npm run test:browser
npm run test:structured-text
```

If the browser test launcher cannot find Chrome or Edge automatically:

```powershell
$env:CHATIMAGE_BROWSER_PATH="C:\path\to\chrome.exe"
npm run test:browser
```

Real provider smoke tests are opt-in because they may call paid APIs:

```powershell
$env:CHATIMAGE_API_KEY="your_key_here"
npm run test:api
```

## Development Notes

- The frontend is intentionally dependency-light and uses browser globals under `src/`.
- The build script concatenates and minifies local assets into `dist/`.
- SQLite data, screenshots, diagnostics, and other generated files live under `tmp/` by default.
- Real API mode requires a vision alignment strategy for reliable hotspot placement.
- Debug and calibration data are exposed in development flows to make visual alignment failures easier to inspect.

## Security

- Keep all API keys in `.env.local`; never expose them in frontend code.
- The backend validates payload shape, image URL protocols, hotspot bounds, and route inputs.
- Upstream calls use configurable timeouts and a concurrency gate to avoid uncontrolled request buildup.
- Generated local databases and diagnostics are ignored by Git.

## Roadmap

- Export interactive ChatImages as shareable HTML packages.
- Add richer document parsing for PDF, Word, PowerPoint, Excel, and image inputs.
- Support cloud persistence and multi-device history sync.
- Add user-selectable visual templates and layout styles.
- Improve automated visual QA for generated images and hotspot accuracy.

## License

No license has been specified yet. Add a `LICENSE` file before publishing this repository for public reuse.
