import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  GripVertical,
  Pause,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";

const iconProps = {
  className: "queue-icon",
  "aria-hidden": true,
  strokeWidth: 1.8,
} as const;

export function QueueIcon() {
  return <CornerDownRight {...iconProps} />;
}

export function GripIcon() {
  return <GripVertical {...iconProps} />;
}

export function TrashIcon() {
  return <Trash2 {...iconProps} />;
}

export function PencilIcon() {
  return <Pencil {...iconProps} />;
}

export function ArrowUpIcon() {
  return <ArrowUp {...iconProps} />;
}

export function ArrowDownIcon() {
  return <ArrowDown {...iconProps} />;
}

export function ChevronIcon({ collapsed }: { readonly collapsed: boolean }) {
  return collapsed ? (
    <ChevronUp {...iconProps} />
  ) : (
    <ChevronDown {...iconProps} />
  );
}

export function QueueControlIcon({ paused }: { readonly paused: boolean }) {
  return paused ? <Play {...iconProps} /> : <Pause {...iconProps} />;
}
