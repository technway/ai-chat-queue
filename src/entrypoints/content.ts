import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { QueueDraftButton } from "../components/queue/QueueDraftButton";
import { QueuePanel } from "../components/queue/QueuePanel";
import "../styles/tailwind.css";
import { QueueActionIntegration } from "../integrations/queue-action";
import { placeQueueButton } from "../integrations/queue-button-placement";
import type { GenerationState, Provider } from "../providers/provider";
import { providerRegistry } from "../providers/registry";
import { MessageQueue } from "../queue/queue";
import { QueueService } from "../queue/queue.service";
import type { QueueItem as QueueItemData } from "../queue/queue.types";
import { QueueDrainer } from "../queue/queue-drainer";
import { QueueScopeLineage } from "../queue/queue-scope-lineage";
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

function isUnfinishedTurn(state: GenerationState): boolean {
  return (
    state === "generating" || state === "awaiting" || state === "unavailable"
  );
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
    const scopeLineage = new QueueScopeLineage({
      isPromotion: (currentScope, nextScope) =>
        provider.isQueueScopePromotion?.(currentScope, nextScope) === true,
      isProvisional: (scope) =>
        provider.isProvisionalQueueScope?.(scope) === true,
    });

    const markNativeTurnStart = () => {
      if (composer.readMessage().trim().length > 0) {
        scopeLineage.start(queueScope);
      }
    };

    const onNativeSendClick = (event: MouseEvent) => {
      if (event.isTrusted && composer.isSendButtonTarget(event.target)) {
        markNativeTurnStart();
      }
    };

    const onNativeSendKeyDown = (event: KeyboardEvent) => {
      if (
        event.isTrusted &&
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.isComposing &&
        composer.isComposerTarget(event.target)
      ) {
        markNativeTurnStart();
      }
    };

    const onNavigationClick = (event: MouseEvent) => {
      if (!event.isTrusted || !(event.target instanceof Element)) {
        return;
      }

      const link = event.target.closest("a[href]");

      if (link instanceof HTMLAnchorElement) {
        const targetUrl = new URL(link.href, location.href);

        if (provider.matches(targetUrl)) {
          const targetScope = provider.getQueueScope(targetUrl, document);

          if (targetScope !== getCurrentQueueScope(provider)) {
            scopeLineage.markExplicitNavigation(targetScope);
          }
        }

        return;
      }

      const control = event.target.closest("button[aria-label], button[title]");
      const label =
        control?.getAttribute("aria-label") ?? control?.getAttribute("title");

      if (label?.toLowerCase().includes("new chat")) {
        scopeLineage.markExplicitNavigation();
      }
    };

    const onHistoryNavigation = () => {
      scopeLineage.markExplicitNavigation();
    };

    // Capture the user's send before ChatGPT clears the composer or changes
    // the URL. On slow requests, its DOM can still look idle at this point.
    document.addEventListener("click", onNativeSendClick, true);
    document.addEventListener("keydown", onNativeSendKeyDown, true);
    document.addEventListener("click", onNavigationClick, true);
    window.addEventListener("popstate", onHistoryNavigation);

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
      const previousState = queue.getState();
      const previousItemIds = new Set(
        previousState.items.map((item) => item.id),
      );
      const previousSettings = settings;
      const previousPreferences = preferences;
      const stateDuringSwitch = generationState.getState();
      const scopeTransition = scopeLineage.decide({
        currentScope: queueScope,
        hasQueuedItems: previousState.total > 0,
        nextScope: targetScope,
        unfinishedTurn: isUnfinishedTurn(stateDuringSwitch),
      });
      const migrateExistingQueue = scopeTransition.migrate;
      const continueMigratedQueue = scopeTransition.continueAutomatically;

      previousStorage.save(previousState, settings, preferences);
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

      // Inputs queued during navigation belong to the newly opened chat. If
      // ChatGPT has just assigned an ID to the active new chat, the messages
      // queued before that URL change belong to it as well.
      const restoredIds = new Set(nextSnapshot.items.map((item) => item.id));
      const carriedItems = queue
        .getState()
        .items.filter(
          (item) =>
            !restoredIds.has(item.id) &&
            (migrateExistingQueue || !previousItemIds.has(item.id)),
        );

      if (!continueMigratedQueue) {
        stagedComposerContent = null;
      }
      scopeLineage.complete(queueScope, targetScope, scopeTransition);
      queueScope = targetScope;
      queueStorage = nextStorage;
      preferences = migrateExistingQueue
        ? previousPreferences
        : nextSnapshot.preferences;
      settings = migrateExistingQueue
        ? {
            ...previousSettings,
            // An uncertain lineage keeps its messages but requires an
            // explicit resume before anything can be sent.
            paused:
              previousSettings.paused ||
              nextSnapshot.items.length > 0 ||
              !continueMigratedQueue,
          }
        : {
            ...nextSnapshot.settings,
            paused:
              nextSnapshot.items.length > 0 || nextSnapshot.settings.paused,
          };
      drainer.reset(settings.paused || draftBlocked);

      switchingConversation = false;
      queue.replace([...nextSnapshot.items, ...carriedItems]);
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
        // Clearing a draft must not arm an idle queue by itself. A queue
        // action or an observed active turn decides when draining is safe.
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

      // This callback runs synchronously inside enqueue(), before queueDraft()
      // clears the composer. An enabled send button therefore distinguishes a
      // genuinely idle composer from a busy composer whose stop/pause selector
      // was missed and is only reported as unavailable.
      const stateWhenQueued = generationState.getState();

      // Wait until the queue action clears the submitted draft from the
      // composer so the draft guard can release it.
      queueMicrotask(() => {
        syncDraftGuard();

        if (
          stateWhenQueued === "generating" ||
          stateWhenQueued === "awaiting"
        ) {
          drainer.markGenerating();
          return;
        }

        if (stateWhenQueued === "unavailable") {
          // Stage the message while the native send control is unavailable.
          // When ChatGPT enables it after the active turn, the state observer
          // retries submission. This fallback keeps selector drift from
          // permanently stranding queued messages.
          drainer.markGenerating();
          void drainer.drainNext();
          return;
        }

        drainer.disarm();
      });
    });

    const stopQueueAction = queueAction.start(document);
    const stopObserving = generationState.observeState((state) => {
      console.log("[ai-chat-queue] ChatGPT state changed", { state });

      if (state === "generating" || state === "awaiting") {
        scopeLineage.observeUnfinishedTurn(queueScope);
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
      document.removeEventListener("click", onNativeSendClick, true);
      document.removeEventListener("keydown", onNativeSendKeyDown, true);
      document.removeEventListener("click", onNavigationClick, true);
      window.removeEventListener("popstate", onHistoryNavigation);
      void queueStorage.flush();
    });
  },
});
