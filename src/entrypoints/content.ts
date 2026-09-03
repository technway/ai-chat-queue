import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { ChatGptAdapter } from "../adapters/chatgpt/adapter";
import { ChatGptComposerAdapter } from "../adapters/chatgpt/composer";
import { CHATGPT_SELECTORS } from "../adapters/chatgpt/selectors";
import { QueuePanel } from "../components/queue/QueuePanel";
import "../styles/tailwind.css";
import { ChatGptSendIntegration } from "../integrations/chatgpt/send-integration";
import { MessageQueue } from "../queue/queue";
import { QueueService } from "../queue/queue.service";
import type { QueueItem as QueueItemData } from "../queue/queue.types";
import { QueueDrainer } from "../queue/queue-drainer";
import {
  createQueueStorageForScope,
  getConversationScope,
  isPersistentQueueScope,
} from "../storage/queue-storage";

function appendQueueHost(anchor: Element, shadowHost: Element): void {
  // A form fallback must remain intact because replacing it breaks submission.
  if (anchor.matches("form")) {
    anchor.before(shadowHost);
  } else {
    anchor.prepend(shadowHost);
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

type QueueTheme = "light" | "dark";

function getQueueTheme(): QueueTheme | undefined {
  const root = document.documentElement;
  const dataTheme = root.dataset.theme;

  if (dataTheme === "light" || dataTheme === "dark") {
    return dataTheme;
  }

  if (root.classList.contains("light")) {
    return "light";
  }

  if (root.classList.contains("dark")) {
    return "dark";
  }

  return undefined;
}

function syncQueueTheme(shadowHost: HTMLElement): void {
  const theme = getQueueTheme();

  if (theme === "light" || theme === "dark") {
    shadowHost.dataset.theme = theme;
  } else {
    delete shadowHost.dataset.theme;
  }
}

function getCurrentQueueScope(): string {
  const matches = (selectors: readonly string[]) =>
    document.querySelector(selectors.join(",")) !== null;

  return getConversationScope(new URL(location.href), {
    loggedOut: matches(CHATGPT_SELECTORS.loggedOut),
    temporary: matches(CHATGPT_SELECTORS.temporaryChat),
  });
}

export default defineContentScript({
  matches: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
  cssInjectionMode: "ui",
  async main(ctx) {
    console.log("[message-queue] extension loaded");

    const generationState = new ChatGptAdapter({ root: document });
    const composer = new ChatGptComposerAdapter(document);
    let queueScope = getCurrentQueueScope();
    let queueStorage = createQueueStorageForScope(queueScope);
    const restored = await queueStorage.load();
    console.log("[message-queue] queue storage ready", {
      count: restored.items.length,
      persistent: isPersistentQueueScope(queueScope),
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
    const composerContainerSelector =
      CHATGPT_SELECTORS.composerContainer.join(",");
    let refreshQueueUi = () => {};
    let switchingConversation = false;
    let requestConversationSwitch: (scope: string) => void = () => {};

    const stopStorageSubscription = queue.subscribe((event) => {
      const currentScope = getCurrentQueueScope();

      if (switchingConversation || currentScope !== queueScope) {
        requestConversationSwitch(currentScope);
        return;
      }

      queueStorage.save(event.state, settings, preferences);
    });

    const integration = new ChatGptSendIntegration({
      composer,
      generationState,
      queue,
    });
    const drainer = new QueueDrainer({
      queue,
      sender: composer,
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

      const nextStorage = createQueueStorageForScope(targetScope);
      const nextSnapshot = await nextStorage.load();
      const latestScope = getCurrentQueueScope();

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

      queueScope = targetScope;
      queueStorage = nextStorage;
      preferences = nextSnapshot.preferences;
      settings = {
        ...nextSnapshot.settings,
        paused: nextSnapshot.items.length > 0 || nextSnapshot.settings.paused,
      };

      drainer.reset(settings.paused);

      switchingConversation = false;
      queue.replace([...nextSnapshot.items, ...newlyQueuedItems]);
      refreshQueueUi();
      console.log("[message-queue] queue conversation changed", {
        count: queue.getState().total,
        scope: queueScope,
      });

      if (!settings.paused) {
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
      const currentScope = getCurrentQueueScope();

      if (!switchingConversation && currentScope === queueScope) {
        return true;
      }

      requestConversationSwitch(currentScope);
      return false;
    };
    const drainIfReady = () => {
      const state = generationState.getState();

      if (
        isCurrentConversation() &&
        settings.autoSend &&
        !settings.paused &&
        (state === "available" || state === "unavailable")
      ) {
        void drainer.drainNext();
      }
    };

    const stopQueueSubscription = queue.subscribe((event) => {
      if (event.type !== "queued") {
        return;
      }

      // Wait until the integration clears the submitted draft from the composer.
      queueMicrotask(drainIfReady);
    });

    const stopIntegration = integration.start(document);
    const stopObserving = generationState.observeState((state) => {
      console.log("[message-queue] ChatGPT state changed", { state });

      if (state === "generating") {
        // Restore any draft that was preserved during automatic submission.
        void composer.restoreDraft();
        if (isCurrentConversation() && settings.autoSend && !settings.paused) {
          drainer.markGenerating();
        }
      } else if (
        isCurrentConversation() &&
        settings.autoSend &&
        !settings.paused &&
        (state === "available" || state === "unavailable")
      ) {
        // The unavailable phase stages text. The available phase submits it.
        void drainer.drainNext();
      }
    });

    await waitForPageHydration();

    const ui = await createShadowRootUi(ctx, {
      name: "chatgpt-message-queue",
      position: "inline",
      anchor: composerContainerSelector,
      append(anchor, shadowHost) {
        appendQueueHost(anchor, shadowHost);
      },
      inheritStyles: true,
      isolateEvents: true,
      onMount(container, _shadow, shadowHost) {
        // The host must participate in ChatGPT's composer layout.
        shadowHost.style.setProperty("display", "block", "important");
        shadowHost.style.setProperty("width", "100%", "important");
        shadowHost.style.setProperty("flex", "none", "important");
        syncQueueTheme(shadowHost);

        console.log("[message-queue] queue UI mounted", {
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
              paused: settings.paused,
              onCollapsedChange(collapsed) {
                preferences = { ...preferences, collapsed };
                queueStorage.save(queue.getState(), settings, preferences);
              },
              onPausedChange(paused) {
                if (!isCurrentConversation()) {
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

                if (!paused) {
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
        refreshQueueUi = renderQueue;
        renderQueue();

        return {
          unmount() {
            refreshQueueUi = () => {};
            stopRendering();
            root.unmount();
          },
        };
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    const ensureQueueUi = () => {
      isCurrentConversation();
      syncQueueTheme(ui.shadowHost);
      const anchor = document.querySelector(composerContainerSelector);

      if (!anchor) {
        return;
      }

      if (!ui.mounted) {
        ui.mount();
        return;
      }

      if (!ui.shadowHost.isConnected) {
        // ChatGPT can remove unknown footer children without replacing the footer.
        appendQueueHost(anchor, ui.shadowHost);
        console.log("[message-queue] queue UI reattached", {
          parent: ui.shadowHost.parentElement?.className || null,
        });
      }
    };

    const uiObserver = new MutationObserver(ensureQueueUi);
    uiObserver.observe(document.body, { childList: true, subtree: true });
    const themeObserver = new MutationObserver(() => {
      syncQueueTheme(ui.shadowHost);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    ensureQueueUi();

    ctx.onInvalidated(() => {
      uiObserver.disconnect();
      themeObserver.disconnect();
      drainer.stop();
      stopIntegration();
      stopObserving();
      stopQueueSubscription();
      stopStorageSubscription();
      void queueStorage.flush();
    });
  },
});
