import { describe, expect, it } from "vitest";
import { MessageQueue } from "./queue";

function createQueue() {
  let id = 0;

  return new MessageQueue({
    createId: () => {
      id += 1;
      return `message-${id}`;
    },
    now: () => 1_700_000_000_000,
  });
}

describe("MessageQueue", () => {
  it("starts empty", () => {
    const state = createQueue().getState();

    expect(state).toEqual({
      items: [],
      total: 0,
      isEmpty: true,
      counts: {
        pending: 0,
        sending: 0,
        sent: 0,
        failed: 0,
      },
    });
  });

  it("restores an existing queue without changing item metadata", () => {
    const initialItems = [
      {
        id: "restored-1",
        content: "Restored message",
        createdAt: 123,
        status: "pending" as const,
      },
      {
        id: "restored-2",
        content: "Needs attention",
        createdAt: 456,
        status: "failed" as const,
      },
    ];
    const queue = new MessageQueue({ initialItems });

    expect(queue.getState().items).toEqual(initialItems);
    expect(queue.getNextPending()?.id).toBe("restored-1");
    expect(queue.getState().counts.failed).toBe(1);
  });

  it("adds pending messages with generated metadata", () => {
    const queue = createQueue();

    const item = queue.add("Send this message");

    expect(item).toEqual({
      id: "message-1",
      content: "Send this message",
      createdAt: 1_700_000_000_000,
      status: "pending",
    });
    expect(queue.getState().items).toEqual([item]);
  });

  it.each(["", "   ", "\n\t"])("rejects empty content %j", (content) => {
    const queue = createQueue();

    expect(() => queue.add(content)).toThrow(
      new TypeError("Message content must be a non-empty string"),
    );
    expect(queue.getState().isEmpty).toBe(true);
  });

  it("rejects non-string content at runtime", () => {
    const queue = createQueue();

    expect(() => queue.add(null as unknown as string)).toThrow(TypeError);
  });

  it("rejects duplicate generated IDs", () => {
    const queue = new MessageQueue({
      createId: () => "duplicate",
      now: () => 0,
    });

    queue.add("First");

    expect(() => queue.add("Second")).toThrow(
      "Queue item ID already exists: duplicate",
    );
  });

  it("returns pending messages in FIFO order", () => {
    const queue = createQueue();
    const first = queue.add("First");
    const second = queue.add("Second");
    const third = queue.add("Third");

    expect(queue.getNextPending()).toBe(first);

    queue.updateStatus(first.id, "sending");
    expect(queue.getNextPending()).toBe(second);

    queue.updateStatus(second.id, "sent");
    expect(queue.getNextPending()).toBe(third);

    queue.updateStatus(third.id, "failed");
    expect(queue.getNextPending()).toBeUndefined();
  });

  it("removes messages and returns the removed item", () => {
    const queue = createQueue();
    const first = queue.add("First");
    const second = queue.add("Second");

    expect(queue.remove(first.id)).toBe(first);
    expect(queue.getState().items).toEqual([second]);
    expect(queue.remove("missing")).toBeUndefined();
  });

  it("clears every message from the queue", () => {
    const queue = createQueue();
    queue.add("First");
    queue.add("Second");

    expect(queue.clear()).toBeUndefined();
    expect(queue.getNextPending()).toBeUndefined();
    expect(queue.getState()).toEqual({
      items: [],
      total: 0,
      isEmpty: true,
      counts: {
        pending: 0,
        sending: 0,
        sent: 0,
        failed: 0,
      },
    });

    expect(() => queue.clear()).not.toThrow();
  });

  it("replaces all items when the active conversation changes", () => {
    const queue = createQueue();
    queue.add("Previous conversation");
    const replacement = {
      id: "restored",
      content: "Current conversation",
      createdAt: 123,
      status: "pending" as const,
    };

    queue.replace([replacement]);

    expect(queue.getState().items).toEqual([replacement]);
  });

  it("moves messages to a new queue position", () => {
    const queue = createQueue();
    const first = queue.add("First");
    const second = queue.add("Second");
    const third = queue.add("Third");

    expect(queue.move(third.id, 0)).toBe(true);
    expect(queue.getState().items).toEqual([third, first, second]);
    expect(queue.getNextPending()).toBe(third);

    expect(queue.move(third.id, 2)).toBe(true);
    expect(queue.getState().items).toEqual([first, second, third]);

    expect(queue.move(second.id, 1)).toBe(true);
    expect(queue.getState().items).toEqual([first, second, third]);
    expect(queue.move("missing", 0)).toBe(false);
  });

  it.each([-1, 3, 1.5])("rejects invalid target index %s", (index) => {
    const queue = createQueue();
    const item = queue.add("First");

    expect(() => queue.move(item.id, index)).toThrow(
      new RangeError("Queue index is out of range"),
    );
  });

  it("updates statuses and tracks queue state", () => {
    const queue = createQueue();
    const pending = queue.add("Pending");
    const sending = queue.add("Sending");
    const sent = queue.add("Sent");
    const failed = queue.add("Failed");

    const updatedSending = queue.updateStatus(sending.id, "sending");
    queue.updateStatus(sent.id, "sent");
    queue.updateStatus(failed.id, "failed");

    expect(updatedSending).toEqual({ ...sending, status: "sending" });
    expect(updatedSending).not.toBe(sending);
    expect(queue.updateStatus("missing", "sent")).toBeUndefined();
    expect(queue.getState()).toEqual({
      items: [
        pending,
        updatedSending,
        { ...sent, status: "sent" },
        { ...failed, status: "failed" },
      ],
      total: 4,
      isEmpty: false,
      counts: {
        pending: 1,
        sending: 1,
        sent: 1,
        failed: 1,
      },
    });
  });

  it("returns state snapshots that do not change with the queue", () => {
    const queue = createQueue();
    queue.add("First");
    const snapshot = queue.getState();

    queue.add("Second");

    expect(snapshot.total).toBe(1);
    expect(snapshot.items).toHaveLength(1);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.items)).toBe(true);
    expect(Object.isFrozen(snapshot.counts)).toBe(true);
  });
});
