import type { QueueService } from "./queue.service";

export type QueueSendResult = "sent" | "deferred" | "staged";

type QueueDrainStore = Pick<
  QueueService,
  "claimNextPending" | "markPending" | "markSent" | "markFailed"
>;

export interface QueueMessageSender {
  send(content: string): QueueSendResult | Promise<QueueSendResult>;
}

export interface QueueDrainerOptions {
  readonly queue: QueueDrainStore;
  readonly sender: QueueMessageSender;
}

export class QueueDrainer {
  private armed = true;
  private halted = false;
  private inFlight = false;
  private paused = false;
  private retryRequested = false;
  private stopped = false;

  constructor(private readonly options: QueueDrainerOptions) {}

  markGenerating(): void {
    if (!this.halted && !this.paused && !this.stopped) {
      this.armed = true;
    }
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    if (!this.halted && !this.stopped) {
      this.paused = false;
      this.armed = true;
    }
  }

  reset(paused = false): void {
    if (this.stopped) {
      return;
    }

    this.armed = true;
    this.halted = false;
    this.paused = paused;
    this.retryRequested = false;
  }

  async drainNext(): Promise<void> {
    if (this.paused || this.stopped) {
      return;
    }

    if (this.inFlight) {
      // Do not lose an availability change that occurs while staging the text.
      this.retryRequested = true;
      return;
    }

    if (this.halted || !this.armed) {
      return;
    }

    const item = this.options.queue.claimNextPending();

    if (!item) {
      return;
    }

    this.armed = false;
    this.inFlight = true;
    let staged = false;

    try {
      const result = await this.options.sender.send(item.content);

      if (result === "deferred") {
        this.options.queue.markPending(item.id);
        this.armed = true;
        console.log("[message-queue] queue drain deferred", { id: item.id });
        return;
      }

      if (result === "staged") {
        this.options.queue.markPending(item.id);
        this.armed = true;
        staged = true;
        console.log("[message-queue] queued message staged", { id: item.id });
        return;
      }

      this.options.queue.markSent(item.id);
      console.log("[message-queue] queued message sent", { id: item.id });
    } catch (error) {
      this.options.queue.markFailed(item.id);
      this.halted = true;
      console.error("[message-queue] queue draining halted", {
        error,
        id: item.id,
      });
    } finally {
      this.inFlight = false;

      const shouldRetry = staged && this.retryRequested;
      this.retryRequested = false;

      if (shouldRetry) {
        await this.drainNext();
      }
    }
  }

  stop(): void {
    this.stopped = true;
  }
}
