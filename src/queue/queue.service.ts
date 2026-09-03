import { MessageQueue } from "./queue";
import type { QueueItem, QueueItemStatus, QueueState } from "./queue.types";

export type QueueServiceEvent =
  | {
      readonly type:
        | "queued"
        | "removed"
        | "status-changed"
        | "reordered"
        | "edited";
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

  move(id: string, direction: "up" | "down"): boolean {
    const state = this.queue.getState();
    const item = state.items.find((candidate) => candidate.id === id);

    if (!item || item.status === "sent" || item.status === "sending") {
      return false;
    }

    const movableItems = state.items.filter(
      (candidate) =>
        candidate.status !== "sent" && candidate.status !== "sending",
    );
    const movableIndex = movableItems.findIndex(
      (candidate) => candidate.id === id,
    );
    const targetIndex =
      direction === "up" ? movableIndex - 1 : movableIndex + 1;

    if (
      movableIndex === -1 ||
      targetIndex < 0 ||
      targetIndex >= movableItems.length
    ) {
      return false;
    }

    const target = movableItems[targetIndex];

    if (!target) {
      return false;
    }

    const fromIndex = state.items.findIndex((candidate) => candidate.id === id);
    const toIndex = state.items.findIndex(
      (candidate) => candidate.id === target.id,
    );
    const startIndex = Math.min(fromIndex, toIndex);
    const endIndex = Math.max(fromIndex, toIndex);
    const crossesProtectedItem = state.items
      .slice(startIndex, endIndex + 1)
      .some(
        (candidate) =>
          candidate.status === "sent" || candidate.status === "sending",
      );

    if (crossesProtectedItem || !this.queue.move(id, toIndex)) {
      return false;
    }

    const reorderedItem = this.queue
      .getState()
      .items.find((candidate) => candidate.id === id);

    if (!reorderedItem) {
      return false;
    }

    this.publish("reordered", reorderedItem);
    return true;
  }

  edit(id: string, content: string): QueueItem | undefined {
    const existingItem = this.queue
      .getState()
      .items.find((item) => item.id === id);

    if (
      !existingItem ||
      existingItem.status === "sent" ||
      existingItem.status === "sending"
    ) {
      return undefined;
    }

    const editedItem = this.queue.updateContent(id, content);

    if (!editedItem) {
      return undefined;
    }

    const item =
      editedItem.status === "failed"
        ? (this.queue.updateStatus(id, "pending") ?? editedItem)
        : editedItem;

    this.publish("edited", item);
    return item;
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
    type: "queued" | "removed" | "status-changed" | "reordered" | "edited",
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
