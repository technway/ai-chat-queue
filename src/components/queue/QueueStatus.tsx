import type { QueueItemStatus } from "../../queue/queue.types";

const statusClass: Record<QueueItemStatus, string> = {
  pending: "",
  sending: "font-semibold text-queue-accent",
  sent: "",
  failed: "font-semibold text-queue-danger",
};

export interface QueueStatusProps {
  readonly status: QueueItemStatus;
  readonly label: string;
}

export function QueueStatus({ status, label }: QueueStatusProps) {
  return (
    <span
      className={`whitespace-nowrap text-[11px] text-queue-text-muted max-[560px]:hidden ${statusClass[status]}`}
    >
      {label}
    </span>
  );
}
