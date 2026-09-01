import { ChatGptAdapter } from "../adapters/chatgpt/adapter";
import { ChatGptComposerAdapter } from "../adapters/chatgpt/composer";
import { ChatGptSendIntegration } from "../integrations/chatgpt/send-integration";
import { QueueService } from "../queue/queue.service";

export default defineContentScript({
  matches: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
  main(ctx) {
    console.log("[message-queue] extension loaded");

    const generationState = new ChatGptAdapter({ root: document });

    const integration = new ChatGptSendIntegration({
      composer: new ChatGptComposerAdapter(document),
      generationState,
      queue: new QueueService(),
    });

    const stopIntegration = integration.start(document);
    const stopObserving = generationState.observeState((state) => {
      console.log("[message-queue] ChatGPT state changed", { state });
    });

    ctx.onInvalidated(() => {
      stopIntegration();
      stopObserving();
    });
  },
});
