import { ChatGptAdapter } from "../adapters/chatgpt/adapter";
import { ChatGptComposerAdapter } from "../adapters/chatgpt/composer";
import { CHATGPT_SELECTORS } from "../adapters/chatgpt/selectors";
import type { Provider } from "./provider";

const CHATGPT_URL_PATTERNS = [
  "https://chatgpt.com/*",
  "https://chat.openai.com/*",
] as const;

function findConversation(
  value: string,
): { id: string; route: "c" | "uc" } | undefined {
  const segments = value.split("/").filter(Boolean);

  for (let index = segments.length - 2; index >= 0; index -= 1) {
    const route = segments[index];
    const id = segments[index + 1];

    if ((route === "c" || route === "uc") && id) {
      return { id, route };
    }
  }

  return undefined;
}

function hasTemporaryChatFlag(url: URL): boolean {
  const names = ["temporary-chat", "temporary_chat", "temporary"];

  return names.some((name) => {
    if (!url.searchParams.has(name)) {
      return false;
    }

    const value = url.searchParams.get(name)?.toLowerCase();
    return value !== "false" && value !== "0";
  });
}

function getQueueScope(url: URL, root: Document): string {
  const pathConversation = findConversation(url.pathname);
  const hashValue = url.hash.slice(1);
  const hashConversation = findConversation(hashValue);
  const hashParams = new URLSearchParams(hashValue.replace(/^\?/, ""));
  const queryId =
    url.searchParams.get("conversationId") ??
    url.searchParams.get("conversation_id") ??
    hashParams.get("conversationId") ??
    hashParams.get("conversation_id");
  const conversation =
    pathConversation ??
    hashConversation ??
    (queryId ? { id: queryId, route: "c" as const } : undefined);
  const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
  const scopeId = conversation?.id ?? normalizedPath;
  const temporary =
    hasTemporaryChatFlag(url) ||
    url.pathname.includes("/temporary-chat") ||
    root.querySelector(CHATGPT_SELECTORS.temporaryChat.join(",")) !== null;

  if (temporary) {
    return `temporary:${scopeId}`;
  }

  if (
    conversation?.route === "uc" ||
    root.querySelector(CHATGPT_SELECTORS.loggedOut.join(",")) !== null
  ) {
    return `unauthenticated:${scopeId}`;
  }

  if (conversation) {
    return `conversation:${conversation.id}`;
  }

  return `page:${normalizedPath}`;
}

function getTheme(root: Document) {
  const element = root.documentElement;
  const dataTheme = element.dataset.theme;

  if (dataTheme === "light" || dataTheme === "dark") {
    return dataTheme;
  }

  if (element.classList.contains("light")) {
    return "light";
  }

  if (element.classList.contains("dark")) {
    return "dark";
  }

  return undefined;
}

export const chatGptProvider: Provider = {
  id: "chatgpt",
  name: "ChatGPT",
  urlPatterns: CHATGPT_URL_PATTERNS,
  composerContainerSelector: CHATGPT_SELECTORS.composerContainer.join(","),
  matches(url) {
    return (
      url.protocol === "https:" &&
      (url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com")
    );
  },
  createGenerationState(root) {
    return new ChatGptAdapter({ root });
  },
  createComposer(root) {
    return new ChatGptComposerAdapter(root);
  },
  getQueueScope,
  isPersistentQueueScope(scope) {
    return scope.startsWith("conversation:");
  },
  getTheme,
};
