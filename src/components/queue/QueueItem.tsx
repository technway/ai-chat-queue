import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { type DragEvent, useState } from "react";
import type { QueueItem as QueueItemData } from "../../queue/queue.types";
import { QueueIconButton } from "./QueueIconButton";
import { QueueStatus } from "./QueueStatus";

const iconProps = {
  className: "size-3.75 shrink-0",
  "aria-hidden": true,
  strokeWidth: 1.8,
} as const;

const STATUS_LABELS = {
  pending: "Queued",
  sending: "Sending",
  sent: "Sent",
  failed: "Needs attention",
} as const;

function captureItemPositions(list: HTMLElement): Map<string, number> {
  const positions = new Map<string, number>();

  for (const element of list.querySelectorAll<HTMLElement>(
    ":scope > [data-queue-item-id]",
  )) {
    const id = element.dataset.queueItemId;
    if (id) positions.set(id, element.getBoundingClientRect().top);
  }

  return positions;
}

function animateItemReorder(
  list: HTMLElement,
  previousPositions: ReadonlyMap<string, number>,
): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  for (const element of list.querySelectorAll<HTMLElement>(
    ":scope > [data-queue-item-id]",
  )) {
    const id = element.dataset.queueItemId;
    const previousTop = id ? previousPositions.get(id) : undefined;

    if (previousTop === undefined) {
      continue;
    }

    const deltaY = previousTop - element.getBoundingClientRect().top;

    if (Math.abs(deltaY) < 1) {
      continue;
    }

    element.animate(
      [
        { transform: `translate3d(0, ${deltaY}px, 0)` },
        { transform: "translate3d(0, 0, 0)" },
      ],
      {
        duration: 240,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    );
  }
}

export interface QueueItemProps {
  readonly item: QueueItemData;
  readonly position: number;
  readonly total: number;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly canEdit: boolean;
  readonly canDrag: boolean;
  readonly isEditing: boolean;
  readonly isExiting?: boolean;
  readonly onMove: (id: string, direction: "up" | "down") => void;
  readonly onDropItem: (id: string, targetId: string) => void;
  readonly onEditStart: (id: string) => void;
  readonly onEditCancel: () => void;
  readonly onEdit: (id: string, content: string) => boolean;
  readonly onRemove: (id: string) => void;
}

export function QueueItem({
  item,
  position,
  total,
  canMoveUp,
  canMoveDown,
  canEdit,
  canDrag,
  isEditing,
  isExiting = false,
  onMove,
  onDropItem,
  onEditStart,
  onEditCancel,
  onEdit,
  onRemove,
}: QueueItemProps) {
  const [draft, setDraft] = useState(item.content);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const isSending = item.status === "sending";
  const statusLabel = STATUS_LABELS[item.status];
  const accessibleContent = isEditing ? draft : item.content;
  const itemHelpId = `queue-item-help-${position}`;
  const editorErrorId = `queue-item-editor-error-${position}`;
  const isDraggable = canDrag && !isEditing && !isExiting;

  const startEditing = () => {
    setDraft(item.content);
    setError(null);
    onEditStart(item.id);
  };

  const cancelEditing = () => {
    setError(null);
    onEditCancel();
  };

  const saveEdit = () => {
    if (draft.trim().length === 0) {
      setError("Message cannot be empty");
      return;
    }

    if (!onEdit(item.id, draft)) {
      setError("This message can no longer be edited");
      return;
    }

    setError(null);
    onEditCancel();
  };

  const handleDragStart = (event: DragEvent<HTMLLIElement>) => {
    const target = event.target as Element;
    const interactiveTarget = target.closest(
      "button:not([data-drag-handle]), textarea, input, a, [contenteditable='true']",
    );

    if (!isDraggable || interactiveTarget) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
    const bounds = event.currentTarget.getBoundingClientRect();
    event.dataTransfer.setDragImage(
      event.currentTarget,
      event.clientX - bounds.left,
      event.clientY - bounds.top,
    );
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setIsDragOver(false);
  };

  const handleDragOver = (event: DragEvent<HTMLLIElement>) => {
    if (!isDraggable) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setIsDragOver(event.dataTransfer.getData("text/plain") !== item.id);
  };

  const handleDragLeave = (event: DragEvent<HTMLLIElement>) => {
    const nextTarget = event.relatedTarget;

    if (
      nextTarget instanceof Node &&
      event.currentTarget.contains(nextTarget)
    ) {
      return;
    }

    setIsDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLLIElement>) => {
    event.preventDefault();
    setIsDragOver(false);

    const sourceId = event.dataTransfer.getData("text/plain");
    const list = event.currentTarget.parentElement;
    const previousPositions = list ? captureItemPositions(list) : undefined;
    const listRoot = list?.getRootNode() as Document | ShadowRoot | undefined;

    if (sourceId && sourceId !== item.id) {
      onDropItem(sourceId, item.id);

      if (list && previousPositions) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const activeList = list.isConnected
              ? list
              : listRoot?.querySelector<HTMLElement>("#queue-message-list");

            if (activeList) {
              animateItemReorder(activeList, previousPositions);
            }
          });
        });
      }
    }
  };

  return (
    <li
      className={`group/item relative grid min-h-9 grid-cols-[18px_minmax(0,1fr)_auto_auto] items-center gap-1.5 rounded-lg border-transparent px-1 py-0.5 select-none motion-safe:animate-queue-item-in transition-[background-color,box-shadow,opacity,transform] duration-200 ease-out not-first:border-t not-first:border-queue-border hover:z-10 hover:bg-queue-surface-muted hover:shadow-[inset_0_0_0_1px_var(--queue-border),0_3px_12px_rgb(0_0_0_/_12%)] data-[can-drag]:cursor-grab data-[dragging]:z-20 data-[dragging]:scale-[0.985] data-[dragging]:cursor-grabbing data-[dragging]:bg-queue-surface-muted data-[dragging]:opacity-55 data-[dragging]:shadow-[inset_0_0_0_1px_var(--queue-accent),0_8px_24px_rgb(0_0_0_/_24%)] data-[drag-over]:z-10 data-[drag-over]:bg-queue-surface-muted data-[drag-over]:shadow-[inset_0_0_0_1px_var(--queue-accent)] max-[560px]:grid-cols-[18px_minmax(0,1fr)_auto]${isExiting ? " pointer-events-none overflow-hidden motion-safe:animate-queue-item-out" : ""}`}
      data-testid="queue-item"
      data-queue-item-id={item.id}
      data-can-drag={isDraggable || undefined}
      data-editing={isEditing || undefined}
      data-dragging={isDragging || undefined}
      data-drag-over={isDragOver || undefined}
      data-exiting={isExiting || undefined}
      data-status={item.status}
      aria-hidden={isExiting || undefined}
      aria-label={`Queued message ${position}: ${accessibleContent}. ${statusLabel}.`}
      aria-describedby={itemHelpId}
      aria-posinset={position}
      aria-setsize={total}
      draggable={isDraggable}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <QueueIconButton
        className="active:cursor-grabbing group-hover/item:bg-queue-surface-muted group-hover/item:text-queue-text"
        cursor="grab"
        size="compact"
        type="button"
        data-drag-handle
        disabled={!isDraggable}
        aria-label={`Drag queued message ${position} to reorder`}
        title="Drag to reorder"
      >
        <GripVertical {...iconProps} />
      </QueueIconButton>
      {isEditing ? (
        <div className="[grid-column:2_/-1] grid gap-1.5 py-1">
          <div className="relative">
            <textarea
              className="min-h-10 w-full resize-y rounded-lg border border-queue-border bg-queue-surface-muted px-2 py-1.5 pe-16 font-inherit leading-[1.35] text-queue-text focus-visible:outline-2 focus-visible:outline-queue-text-muted focus-visible:outline-offset-1"
              aria-label={`Edit queued message ${position}`}
              aria-describedby={error ? editorErrorId : itemHelpId}
              aria-invalid={error ? true : undefined}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={1}
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-1">
              <QueueIconButton
                size="default"
                tone="neutral"
                variant="outlined"
                type="button"
                title="Cancel editing"
                aria-label="Cancel editing queued message"
                onClick={cancelEditing}
              >
                <X {...iconProps} />
              </QueueIconButton>
              <QueueIconButton
                size="default"
                tone="neutral"
                variant="filled"
                type="button"
                title="Save edited message"
                aria-label="Save edited queued message"
                onClick={saveEdit}
              >
                <Check {...iconProps} />
              </QueueIconButton>
            </div>
          </div>
          {error ? (
            <p
              id={editorErrorId}
              className="m-0 text-[11px] font-semibold text-queue-text-muted"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <p
            className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]"
            data-testid="queue-item-preview"
            title={item.content}
          >
            {item.content}
          </p>
          <QueueStatus status={item.status} label={statusLabel} />
          <div className="flex items-center gap-px opacity-75 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100 max-[560px]:opacity-100">
            <QueueIconButton
              type="button"
              disabled={!canMoveUp}
              aria-label={`Move queued message ${position} up`}
              title="Move up"
              onClick={() => onMove(item.id, "up")}
            >
              <ArrowUp {...iconProps} />
            </QueueIconButton>
            <QueueIconButton
              type="button"
              disabled={!canMoveDown}
              aria-label={`Move queued message ${position} down`}
              title="Move down"
              onClick={() => onMove(item.id, "down")}
            >
              <ArrowDown {...iconProps} />
            </QueueIconButton>
            <QueueIconButton
              type="button"
              disabled={!canEdit}
              aria-label={`Edit queued message ${position}`}
              title="Edit message"
              onClick={startEditing}
            >
              <Pencil {...iconProps} />
            </QueueIconButton>
            <QueueIconButton
              type="button"
              disabled={isSending}
              aria-label={`Remove queued message ${position}`}
              title="Remove message"
              onClick={() => onRemove(item.id)}
            >
              <Trash2 {...iconProps} />
            </QueueIconButton>
          </div>
        </>
      )}
      <span id={itemHelpId} className="sr-only">
        {canDrag
          ? "Drag this message to reorder it. Keyboard users can use the move up and move down buttons."
          : "Use the move up and move down buttons to reorder this message."}
      </span>
    </li>
  );
}
