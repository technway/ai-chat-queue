import type {
  MessageQueueOptions,
  QueueItem,
  QueueItemStatus,
  QueueState,
} from "./queue.types";

let idSequence = 0;

function createDefaultId(): string {
  idSequence += 1;
  return `message-${Date.now().toString(36)}-${idSequence.toString(36)}`;
}

function createQueueItem(
  id: string,
  content: string,
  createdAt: number,
  status: QueueItemStatus,
): QueueItem {
  return Object.freeze({ id, content, createdAt, status });
}

export class MessageQueue {
  private readonly createId: () => string;
  private readonly now: () => number;
  private readonly items: QueueItem[] = [];

  constructor(options: MessageQueueOptions = {}) {
    this.createId = options.createId ?? createDefaultId;
    this.now = options.now ?? Date.now;
  }

  add(content: string): QueueItem {
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new TypeError("Message content must be a non-empty string");
    }

    const id = this.createId();

    if (this.items.some((item) => item.id === id)) {
      throw new Error(`Queue item ID already exists: ${id}`);
    }

    const item = createQueueItem(id, content, this.now(), "pending");
    this.items.push(item);
    return item;
  }

  remove(id: string): QueueItem | undefined {
    const index = this.items.findIndex((item) => item.id === id);

    if (index === -1) {
      return undefined;
    }

    return this.items.splice(index, 1)[0];
  }

  clear(): void {
    this.items.length = 0;
  }

  move(id: string, toIndex: number): boolean {
    const fromIndex = this.items.findIndex((item) => item.id === id);

    if (fromIndex === -1) {
      return false;
    }

    if (
      !Number.isInteger(toIndex) ||
      toIndex < 0 ||
      toIndex >= this.items.length
    ) {
      throw new RangeError("Queue index is out of range");
    }

    if (fromIndex === toIndex) {
      return true;
    }

    const item = this.items[fromIndex];

    if (!item) {
      return false;
    }

    this.items.splice(fromIndex, 1);
    this.items.splice(toIndex, 0, item);
    return true;
  }

  getNextPending(): QueueItem | undefined {
    return this.items.find((item) => item.status === "pending");
  }

  updateStatus(id: string, status: QueueItemStatus): QueueItem | undefined {
    const index = this.items.findIndex((item) => item.id === id);

    if (index === -1) {
      return undefined;
    }

    const item = this.items[index];

    if (!item) {
      return undefined;
    }

    const updatedItem = createQueueItem(
      item.id,
      item.content,
      item.createdAt,
      status,
    );
    this.items[index] = updatedItem;
    return updatedItem;
  }

  getState(): QueueState {
    const counts: Record<QueueItemStatus, number> = {
      pending: 0,
      sending: 0,
      sent: 0,
      failed: 0,
    };

    for (const item of this.items) {
      counts[item.status] += 1;
    }

    return Object.freeze({
      items: Object.freeze([...this.items]),
      total: this.items.length,
      isEmpty: this.items.length === 0,
      counts: Object.freeze(counts),
    });
  }
}
