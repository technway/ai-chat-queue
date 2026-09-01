import { useEffect, useState } from "react";
import type { QueueService } from "../../queue/queue.service";
import type { QueueItem as QueueItemData } from "../../queue/queue.types";
import { QueueBadge } from "./QueueBadge";
import { ChevronIcon, MoreIcon } from "./QueueIcons";
import { QueueItem } from "./QueueItem";

export interface QueuePanelProps {
  readonly queue: QueueService;
}

function isVisibleItem(item: QueueItemData): boolean {
  return item.status !== "sent";
}

export function QueuePanel({ queue }: QueuePanelProps) {
  const [state, setState] = useState(() => queue.getState());
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const unsubscribe = queue.subscribe((event) => setState(event.state));
    setState(queue.getState());
    return unsubscribe;
  }, [queue]);

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
        <QueueBadge count={items.length} sending={isSending} />
        <div className="queue-toolbar-actions">
          <details className="queue-actions">
            <summary
              className="queue-icon-button"
              aria-label="Queue actions"
              title="Queue actions"
            >
              <MoreIcon />
            </summary>
            <div className="queue-actions-menu">
              <button
                type="button"
                disabled={!hasRemovableItems}
                aria-label="Clear queued messages"
                onClick={() => queue.clear()}
              >
                Clear queue
              </button>
            </div>
          </details>

          <button
            className="queue-icon-button"
            type="button"
            aria-expanded={!collapsed}
            aria-controls="queue-message-list"
            aria-label={collapsed ? "Expand queue" : "Minimize queue"}
            title={collapsed ? "Expand queue" : "Minimize queue"}
            onClick={() => setCollapsed((value) => !value)}
          >
            <ChevronIcon collapsed={collapsed} />
          </button>
        </div>
      </div>

      <ol
        id="queue-message-list"
        className="queue-list"
        aria-label="Queued messages"
        hidden={collapsed}
      >
        {items.map((item, index) => (
          <QueueItem
            key={item.id}
            item={item}
            position={index + 1}
            onRemove={(id) => queue.remove(id)}
          />
        ))}
      </ol>
    </section>
  );
}
