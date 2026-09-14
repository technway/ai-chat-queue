import { expect, test } from "./fixtures";

function expectGrayscale(color: string): void {
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);

  expect(channels, color).toHaveLength(3);
  expect(channels?.[0], color).toBe(channels?.[1]);
  expect(channels?.[1], color).toBe(channels?.[2]);
}

test("uses distinct grayscale popup palettes in light and dark themes", async ({
  context,
}) => {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(worker.url()).host;
  const popup = await context.newPage();
  const backgrounds: string[] = [];

  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  for (const theme of ["light", "dark"] as const) {
    await popup.emulateMedia({ colorScheme: theme });
    const root = popup.locator(".popup-root");
    await expect(root).toHaveCSS("color-scheme", theme);

    const colors = await root.evaluate((element) => {
      const button = element.querySelector("a");
      const key = element.querySelector("kbd");

      return [
        getComputedStyle(element).backgroundColor,
        getComputedStyle(element).color,
        button ? getComputedStyle(button).backgroundColor : "",
        button ? getComputedStyle(button).color : "",
        key ? getComputedStyle(key).backgroundColor : "",
        key ? getComputedStyle(key).color : "",
      ];
    });

    backgrounds.push(colors[0] ?? "");
    for (const color of colors) {
      expectGrayscale(color);
    }
  }

  expect(backgrounds[0]).not.toBe(backgrounds[1]);
});
