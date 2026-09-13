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

async function requestApproval(page: Parameters<typeof openFakeChatGpt>[0]) {
  await page.getByTestId("fake-request-approval").click();
  await expect(page.getByTestId("generation-state")).toHaveText("awaiting");
  await expect(page.getByTestId("tool-approval")).toBeVisible();
  await expect(page.getByTestId("stop-button")).toBeHidden();
}

async function queueMessage(
  page: Parameters<typeof openFakeChatGpt>[0],
  content: string,
) {
  await page.getByTestId("prompt-textarea").fill(content);
  await page.getByTestId("queue-draft-button").click();
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
test("queues the current draft with the Queue button while generating", async ({
  page,
}) => {
  await openFakeChatGpt(page);
  await startGenerating(page);

  await page.getByTestId("prompt-textarea").fill("Queue via button");

  await page.getByTestId("queue-draft-button").click();

  await expect(queueItems(page).getByTestId("queue-item-preview")).toHaveText([
    "Queue via button",
  ]);
  await expect(page.locator("#sent-messages li")).toHaveCount(0);
  await expect(page.getByTestId("prompt-textarea")).toHaveText("");

  await page.getByTestId("fake-finish-generating").click();

  await expect(page.locator("#sent-messages li")).toHaveText([
    "Queue via button",
  ]);
  await expect(queuePanel(page)).toHaveCount(0);
});

test("queues the current draft with the keyboard shortcut while generating", async ({
  page,
}) => {
  await openFakeChatGpt(page);
  await startGenerating(page);

  await page.getByTestId("prompt-textarea").fill("Queue via shortcut");
  await page.getByTestId("prompt-textarea").press("Control+Shift+Enter");

  await expect(queueItems(page).getByTestId("queue-item-preview")).toHaveText([
    "Queue via shortcut",
  ]);
  await expect(page.locator("#sent-messages li")).toHaveCount(0);
  await expect(page.getByTestId("prompt-textarea")).toHaveText("");
});

test("keyboard shortcut does not trigger ChatGPT's native send", async ({
  page,
}) => {
  await openFakeChatGpt(page);
  await startGenerating(page);

  // In the generating state ChatGPT cannot send natively. The keydown never
  // reaches the page's composer handler (the extension stops propagation), so
  // only the shortcut's own queue capture can explain the resulting state.
  await page.getByTestId("prompt-textarea").fill("Do not send natively");
  await page.getByTestId("prompt-textarea").press("Control+Shift+Enter");

  await expect(queueItems(page).getByTestId("queue-item-preview")).toHaveText([
    "Do not send natively",
  ]);
  await expect(page.locator("#sent-messages li")).toHaveCount(0);
  await expect(page.getByTestId("prompt-textarea")).toHaveText("");

  await page.getByTestId("fake-finish-generating").click();

  await expect(page.locator("#sent-messages li")).toHaveText([
    "Do not send natively",
  ]);
  await expect(queuePanel(page)).toHaveCount(0);
});

test("keeps ChatGPT's native Enter send behavior unchanged", async ({
  page,
}) => {
  await openFakeChatGpt(page);

  await page.getByTestId("prompt-textarea").fill("Native Enter message");
  await page.getByTestId("prompt-textarea").press("Enter");

  await expect(page.locator("#sent-messages li")).toHaveText([
    "Native Enter message",
  ]);
  await expect(queuePanel(page)).toHaveCount(0);
});

test("keeps Shift+Enter newline behavior unchanged", async ({ page }) => {
  await openFakeChatGpt(page);

  await page.getByTestId("prompt-textarea").fill("Line one");
  await page.getByTestId("prompt-textarea").press("Shift+Enter");
  await page.getByTestId("prompt-textarea").type("Line two");

  await expect(page.locator("#sent-messages li")).toHaveCount(0);
  await expect(queuePanel(page)).toHaveCount(0);
});

test("disables the Queue button and ignores the shortcut for empty drafts", async ({
  page,
}) => {
  await openFakeChatGpt(page);

  await expect(page.getByTestId("queue-draft-button")).toBeDisabled();

  await page.getByTestId("prompt-textarea").focus();
  await page.getByTestId("prompt-textarea").press("Control+Shift+Enter");

  await expect(queuePanel(page)).toHaveCount(0);
  await expect(page.locator("#sent-messages li")).toHaveCount(0);

  await page.getByTestId("prompt-textarea").fill("Draft");
  await expect(page.getByTestId("queue-draft-button")).toBeEnabled();
});

test("restores composer focus after queueing from the button", async ({
  page,
}) => {
  await openFakeChatGpt(page);
  await startGenerating(page);

  await page.getByTestId("prompt-textarea").fill("Keep typing");
  await page.getByTestId("queue-draft-button").click();

  await expect(queueItems(page)).toHaveCount(1);
  await expect(page.getByTestId("prompt-textarea")).toBeFocused();
});

test("explicit queue while idle does not auto-send until a turn completes", async ({
  page,
}) => {
  await openFakeChatGpt(page);

  await page.getByTestId("prompt-textarea").fill("Queued while idle");
  await page.getByTestId("queue-draft-button").click();

  await expect(queueItems(page).getByTestId("queue-item-preview")).toHaveText([
    "Queued while idle",
  ]);
  await expect(page.locator("#sent-messages li")).toHaveCount(0);
  await page.waitForTimeout(250);
  await expect(page.locator("#sent-messages li")).toHaveCount(0);

  await page.getByTestId("fake-start-generating").click();
  await page.getByTestId("fake-finish-generating").click();

  await expect(page.locator("#sent-messages li")).toHaveText([
    "Queued while idle",
  ]);
  await expect(queuePanel(page)).toHaveCount(0);
});

test("keeps queued messages when a slow new chat receives its conversation ID", async ({
  page,
}) => {
  await openFakeChatGpt(page, "https://chatgpt.com/");
  await page.getByTestId("fake-start-pending").click();
  await expect(page.getByTestId("generation-state")).toHaveText("pending");

  await queueMessage(page, "First message queued during the slow request");
  await queueMessage(page, "Second message queued during the slow request");

  await page.evaluate(() => {
    history.replaceState({}, "", "/c/delayed-conversation");
  });
  await page.getByTestId("fake-start-generating").click();

  await expect(page).toHaveURL("https://chatgpt.com/c/delayed-conversation");
  await expect(queueItems(page).getByTestId("queue-item-preview")).toHaveText([
    "First message queued during the slow request",
    "Second message queued during the slow request",
  ]);

  await page.getByTestId("fake-finish-generating").click();

  await expect(page.locator("#sent-messages li")).toHaveText([
    "First message queued during the slow request",
    "Second message queued during the slow request",
  ]);
  await expect(queuePanel(page)).toHaveCount(0);
});

test("keeps a queued message pending when ChatGPT ignores the send click", async ({
  page,
}) => {
  await openFakeChatGpt(page);
  await startGenerating(page);
  await queueMessage(page, "Retry ignored send");
  await page.getByTestId("send-button").evaluate((button) => {
    button.dataset.ignoreClicks = "true";
  });

  await page.getByTestId("fake-finish-generating").click();

  await expect(queueItems(page).getByTestId("queue-item-preview")).toHaveText([
    "Retry ignored send",
  ]);
  await expect(queueItems(page)).toHaveAttribute("data-status", "pending");
  await expect(page.locator("#sent-messages li")).toHaveCount(0);

  await page.getByTestId("send-button").evaluate((button) => {
    delete button.dataset.ignoreClicks;
  });
  await page.getByTestId("fake-start-generating").click();
  await page.getByTestId("fake-finish-generating").click();

  await expect(page.locator("#sent-messages li")).toHaveText([
    "Retry ignored send",
  ]);
  await expect(queuePanel(page)).toHaveCount(0);
});

test("sends after generation when the active-turn selector is missed", async ({
  page,
}) => {
  await openFakeChatGpt(page);
  await startGenerating(page);
  await page.getByTestId("stop-button").evaluate((button) => button.remove());

  await queueMessage(page, "Send despite selector drift");
  await page.getByTestId("fake-finish-generating").click();

  await expect(page.locator("#sent-messages li")).toHaveText([
    "Send despite selector drift",
  ]);
  await expect(queuePanel(page)).toHaveCount(0);
});

test("keeps ChatGPT's native Enter behavior unchanged while generating", async ({
  page,
}) => {
  await openFakeChatGpt(page);
  await startGenerating(page);

  // Normal Enter must stay native: ChatGPT refuses the send while streaming,
  // and the draft stays in the composer untouched by the extension.
  await page.getByTestId("prompt-textarea").fill("Not auto-queued");
  await page.getByTestId("prompt-textarea").press("Enter");

  await expect(queuePanel(page)).toHaveCount(0);
  await expect(page.locator("#sent-messages li")).toHaveCount(0);
  await expect(page.getByTestId("prompt-textarea")).toHaveText(
    "Not auto-queued",
  );
});

test("lets ChatGPT handle Enter natively during a follow-up approval", async ({
  page,
}) => {
  await openFakeChatGpt(page);
  await startGenerating(page);
  await requestApproval(page);

  // ChatGPT's "Follow up" behavior is untouched: Enter sends the draft as a
  // native follow-up instead of queueing it.
  await page.getByTestId("prompt-textarea").fill("Native follow-up");
  await page.getByTestId("prompt-textarea").press("Enter");

  await expect(page.locator("#sent-messages li")).toHaveText([
    "Native follow-up",
  ]);
  await expect(queuePanel(page)).toHaveCount(0);
});

test("does not auto-send queued messages while a tool approval is pending", async ({
  page,
}) => {
  await openFakeChatGpt(page);
  await startGenerating(page);
  await queueMessage(page, "Queued before approval");

  await requestApproval(page);

  // The approval state has the send button enabled, but the turn is unfinished
  // so the explicit queue entry must not be drained into it.
  await expect(queueItems(page).getByTestId("queue-item-preview")).toHaveText([
    "Queued before approval",
  ]);
  await expect(page.locator("#sent-messages li")).toHaveCount(0);
  await page.waitForTimeout(250);
  await expect(page.locator("#sent-messages li")).toHaveCount(0);

  await page.getByTestId("fake-approve").click();

  await expect(page.locator("#sent-messages li")).toHaveText([
    "Queued before approval",
  ]);
  await expect(queuePanel(page)).toHaveCount(0);
});

test("queues a draft during a tool approval and sends it after completion", async ({
  page,
}) => {
  await openFakeChatGpt(page);
  await startGenerating(page);
  await requestApproval(page);

  await page.getByTestId("prompt-textarea").fill("Queued during approval");
  await page.getByTestId("queue-draft-button").click();

  await expect(queueItems(page).getByTestId("queue-item-preview")).toHaveText([
    "Queued during approval",
  ]);
  await expect(page.locator("#sent-messages li")).toHaveCount(0);
  await expect(page.getByTestId("prompt-textarea")).toHaveText("");

  await page.getByTestId("fake-approve").click();

  await expect(page.locator("#sent-messages li")).toHaveText([
    "Queued during approval",
  ]);
  await expect(queuePanel(page)).toHaveCount(0);
});

test("keeps the Queue button above narrow composers and bottom-aligned beside roomy ones", async ({
  page,
}) => {
  await openFakeChatGpt(page);
  await page.addStyleTag({
    content: `
    main { max-width: 640px; margin: 80px auto; }
    #composer-container { box-sizing: border-box; width: 100%; min-height: 80px; }
  `,
  });
  const host = page.locator("ai-chat-queue-button");
  const button = page.getByTestId("queue-draft-button");
  const composer = page.locator("#composer-container");
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(host).toHaveAttribute("data-placement", "beside");
  const wideButtonBounds = await button.boundingBox();
  const wideComposerBounds = await composer.boundingBox();
  if (!wideButtonBounds || !wideComposerBounds)
    throw new Error("Missing wide button or composer bounds");
  expect(wideButtonBounds.y + wideButtonBounds.height).toBeCloseTo(
    wideComposerBounds.y + wideComposerBounds.height - 8,
    0,
  );

  await composer.evaluate((element) => {
    (element as HTMLElement).style.minHeight = "220px";
  });
  await expect
    .poll(async () => {
      const buttonBounds = await button.boundingBox();
      const composerBounds = await composer.boundingBox();
      if (!buttonBounds || !composerBounds) return undefined;
      return (
        composerBounds.y +
        composerBounds.height -
        (buttonBounds.y + buttonBounds.height)
      );
    })
    .toBeCloseTo(8, 0);

  await page.setViewportSize({ width: 375, height: 800 });
  await expect(host).toHaveAttribute("data-placement", "above");
  const buttonBounds = await button.boundingBox();
  const composerBounds = await composer.boundingBox();
  if (!buttonBounds || !composerBounds)
    throw new Error("Missing button or composer bounds");
  expect(buttonBounds.x).toBeGreaterThanOrEqual(0);
  expect(buttonBounds.x + buttonBounds.width).toBeLessThanOrEqual(375);
  expect(buttonBounds.y + buttonBounds.height).toBeLessThanOrEqual(
    composerBounds.y,
  );
  await page.getByTestId("prompt-textarea").fill("Small screen draft");
  await test.info().attach("small-screen-queue-button", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await button.click();
  await expect(queueItems(page)).toContainText("Small screen draft");
  await expect(button).toBeDisabled();
  await expect(page.getByTestId("prompt-textarea")).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(host).toHaveAttribute("data-placement", "beside");
  // A wide viewport with a full-width composer still needs the row above.
  await page.addStyleTag({ content: "main { max-width: none; }" });
  await expect(host).toHaveAttribute("data-placement", "above");
});

test("updates placement on scroll and removes the button with the composer", async ({
  page,
}) => {
  await openFakeChatGpt(page);
  await page.addStyleTag({
    content: `
    main { width: 600px; margin: 100px auto; }
    body { min-height: 2000px; }
  `,
  });
  const host = page.locator("ai-chat-queue-button");
  await expect(host).toHaveAttribute("data-placement", "beside");
  const before = await host.boundingBox();
  if (!before) throw new Error("Missing button bounds");
  await page.evaluate(() => window.scrollBy(0, 50));
  await expect
    .poll(async () => (await host.boundingBox())?.y)
    .toBeCloseTo(before.y - 50, 0);
  await page.getByTestId("prompt-textarea").fill("Keep queue on replacement");
  await page.getByTestId("queue-draft-button").click();
  await page.locator("#composer-container").evaluate((element) => {
    const replacement = element.cloneNode(true);
    element.replaceWith(replacement);
  });
  await expect(queueItems(page)).toContainText("Keep queue on replacement");
  await expect(page.locator("ai-chat-queue")).toHaveCount(1);
  await page
    .locator("#composer-container")
    .evaluate((element) => element.remove());
  await expect(host).toHaveCount(0);
  await expect(page.locator("ai-chat-queue")).toHaveCount(0);
});

test("clearing an unrelated idle draft does not send queued messages", async ({
  page,
}) => {
  await openFakeChatGpt(page);
  await queueMessage(page, "Wait for a completed turn");
  const composer = page.getByTestId("prompt-textarea");
  await composer.fill("Unrelated draft");
  await composer.fill("");
  await page.waitForTimeout(250);
  await expect(page.locator("#sent-messages li")).toHaveCount(0);
  await expect(queueItems(page)).toContainText("Wait for a completed turn");
  await startGenerating(page);
  await page.getByTestId("fake-finish-generating").click();
  await expect(page.locator("#sent-messages li")).toHaveText([
    "Wait for a completed turn",
  ]);
});

test("refreshes draft state when the page clears the composer without input events", async ({
  page,
}) => {
  await openFakeChatGpt(page);
  const composer = page.getByTestId("prompt-textarea");
  const button = page.getByTestId("queue-draft-button");
  await composer.fill("Draft cleared by the page");
  await expect(button).toBeEnabled();
  await composer.evaluate((element) => {
    element.textContent = "";
  });
  await expect(button).toBeDisabled();
});
