import { describe, expect, it, vi } from "vitest";
import { chatGptProvider } from "./chatgpt";

function createDocument(activeSelectors: readonly string[] = []): Document {
  return {
    querySelector: vi.fn((selector: string) =>
      activeSelectors.includes(selector) ? {} : null,
    ),
    documentElement: {
      dataset: {},
      classList: {
        contains: () => false,
      },
    },
  } as unknown as Document;
}

describe("ChatGPT provider", () => {
  it("matches only supported ChatGPT origins", () => {
    expect(
      chatGptProvider.matches(new URL("https://chatgpt.com/c/chat-1")),
    ).toBe(true);
    expect(
      chatGptProvider.matches(new URL("https://chat.openai.com/c/chat-2")),
    ).toBe(true);
    expect(
      chatGptProvider.matches(new URL("https://example.com/c/chat-3")),
    ).toBe(false);
  });

  it("keeps ChatGPT conversation scoping inside the provider", () => {
    const emptyDocument = createDocument();

    expect(
      chatGptProvider.getQueueScope(
        new URL("https://chatgpt.com/c/chat-1"),
        emptyDocument,
      ),
    ).toBe("conversation:chat-1");
    expect(
      chatGptProvider.getQueueScope(
        new URL("https://chatgpt.com/uc/chat-2"),
        emptyDocument,
      ),
    ).toBe("unauthenticated:chat-2");
    expect(
      chatGptProvider.getQueueScope(
        new URL("https://chatgpt.com/g/custom-gpt/c/chat-3"),
        emptyDocument,
      ),
    ).toBe("conversation:chat-3");
    expect(
      chatGptProvider.getQueueScope(
        new URL("https://chatgpt.com/#/c/chat-from-hash"),
        emptyDocument,
      ),
    ).toBe("conversation:chat-from-hash");
  });

  it("uses page and ephemeral scopes for non-durable chats", () => {
    expect(
      chatGptProvider.getQueueScope(
        new URL("https://chatgpt.com/"),
        createDocument(),
      ),
    ).toBe("page:/");
    expect(
      chatGptProvider.getQueueScope(
        new URL("https://chatgpt.com/c/chat-1"),
        createDocument(["[data-logged-out]"]),
      ),
    ).toBe("unauthenticated:chat-1");
    expect(
      chatGptProvider.getQueueScope(
        new URL("https://chatgpt.com/?temporary-chat=true"),
        createDocument(),
      ),
    ).toBe("temporary:/");
  });

  it("detects durable scopes and ChatGPT themes", () => {
    expect(chatGptProvider.isPersistentQueueScope("conversation:chat-1")).toBe(
      true,
    );
    expect(chatGptProvider.isPersistentQueueScope("temporary:chat-1")).toBe(
      false,
    );

    const lightDocument = createDocument();
    lightDocument.documentElement.dataset.theme = "light";
    expect(chatGptProvider.getTheme(lightDocument)).toBe("light");
  });
});
