import type { QueueItem as QueueItemData } from "../../queue/queue.types";
import { QueueIcon, TrashIcon } from "./QueueIcons";

const STATUS_LABELS = {
  pending: "Queued",
  sending: "Sending",
  sent: "Sent",
  failed: "Needs attention",
} as const;

export interface QueueItemProps {
  readonly item: QueueItemData;
  readonly position: number;
  readonly onRemove: (id: string) => void;
}

export function QueueItem({ item, position, onRemove }: QueueItemProps) {
  const isSending = item.status === "sending";

  return (
    <li className="queue-item" data-status={item.status}>
      <QueueIcon />
      <p className="queue-item-preview" title={item.content}>
        {item.content}
      </p>
      <span className="queue-item-status">{STATUS_LABELS[item.status]}</span>
      <button
        className="queue-icon-button"
        type="button"
        disabled={isSending}
        aria-label={`Remove queued message ${position}`}
        title="Remove message"
        onClick={() => onRemove(item.id)}
      >
        <TrashIcon />
      </button>
    </li>
  );
}
