export type QueueItemStatus = "pending" | "sending" | "sent" | "failed";

export interface QueueItem {
  readonly id: string;
  readonly content: string;
  readonly createdAt: number;
  readonly status: QueueItemStatus;
}

export interface QueueState {
  readonly items: readonly QueueItem[];
  readonly total: number;
  readonly isEmpty: boolean;
  readonly counts: Readonly<Record<QueueItemStatus, number>>;
}

export interface MessageQueueOptions {
  readonly createId?: () => string;
  readonly now?: () => number;
  readonly initialItems?: readonly QueueItem[];
}
