export interface QueueBadgeProps {
  readonly count: number;
  readonly paused?: boolean;
  readonly sending: boolean;
}

export function QueueBadge({
  count,
  paused = false,
  sending,
}: QueueBadgeProps) {
  const status = paused ? ", paused" : sending ? ", sending now" : "";
  const label = `${count} queued${status}`;

  return (
    <span
      className="text-[11px] font-medium text-queue-text-muted"
      aria-live="polite"
    >
      {label}
    </span>
  );
}
