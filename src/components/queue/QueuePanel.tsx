import { useState } from "react";
import type { QueueService } from "../../queue/queue.service";
import type {
  QueueItem as QueueItemData,
  QueueState,
} from "../../queue/queue.types";
import { QueueBadge } from "./QueueBadge";
import { ChevronIcon, QueueControlIcon } from "./QueueIcons";
import { QueueItem } from "./QueueItem";

export interface QueuePanelProps {
  readonly queue: QueueService;
  readonly state?: QueueState;
  readonly initialCollapsed?: boolean;
  readonly paused?: boolean;
  readonly onCollapsedChange?: (collapsed: boolean) => void;
  readonly onPausedChange?: (paused: boolean) => void;
  readonly onEditingChange?: (id: string | null) => void;
}

function isVisibleItem(item: QueueItemData): boolean {
  return item.status !== "sent";
}

export function QueuePanel({
  queue,
  state = queue.getState(),
  initialCollapsed = false,
  paused = false,
  onCollapsedChange,
  onPausedChange,
  onEditingChange,
}: QueuePanelProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [editingId, setEditingId] = useState<string | null>(null);

  const items = state.items.filter(isVisibleItem);

  if (items.length === 0) {
    return null;
  }

  const isSending = state.counts.sending > 0;
  const hasRemovableItems = items.some((item) => item.status !== "sending");

  return (
    <section
      className="queue-panel"
      data-collapsed={collapsed || undefined}
      aria-labelledby="queue-panel-title"
    >
      <h2 id="queue-panel-title" className="queue-visually-hidden">
        Message queue
      </h2>

      <div className="queue-toolbar">
        <QueueBadge count={items.length} paused={paused} sending={isSending} />
        <div className="queue-toolbar-actions">
          <button
            className="queue-icon-button"
            type="button"
            aria-label={paused ? "Resume queue" : "Pause queue"}
            title={paused ? "Resume queue" : "Pause queue"}
            onClick={() => onPausedChange?.(!paused)}
          >
            <QueueControlIcon paused={paused} />
          </button>

          <button
            className="queue-clear-button"
            type="button"
            disabled={!hasRemovableItems}
            aria-label="Clear queued messages"
            title="Clear all queued messages"
            onClick={() => queue.clear()}
          >
            Clear all
          </button>

          <button
            className="queue-icon-button"
            type="button"
            aria-expanded={!collapsed}
            aria-controls="queue-message-list"
            aria-label={collapsed ? "Expand queue" : "Minimize queue"}
            title={collapsed ? "Expand queue" : "Minimize queue"}
            onClick={() =>
              setCollapsed((value) => {
                const nextValue = !value;
                onCollapsedChange?.(nextValue);
                return nextValue;
              })
            }
          >
            <ChevronIcon collapsed={collapsed} />
          </button>
        </div>
      </div>

      <p id="queue-list-instructions" className="queue-visually-hidden">
        Messages are sent from top to bottom. Use the move buttons to reorder a
        message, or drag it onto another message.
      </p>

      <ol
        id="queue-message-list"
        className="queue-list"
        aria-label="Queued messages"
        aria-describedby="queue-list-instructions"
        hidden={collapsed}
      >
        {items.map((item, index) => (
          <QueueItem
            key={item.id}
            item={item}
            position={index + 1}
            total={items.length}
            canMoveUp={
              item.status !== "sending" &&
              index > 0 &&
              items[index - 1]?.status !== "sending"
            }
            canMoveDown={
              item.status !== "sending" &&
              index < items.length - 1 &&
              items[index + 1]?.status !== "sending"
            }
            canEdit={
              item.status !== "sending" &&
              (editingId === null || editingId === item.id)
            }
            canDrag={item.status !== "sending" && editingId === null}
            isEditing={editingId === item.id}
            onMove={(id, direction) => queue.move(id, direction)}
            onDropItem={(id, targetId) => queue.moveBefore(id, targetId)}
            onEditStart={(id) => {
              setEditingId(id);
              onEditingChange?.(id);
            }}
            onEditCancel={() => {
              setEditingId(null);
              onEditingChange?.(null);
            }}
            onEdit={(id, content) => queue.edit(id, content) !== undefined}
            onRemove={(id) => queue.remove(id)}
          />
        ))}
      </ol>
    </section>
  );
}
