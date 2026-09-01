import { CHATGPT_SELECTORS } from "./selectors";

type ComposerRoot = Pick<ParentNode, "querySelectorAll">;

function asElement(target: EventTarget | null): Element | null {
  return target && "closest" in target ? (target as Element) : null;
}

function matchesAny(element: Element, selectors: readonly string[]): boolean {
  for (const selector of selectors) {
    try {
      if (element.matches(selector) || element.closest(selector)) {
        return true;
      }
    } catch {
      // A selector failure should not break native composer behavior.
    }
  }

  return false;
}

function isVisible(element: Element): boolean {
  if ("hidden" in element && element.hidden) {
    return false;
  }

  try {
    if (element.getAttribute("aria-hidden") === "true") {
      return false;
    }
  } catch {
    // Continue with the remaining visibility checks.
  }

  try {
    if (element.closest('[hidden], [aria-hidden="true"]')) {
      return false;
    }
  } catch {
    // Continue when ancestor visibility cannot be inspected.
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
    // Attribute checks are sufficient when computed styles are unavailable.
  }

  return true;
}

export class ChatGptComposerAdapter {
  constructor(private readonly root: ComposerRoot) {}

  isComposerTarget(target: EventTarget | null): boolean {
    const element = asElement(target);
    return element ? matchesAny(element, CHATGPT_SELECTORS.composer) : false;
  }

  isSendButtonTarget(target: EventTarget | null): boolean {
    const element = asElement(target);
    return element ? matchesAny(element, CHATGPT_SELECTORS.sendButton) : false;
  }

  readMessage(): string {
    const composer = this.findComposer();

    if (!composer) {
      return "";
    }

    if ("value" in composer && typeof composer.value === "string") {
      return composer.value;
    }

    if ("innerText" in composer && typeof composer.innerText === "string") {
      return composer.innerText;
    }

    return composer.textContent ?? "";
  }

  clearMessage(): void {
    const composer = this.findComposer();

    if (!composer) {
      return;
    }

    if ("value" in composer && typeof composer.value === "string") {
      composer.value = "";
    } else {
      composer.textContent = "";
    }

    try {
      composer.dispatchEvent(new Event("input", { bubbles: true }));
    } catch {
      // Clearing the DOM value is still useful if an input event cannot be sent.
    }
  }

  private findComposer(): Element | null {
    for (const selector of CHATGPT_SELECTORS.composer) {
      try {
        const composers = this.root.querySelectorAll(selector);

        for (const composer of composers) {
          if (isVisible(composer)) {
            return composer;
          }
        }
      } catch {
        // Try the remaining selector fallbacks.
      }
    }

    return null;
  }
}
