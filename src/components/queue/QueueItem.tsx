import { type DragEvent, useState } from "react";
import type { QueueItem as QueueItemData } from "../../queue/queue.types";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  GripIcon,
  PencilIcon,
  TrashIcon,
} from "./QueueIcons";

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
      className="queue-item"
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
      <button
        className="queue-item-grip"
        type="button"
        draggable={canDrag && !isEditing}
        disabled={!canDrag || isEditing}
        aria-label={`Drag queued message ${position} to reorder`}
        title="Drag to reorder"
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <GripIcon />
      </button>
      {isEditing ? (
        <div className="queue-item-editor">
          <textarea
            className="queue-item-editor-input"
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
              className="queue-item-editor-error"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <div className="queue-item-editor-actions">
            <button
              className="queue-editor-button"
              type="button"
              title="Cancel editing"
              aria-label="Cancel editing queued message"
              onClick={cancelEditing}
            >
              Cancel
            </button>
            <button
              className="queue-editor-button queue-editor-button-primary"
              type="button"
              title="Save edited message"
              aria-label="Save edited queued message"
              onClick={saveEdit}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="queue-item-preview" title={item.content}>
            {item.content}
          </p>
          <span className="queue-item-status">{statusLabel}</span>
          <div className="queue-item-actions">
            <button
              className="queue-icon-button"
              type="button"
              disabled={!canMoveUp}
              aria-label={`Move queued message ${position} up`}
              title="Move up"
              onClick={() => onMove(item.id, "up")}
            >
              <ArrowUpIcon />
            </button>
            <button
              className="queue-icon-button"
              type="button"
              disabled={!canMoveDown}
              aria-label={`Move queued message ${position} down`}
              title="Move down"
              onClick={() => onMove(item.id, "down")}
            >
              <ArrowDownIcon />
            </button>
            <button
              className="queue-icon-button"
              type="button"
              disabled={!canEdit}
              aria-label={`Edit queued message ${position}`}
              title="Edit message"
              onClick={startEditing}
            >
              <PencilIcon />
            </button>
            <button
              className="queue-icon-button"
              type="button"
              disabled={isSending}
              aria-label={`Remove queued message ${position}`}
              title="Remove message"
              onClick={() => onRemove(item.id)}
            >
              <TrashIcon />
            </button>
          </div>
        </>
      )}
      <span id={itemHelpId} className="queue-visually-hidden">
        {canDrag
          ? "Drag this message to reorder it. Keyboard users can use the move up and move down buttons."
          : "Use the move up and move down buttons to reorder this message."}
      </span>
    </li>
  );
}
