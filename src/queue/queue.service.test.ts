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

  it("protects a message while it is being sent", () => {
    const service = new QueueService();
    const sending = service.enqueue("Sending now");
    service.enqueue("Still queued");
    service.claimNextPending();

    expect(service.remove(sending.id)).toBeUndefined();

    service.clear();

    expect(service.getState().items).toEqual([
      expect.objectContaining({ id: sending.id, status: "sending" }),
    ]);
  });
});
