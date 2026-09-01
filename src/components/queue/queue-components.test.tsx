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
    expect(html).toContain('aria-label="Clear queued messages"');
    expect(html).toContain('aria-label="Remove queued message 1"');
    expect(html).toContain('aria-label="Minimize queue"');
    expect(html).toContain('aria-expanded="true"');
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
      <QueueItem item={item} position={1} onRemove={vi.fn()} />,
    );
    const queue = new QueueService();
    queue.enqueue("Sending message");
    queue.claimNextPending();
    const panel = renderToStaticMarkup(<QueuePanel queue={queue} />);

    expect(badge).toContain("2 queued, sending now");
    expect(row).toContain("Sending");
    expect(row).toContain("disabled");
    expect(panel).toContain('disabled="" aria-label="Clear queued messages"');
  });
});
