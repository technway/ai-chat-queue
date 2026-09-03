import { describe, expect, it, vi } from "vitest";
import { MessageQueue } from "./queue";
import { QueueService } from "./queue.service";

describe("QueueService", () => {
  it("publishes queued items and current state", () => {
    let id = 0;
    const service = new QueueService(
      new MessageQueue({
        createId: () => {
          id += 1;
          return `message-${id}`;
        },
        now: () => 123,
      }),
    );
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);

    const first = service.enqueue("First");

    expect(listener).toHaveBeenCalledWith({
      type: "queued",
      item: first,
      state: expect.objectContaining({ total: 1, isEmpty: false }),
    });

    unsubscribe();
    service.enqueue("Second");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(service.getState().total).toBe(2);
  });

  it("keeps queued messages when a listener fails", () => {
    const service = new QueueService();
    service.subscribe(() => {
      throw new Error("UI failed");
    });

    expect(() => service.enqueue("Keep this message")).not.toThrow();
    expect(service.getState().items[0]?.content).toBe("Keep this message");
  });

  it("claims pending messages and publishes status changes", () => {
    const service = new QueueService();
    const first = service.enqueue("First");
    const second = service.enqueue("Second");
    const listener = vi.fn();
    service.subscribe(listener);

    expect(service.claimNextPending()).toEqual({
      ...first,
      status: "sending",
    });
    expect(service.markSent(first.id)).toEqual({ ...first, status: "sent" });
    expect(service.claimNextPending()).toEqual({
      ...second,
      status: "sending",
    });
    expect(service.markPending(second.id)).toEqual({
      ...second,
      status: "pending",
    });
    expect(service.markFailed(second.id)).toEqual({
      ...second,
      status: "failed",
    });
    expect(service.claimNextPending()).toBeUndefined();
    expect(service.markSent("missing")).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(5);
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "status-changed",
        item: expect.objectContaining({ id: second.id, status: "failed" }),
      }),
    );
  });

  it("removes individual messages and clears the queue", () => {
    const service = new QueueService();
    const first = service.enqueue("First");
    service.enqueue("Second");
    const listener = vi.fn();
    service.subscribe(listener);

    expect(service.remove(first.id)).toEqual(first);
    expect(listener).toHaveBeenLastCalledWith({
      type: "removed",
      item: first,
      state: expect.objectContaining({ total: 1 }),
    });

    service.clear();

    expect(service.getState().isEmpty).toBe(true);
    expect(listener).toHaveBeenLastCalledWith({
      type: "cleared",
      state: expect.objectContaining({ total: 0, isEmpty: true }),
    });
    expect(service.remove("missing")).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("reorders pending messages and publishes the new order", () => {
    const service = new QueueService();
    const first = service.enqueue("First");
    const second = service.enqueue("Second");
    const third = service.enqueue("Third");
    const listener = vi.fn();
    service.subscribe(listener);

    expect(service.move(third.id, "up")).toBe(true);
    expect(service.getState().items).toEqual([first, third, second]);
    expect(listener).toHaveBeenLastCalledWith({
      type: "reordered",
      item: third,
      state: expect.objectContaining({
        items: [first, third, second],
      }),
    });

    expect(service.move(first.id, "up")).toBe(false);
    expect(service.move(second.id, "down")).toBe(false);
  });

  it("edits queued content and retries failed messages", () => {
    const service = new QueueService();
    const pending = service.enqueue("Pending message");
    const failed = service.enqueue("Failed message");
    service.markFailed(failed.id);
    const listener = vi.fn();
    service.subscribe(listener);

    expect(service.edit(pending.id, "Edited pending message")).toEqual({
      ...pending,
      content: "Edited pending message",
    });
    expect(service.edit(failed.id, "Edited and retry")).toEqual({
      ...failed,
      content: "Edited and retry",
      status: "pending",
    });
    expect(listener).toHaveBeenLastCalledWith({
      type: "edited",
      item: { ...failed, content: "Edited and retry", status: "pending" },
      state: expect.objectContaining({
        items: [
          { ...pending, content: "Edited pending message" },
          { ...failed, content: "Edited and retry", status: "pending" },
        ],
      }),
    });
  });

  it("does not edit messages that are sent or sending", () => {
    const service = new QueueService();
    const sending = service.enqueue("Sending now");
    const sent = service.enqueue("Already sent");
    service.claimNextPending();
    service.markSent(sent.id);

    expect(service.edit(sending.id, "Changed")).toBeUndefined();
    expect(service.edit(sent.id, "Changed")).toBeUndefined();
  });

  it("protects a message while it is being sent", () => {
    const service = new QueueService();
    const sending = service.enqueue("Sending now");
    const queued = service.enqueue("Still queued");
    service.claimNextPending();

    expect(service.remove(sending.id)).toBeUndefined();
    expect(service.move(sending.id, "down")).toBe(false);
    expect(service.move(queued.id, "up")).toBe(false);

    service.clear();

    expect(service.getState().items).toEqual([
      expect.objectContaining({ id: sending.id, status: "sending" }),
    ]);
  });

  it("replaces queue state and notifies subscribers", () => {
    const service = new QueueService();
    service.enqueue("Previous conversation");
    const listener = vi.fn();
    service.subscribe(listener);
    const items = [
      {
        id: "restored",
        content: "Current conversation",
        createdAt: 123,
        status: "pending" as const,
      },
    ];

    service.replace(items);

    expect(service.getState().items).toEqual(items);
    expect(listener).toHaveBeenCalledWith({
      type: "replaced",
      state: expect.objectContaining({ items }),
    });
  });
});
