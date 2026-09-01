import { ChatGptAdapter } from "../adapters/chatgpt/adapter";
import { ChatGptComposerAdapter } from "../adapters/chatgpt/composer";
import { ChatGptSendIntegration } from "../integrations/chatgpt/send-integration";
import { QueueService } from "../queue/queue.service";
import { QueueDrainer } from "../queue/queue-drainer";

export default defineContentScript({
  matches: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
  main(ctx) {
    console.log("[message-queue] extension loaded");

    const generationState = new ChatGptAdapter({ root: document });
    const composer = new ChatGptComposerAdapter(document);
    const queue = new QueueService();

    const integration = new ChatGptSendIntegration({
      composer,
      generationState,
      queue,
    });
    const drainer = new QueueDrainer({
      queue,
      sender: composer,
    });
    const drainIfReady = () => {
      const state = generationState.getState();

      if (state === "available" || state === "unavailable") {
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
        drainer.markGenerating();
      } else if (state === "available" || state === "unavailable") {
        // The unavailable phase stages text. The available phase submits it.
        void drainer.drainNext();
      }
    });

    ctx.onInvalidated(() => {
      drainer.stop();
      stopIntegration();
      stopObserving();
      stopQueueSubscription();
    });
  },
});
