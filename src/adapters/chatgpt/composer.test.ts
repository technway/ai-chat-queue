import { describe, expect, it, vi } from "vitest";
import { ChatGptComposerAdapter } from "./composer";
import { CHATGPT_SELECTORS } from "./selectors";

function createTarget(matchedSelector: string): Element {
  const element = {
    matches: vi.fn((selector: string) => selector === matchedSelector),
    closest: vi.fn((selector: string) =>
      selector === matchedSelector ? element : null,
    ),
  };

  return element as unknown as Element;
}

describe("ChatGptComposerAdapter", () => {
  it("identifies composer and send-button event targets", () => {
    const composer = createTarget(CHATGPT_SELECTORS.composer[0]);
    const sendButton = createTarget(CHATGPT_SELECTORS.sendButton[0]);
    const adapter = new ChatGptComposerAdapter({
      querySelectorAll: vi.fn(
        () => [],
      ) as unknown as ParentNode["querySelectorAll"],
    });

    expect(adapter.isComposerTarget(composer)).toBe(true);
    expect(adapter.isSendButtonTarget(sendButton)).toBe(true);
    expect(adapter.isComposerTarget(sendButton)).toBe(false);
    expect(adapter.isSendButtonTarget(null)).toBe(false);
  });

  it("reads and clears a textarea composer", () => {
    const dispatchEvent = vi.fn();
    const composer = {
      value: "Queued from textarea",
      textContent: "ignored",
      dispatchEvent,
    } as unknown as Element;
    const adapter = new ChatGptComposerAdapter({
      querySelectorAll: vi.fn((selector: string) =>
        selector === CHATGPT_SELECTORS.composer[0] ? [composer] : [],
      ) as unknown as ParentNode["querySelectorAll"],
    });

    expect(adapter.readMessage()).toBe("Queued from textarea");

    adapter.clearMessage();

    expect("value" in composer && composer.value).toBe("");
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "input", bubbles: true }),
    );
  });

  it("reads and clears a contenteditable composer", () => {
    const dispatchEvent = vi.fn();
    const composer = {
      innerText: "First paragraph\nSecond paragraph",
      textContent: "First paragraphSecond paragraph",
      dispatchEvent,
    } as unknown as Element;
    const adapter = new ChatGptComposerAdapter({
      querySelectorAll: vi.fn(() => [
        composer,
      ]) as unknown as ParentNode["querySelectorAll"],
    });

    expect(adapter.readMessage()).toBe("First paragraph\nSecond paragraph");

    adapter.clearMessage();

    expect(composer.textContent).toBe("");
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });

  it("skips hidden composer matches in favor of the visible composer", () => {
    const hiddenComposer = {
      value: "Hidden draft",
      hidden: true,
    } as unknown as Element;
    const visibleComposer = {
      value: "Visible draft",
    } as unknown as Element;
    const adapter = new ChatGptComposerAdapter({
      querySelectorAll: vi.fn((selector: string) => {
        if (selector === CHATGPT_SELECTORS.composer[0]) {
          return [hiddenComposer, visibleComposer];
        }

        return [];
      }) as unknown as ParentNode["querySelectorAll"],
    });

    expect(adapter.readMessage()).toBe("Visible draft");
  });

  it("handles missing composer selectors safely", () => {
    const adapter = new ChatGptComposerAdapter({
      querySelectorAll: vi.fn(() => {
        throw new Error("DOM unavailable");
      }),
    });

    expect(adapter.readMessage()).toBe("");
    expect(() => adapter.clearMessage()).not.toThrow();
  });
});
