import type { ButtonHTMLAttributes } from "react";

type QueueIconButtonSize = "default" | "compact";

interface QueueIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly size?: QueueIconButtonSize;
}

const iconButtonBaseClass =
  "grid place-items-center border-0 bg-transparent p-0 text-queue-text-muted hover:bg-queue-surface-muted hover:text-queue-text focus-visible:outline-2 focus-visible:outline-queue-accent focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-[.38]";

const iconButtonSizeClass: Record<QueueIconButtonSize, string> = {
  default: "size-[26px] rounded-lg",
  compact: "size-[18px] rounded-md",
};

export function QueueIconButton({
  className,
  size = "default",
  ...props
}: QueueIconButtonProps) {
  return (
    <button
      {...props}
      className={`${iconButtonBaseClass} ${iconButtonSizeClass[size]}${className ? ` ${className}` : ""}`}
    />
  );
}
