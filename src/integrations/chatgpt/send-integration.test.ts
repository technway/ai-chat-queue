import { describe, expect, it, vi } from "vitest";
import type { GenerationState } from "../../adapters/chatgpt/generation-state";
import { MessageQueue } from "../../queue/queue";
import { QueueService } from "../../queue/queue.service";
import { ChatGptSendIntegration } from "./send-integration";

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

function createActionEvent(target: EventTarget, options: object = {}) {
  return {
    isTrusted: true,
    target,
    key: "Enter",
    shiftKey: false,
    isComposing: false,
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    ...options,
  };
}

function createHarness(initialState: GenerationState, initialDraft = "Hello") {
  let draft = initialDraft;
  let generationState = initialState;
  let id = 0;
  const composerTarget = {} as EventTarget;
  const sendButtonTarget = {} as EventTarget;
  const composer = {
    isComposerTarget: vi.fn(
      (target: EventTarget | null) => target === composerTarget,
    ),
    isSendButtonTarget: vi.fn(
      (target: EventTarget | null) => target === sendButtonTarget,
    ),
    readMessage: vi.fn(() => draft),
    clearMessage: vi.fn(() => {
      draft = "";
    }),
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
  const integration = new ChatGptSendIntegration({
    composer,
    generationState: { getState: () => generationState },
    queue,
  });
  const events = new TestEventTarget();
  const stop = integration.start(events as unknown as EventTarget);

  return {
    composer,
    composerTarget,
    events,
    queue,
    queueListener,
    sendButtonTarget,
    setDraft: (content: string) => {
      draft = content;
    },
    setGenerationState: (state: GenerationState) => {
      generationState = state;
    },
    stop,
  };
}

describe("ChatGptSendIntegration", () => {
  it.each([
    ["keydown", "composer"],
    ["pointerdown", "button"],
    ["click", "button"],
  ] as const)("leaves normal %s sending untouched", (eventType, targetType) => {
    const harness = createHarness("available");
    const target =
      targetType === "composer"
        ? harness.composerTarget
        : harness.sendButtonTarget;
    const event = createActionEvent(target);

    harness.events.emit(eventType, event);

    expect(harness.queue.getState().isEmpty).toBe(true);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(harness.composer.clearMessage).not.toHaveBeenCalled();
  });

  it("queues keyboard sends while ChatGPT is generating", () => {
    const harness = createHarness("generating", "Queue from keyboard");
    const event = createActionEvent(harness.composerTarget);

    harness.events.emit("keydown", event);

    expect(harness.queue.getState().items).toEqual([
      expect.objectContaining({
        content: "Queue from keyboard",
        status: "pending",
      }),
    ]);
    expect(harness.queueListener).toHaveBeenCalledWith(
      expect.objectContaining({ type: "queued" }),
    );
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(harness.composer.clearMessage).toHaveBeenCalledOnce();
  });

  it("queues keyboard sends when the send button is unavailable", () => {
    const harness = createHarness("unavailable", "Queue while disabled");
    const event = createActionEvent(harness.composerTarget);

    harness.events.emit("keydown", event);

    expect(harness.queue.getState().items[0]?.content).toBe(
      "Queue while disabled",
    );
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(harness.composer.clearMessage).toHaveBeenCalledOnce();
  });

  it("queues new sends while unfinished queue work is briefly available", () => {
    const harness = createHarness("available", "Second message");
    harness.queue.enqueue("First message");
    const event = createActionEvent(harness.composerTarget);

    harness.events.emit("keydown", event);

    expect(harness.queue.getState().items).toEqual([
      expect.objectContaining({
        content: "First message",
        status: "pending",
      }),
      expect.objectContaining({
        content: "Second message",
        status: "pending",
      }),
    ]);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(harness.composer.clearMessage).toHaveBeenCalledOnce();
  });

  it("does not intercept the drainer's automatic button click", () => {
    const harness = createHarness("available", "First message");
    harness.queue.enqueue("First message");
    harness.queue.claimNextPending();
    const event = createActionEvent(harness.sendButtonTarget, {
      isTrusted: false,
    });

    harness.events.emit("click", event);

    expect(harness.queue.getState().items).toHaveLength(1);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(harness.composer.clearMessage).not.toHaveBeenCalled();
  });

  it.each([{ key: "Escape" }, { shiftKey: true }, { isComposing: true }])(
    "ignores non-send keyboard actions",
    (options) => {
      const harness = createHarness("generating");
      const event = createActionEvent(harness.composerTarget, options);

      harness.events.emit("keydown", event);

      expect(harness.queue.getState().isEmpty).toBe(true);
      expect(event.preventDefault).not.toHaveBeenCalled();
    },
  );

  it("queues a pointer send once and suppresses its following click", () => {
    const harness = createHarness("generating", "Queue from pointer");
    const pointerEvent = createActionEvent(harness.sendButtonTarget);
    const clickEvent = createActionEvent(harness.sendButtonTarget);

    harness.events.emit("pointerdown", pointerEvent);
    harness.events.emit("click", clickEvent);

    expect(harness.queue.getState().items).toHaveLength(1);
    expect(harness.queue.getState().items[0]?.content).toBe(
      "Queue from pointer",
    );
    expect(harness.queueListener).toHaveBeenCalledTimes(1);
    expect(pointerEvent.preventDefault).toHaveBeenCalledOnce();
    expect(clickEvent.preventDefault).toHaveBeenCalledOnce();
    expect(clickEvent.stopImmediatePropagation).toHaveBeenCalledOnce();
  });

  it("queues click-only send actions while generating", () => {
    const harness = createHarness("generating", "Queue from click");
    const event = createActionEvent(harness.sendButtonTarget);

    harness.events.emit("click", event);

    expect(harness.queue.getState().items[0]?.content).toBe("Queue from click");
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("does not queue empty or unrelated send actions", () => {
    const harness = createHarness("generating", "   ");
    const emptyEvent = createActionEvent(harness.composerTarget);
    const unrelatedEvent = createActionEvent({} as EventTarget);

    harness.events.emit("keydown", emptyEvent);
    harness.setDraft("Message");
    harness.events.emit("keydown", unrelatedEvent);

    expect(harness.queue.getState().isEmpty).toBe(true);
    expect(emptyEvent.preventDefault).not.toHaveBeenCalled();
    expect(unrelatedEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("removes all event handlers during cleanup", () => {
    const harness = createHarness("generating");
    harness.stop();
    const event = createActionEvent(harness.composerTarget);

    harness.events.emit("keydown", event);

    expect(harness.queue.getState().isEmpty).toBe(true);
  });
});
