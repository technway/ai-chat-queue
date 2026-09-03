import type { ButtonHTMLAttributes } from "react";

type QueueIconButtonSize = "default" | "compact";
type QueueIconButtonCursor = "pointer" | "grab";
type QueueIconButtonTone = "queue" | "neutral";
type QueueIconButtonVariant = "ghost" | "outlined" | "filled";

interface QueueIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly size?: QueueIconButtonSize;
  readonly cursor?: QueueIconButtonCursor;
  readonly tone?: QueueIconButtonTone;
  readonly variant?: QueueIconButtonVariant;
}

const iconButtonBaseClass =
  "grid place-items-center p-0 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-40";

const iconButtonSizeClass: Record<QueueIconButtonSize, string> = {
  default: "size-6.5",
  compact: "size-4.5",
};

const iconButtonCursorClass: Record<QueueIconButtonCursor, string> = {
  pointer: "cursor-pointer",
  grab: "cursor-grab",
};

const iconButtonVariantClass: Record<QueueIconButtonVariant, string> = {
  ghost:
    "rounded-lg border-0 bg-transparent text-queue-text-muted hover:bg-queue-surface-muted hover:text-queue-text",
  outlined:
    "rounded-full border border-queue-border bg-queue-surface-muted text-queue-text-muted hover:bg-queue-text hover:text-queue-surface",
  filled:
    "rounded-full border border-queue-text bg-queue-text text-queue-surface hover:bg-queue-text-muted hover:text-queue-surface",
};

const iconButtonToneClass: Record<QueueIconButtonTone, string> = {
  queue: "focus-visible:outline-queue-accent",
  neutral: "focus-visible:outline-queue-text-muted",
};

export function QueueIconButton({
  className,
  cursor = "pointer",
  size = "default",
  tone = "queue",
  variant = "ghost",
  ...props
}: QueueIconButtonProps) {
  return (
    <button
      {...props}
      className={[
        iconButtonBaseClass,
        iconButtonSizeClass[size],
        iconButtonCursorClass[cursor],
        iconButtonVariantClass[variant],
        iconButtonToneClass[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
