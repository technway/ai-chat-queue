# Contributing

Thanks for helping improve AI Chat Queue.

This project follows the practical recommendations in the [Open Source Guides](https://opensource.guide/).

## Before coding

1. Search existing issues or open a new issue describing the problem and proposed behavior.
2. Keep changes focused on one problem.
3. For ChatGPT DOM changes, update the adapter and selector tests rather than querying ChatGPT directly from queue or UI code.

## Local setup

```bash
pnpm install
pnpm exec playwright install chromium
```

Use the Node.js version in `.nvmrc` and pnpm 10.

## Validation

Run the checks relevant to your change before opening a pull request:

```bash
pnpm check
pnpm compile
pnpm test
pnpm test:e2e
```

The E2E tests use a local fake ChatGPT page, so contributions must not require a logged-in account or the production ChatGPT site.

## Pull requests

- Explain the user-visible behavior and implementation scope.
- Include tests, or explain why a test is not practical.
- Include a screenshot or short recording for UI changes.
- Mention any ChatGPT selector or browser compatibility assumptions.
- Keep generated build output, Playwright reports, and local credentials out of commits.
