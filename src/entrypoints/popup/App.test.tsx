import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("popup shortcut", () => {
  it("uses provider-neutral product copy", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("while your AI chat is");
    expect(html).toContain("Open an AI chat");
    expect(html).not.toContain("ChatGPT");
  });

  it("renders each shortcut key separately for macOS and Windows/Linux", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html.match(/<kbd/g)).toHaveLength(6);
    expect(html).toContain("Command plus Shift plus Enter");
    expect(html).toContain("Control plus Shift plus Enter");
    expect(html).not.toContain("⌘/Ctrl+Shift+Enter");
  });
});
