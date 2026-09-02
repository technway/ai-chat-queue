import { MessageQueue } from "./queue";
import type { QueueItem, QueueItemStatus, QueueState } from "./queue.types";

export type QueueServiceEvent =
  | {
      readonly type: "queued" | "removed" | "status-changed";
      readonly item: QueueItem;
      readonly state: QueueState;
    }
  | {
      readonly type: "cleared" | "replaced";
      readonly state: QueueState;
    };

export type QueueServiceListener = (event: QueueServiceEvent) => void;

export class QueueService {
  private readonly listeners = new Set<QueueServiceListener>();

  constructor(private readonly queue = new MessageQueue()) {}

  enqueue(content: string): QueueItem {
    const item = this.queue.add(content);
    this.publish("queued", item);
    return item;
  }

  remove(id: string): QueueItem | undefined {
    const existingItem = this.queue
      .getState()
      .items.find((item) => item.id === id);

    if (existingItem?.status === "sending") {
      return undefined;
    }

    const item = this.queue.remove(id);

    if (item) {
      this.publish("removed", item);
    }

    return item;
  }

  clear(): void {
    for (const item of this.queue.getState().items) {
      if (item.status !== "sending") {
        this.queue.remove(item.id);
      }
    }

    this.notify({
      type: "cleared",
      state: this.queue.getState(),
    });
  }

  replace(items: readonly QueueItem[]): void {
    this.queue.replace(items);
    this.notify({
      type: "replaced",
      state: this.queue.getState(),
    });
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

  private publish(
    type: "queued" | "removed" | "status-changed",
    item: QueueItem,
  ): void {
    const event: QueueServiceEvent = {
      type,
      item,
      state: this.queue.getState(),
    };

    this.notify(event);
  }

  private notify(event: QueueServiceEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener failures must not break successful queue operations.
      }
    }
  }
}
