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
  readonly isTrusted?: boolean;
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

export class ChatGptSendIntegration {
  private readonly composer: ComposerPort;
  private readonly generationState: GenerationStatePort;
  private readonly queue: QueuePort;

  constructor(options: ChatGptSendIntegrationOptions) {
    this.composer = options.composer;
    this.generationState = options.generationState;
    this.queue = options.queue;
  }

  start(target: EventTarget): () => void {
    const onKeyDown: EventListener = (event) => {
      this.handleKeyboard(event as unknown as KeyboardSendEvent);
    };
    const onMouseSend: EventListener = (event) => {
      this.handleMouse(event as unknown as SendActionEvent);
    };

    target.addEventListener("keydown", onKeyDown, true);
    target.addEventListener("pointerdown", onMouseSend, true);
    target.addEventListener("click", onMouseSend, true);

    return () => {
      target.removeEventListener("keydown", onKeyDown, true);
      target.removeEventListener("pointerdown", onMouseSend, true);
      target.removeEventListener("click", onMouseSend, true);
    };
  }

  private handleKeyboard(event: KeyboardSendEvent): void {
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

  private handleMouse(event: SendActionEvent): void {
    // The drainer submits with HTMLElement.click(). Do not queue that click again.
    if (event.isTrusted === false) {
      return;
    }

    if (!this.composer.isSendButtonTarget(event.target)) {
      return;
    }

    this.enqueueWhenBusy(event);
  }

  private enqueueWhenBusy(event: SendActionEvent): void {
    const state: GenerationState = this.generationState.getState();
    const counts = this.queue.getState().counts;
    const hasUnfinishedQueue =
      counts.pending > 0 || counts.sending > 0 || counts.failed > 0;

    // Preserve FIFO order during ChatGPT's brief available state transitions.
    if (
      state !== "generating" &&
      state !== "unavailable" &&
      !hasUnfinishedQueue
    ) {
      return;
    }

    const content = this.composer.readMessage();

    if (content.trim().length === 0) {
      return;
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
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    this.composer.clearMessage();
  }
}
