import type { ProviderComposerPort } from "../providers/provider";
import type { QueueService } from "../queue/queue.service";

export type QueueActionResult = "queued" | "ignored" | "failed";

export type QueueActionComposerPort = Pick<
  ProviderComposerPort,
  "isComposerTarget" | "readMessage" | "clearMessage" | "focusMessage"
>;

export interface QueueActionOptions {
  readonly composer: QueueActionComposerPort;
  readonly queue: Pick<QueueService, "enqueue">;
}

interface QueueShortcutEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly isComposing: boolean;
  readonly isTrusted: boolean;
  readonly target: EventTarget | null;
  preventDefault(): void;
  stopImmediatePropagation(): void;
}

function isQueueShortcutKey(event: QueueShortcutEvent): boolean {
  return (
    event.key === "Enter" && event.shiftKey && (event.metaKey || event.ctrlKey)
  );
}

/**
 * Explicitly queues the current composer draft.
 *
 * This action is intentionally decoupled from ChatGPT's generation state and
 * send-button state: the user decides when to queue through the Queue button
 * or the Cmd/Ctrl+Shift+Enter shortcut. Automatic draining keeps using the
 * generation state and is owned by QueueDrainer.
 */
export class QueueActionIntegration {
  private readonly composer: QueueActionComposerPort;
  private readonly queue: Pick<QueueService, "enqueue">;

  constructor(options: QueueActionOptions) {
    this.composer = options.composer;
    this.queue = options.queue;
  }

  start(target: EventTarget): () => void {
    const onKeyDown: EventListener = (event) => {
      this.handleKeyDown(event as unknown as QueueShortcutEvent);
    };

    target.addEventListener("keydown", onKeyDown, true);

    return () => {
      target.removeEventListener("keydown", onKeyDown, true);
    };
  }

  queueDraft(): QueueActionResult {
    const content = this.composer.readMessage();

    if (content.trim().length === 0) {
      return "ignored";
    }

    try {
      this.queue.enqueue(content);
    } catch (error) {
      console.error("[ai-chat-queue] explicit queue failed", { error });
      return "failed";
    }

    console.log("[ai-chat-queue] explicit message queued", {
      length: content.length,
      lines: content.split(/\r\n|\r|\n/).length,
    });

    this.composer.clearMessage();
    this.composer.focusMessage();
    return "queued";
  }

  private handleKeyDown(event: QueueShortcutEvent): void {
    if (
      event.isComposing ||
      !event.isTrusted ||
      !isQueueShortcutKey(event) ||
      !this.composer.isComposerTarget(event.target)
    ) {
      return;
    }

    // The reserved combination must never reach ChatGPT's native handlers,
    // which would otherwise insert a newline or send the message.
    event.preventDefault();
    event.stopImmediatePropagation();

    this.queueDraft();
  }
}
