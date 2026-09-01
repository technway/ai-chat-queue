export interface QueueBadgeProps {
  readonly count: number;
  readonly sending: boolean;
}

export function QueueBadge({ count, sending }: QueueBadgeProps) {
  const label = `${count} queued${sending ? ", sending now" : ""}`;

  return (
    <span className="queue-badge" aria-live="polite">
      {label}
    </span>
  );
}
