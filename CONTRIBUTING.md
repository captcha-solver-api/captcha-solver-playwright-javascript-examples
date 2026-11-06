# Contributing

Thank you for helping improve these examples. They are written for readers who
may be new to JavaScript browser automation, so clarity is more important than
removing a few repeated lines.

## Development setup

1. Install Node.js 22.12 or newer.
2. Run `npm ci`.
3. Install Chromium with `npx playwright install chromium`.
4. Set `CAPTCHA_API_KEY` only when manually running an example.
5. Run `npm run check` before opening a pull request.

Local tests must never call the paid API. Do not commit API keys, credentials,
`.env`, screenshots, or test artifacts.

## Example guidelines

- Use JavaScript ES modules and Playwright.
- Use `@captcha-solver-api/javascript-sdk`; do not implement another API client.
- Keep parameter extraction, task creation, solution logging, browser injection,
  submission, and acceptance verification easy to find.
- Print CAPTCHA parameters and the service task ID.
- Use the shared helpers where they improve reliability and consistency.
- Prefer straightforward code over unnecessary abstraction.
- Keep all console step messages short and in English.

## Pull requests

Keep each pull request focused, explain how it was tested, and use English
Conventional Commits such as `feat: add a Playwright example`. Live checks must
be authorized by a maintainer and must use only demo pages or websites the
maintainer is authorized to test.

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
