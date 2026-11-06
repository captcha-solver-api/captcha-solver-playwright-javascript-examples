# Project instructions

- Use JavaScript ES modules and Node.js 22.12+. Browser automation uses Playwright.
- Use `@captcha-solver-api/javascript-sdk` for CAPTCHA solving. Do not duplicate its HTTP client.
- Keep API keys in environment variables or ignored `.env`; never commit keys or artifacts.
- Demo target templates live in `.env.example`; runtime targets come from the ignored `.env` file and should use public demos or websites the user is authorized to test.
- Keep every example understandable: show parameter extraction, task creation,
  solving, result logging, browser injection, and acceptance verification.
- Keep console step messages short and in English.
- Run `npm run check` before committing.
- Local tests must not call the paid API or create real CAPTCHA tasks.
- Live tests require explicit user authorization and use one attempt per example by default.
- Confirm page acceptance where the demo supports it; receiving an API token alone does not prove success.
- Use English Conventional Commits.
