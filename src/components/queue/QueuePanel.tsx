import { ChevronDown, ChevronUp, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import type { QueueService } from "../../queue/queue.service";
import type {
  QueueItem as QueueItemData,
  QueueState,
} from "../../queue/queue.types";
import { QueueBadge } from "./QueueBadge";
import { QueueButton } from "./QueueButton";
import { QueueIconButton } from "./QueueIconButton";
import { QueueItem } from "./QueueItem";

const iconProps = {
  className: "size-3.75 shrink-0",
  "aria-hidden": true,
  strokeWidth: 1.8,
} as const;

export interface QueuePanelProps {
  readonly queue: QueueService;
  readonly state?: QueueState;
  readonly initialCollapsed?: boolean;
  readonly paused?: boolean;
  readonly onCollapsedChange?: (collapsed: boolean) => void;
  readonly onPausedChange?: (paused: boolean) => void;
  readonly onEditingChange?: (id: string | null) => void;
  readonly exitingItem?: QueueItemData;
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
  exitingItem,
}: QueuePanelProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [exitingItems, setExitingItems] = useState<QueueItemData[]>([]);

  useEffect(() => {
    if (!exitingItem) {
      return;
    }

    setExitingItems((current) =>
      current.some((item) => item.id === exitingItem.id)
        ? current
        : [...current, exitingItem],
    );

    window.setTimeout(() => {
      setExitingItems((current) =>
        current.filter((item) => item.id !== exitingItem.id),
      );
    }, 240);
  }, [exitingItem]);

  const queuedItems = state.items.filter(isVisibleItem);
  const exitingIds = new Set(exitingItems.map((item) => item.id));

  if (exitingItem) {
    exitingIds.add(exitingItem.id);
  }

  const items = [
    ...queuedItems,
    ...[...exitingItems, ...(exitingItem ? [exitingItem] : [])].filter(
      (item, index, allItems) =>
        !queuedItems.some((queuedItem) => queuedItem.id === item.id) &&
        allItems.findIndex((candidate) => candidate.id === item.id) === index,
    ),
  ];

  if (items.length === 0) {
    return null;
  }

  const isSending = state.counts.sending > 0;
  const hasRemovableItems = items.some((item) => item.status !== "sending");

  return (
    <section
      className="group mx-auto mb-2 w-full max-w-3xl overflow-visible rounded-2xl border border-queue-border bg-queue-surface font-sans text-[13px] leading-[1.4] text-queue-text shadow-queue transition-shadow duration-200 data-[collapsed]:rounded-xl"
      data-testid="queue-panel"
      data-collapsed={collapsed ? "true" : undefined}
      aria-labelledby="queue-panel-title"
    >
      <h2 id="queue-panel-title" className="sr-only">
        Message queue
      </h2>

      <div className="flex min-h-10 items-center justify-between border-b border-queue-border px-3 py-1 group-data-[collapsed]:border-b-0">
        <QueueBadge count={items.length} paused={paused} sending={isSending} />
        <div className="flex items-center">
          <QueueIconButton
            type="button"
            aria-label={paused ? "Resume queue" : "Pause queue"}
            title={paused ? "Resume queue" : "Pause queue"}
            onClick={() => onPausedChange?.(!paused)}
          >
            {paused ? <Play {...iconProps} /> : <Pause {...iconProps} />}
          </QueueIconButton>

          <QueueButton
            type="button"
            disabled={!hasRemovableItems}
            aria-label="Clear queued messages"
            title="Clear all queued messages"
            onClick={() => queue.clear()}
          >
            Clear all
          </QueueButton>

          <QueueIconButton
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
            {collapsed ? (
              <ChevronUp {...iconProps} />
            ) : (
              <ChevronDown {...iconProps} />
            )}
          </QueueIconButton>
        </div>
      </div>

      <p id="queue-list-instructions" className="sr-only">
        Messages are sent from top to bottom. Use the move buttons to reorder a
        message, or drag it onto another message.
      </p>

      <ol
        id="queue-message-list"
        className="m-0 max-h-[min(136px,calc(28vh-34px))] list-none overflow-y-auto px-1.5 max-[560px]:max-h-[calc(24vh-34px)]"
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
            isExiting={exitingIds.has(item.id)}
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
