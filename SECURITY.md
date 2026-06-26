# Security Policy

## Supported Versions

ChatImage is currently pre-1.0 research/demo software. Security fixes should target the `main` branch unless a release branch is introduced.

## Reporting a Vulnerability

Please do not open a public issue for secrets exposure, server-side request issues, unsafe file handling, or provider key leakage.

Report privately by emailing the maintainer listed on the GitHub repository profile, or by using GitHub private vulnerability reporting if it is enabled for the repository. Include:

- A short description of the issue.
- Steps to reproduce.
- Impact and affected configuration.
- Any relevant logs with secrets removed.

We will acknowledge credible reports as quickly as possible and coordinate a fix before public disclosure.

## Security Notes

- API keys belong in `.env.local`; they must never be committed or sent to browser code.
- The backend is the only place that should call real text, image, and vision providers.
- `.env.example` must use placeholders only.
- Generated SQLite databases, diagnostics, screenshots, and provider logs should stay under ignored local paths such as `tmp/`.
- Local model paths in examples must be placeholders, not maintainer-specific absolute paths.

