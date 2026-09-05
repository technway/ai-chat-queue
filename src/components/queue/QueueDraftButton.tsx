import { ListPlus } from "lucide-react";

const QUEUE_ACTION_LABEL = "Queue message";
const QUEUE_ACTION_SHORTCUT = "Cmd/Ctrl+Shift+Enter";

const iconProps = {
  className: "size-5 shrink-0",
  "aria-hidden": true,
  strokeWidth: 2,
} as const;

export interface QueueDraftButtonProps {
  readonly disabled: boolean;
  readonly onQueue: () => void;
}

/**
 * Explicitly queues the current composer draft, independent of ChatGPT's
 * send-button or generation state. Lives next to the composer so the user can
 * always stage their message without waiting for ChatGPT.
 */
export function QueueDraftButton({ disabled, onQueue }: QueueDraftButtonProps) {
  const enabledTitle = `${QUEUE_ACTION_LABEL} (${QUEUE_ACTION_SHORTCUT})`;
  const disabledReason = "Type a message before adding it to the queue.";
  const title = disabled
    ? `${QUEUE_ACTION_LABEL} unavailable: ${disabledReason}`
    : enabledTitle;
  const ariaLabel = disabled
    ? `${QUEUE_ACTION_LABEL} unavailable. ${disabledReason}`
    : enabledTitle;

  return (
    <button
      type="button"
      className="queue-draft-button"
      data-testid="queue-draft-button"
      disabled={disabled}
      aria-label={ariaLabel}
      aria-keyshortcuts="Meta+Shift+Enter Control+Shift+Enter"
      title={title}
      onClick={onQueue}
    >
      <ListPlus {...iconProps} />
      <span className="text-[12px] font-semibold leading-none">Queue</span>
    </button>
  );
}
