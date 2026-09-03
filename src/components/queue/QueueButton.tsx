import type { ButtonHTMLAttributes } from "react";

type QueueButtonSize = "toolbar" | "editor";
type QueueButtonVariant = "ghost" | "primary";

interface QueueButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly size?: QueueButtonSize;
  readonly variant?: QueueButtonVariant;
}

const buttonBaseClass =
  "rounded-lg bg-transparent text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-queue-accent focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-[.38]";

const buttonSizeClass: Record<QueueButtonSize, string> = {
  toolbar: "min-h-[26px] px-2",
  editor: "min-h-[25px] px-2",
};

const buttonVariantClass: Record<QueueButtonVariant, string> = {
  ghost: "text-queue-text hover:bg-queue-surface-muted",
  primary: "bg-queue-text text-queue-surface hover:bg-queue-text-muted",
};

const buttonBorderClass: Record<
  QueueButtonSize,
  Record<QueueButtonVariant, string>
> = {
  toolbar: {
    ghost: "border-0",
    primary: "border border-queue-text",
  },
  editor: {
    ghost: "border border-queue-border",
    primary: "border border-queue-text",
  },
};

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

export function QueueButton({
  className,
  size = "toolbar",
  variant = "ghost",
  ...props
}: QueueButtonProps) {
  return (
    <button
      {...props}
      className={joinClassNames(
        buttonBaseClass,
        buttonSizeClass[size],
        buttonBorderClass[size][variant],
        buttonVariantClass[variant],
        className,
      )}
    />
  );
}
