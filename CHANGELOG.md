# Changelog

All notable changes to ChatImage are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-06-26

First public open-source release.

### Added
- Interactive image answers: turn a natural-language question into a structured
  visual result with transparent, clickable hotspots overlaid on a generated image.
- Per-region detail panels with their own title, summary, detail text, and
  follow-up thread.
- Vision-aligned hotspots via LocateAnything / MiMo-vision / local-OCR, with
  optional SAM3 mask refinement, so hotspots land on real visual regions.
- Provider-agnostic backend: deterministic `mock` mode with no keys, or real
  text/image/vision providers proxied so keys never reach the browser.
- Local-first persistence using the built-in `node:sqlite` module (zero npm
  dependencies).
- Curated demo showcase (`docs/`) publishing only outputs that pass a strict
  visual-alignment gate (primary grounding + SAM mask + cutout + organic preview).
- Zero-dependency frontend build to `dist/`.
- Open-source hygiene: `CONTRIBUTING.md`, `SECURITY.md`, `RELEASE_CHECKLIST.md`,
  MIT `LICENSE`, and a bilingual (EN/ZH) README.
- arXiv paper draft and technical report.

### Fixed
- Keep concrete transport/lodging map legends as real clickable targets (they
  were dropped by the scaffold-prompt filter, losing a hotspot).
- Kill the headless browser process tree on Windows (`taskkill /T`) so renderer
  child processes no longer leak and exhaust the machine across runs.
- Frontend hardening: zoom modal stacks above the composer/sidebar; the mobile
  detail panel re-centers instead of overflowing; the copy button falls back when
  the clipboard API is unavailable; `localStorage` access is guarded for private
  mode; zoom/save bind in the partial error state.
- Correct the documented Node version to 22.5+ (required by `node:sqlite`) and
  the persistence engine to `node:sqlite` (the README previously said Node 18+
  and `better-sqlite3`).
- Removed a leaked local username path from an archived doc.

### Notes
- The public showcase is a set of selected best-case outputs from the same
  ChatImage workflow, not a separate product path. Run the app in `mock` mode to
  generate new results locally without keys.

[Unreleased]: https://github.com/wencanjiang/ChatImage/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/wencanjiang/ChatImage/releases/tag/v0.1.0
