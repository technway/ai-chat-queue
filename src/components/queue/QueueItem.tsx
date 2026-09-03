import { ArrowDown, ArrowUp, GripVertical, Pencil, Trash2 } from "lucide-react";
import { type DragEvent, useState } from "react";
import type { QueueItem as QueueItemData } from "../../queue/queue.types";
import { QueueButton } from "./QueueButton";
import { QueueIconButton } from "./QueueIconButton";
import { QueueStatus } from "./QueueStatus";

const iconProps = {
  className: "size-[15px] shrink-0",
  "aria-hidden": true,
  strokeWidth: 1.8,
} as const;

const STATUS_LABELS = {
  pending: "Queued",
  sending: "Sending",
  sent: "Sent",
  failed: "Needs attention",
} as const;

export interface QueueItemProps {
  readonly item: QueueItemData;
  readonly position: number;
  readonly total: number;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly canEdit: boolean;
  readonly canDrag: boolean;
  readonly isEditing: boolean;
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

  const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
    if (!canDrag || isEditing) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setIsDragOver(false);
  };

  const handleDragOver = (event: DragEvent<HTMLLIElement>) => {
    if (!canDrag || isEditing) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLLIElement>) => {
    event.preventDefault();
    setIsDragOver(false);

    const sourceId = event.dataTransfer.getData("text/plain");

    if (sourceId) {
      onDropItem(sourceId, item.id);
    }
  };

  return (
    <li
      className="group/item grid min-h-[34px] grid-cols-[18px_minmax(0,1fr)_auto_auto] items-center gap-1.5 border-transparent py-0.5 not-first:border-t not-first:border-queue-border data-[dragging]:opacity-[.45] data-[drag-over]:rounded-lg data-[drag-over]:bg-queue-surface-muted max-[560px]:grid-cols-[18px_minmax(0,1fr)_auto]"
      data-testid="queue-item"
      data-editing={isEditing || undefined}
      data-dragging={isDragging || undefined}
      data-drag-over={isDragOver || undefined}
      data-status={item.status}
      aria-label={`Queued message ${position}: ${accessibleContent}. ${statusLabel}.`}
      aria-describedby={itemHelpId}
      aria-posinset={position}
      aria-setsize={total}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <QueueIconButton
        className="active:cursor-grabbing"
        size="compact"
        type="button"
        draggable={canDrag && !isEditing}
        disabled={!canDrag || isEditing}
        aria-label={`Drag queued message ${position} to reorder`}
        title="Drag to reorder"
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <GripVertical {...iconProps} />
      </QueueIconButton>
      {isEditing ? (
        <div className="[grid-column:2_/-1] grid gap-1.5 py-1">
          <textarea
            className="min-h-[58px] w-full resize-y rounded-lg border border-queue-border bg-queue-surface-muted px-2 py-1.5 font-[inherit] leading-[1.35] text-queue-text focus-visible:outline-2 focus-visible:outline-queue-accent focus-visible:outline-offset-1"
            aria-label={`Edit queued message ${position}`}
            aria-describedby={error ? editorErrorId : itemHelpId}
            aria-invalid={error ? true : undefined}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
          />
          {error ? (
            <p
              id={editorErrorId}
              className="m-0 text-[11px] text-queue-danger"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-1.5">
            <QueueButton
              size="editor"
              type="button"
              title="Cancel editing"
              aria-label="Cancel editing queued message"
              onClick={cancelEditing}
            >
              Cancel
            </QueueButton>
            <QueueButton
              size="editor"
              variant="primary"
              type="button"
              title="Save edited message"
              aria-label="Save edited queued message"
              onClick={saveEdit}
            >
              Save
            </QueueButton>
          </div>
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
          <div className="flex items-center gap-px">
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
