import { describe, expect, it, vi } from "vitest";
import { detectGenerationState } from "./generation-state";
import { CHATGPT_SELECTORS } from "./selectors";

interface MockElementOptions {
  readonly disabled?: boolean;
  readonly ariaDisabled?: boolean;
  readonly hidden?: boolean;
  readonly ariaHidden?: boolean;
  readonly display?: string;
  readonly visibility?: string;
}

function createElement(options: MockElementOptions = {}): Element {
  const element = {
    disabled: options.disabled ?? false,
    hidden: options.hidden ?? false,
    getAttribute: (name: string) => {
      if (name === "aria-disabled" && options.ariaDisabled) {
        return "true";
      }

      if (name === "aria-hidden" && options.ariaHidden) {
        return "true";
      }

      return null;
    },
    closest: () =>
      options.hidden || options.ariaHidden
        ? (element as unknown as Element)
        : null,
    ownerDocument: {
      defaultView: {
        getComputedStyle: () => ({
          display: options.display ?? "block",
          visibility: options.visibility ?? "visible",
        }),
      },
    },
  };

  return element as unknown as Element;
}

function createRoot(
  elements: Record<string, Element | readonly Element[]> = {},
): ParentNode {
  return {
    querySelectorAll: vi.fn((selector: string) => {
      const matches = elements[selector];

      if (!matches) {
        return [];
      }

      return Array.isArray(matches) ? matches : [matches];
    }),
  } as unknown as ParentNode;
}

describe("detectGenerationState", () => {
  it("detects a visible stop button as generating", () => {
    const root = createRoot({
      [CHATGPT_SELECTORS.stopButton[0]]: createElement(),
    });

    expect(detectGenerationState(root)).toBe("generating");
  });

  it("detects a visible pause button as generating", () => {
    const root = createRoot({
      [CHATGPT_SELECTORS.pauseButton[0]]: createElement(),
    });

    expect(detectGenerationState(root)).toBe("generating");
  });

  it("skips a hidden selector fallback when a later one is visible", () => {
    const root = createRoot({
      [CHATGPT_SELECTORS.stopButton[0]]: createElement({ hidden: true }),
      [CHATGPT_SELECTORS.stopButton[1]]: createElement(),
    });

    expect(detectGenerationState(root)).toBe("generating");
  });

  it("skips hidden elements when one selector matches multiple controls", () => {
    const root = createRoot({
      [CHATGPT_SELECTORS.stopButton[0]]: [
        createElement({ hidden: true }),
        createElement(),
      ],
    });

    expect(detectGenerationState(root)).toBe("generating");
  });

  it("detects an enabled send button as available", () => {
    const root = createRoot({
      [CHATGPT_SELECTORS.sendButton[0]]: createElement(),
    });

    expect(detectGenerationState(root)).toBe("available");
  });

  it.each([
    { disabled: true },
    { ariaDisabled: true },
  ] satisfies MockElementOptions[])(
    "detects a disabled send button as unavailable",
    (options) => {
      const root = createRoot({
        [CHATGPT_SELECTORS.sendButton[0]]: createElement(options),
      });

      expect(detectGenerationState(root)).toBe("unavailable");
    },
  );

  it("ignores hidden generation controls", () => {
    const root = createRoot({
      [CHATGPT_SELECTORS.stopButton[0]]: createElement({ hidden: true }),
      [CHATGPT_SELECTORS.pauseButton[0]]: createElement({ display: "none" }),
      [CHATGPT_SELECTORS.sendButton[0]]: createElement(),
    });

    expect(detectGenerationState(root)).toBe("available");
  });

  it("returns unknown when the send button is hidden", () => {
    const root = createRoot({
      [CHATGPT_SELECTORS.sendButton[0]]: createElement({
        visibility: "hidden",
      }),
    });

    expect(detectGenerationState(root)).toBe("unknown");
  });

  it("returns unknown when controls are missing", () => {
    expect(detectGenerationState(createRoot())).toBe("unknown");
    expect(detectGenerationState(null)).toBe("unknown");
  });

  it("handles selector failures safely", () => {
    const root = {
      querySelectorAll: vi.fn(() => {
        throw new Error("DOM unavailable");
      }),
    } as unknown as ParentNode;

    expect(detectGenerationState(root)).toBe("unknown");
  });
});
