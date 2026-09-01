import type { ChatGptAdapter } from "../../adapters/chatgpt/adapter";
import type { ChatGptComposerAdapter } from "../../adapters/chatgpt/composer";
import type { GenerationState } from "../../adapters/chatgpt/generation-state";
import type { QueueService } from "../../queue/queue.service";

type ComposerPort = Pick<
  ChatGptComposerAdapter,
  "isComposerTarget" | "isSendButtonTarget" | "readMessage" | "clearMessage"
>;

type GenerationStatePort = Pick<ChatGptAdapter, "getState">;
type QueuePort = Pick<QueueService, "enqueue" | "getState">;

interface SendActionEvent {
  readonly isTrusted: boolean;
  readonly target: EventTarget | null;
  preventDefault(): void;
  stopImmediatePropagation(): void;
}

interface KeyboardSendEvent extends SendActionEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly isComposing: boolean;
}

export interface ChatGptSendIntegrationOptions {
  readonly composer: ComposerPort;
  readonly generationState: GenerationStatePort;
  readonly queue: QueuePort;
}

function cancelSend(event: SendActionEvent): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function hasUnfinishedItems(queue: QueuePort): boolean {
  const { failed, pending, sending } = queue.getState().counts;
  return failed > 0 || pending > 0 || sending > 0;
}

export class ChatGptSendIntegration {
  private readonly composer: ComposerPort;
  private readonly generationState: GenerationStatePort;
  private readonly queue: QueuePort;
  private queuedPointerTarget: EventTarget | null = null;

  constructor(options: ChatGptSendIntegrationOptions) {
    this.composer = options.composer;
    this.generationState = options.generationState;
    this.queue = options.queue;
  }

  start(target: EventTarget): () => void {
    const onKeyDown: EventListener = (event) => {
      this.handleKeyboard(event as unknown as KeyboardSendEvent);
    };
    const onPointerDown: EventListener = (event) => {
      this.handlePointerDown(event as unknown as SendActionEvent);
    };
    const onClick: EventListener = (event) => {
      this.handleClick(event as unknown as SendActionEvent);
    };

    target.addEventListener("keydown", onKeyDown, true);
    target.addEventListener("pointerdown", onPointerDown, true);
    target.addEventListener("click", onClick, true);

    return () => {
      this.queuedPointerTarget = null;
      target.removeEventListener("keydown", onKeyDown, true);
      target.removeEventListener("pointerdown", onPointerDown, true);
      target.removeEventListener("click", onClick, true);
    };
  }

  private handleKeyboard(event: KeyboardSendEvent): void {
    this.queuedPointerTarget = null;

    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.isComposing ||
      !this.composer.isComposerTarget(event.target)
    ) {
      return;
    }

    this.enqueueWhenBusy(event);
  }

  private handlePointerDown(event: SendActionEvent): void {
    this.queuedPointerTarget = null;

    if (!event.isTrusted) {
      return;
    }

    if (!this.composer.isSendButtonTarget(event.target)) {
      return;
    }

    if (this.enqueueWhenBusy(event)) {
      this.queuedPointerTarget = event.target;
    }
  }

  private handleClick(event: SendActionEvent): void {
    // The drainer submits with HTMLElement.click(). Do not queue that click again.
    if (!event.isTrusted) {
      return;
    }

    if (this.queuedPointerTarget === event.target) {
      // A pointer send was already queued. Block its matching native click.
      this.queuedPointerTarget = null;
      cancelSend(event);
      return;
    }

    this.queuedPointerTarget = null;

    if (!this.composer.isSendButtonTarget(event.target)) {
      return;
    }

    this.enqueueWhenBusy(event);
  }

  private enqueueWhenBusy(event: SendActionEvent): boolean {
    const state: GenerationState = this.generationState.getState();

    // Preserve FIFO order during ChatGPT's brief available state transitions.
    if (
      state !== "generating" &&
      state !== "unavailable" &&
      !hasUnfinishedItems(this.queue)
    ) {
      return false;
    }

    const content = this.composer.readMessage();

    if (content.trim().length === 0) {
      return false;
    }

    try {
      const item = this.queue.enqueue(content);

      console.log("[message-queue] message queued", {
        id: item.id,
        length: content.length,
        lines: content.split(/\r\n|\r|\n/).length,
        state,
      });
    } catch (error) {
      console.error("[message-queue] failed to queue message", { error });
      return false;
    }

    cancelSend(event);
    this.composer.clearMessage();
    return true;
  }
}
