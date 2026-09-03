import { expect, openFakeChatGpt, test } from "./fixtures";

function queuePanel(page: Parameters<typeof openFakeChatGpt>[0]) {
  return page.getByTestId("queue-panel");
}

function queueItems(page: Parameters<typeof openFakeChatGpt>[0]) {
  return queuePanel(page).getByTestId("queue-item");
}

async function startGenerating(page: Parameters<typeof openFakeChatGpt>[0]) {
  await page.getByTestId("fake-start-generating").click();
  await expect(page.getByTestId("generation-state")).toHaveText("generating");
  await expect(page.getByTestId("send-button")).toBeDisabled();
  await expect(page.getByTestId("stop-button")).toBeVisible();
}

async function queueMessage(
  page: Parameters<typeof openFakeChatGpt>[0],
  content: string,
) {
  await page.getByTestId("prompt-textarea").fill(content);
  await page.getByTestId("prompt-textarea").press("Enter");
  await expect(queueItems(page).filter({ hasText: content })).toHaveCount(1);
}

test("sends a message normally", async ({ page }) => {
  await openFakeChatGpt(page);

  await page.getByTestId("prompt-textarea").fill("Normal message");
  await page.getByTestId("send-button").click();

  await expect(page.locator("#sent-messages li")).toHaveText([
    "Normal message",
  ]);
  await expect(queuePanel(page)).toHaveCount(0);
});

test("queues a message while ChatGPT is generating", async ({ page }) => {
  await openFakeChatGpt(page);
  await startGenerating(page);

  await queueMessage(page, "Queued while generating");

  await expect(queueItems(page)).toHaveCount(1);
  await expect(page.locator("#sent-messages li")).toHaveCount(0);
});

test("sends a queued message after generation finishes", async ({ page }) => {
  await openFakeChatGpt(page);
  await startGenerating(page);
  await queueMessage(page, "Send after generation");

  await page.getByTestId("fake-finish-generating").click();

  await expect(page.locator("#sent-messages li")).toHaveText([
    "Send after generation",
  ]);
  await expect(queuePanel(page)).toHaveCount(0);
});

test("sends multiple queued messages in order", async ({ page }) => {
  await openFakeChatGpt(page);
  await startGenerating(page);
  await queueMessage(page, "First queued");
  await queueMessage(page, "Second queued");
  await queueMessage(page, "Third queued");

  await page.getByTestId("fake-finish-generating").click();

  await expect(page.locator("#sent-messages li")).toHaveText([
    "First queued",
    "Second queued",
    "Third queued",
  ]);
  await expect(queuePanel(page)).toHaveCount(0);
});

test("reorders queued messages before sending", async ({ page }) => {
  await openFakeChatGpt(page);
  await startGenerating(page);
  await queueMessage(page, "First queued");
  await queueMessage(page, "Second queued");
  await queueMessage(page, "Third queued");

  await page.getByRole("button", { name: "Move queued message 3 up" }).click();

  await expect(queueItems(page).getByTestId("queue-item-preview")).toHaveText([
    "First queued",
    "Third queued",
    "Second queued",
  ]);

  await page.getByTestId("fake-finish-generating").click();

  await expect(page.locator("#sent-messages li")).toHaveText([
    "First queued",
    "Third queued",
    "Second queued",
  ]);
  await expect(queuePanel(page)).toHaveCount(0);
});

test("reorders queued messages with drag and drop", async ({ page }) => {
  await openFakeChatGpt(page);
  await startGenerating(page);
  await queueMessage(page, "First queued");
  await queueMessage(page, "Second queued");
  await queueMessage(page, "Third queued");

  await queueItems(page)
    .filter({ hasText: "Third queued" })
    .getByRole("button", { name: "Drag queued message 3 to reorder" })
    .dragTo(queueItems(page).filter({ hasText: "First queued" }));

  await expect(queueItems(page).getByTestId("queue-item-preview")).toHaveText([
    "Third queued",
    "First queued",
    "Second queued",
  ]);
});

test("edits a queued message and pauses at its position", async ({ page }) => {
  await openFakeChatGpt(page);
  await startGenerating(page);
  await queueMessage(page, "First queued");
  await queueMessage(page, "Second queued");
  await queueMessage(page, "Third queued");

  await page.getByRole("button", { name: "Edit queued message 2" }).click();
  await page
    .getByRole("textbox", { name: "Edit queued message 2" })
    .fill("Second edited");

  await page.getByTestId("fake-finish-generating").click();

  await expect(page.locator("#sent-messages li")).toHaveText(["First queued"]);
  await expect(
    page.getByRole("textbox", { name: "Edit queued message 1" }),
  ).toHaveValue("Second edited");

  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.locator("#sent-messages li")).toHaveText([
    "First queued",
    "Second edited",
    "Third queued",
  ]);
  await expect(queuePanel(page)).toHaveCount(0);
});

test("restores a queued message after refresh", async ({ page }) => {
  await openFakeChatGpt(page);
  await startGenerating(page);
  await queueMessage(page, "Restore after refresh");

  await page.waitForTimeout(100);
  await page.reload();

  await expect(queueItems(page)).toContainText("Restore after refresh");
  await expect(
    page.getByRole("button", { name: "Resume queue" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Resume queue" }).click();

  await expect(page.locator("#sent-messages li")).toHaveText([
    "Restore after refresh",
  ]);
  await expect(queuePanel(page)).toHaveCount(0);
});
