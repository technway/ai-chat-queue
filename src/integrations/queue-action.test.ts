import { describe, expect, it, vi } from "vitest";
import { MessageQueue } from "../queue/queue";
import { QueueService } from "../queue/queue.service";
import { QueueActionIntegration } from "./queue-action";

class TestEventTarget {
  private readonly listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (typeof listener !== "function") {
      return;
    }

    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ) {
    if (typeof listener === "function") {
      this.listeners.get(type)?.delete(listener);
    }
  }

  emit(type: string, event: object) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as Event);
    }
  }
}

function createShortcutEvent(target: EventTarget, options: object = {}) {
  return {
    key: "Enter",
    shiftKey: true,
    metaKey: true,
    ctrlKey: false,
    isComposing: false,
    isTrusted: true,
    target,
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    ...options,
  };
}

function createHarness(initialDraft = "Explicit draft") {
  let draft = initialDraft;
  let id = 0;
  const composerTarget = {} as EventTarget;
  const composer = {
    isComposerTarget: vi.fn(
      (target: EventTarget | null) => target === composerTarget,
    ),
    readMessage: vi.fn(() => draft),
    clearMessage: vi.fn(() => {
      draft = "";
    }),
    focusMessage: vi.fn(),
  };
  const queue = new QueueService(
    new MessageQueue({
      createId: () => {
        id += 1;
        return `message-${id}`;
      },
      now: () => 123,
    }),
  );
  const queueListener = vi.fn();
  queue.subscribe(queueListener);
  const integration = new QueueActionIntegration({
    composer,
    queue,
  });
  const events = new TestEventTarget();
  const stop = integration.start(events as unknown as EventTarget);

  return {
    composer,
    composerTarget,
    events,
    integration,
    queue,
    queueListener,
    setDraft: (content: string) => {
      draft = content;
    },
    stop,
  };
}

describe("QueueActionIntegration", () => {
  describe("button-driven queue action", () => {
    it("queues a non-empty draft on demand", () => {
      const harness = createHarness("Queue from button");

      expect(harness.integration.queueDraft()).toBe("queued");
      expect(harness.queue.getState().items).toEqual([
        expect.objectContaining({
          content: "Queue from button",
          status: "pending",
        }),
      ]);
      expect(harness.queueListener).toHaveBeenCalledWith(
        expect.objectContaining({ type: "queued" }),
      );
      expect(harness.composer.clearMessage).toHaveBeenCalledOnce();
      expect(harness.composer.focusMessage).toHaveBeenCalledOnce();
    });

    it("ignores empty or whitespace-only drafts", () => {
      const harness = createHarness("   \n\t ");

      expect(harness.integration.queueDraft()).toBe("ignored");
      expect(harness.queue.getState().isEmpty).toBe(true);
      expect(harness.composer.clearMessage).not.toHaveBeenCalled();
      expect(harness.composer.focusMessage).not.toHaveBeenCalled();
    });
  });

  describe("keyboard shortcut", () => {
    it("queues the current draft with Cmd+Shift+Enter", () => {
      const harness = createHarness("Queue from macOS shortcut");
      const event = createShortcutEvent(harness.composerTarget);

      harness.events.emit("keydown", event);

      expect(harness.queue.getState().items).toEqual([
        expect.objectContaining({
          content: "Queue from macOS shortcut",
          status: "pending",
        }),
      ]);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
      expect(harness.composer.clearMessage).toHaveBeenCalledOnce();
      expect(harness.composer.focusMessage).toHaveBeenCalledOnce();
    });

    it("queues the current draft with Ctrl+Shift+Enter", () => {
      const harness = createHarness("Queue from Windows shortcut");
      const event = createShortcutEvent(harness.composerTarget, {
        metaKey: false,
        ctrlKey: true,
      });

      harness.events.emit("keydown", event);

      expect(harness.queue.getState().items[0]?.content).toBe(
        "Queue from Windows shortcut",
      );
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    });
    it("does not trigger ChatGPT's native send handling", () => {
      const harness = createHarness("Never send natively");
      const event = createShortcutEvent(harness.composerTarget);

      harness.events.emit("keydown", event);

      // preventDefault + stopImmediatePropagation keep the event away from the
      // page's composer handlers, so ChatGPT cannot submit or alter it.
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    });

    it("leaves normal Enter behavior unchanged", () => {
      const harness = createHarness("Native send");
      const event = createShortcutEvent(harness.composerTarget, {
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
      });

      harness.events.emit("keydown", event);

      expect(harness.queue.getState().isEmpty).toBe(true);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
      expect(harness.composer.clearMessage).not.toHaveBeenCalled();
    });

    it("leaves Shift+Enter newline behavior unchanged", () => {
      const harness = createHarness("New line");
      const event = createShortcutEvent(harness.composerTarget, {
        metaKey: false,
        ctrlKey: false,
      });

      harness.events.emit("keydown", event);

      expect(harness.queue.getState().isEmpty).toBe(true);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    });

    it("ignores the shortcut while an IME composition is active", () => {
      const harness = createHarness("Composing text");
      const event = createShortcutEvent(harness.composerTarget, {
        isComposing: true,
      });

      harness.events.emit("keydown", event);

      expect(harness.queue.getState().isEmpty).toBe(true);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    });

    it("ignores the shortcut outside the composer", () => {
      const harness = createHarness("Outside draft");
      const event = createShortcutEvent({} as EventTarget);

      harness.events.emit("keydown", event);

      expect(harness.queue.getState().isEmpty).toBe(true);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    });

    it("ignores untrusted shortcut events", () => {
      const harness = createHarness("Untrusted draft");
      const event = createShortcutEvent(harness.composerTarget, {
        isTrusted: false,
      });

      harness.events.emit("keydown", event);

      expect(harness.queue.getState().isEmpty).toBe(true);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    });

    it("removes the keydown listener during cleanup", () => {
      const harness = createHarness("Stopped");
      harness.stop();
      const event = createShortcutEvent(harness.composerTarget);

      harness.events.emit("keydown", event);

      expect(harness.queue.getState().isEmpty).toBe(true);
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });
});
