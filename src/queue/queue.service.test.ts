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
});
