import { describe, expect, it, vi } from "vitest";
import { MessageQueue } from "./queue";
import { QueueService } from "./queue.service";
import { QueueDrainer, type QueueSendResult } from "./queue-drainer";

function createQueue() {
  let id = 0;

  return new QueueService(
    new MessageQueue({
      createId: () => {
        id += 1;
        return `message-${id}`;
      },
      now: () => 123,
    }),
  );
}

describe("QueueDrainer", () => {
  it("sends one queued message during each availability window", async () => {
    const queue = createQueue();
    const first = queue.enqueue("First");
    const second = queue.enqueue("Second");
    const sender = { send: vi.fn(() => "sent" as const) };
    const drainer = new QueueDrainer({ queue, sender });

    await drainer.drainNext();
    await drainer.drainNext();

    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(sender.send).toHaveBeenCalledWith("First");
    expect(queue.getState().items).toEqual([
      { ...first, status: "sent" },
      second,
    ]);

    drainer.markGenerating();
    await drainer.drainNext();

    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(sender.send).toHaveBeenLastCalledWith("Second");
    expect(queue.getState().items[1]?.status).toBe("sent");
  });

  it("does not start a second send while one is in flight", async () => {
    const queue = createQueue();
    queue.enqueue("First");
    queue.enqueue("Second");
    let finishSend: ((result: QueueSendResult) => void) | undefined;
    const sender = {
      send: vi.fn(
        () =>
          new Promise<QueueSendResult>((resolve) => {
            finishSend = resolve;
          }),
      ),
    };
    const drainer = new QueueDrainer({ queue, sender });

    const firstDrain = drainer.drainNext();
    await drainer.drainNext();
    drainer.markGenerating();
    await drainer.drainNext();

    expect(sender.send).toHaveBeenCalledTimes(1);

    finishSend?.("sent");
    await firstDrain;
    expect(queue.getState().counts.sent).toBe(1);
    expect(queue.getState().counts.pending).toBe(1);
  });

  it("keeps a deferred message pending and preserves normal interaction", async () => {
    const queue = createQueue();
    const item = queue.enqueue("Queued message");
    const sender = {
      send: vi
        .fn<() => QueueSendResult>()
        .mockReturnValueOnce("deferred")
        .mockReturnValueOnce("sent"),
    };
    const drainer = new QueueDrainer({ queue, sender });

    await drainer.drainNext();

    expect(queue.getState().items[0]).toEqual(item);

    await drainer.drainNext();

    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(queue.getState().items[0]?.status).toBe("sent");
  });

  it("retries a staged message when availability changes", async () => {
    const queue = createQueue();
    const item = queue.enqueue("Queued message");
    const sender = {
      send: vi
        .fn<() => QueueSendResult>()
        .mockReturnValueOnce("staged")
        .mockReturnValueOnce("sent"),
    };
    const drainer = new QueueDrainer({ queue, sender });

    await drainer.drainNext();

    expect(queue.getState().items[0]).toEqual(item);

    await drainer.drainNext();

    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(queue.getState().items[0]?.status).toBe("sent");
  });

  it("does not miss availability while a message is being staged", async () => {
    const queue = createQueue();
    queue.enqueue("Queued message");
    let finishStaging: ((result: QueueSendResult) => void) | undefined;
    const sender = {
      send: vi
        .fn<() => QueueSendResult | Promise<QueueSendResult>>()
        .mockImplementationOnce(
          () =>
            new Promise<QueueSendResult>((resolve) => {
              finishStaging = resolve;
            }),
        )
        .mockReturnValueOnce("sent"),
    };
    const drainer = new QueueDrainer({ queue, sender });

    const staging = drainer.drainNext();
    await drainer.drainNext();
    finishStaging?.("staged");
    await staging;

    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(queue.getState().items[0]?.status).toBe("sent");
  });

  it("retains a failed item and halts later sends", async () => {
    const queue = createQueue();
    queue.enqueue("Fails");
    queue.enqueue("Must wait");
    const sender = {
      send: vi.fn(() => {
        throw new Error("ChatGPT DOM changed");
      }),
    };
    const drainer = new QueueDrainer({ queue, sender });

    await drainer.drainNext();
    drainer.markGenerating();
    await drainer.drainNext();

    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(queue.getState().counts.failed).toBe(1);
    expect(queue.getState().counts.pending).toBe(1);
  });

  it("resets halted state when the conversation changes", async () => {
    const queue = createQueue();
    const failed = queue.enqueue("Fails in the previous chat");
    const sender = {
      send: vi
        .fn<() => QueueSendResult>()
        .mockImplementationOnce(() => {
          throw new Error("Previous chat failed");
        })
        .mockReturnValueOnce("sent"),
    };
    const drainer = new QueueDrainer({ queue, sender });

    await drainer.drainNext();
    queue.remove(failed.id);
    queue.enqueue("Send in the current chat");
    drainer.reset();
    await drainer.drainNext();

    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(queue.getState().counts.sent).toBe(1);
  });

  it("keeps messages pending while paused and resumes safely", async () => {
    const queue = createQueue();
    queue.enqueue("Wait for confirmation");
    const sender = { send: vi.fn(() => "sent" as const) };
    const drainer = new QueueDrainer({ queue, sender });

    drainer.pause();
    await drainer.drainNext();

    expect(sender.send).not.toHaveBeenCalled();
    expect(queue.getState().counts.pending).toBe(1);

    drainer.resume();
    await drainer.drainNext();

    expect(sender.send).toHaveBeenCalledWith("Wait for confirmation");
    expect(queue.getState().counts.sent).toBe(1);
  });

  it("does nothing after cleanup", async () => {
    const queue = createQueue();
    queue.enqueue("Do not send");
    const sender = { send: vi.fn(() => "sent" as const) };
    const drainer = new QueueDrainer({ queue, sender });

    drainer.stop();
    drainer.markGenerating();
    await drainer.drainNext();

    expect(sender.send).not.toHaveBeenCalled();
    expect(queue.getState().counts.pending).toBe(1);
  });
});
