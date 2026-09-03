import { useState } from "react";
import type { QueueItem as QueueItemData } from "../../queue/queue.types";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  PencilIcon,
  QueueIcon,
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
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly canEdit: boolean;
  readonly isEditing: boolean;
  readonly onMove: (id: string, direction: "up" | "down") => void;
  readonly onEditStart: (id: string) => void;
  readonly onEditCancel: () => void;
  readonly onEdit: (id: string, content: string) => boolean;
  readonly onRemove: (id: string) => void;
}

export function QueueItem({
  item,
  position,
  canMoveUp,
  canMoveDown,
  canEdit,
  isEditing,
  onMove,
  onEditStart,
  onEditCancel,
  onEdit,
  onRemove,
}: QueueItemProps) {
  const [draft, setDraft] = useState(item.content);
  const [error, setError] = useState<string | null>(null);
  const isSending = item.status === "sending";

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

  return (
    <li
      className="queue-item"
      data-editing={isEditing || undefined}
      data-status={item.status}
    >
      <QueueIcon />
      {isEditing ? (
        <div className="queue-item-editor">
          <textarea
            className="queue-item-editor-input"
            aria-label={`Edit queued message ${position}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
          />
          {error ? (
            <p className="queue-item-editor-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="queue-item-editor-actions">
            <button
              className="queue-editor-button"
              type="button"
              onClick={cancelEditing}
            >
              Cancel
            </button>
            <button
              className="queue-editor-button queue-editor-button-primary"
              type="button"
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
          <span className="queue-item-status">
            {STATUS_LABELS[item.status]}
          </span>
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
    </li>
  );
}
