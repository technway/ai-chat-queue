import { MessageQueue } from "./queue";
import type { QueueItem, QueueState } from "./queue.types";

export interface QueueServiceEvent {
  readonly type: "queued";
  readonly item: QueueItem;
  readonly state: QueueState;
}

export type QueueServiceListener = (event: QueueServiceEvent) => void;

export class QueueService {
  private readonly listeners = new Set<QueueServiceListener>();

  constructor(private readonly queue = new MessageQueue()) {}

  enqueue(content: string): QueueItem {
    const item = this.queue.add(content);
    const event: QueueServiceEvent = {
      type: "queued",
      item,
      state: this.queue.getState(),
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A UI listener must not turn a successful enqueue into a native send.
      }
    }

    return item;
  }

  getState(): QueueState {
    return this.queue.getState();
  }

  subscribe(listener: QueueServiceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
