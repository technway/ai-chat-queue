import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { QueueDraftButton } from "../components/queue/QueueDraftButton";
import { QueuePanel } from "../components/queue/QueuePanel";
import "../styles/tailwind.css";
import { QueueActionIntegration } from "../integrations/queue-action";
import { placeQueueButton } from "../integrations/queue-button-placement";
import type { Provider } from "../providers/provider";
import { providerRegistry } from "../providers/registry";
import { MessageQueue } from "../queue/queue";
import { QueueService } from "../queue/queue.service";
import type { QueueItem as QueueItemData } from "../queue/queue.types";
import { QueueDrainer } from "../queue/queue-drainer";
import { createQueueStorageForScope } from "../storage/queue-storage";

function appendPanelHost(anchor: Element, shadowHost: Element): void {
  // A form fallback must remain intact because replacing it breaks submission.
  if (anchor.matches("form")) {
    anchor.before(shadowHost);
    return;
  }

  if (shadowHost.parentElement !== anchor) {
    anchor.append(shadowHost);
  }
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}

async function waitForPageHydration(): Promise<void> {
  if (document.readyState === "loading") {
    await new Promise<void>((resolve) => {
      document.addEventListener("DOMContentLoaded", () => resolve(), {
        once: true,
      });
    });
  }

  // Let the page's React tree finish its initial hydration before inserting
  // the extension host into the composer layout.
  await waitForAnimationFrame();
  await waitForAnimationFrame();
}

function syncQueueTheme(provider: Provider, shadowHost: HTMLElement): void {
  const theme = provider.getTheme(document);

  if (theme === "light" || theme === "dark") {
    shadowHost.dataset.theme = theme;
  } else {
    delete shadowHost.dataset.theme;
  }
}

function getCurrentQueueScope(provider: Provider): string {
  return provider.getQueueScope(new URL(location.href), document);
}

export default defineContentScript({
  matches: providerRegistry.urlPatterns,
  cssInjectionMode: "ui",
  async main(ctx) {
    const provider = providerRegistry.get(new URL(location.href));

    if (!provider) {
      return;
    }

    console.log("[ai-chat-queue] extension loaded");

    const generationState = provider.createGenerationState(document);
    const composer = provider.createComposer(document);
    let queueScope = getCurrentQueueScope(provider);
    let queueStorage = createQueueStorageForScope(
      provider.id,
      queueScope,
      provider.isPersistentQueueScope(queueScope),
    );
    const restored = await queueStorage.load();
    console.log("[ai-chat-queue] queue storage ready", {
      count: restored.items.length,
      persistent: provider.isPersistentQueueScope(queueScope),
      scope: queueScope,
    });
    let settings = {
      ...restored.settings,
      // Restored messages always wait for an explicit resume after a reload.
      paused: restored.items.length > 0 || restored.settings.paused,
    };
    let preferences = restored.preferences;
    const queue = new QueueService(
      new MessageQueue({ initialItems: restored.items }),
    );
    const composerContainerSelector = provider.composerContainerSelector;
    let refreshQueueUi = () => {};
    let refreshQueueButtonUi = () => {};
    let refreshQueuePanelUi = () => {};
    let switchingConversation = false;
    let requestConversationSwitch: (scope: string) => void = () => {};
    let draftBlocked = false;
    let stagedComposerContent: string | null = null;

    const stopStorageSubscription = queue.subscribe((event) => {
      const currentScope = getCurrentQueueScope(provider);

      if (switchingConversation || currentScope !== queueScope) {
        requestConversationSwitch(currentScope);
        return;
      }

      queueStorage.save(event.state, settings, preferences);
    });

    const queueAction = new QueueActionIntegration({
      composer,
      queue,
    });
    const drainer = new QueueDrainer({
      queue,
      sender: composer,
      onSendStart(content) {
        stagedComposerContent = content;
      },
    });

    if (settings.paused) {
      drainer.pause();
      queueStorage.save(queue.getState(), settings, preferences);
    }

    const switchConversation = async (targetScope: string) => {
      const previousStorage = queueStorage;
      const previousItemIds = new Set(
        queue.getState().items.map((item) => item.id),
      );

      previousStorage.save(queue.getState(), settings, preferences);
      await previousStorage.flush();

      const nextStorage = createQueueStorageForScope(
        provider.id,
        targetScope,
        provider.isPersistentQueueScope(targetScope),
      );
      const nextSnapshot = await nextStorage.load();
      const latestScope = getCurrentQueueScope(provider);

      if (latestScope !== targetScope) {
        switchingConversation = false;
        requestConversationSwitch(latestScope);
        return;
      }

      // Inputs queued during navigation belong to the newly opened chat.
      const restoredIds = new Set(nextSnapshot.items.map((item) => item.id));
      const newlyQueuedItems = queue
        .getState()
        .items.filter(
          (item) => !previousItemIds.has(item.id) && !restoredIds.has(item.id),
        );

      stagedComposerContent = null;
      queueScope = targetScope;
      queueStorage = nextStorage;
      preferences = nextSnapshot.preferences;
      settings = {
        ...nextSnapshot.settings,
        paused: nextSnapshot.items.length > 0 || nextSnapshot.settings.paused,
      };

      drainer.reset(settings.paused || draftBlocked);

      switchingConversation = false;
      queue.replace([...nextSnapshot.items, ...newlyQueuedItems]);
      refreshQueueUi();
      console.log("[ai-chat-queue] queue conversation changed", {
        count: queue.getState().total,
        scope: queueScope,
      });

      if (!settings.paused && !draftBlocked) {
        queueMicrotask(drainIfReady);
      }
    };

    requestConversationSwitch = (targetScope) => {
      if (targetScope === queueScope || switchingConversation) {
        return;
      }

      switchingConversation = true;
      drainer.pause();
      void switchConversation(targetScope);
    };

    const isCurrentConversation = () => {
      const currentScope = getCurrentQueueScope(provider);

      if (!switchingConversation && currentScope === queueScope) {
        return true;
      }

      requestConversationSwitch(currentScope);
      return false;
    };
    const isQueuePaused = () => settings.paused || draftBlocked;
    const drainIfReady = () => {
      const state = generationState.getState();

      if (
        isCurrentConversation() &&
        settings.autoSend &&
        !isQueuePaused() &&
        (state === "available" || state === "unavailable")
      ) {
        void drainer.drainNext();
      }
    };

    const syncDraftGuard = () => {
      const content = composer.readMessage();
      const hasDraft =
        content.trim().length > 0 && content !== stagedComposerContent;

      if (hasDraft === draftBlocked) {
        return;
      }

      draftBlocked = hasDraft;

      if (draftBlocked) {
        drainer.pause();
        console.log("[ai-chat-queue] queue paused for active draft");
      } else if (!settings.paused) {
        // Releasing a draft unblocks the queue but never triggers a send by
        // itself: the automatic drain is driven by observed generation
        // completions and explicit user actions, not by the current state.
        drainer.resume({ arm: false });
        console.log("[ai-chat-queue] queue resumed after draft cleared");
      }

      refreshQueueUi();
    };

    const onComposerInput: EventListener = (event) => {
      if (!composer.isComposerTarget(event.target)) {
        return;
      }

      // Only user edits take ownership of text staged by the drainer.
      if (event.isTrusted) stagedComposerContent = null;
      syncDraftGuard();
    };

    document.addEventListener("input", onComposerInput, true);
    document.addEventListener("change", onComposerInput, true);
    document.addEventListener("compositionend", onComposerInput, true);

    const stopQueueSubscription = queue.subscribe((event) => {
      if (event.type !== "queued") {
        return;
      }

      // Wait until the queue action clears the submitted draft from the
      // composer so the draft guard can release it. Queue entry never triggers
      // an automatic send by itself: while the current turn is genuinely in
      // progress the drainer stays armed for the upcoming completion, and in
      // every other state it is disarmed so spurious available/unavailable DOM
      // transitions cannot send a freshly staged draft.
      queueMicrotask(() => {
        syncDraftGuard();
        const state = generationState.getState();

        if (state === "generating" || state === "awaiting") {
          drainer.markGenerating();
        } else {
          drainer.disarm();
        }
      });
    });

    const stopQueueAction = queueAction.start(document);
    const stopObserving = generationState.observeState((state) => {
      console.log("[ai-chat-queue] ChatGPT state changed", { state });

      if (state === "generating" || state === "awaiting") {
        if (isCurrentConversation() && settings.autoSend && !isQueuePaused()) {
          drainer.markGenerating();
        }
      } else if (
        isCurrentConversation() &&
        settings.autoSend &&
        !isQueuePaused() &&
        (state === "available" || state === "unavailable")
      ) {
        // A completed turn arms the drainer through the generating/awaiting
        // phase; reaching available/unavailable submits the next message.
        void drainer.drainNext();
      }
    });

    await waitForPageHydration();
    syncDraftGuard();

    const buttonUi = await createShadowRootUi(ctx, {
      name: "ai-chat-queue-button",
      position: "inline",
      anchor: composerContainerSelector,
      append(anchor, shadowHost) {
        placeQueueButton(anchor, shadowHost);
      },
      inheritStyles: true,
      isolateEvents: true,
      onMount(container, _shadow, shadowHost) {
        syncQueueTheme(provider, shadowHost);

        const root = createRoot(container);
        const renderButton = () => {
          root.render(
            createElement(QueueDraftButton, {
              disabled: !draftBlocked,
              onQueue() {
                queueAction.queueDraft();
              },
            }),
          );
        };

        refreshQueueButtonUi = renderButton;
        renderButton();

        return {
          unmount() {
            refreshQueueButtonUi = () => {};
            root.unmount();
          },
        };
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    const panelUi = await createShadowRootUi(ctx, {
      name: "ai-chat-queue",
      position: "inline",
      anchor: composerContainerSelector,
      append(anchor, shadowHost) {
        appendPanelHost(anchor, shadowHost);
      },
      inheritStyles: true,
      isolateEvents: true,
      onMount(container, _shadow, shadowHost) {
        shadowHost.style.setProperty("display", "block", "important");
        shadowHost.style.setProperty("width", "100%", "important");
        shadowHost.style.setProperty("flex", "none", "important");
        syncQueueTheme(provider, shadowHost);

        console.log("[ai-chat-queue] queue UI mounted", {
          parent: shadowHost.parentElement?.className || null,
        });

        const root = createRoot(container);
        const renderQueue = (
          state = queue.getState(),
          exitingItem?: QueueItemData,
        ) => {
          root.render(
            createElement(QueuePanel, {
              queue,
              state,
              exitingItem,
              initialCollapsed: preferences.collapsed,
              paused: isQueuePaused(),
              draftBlocked,
              onCollapsedChange(collapsed) {
                preferences = { ...preferences, collapsed };
                queueStorage.save(queue.getState(), settings, preferences);
              },
              onPausedChange(paused) {
                if (!isCurrentConversation() || draftBlocked) {
                  return;
                }

                settings = { ...settings, paused };

                if (paused) {
                  drainer.pause();
                } else {
                  drainer.resume();
                }

                queueStorage.save(queue.getState(), settings, preferences);
                renderQueue();

                if (!paused && !draftBlocked) {
                  queueMicrotask(drainIfReady);
                }
              },
              onEditingChange(id) {
                if (id) {
                  if (!drainer.pauseAt(id)) {
                    return;
                  }
                } else {
                  drainer.resumeAt();
                }

                // Allow messages before the edit barrier to continue, while
                // keeping the edited message and everything after it queued.
                queueMicrotask(drainIfReady);
              },
            }),
          );
        };

        // Subscribe here so queue updates are not dependent on React effect timing.
        const stopRendering = queue.subscribe((event) => {
          const shouldAnimateExit =
            event.type === "removed" ||
            (event.type === "status-changed" && event.item.status === "sent");
          renderQueue(event.state, shouldAnimateExit ? event.item : undefined);
        });
        refreshQueuePanelUi = renderQueue;
        renderQueue();

        return {
          unmount() {
            refreshQueuePanelUi = () => {};
            stopRendering();
            root.unmount();
          },
        };
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    refreshQueueUi = () => {
      refreshQueueButtonUi();
      refreshQueuePanelUi();
    };

    let panelMountAnchor: Element | null = null;
    const ensureQueueUi = () => {
      isCurrentConversation();
      // React can clear or replace the editor without dispatching input.
      syncDraftGuard();
      syncQueueTheme(provider, buttonUi.shadowHost);
      syncQueueTheme(provider, panelUi.shadowHost);
      const buttonAnchor = document.querySelector(composerContainerSelector);
      const panelAnchor = buttonAnchor;

      if (buttonAnchor) {
        if (!buttonUi.mounted) {
          buttonUi.mount();
        } else {
          placeQueueButton(buttonAnchor, buttonUi.shadowHost);
        }
      } else {
        if (buttonUi.mounted) buttonUi.remove();
      }

      if (panelAnchor) {
        if (!panelUi.mounted) {
          panelUi.mount();
        } else if (
          !panelUi.shadowHost.isConnected ||
          panelMountAnchor !== panelAnchor
        ) {
          appendPanelHost(panelAnchor, panelUi.shadowHost);
        }
        panelMountAnchor = panelAnchor;
      } else {
        if (panelUi.mounted) panelUi.remove();
        panelMountAnchor = null;
      }
    };

    let layoutFrame = 0;
    const scheduleLayout = () => {
      if (!layoutFrame) {
        layoutFrame = requestAnimationFrame(() => {
          layoutFrame = 0;
          ensureQueueUi();
        });
      }
    };
    const resizeObserver = new ResizeObserver(scheduleLayout);
    let observedAnchor: Element | null = null;
    const uiObserver = new MutationObserver(() => {
      const anchor = document.querySelector(composerContainerSelector);
      if (anchor !== observedAnchor) {
        resizeObserver.disconnect();
        if (anchor) resizeObserver.observe(anchor);
        observedAnchor = anchor;
      }
      scheduleLayout();
    });
    window.addEventListener("resize", scheduleLayout);
    document.addEventListener("scroll", scheduleLayout, true);
    window.visualViewport?.addEventListener("resize", scheduleLayout);
    window.visualViewport?.addEventListener("scroll", scheduleLayout);
    uiObserver.observe(document.body, { childList: true, subtree: true });
    const themeObserver = new MutationObserver(() => {
      syncQueueTheme(provider, buttonUi.shadowHost);
      syncQueueTheme(provider, panelUi.shadowHost);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    ensureQueueUi();

    ctx.onInvalidated(() => {
      uiObserver.disconnect();
      resizeObserver.disconnect();
      cancelAnimationFrame(layoutFrame);
      window.removeEventListener("resize", scheduleLayout);
      document.removeEventListener("scroll", scheduleLayout, true);
      window.visualViewport?.removeEventListener("resize", scheduleLayout);
      window.visualViewport?.removeEventListener("scroll", scheduleLayout);
      themeObserver.disconnect();
      drainer.stop();
      buttonUi.remove();
      panelUi.remove();
      stopQueueAction();
      stopObserving();
      stopQueueSubscription();
      stopStorageSubscription();
      document.removeEventListener("input", onComposerInput, true);
      document.removeEventListener("change", onComposerInput, true);
      document.removeEventListener("compositionend", onComposerInput, true);
      void queueStorage.flush();
    });
  },
});
