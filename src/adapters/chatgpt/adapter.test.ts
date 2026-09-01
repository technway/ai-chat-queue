import { describe, expect, it, vi } from "vitest";
import { ChatGptAdapter } from "./adapter";
import { CHATGPT_SELECTORS } from "./selectors";

function createElement(disabled = false): Element {
  return {
    disabled,
    hidden: false,
    getAttribute: () => null,
    closest: () => null,
    ownerDocument: {
      defaultView: {
        getComputedStyle: () => ({
          display: "block",
          visibility: "visible",
        }),
      },
    },
  } as unknown as Element;
}

function createMutableRoot() {
  const elements = new Map<string, Element[]>();
  const root = {
    querySelectorAll: vi.fn((selector: string) => elements.get(selector) ?? []),
  } as unknown as ParentNode & Node;

  return { elements, root };
}

describe("ChatGptAdapter", () => {
  it("reports the current state and observes later state changes", () => {
    const { elements, root } = createMutableRoot();
    elements.set(CHATGPT_SELECTORS.sendButton[0], [createElement()]);

    let notify: MutationCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    const observer = { observe, disconnect };
    const adapter = new ChatGptAdapter({
      root,
      createMutationObserver: (callback) => {
        notify = callback;
        return observer;
      },
    });
    const callback = vi.fn();

    expect(adapter.getState()).toBe("available");
    expect(adapter.isGenerating()).toBe(false);

    const stopObserving = adapter.observeState(callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith("available");
    expect(observe).toHaveBeenCalledWith(
      root,
      expect.objectContaining({
        subtree: true,
        childList: true,
        attributes: true,
      }),
    );

    elements.set(CHATGPT_SELECTORS.stopButton[0], [createElement()]);
    notify?.([], observer as unknown as MutationObserver);

    expect(adapter.isGenerating()).toBe(true);
    expect(callback).toHaveBeenLastCalledWith("generating");

    notify?.([], observer as unknown as MutationObserver);
    expect(callback).toHaveBeenCalledTimes(2);

    elements.delete(CHATGPT_SELECTORS.stopButton[0]);
    elements.set(CHATGPT_SELECTORS.sendButton[0], [createElement(true)]);
    notify?.([], observer as unknown as MutationObserver);

    expect(callback).toHaveBeenLastCalledWith("unavailable");

    stopObserving();
    stopObserving();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("returns unknown safely when no DOM root is available", () => {
    const createMutationObserver = vi.fn();
    const adapter = new ChatGptAdapter({ root: null, createMutationObserver });
    const callback = vi.fn();

    expect(adapter.getState()).toBe("unknown");
    expect(adapter.isGenerating()).toBe(false);
    expect(() => adapter.observeState(callback)()).not.toThrow();
    expect(callback).toHaveBeenCalledWith("unknown");
    expect(createMutationObserver).not.toHaveBeenCalled();
  });

  it("handles MutationObserver setup failures safely", () => {
    const { elements, root } = createMutableRoot();
    elements.set(CHATGPT_SELECTORS.sendButton[0], [createElement()]);
    const callback = vi.fn();
    const adapter = new ChatGptAdapter({
      root,
      createMutationObserver: () => {
        throw new Error("MutationObserver unavailable");
      },
    });

    let stopObserving: () => void = () => undefined;

    expect(() => {
      stopObserving = adapter.observeState(callback);
    }).not.toThrow();
    expect(callback).toHaveBeenCalledWith("available");
    expect(() => stopObserving()).not.toThrow();
  });
});
