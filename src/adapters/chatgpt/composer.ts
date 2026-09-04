import { CHATGPT_SELECTORS } from "./selectors";

type ComposerRoot = Pick<ParentNode, "querySelectorAll">;
type SettleDom = () => Promise<void>;

function settleDom(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}

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

function isDisabled(element: Element): boolean {
  return (
    ("disabled" in element && element.disabled === true) ||
    element.getAttribute("aria-disabled") === "true"
  );
}

function isVoiceButton(element: Element): boolean {
  const label = element.getAttribute("aria-label")?.toLowerCase() ?? "";

  if (label.includes("voice") || label.includes("dictation")) {
    return true;
  }

  try {
    return (
      typeof element.querySelector === "function" &&
      element.querySelector('use[href*="voice" i]') !== null
    );
  } catch {
    return false;
  }
}

function readComposer(composer: Element): string {
  if ("value" in composer && typeof composer.value === "string") {
    return composer.value;
  }

  if ("innerText" in composer && typeof composer.innerText === "string") {
    return composer.innerText;
  }

  return composer.textContent ?? "";
}

function writeComposer(composer: Element, content: string): void {
  if ("value" in composer && typeof composer.value === "string") {
    const prototype = Object.getPrototypeOf(composer);
    const valueSetter = Object.getOwnPropertyDescriptor(
      prototype,
      "value",
    )?.set;

    if (valueSetter) {
      valueSetter.call(composer, content);
    } else {
      composer.value = content;
    }
  } else {
    composer.textContent = content;
  }

  const view = composer.ownerDocument?.defaultView;
  const InputEventConstructor = view?.InputEvent ?? globalThis.InputEvent;
  const EventConstructor = view?.Event ?? Event;

  if (typeof InputEventConstructor === "function") {
    composer.dispatchEvent(
      new InputEventConstructor("input", {
        bubbles: true,
        composed: true,
        data: content || null,
        inputType: content ? "insertText" : "deleteContentBackward",
      }),
    );
  } else {
    composer.dispatchEvent(new EventConstructor("input", { bubbles: true }));
  }

  composer.dispatchEvent(new EventConstructor("change", { bubbles: true }));
}

export class ChatGptComposerAdapter {
  private writingMessage = false;

  constructor(
    private readonly root: ComposerRoot,
    private readonly waitForDom: SettleDom = settleDom,
  ) {}

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
    return composer ? readComposer(composer) : "";
  }

  isWritingMessage(): boolean {
    return this.writingMessage;
  }

  clearMessage(): void {
    const composer = this.findComposer();

    if (!composer) {
      return;
    }

    try {
      this.writeMessage(composer, "");
    } catch {
      // Clearing the DOM value is still useful if an input event cannot be sent.
    }
  }

  async send(content: string): Promise<"sent" | "deferred" | "staged"> {
    const composer = this.findComposer();

    if (!composer) {
      throw new Error("ChatGPT composer is unavailable");
    }

    const existingContent = readComposer(composer);
    const hasUserDraft =
      existingContent.trim().length > 0 && existingContent !== content;

    if (hasUserDraft) {
      console.log("[message-queue] automatic send deferred", {
        draftLength: existingContent.length,
        reason: "user-draft-present",
      });
      return "deferred";
    }

    if (existingContent !== content) {
      this.writeMessage(composer, content);
    }

    await this.waitForDom();

    const activeComposer = this.findComposer();

    if (!activeComposer) {
      throw new Error("ChatGPT composer disappeared before sending");
    }

    const activeContent = readComposer(activeComposer);

    if (activeContent !== content) {
      console.log("[message-queue] automatic send deferred", {
        actualLength: activeContent.length,
        expectedLength: content.length,
        reason: "composer-changed",
      });
      return "deferred";
    }

    const sendButton = this.findEnabledSendButton();

    if (!sendButton) {
      // React enables the button later. Keep the exact queued text for retry.
      return "staged";
    }

    sendButton.click();
    return "sent";
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

  private writeMessage(composer: Element, content: string): void {
    this.writingMessage = true;

    try {
      writeComposer(composer, content);
    } finally {
      this.writingMessage = false;
    }
  }

  private findEnabledSendButton(): HTMLElement | null {
    for (const selector of CHATGPT_SELECTORS.sendButton) {
      try {
        const buttons = this.root.querySelectorAll(selector);

        for (const button of buttons) {
          if (
            isVisible(button) &&
            !isDisabled(button) &&
            !isVoiceButton(button)
          ) {
            return button as HTMLElement;
          }
        }
      } catch {
        // Try the remaining selector fallbacks.
      }
    }

    return null;
  }
}
