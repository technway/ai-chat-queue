import type { GenerationState } from "../../providers/provider";
import { CHATGPT_SELECTORS } from "./selectors";

export type { GenerationState } from "../../providers/provider";

type QueryRoot = Pick<ParentNode, "querySelectorAll">;

function queryFirstVisible(
  root: QueryRoot,
  selectors: readonly string[],
): Element | null {
  for (const selector of selectors) {
    try {
      const elements = root.querySelectorAll(selector);

      for (const element of elements) {
        if (isVisible(element)) {
          return element;
        }
      }
    } catch {
      // A selector failure should not break the content script.
    }
  }

  return null;
}

function isVisible(element: Element | null): element is Element {
  if (!element) {
    return false;
  }

  if (
    element.getAttribute("aria-hidden") === "true" ||
    ("hidden" in element && element.hidden)
  ) {
    return false;
  }

  try {
    if (element.closest('[hidden], [aria-hidden="true"]')) {
      return false;
    }
  } catch {
    return false;
  }

  try {
    const style = element.ownerDocument?.defaultView?.getComputedStyle(element);

    if (
      style?.display === "none" ||
      style?.visibility === "hidden" ||
      style?.visibility === "collapse"
    ) {
      return false;
    }
  } catch {
    // Attribute checks above are still useful if computed styles are unavailable.
  }

  return true;
}

function isDisabled(element: Element): boolean {
  return (
    ("disabled" in element && element.disabled === true) ||
    element.getAttribute("aria-disabled") === "true"
  );
}

export function detectGenerationState(
  root: QueryRoot | null | undefined,
): GenerationState {
  if (!root) {
    return "unknown";
  }

  const stopButton = queryFirstVisible(root, CHATGPT_SELECTORS.stopButton);
  const pauseButton = queryFirstVisible(root, CHATGPT_SELECTORS.pauseButton);

  if (stopButton || pauseButton) {
    return "generating";
  }

  const sendButton = queryFirstVisible(root, CHATGPT_SELECTORS.sendButton);

  if (sendButton) {
    return isDisabled(sendButton) ? "unavailable" : "available";
  }

  // Signed-in ChatGPT removes the send button while the composer is empty.
  // A visible composer still gives the queue a safe place to stage text; the
  // composer adapter will retry the send once ChatGPT renders the button.
  return queryFirstVisible(root, CHATGPT_SELECTORS.composer)
    ? "unavailable"
    : "unknown";
}
