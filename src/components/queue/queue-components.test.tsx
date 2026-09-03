import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QueueService } from "../../queue/queue.service";
import type { QueueItem as QueueItemData } from "../../queue/queue.types";
import { QueueBadge } from "./QueueBadge";
import { QueueItem } from "./QueueItem";
import { QueuePanel } from "./QueuePanel";

describe("queue components", () => {
  it("hides the panel when no messages need attention", () => {
    const queue = new QueueService();

    expect(renderToStaticMarkup(<QueuePanel queue={queue} />)).toBe("");

    const item = queue.enqueue("Already sent");
    queue.markSent(item.id);

    expect(renderToStaticMarkup(<QueuePanel queue={queue} />)).toBe("");
  });

  it("shows message count, previews, and management controls", () => {
    const queue = new QueueService();
    queue.enqueue("First queued message");
    queue.enqueue("Second queued message");

    const html = renderToStaticMarkup(<QueuePanel queue={queue} />);

    expect(html).toContain("2 queued");
    expect(html).toContain("First queued message");
    expect(html).toContain("Second queued message");
    expect(html).toContain("Clear all");
    expect(html).toContain('aria-label="Clear queued messages"');
    expect(html).not.toContain('aria-label="Queue actions"');
    expect(html).toContain('aria-label="Move queued message 1 down"');
    expect(html).toContain('aria-label="Move queued message 2 up"');
    expect(html).toContain('aria-label="Edit queued message 1"');
    expect(html).toContain('aria-label="Remove queued message 1"');
    expect(html).toContain('aria-label="Minimize queue"');
    expect(html).toContain('aria-expanded="true"');
  });

  it("renders the supplied queue snapshot", () => {
    const queue = new QueueService();
    const emptyState = queue.getState();
    queue.enqueue("Queued after the UI mounted");

    expect(
      renderToStaticMarkup(<QueuePanel queue={queue} state={emptyState} />),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <QueuePanel queue={queue} state={queue.getState()} />,
      ),
    ).toContain("Queued after the UI mounted");
  });

  it("announces sending status and disables unsafe controls", () => {
    const item: QueueItemData = {
      id: "message-1",
      content: "Sending message",
      createdAt: 123,
      status: "sending",
    };

    const badge = renderToStaticMarkup(<QueueBadge count={2} sending />);
    const row = renderToStaticMarkup(
      <QueueItem
        item={item}
        position={1}
        canMoveUp={false}
        canMoveDown={false}
        canEdit
        isEditing={false}
        onMove={vi.fn()}
        onEditStart={vi.fn()}
        onEditCancel={vi.fn()}
        onEdit={vi.fn(() => true)}
        onRemove={vi.fn()}
      />,
    );
    const queue = new QueueService();
    queue.enqueue("Sending message");
    queue.claimNextPending();
    const panel = renderToStaticMarkup(<QueuePanel queue={queue} />);

    expect(badge).toContain("2 queued, sending now");
    expect(row).toContain("Sending");
    expect(row).toContain("disabled");
    expect(panel).toContain("Clear all");
    expect(panel).toContain('disabled="" aria-label="Clear queued messages"');
  });

  it("restores the minimized preference", () => {
    const queue = new QueueService();
    queue.enqueue("Queued message");

    const html = renderToStaticMarkup(
      <QueuePanel queue={queue} initialCollapsed />,
    );

    expect(html).toContain('data-collapsed="true"');
    expect(html).toContain('aria-label="Expand queue"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('hidden=""');
  });

  it("shows when automatic sending is paused", () => {
    const queue = new QueueService();
    queue.enqueue("Wait for resume");

    const html = renderToStaticMarkup(<QueuePanel queue={queue} paused />);

    expect(html).toContain("1 queued, paused");
    expect(html).toContain('aria-label="Resume queue"');
  });
});
