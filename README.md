<div align="center">
  <img src="./src/assets/logo.png" alt="ChatGPT Message Queue logo" width="128" />
	<h1>ChatGPT Message Queue</h1>
	<p>A browser extension built with WXT, React, and TypeScript.</p>
</div>

## Setup

You need Node.js and pnpm. The Node.js version is in `.nvmrc` and the pnpm version is in `package.json`.

With [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install
nvm use
```

Install pnpm 10 if needed:

```bash
npm install --global pnpm@10
```

Clone the repository and install the dependencies:

```bash
git clone https://github.com/technway/chatgpt-message-queue.git
cd chatgpt-message-queue
pnpm install
```

## Development

Start the development build with:

```bash
pnpm dev
```

The development extension is generated in `.output/chrome-mv3-dev`.

For a production build:

```bash
pnpm build
```

To load it in Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `.output/chrome-mv3`.

## Commands

```text
pnpm dev              Start the Chrome development build
pnpm dev:firefox      Start the Firefox development build
pnpm build            Build the Chrome extension
pnpm build:firefox    Build the Firefox extension
pnpm test             Run unit tests
pnpm test:e2e         Build the extension and run browser E2E tests
pnpm check            Run Biome checks
pnpm format           Format files with Biome
pnpm compile          Type-check without emitting files
pnpm zip              Create a Chrome distribution archive
pnpm zip:firefox      Create a Firefox distribution archive
```

GitHub Actions runs the checks, tests, and build for pull requests targeting `main` and pushes to `main`.

## Browser E2E tests

The browser tests load the built extension into Chromium and serve a local fake ChatGPT page. They do not connect to ChatGPT.

Install the Playwright browser once on a new machine:

```bash
pnpm exec playwright install chromium
```

Run the extension E2E suite:

```bash
pnpm test:e2e
```
