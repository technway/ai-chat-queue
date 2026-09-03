import path from "node:path";
import {
  type BrowserContext,
  test as base,
  chromium,
  type Page,
} from "@playwright/test";

const extensionPath = path.resolve(process.cwd(), ".output/chrome-mv3");
const fakeChatGptPagePath = path.resolve(
  process.cwd(),
  "e2e/fake-chatgpt.html",
);

export const test = base.extend<{ context: BrowserContext }>({
  context: async ({ browser: _browser }, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    await use(context);
    await context.close();
  },
});

export const expect = test.expect;

export async function openFakeChatGpt(page: Page): Promise<void> {
  await page.route("https://chatgpt.com/**", (route) =>
    route.fulfill({
      path: fakeChatGptPagePath,
      contentType: "text/html",
    }),
  );
  await page.goto("https://chatgpt.com/c/e2e-test");
  await expect(page.getByTestId("prompt-textarea")).toBeVisible();
}
