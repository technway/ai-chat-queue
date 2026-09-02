import { describe, expect, it, vi } from "vitest";
import type { QueueState } from "../queue/queue.types";
import {
  getConversationScope,
  getQueueStorageKey,
  QueueStorage,
  type QueueStorageItem,
} from "./queue-storage";

function createItem(value: unknown): QueueStorageItem & {
  setValue: ReturnType<typeof vi.fn>;
} {
  return {
    getValue: vi.fn().mockResolvedValue(value),
    setValue: vi.fn().mockResolvedValue(undefined),
  };
}

function createState(): QueueState {
  return {
    items: [
      { id: "pending", content: "Keep", createdAt: 1, status: "pending" },
      { id: "sent", content: "Do not keep", createdAt: 2, status: "sent" },
    ],
    total: 2,
    isEmpty: false,
    counts: { pending: 1, sending: 0, sent: 1, failed: 0 },
  };
}

describe("QueueStorage", () => {
  it("restores valid items and normalizes interrupted sends", async () => {
    const item = createItem({
      schemaVersion: 1,
      items: [
        { id: "pending", content: "First", createdAt: 1, status: "pending" },
        { id: "sending", content: "Retry", createdAt: 2, status: "sending" },
        {
          id: "failed",
          content: "Keep failed",
          createdAt: 3,
          status: "failed",
        },
        { id: "sent", content: "Already sent", createdAt: 4, status: "sent" },
      ],
      settings: { autoSend: false, paused: true },
      preferences: { collapsed: true },
    });

    await expect(new QueueStorage(item).load()).resolves.toEqual({
      items: [
        { id: "pending", content: "First", createdAt: 1, status: "pending" },
        { id: "sending", content: "Retry", createdAt: 2, status: "pending" },
        {
          id: "failed",
          content: "Keep failed",
          createdAt: 3,
          status: "failed",
        },
      ],
      settings: { autoSend: false, paused: true },
      preferences: { collapsed: true },
    });
  });

  it("drops corrupted values without breaking restoration", async () => {
    const item = createItem({
      schemaVersion: 1,
      items: [
        null,
        { id: "", content: "Invalid ID", createdAt: 1, status: "pending" },
        { id: "valid", content: "Keep this", createdAt: 2, status: "pending" },
        { id: "valid", content: "Duplicate", createdAt: 3, status: "pending" },
        {
          id: "bad-date",
          content: "Invalid date",
          createdAt: -1,
          status: "pending",
        },
      ],
      settings: { autoSend: "yes" },
      preferences: { collapsed: 1 },
    });

    await expect(new QueueStorage(item).load()).resolves.toEqual({
      items: [
        { id: "valid", content: "Keep this", createdAt: 2, status: "pending" },
      ],
      settings: { autoSend: true, paused: false },
      preferences: { collapsed: false },
    });
  });

  it("falls back safely for unsupported schema versions", async () => {
    const item = createItem({
      schemaVersion: 999,
      items: [
        {
          id: "unknown",
          content: "Unknown schema",
          createdAt: 1,
          status: "pending",
        },
      ],
    });

    await expect(new QueueStorage(item).load()).resolves.toEqual({
      items: [],
      settings: { autoSend: true, paused: false },
      preferences: { collapsed: false },
    });
  });

  it("recovers from unreadable storage", async () => {
    const error = new Error("Storage unavailable");
    const item = createItem(null);
    item.getValue = vi.fn().mockRejectedValue(error);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(new QueueStorage(item).load()).resolves.toEqual({
      items: [],
      settings: { autoSend: true, paused: false },
      preferences: { collapsed: false },
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[message-queue] queue storage read failed",
      { error },
    );

    consoleError.mockRestore();
  });

  it("does not let an unresponsive read block extension startup", async () => {
    const item = createItem(null);
    item.getValue = vi.fn(() => new Promise(() => {}));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(new QueueStorage(item, 1).load()).resolves.toEqual({
      items: [],
      settings: { autoSend: true, paused: false },
      preferences: { collapsed: false },
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[message-queue] queue storage read failed",
      {
        error: expect.objectContaining({
          message: "Queue storage read timed out",
        }),
      },
    );

    consoleError.mockRestore();
  });

  it("stores only active queue data and serializes writes", async () => {
    const item = createItem(null);
    const queueStorage = new QueueStorage(item);

    queueStorage.save(
      createState(),
      { autoSend: true, paused: false },
      { collapsed: false },
    );
    queueStorage.save(
      {
        items: [],
        total: 0,
        isEmpty: true,
        counts: { pending: 0, sending: 0, sent: 0, failed: 0 },
      },
      { autoSend: true, paused: true },
      { collapsed: true },
    );
    await queueStorage.flush();

    expect(item.setValue).toHaveBeenNthCalledWith(1, {
      schemaVersion: 2,
      items: [
        { id: "pending", content: "Keep", createdAt: 1, status: "pending" },
      ],
      settings: { autoSend: true, paused: false },
      preferences: { collapsed: false },
    });
    expect(item.setValue).toHaveBeenNthCalledWith(2, {
      schemaVersion: 2,
      items: [],
      settings: { autoSend: true, paused: true },
      preferences: { collapsed: true },
    });
  });

  it("contains write failures so queue operations can continue", async () => {
    const error = new Error("Quota exceeded");
    const item = createItem(null);
    item.setValue.mockRejectedValue(error);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const queueStorage = new QueueStorage(item);

    expect(() =>
      queueStorage.save(
        createState(),
        { autoSend: true, paused: false },
        { collapsed: false },
      ),
    ).not.toThrow();
    await expect(queueStorage.flush()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "[message-queue] queue storage write failed",
      { error },
    );

    consoleError.mockRestore();
  });

  it("scopes storage to the current ChatGPT conversation", () => {
    expect(getConversationScope(new URL("https://chatgpt.com/c/chat-1"))).toBe(
      "conversation:chat-1",
    );
    expect(getConversationScope(new URL("https://chatgpt.com/uc/chat-2"))).toBe(
      "conversation:chat-2",
    );
    expect(
      getConversationScope(
        new URL("https://chatgpt.com/g/custom-gpt/c/chat-3"),
      ),
    ).toBe("conversation:chat-3");
    expect(
      getConversationScope(new URL("https://chatgpt.com/#/c/chat-from-hash")),
    ).toBe("conversation:chat-from-hash");
    expect(getConversationScope(new URL("https://chatgpt.com/"))).toBe(
      "page:/",
    );
    expect(getQueueStorageKey("conversation:chat-1")).not.toBe(
      getQueueStorageKey("conversation:chat-2"),
    );
  });
});
