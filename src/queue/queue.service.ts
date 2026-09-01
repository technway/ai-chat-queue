import { MessageQueue } from "./queue";
import type { QueueItem, QueueItemStatus, QueueState } from "./queue.types";

export interface QueueServiceEvent {
  readonly type: "queued" | "status-changed";
  readonly item: QueueItem;
  readonly state: QueueState;
}

export type QueueServiceListener = (event: QueueServiceEvent) => void;

export class QueueService {
  private readonly listeners = new Set<QueueServiceListener>();

  constructor(private readonly queue = new MessageQueue()) {}

  enqueue(content: string): QueueItem {
    const item = this.queue.add(content);
    this.publish("queued", item);
    return item;
  }

  claimNextPending(): QueueItem | undefined {
    const item = this.queue.getNextPending();
    return item ? this.updateStatus(item.id, "sending") : undefined;
  }

  markPending(id: string): QueueItem | undefined {
    return this.updateStatus(id, "pending");
  }

  markSent(id: string): QueueItem | undefined {
    return this.updateStatus(id, "sent");
  }

  markFailed(id: string): QueueItem | undefined {
    return this.updateStatus(id, "failed");
  }

  getState(): QueueState {
    return this.queue.getState();
  }

  subscribe(listener: QueueServiceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private updateStatus(
    id: string,
    status: QueueItemStatus,
  ): QueueItem | undefined {
    const item = this.queue.updateStatus(id, status);

    if (item) {
      this.publish("status-changed", item);
    }

    return item;
  }

  private publish(type: QueueServiceEvent["type"], item: QueueItem): void {
    const event: QueueServiceEvent = {
      type,
      item,
      state: this.queue.getState(),
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener failures must not break successful queue operations.
      }
    }
  }
}
