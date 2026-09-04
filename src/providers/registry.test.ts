import { describe, expect, it, vi } from "vitest";
import type { Provider } from "./provider";
import { createProviderRegistry } from "./registry";

function createFakeProvider(id: string, hostname: string): Provider {
  return {
    id,
    name: id,
    urlPatterns: [`https://${hostname}/*`],
    composerContainerSelector: "#composer",
    matches: (url) => url.hostname === hostname,
    createGenerationState: vi.fn(),
    createComposer: vi.fn(),
    getQueueScope: vi.fn(() => "page:/"),
    isPersistentQueueScope: vi.fn(() => false),
    getTheme: vi.fn(),
  };
}

describe("provider registry", () => {
  it("selects a matching provider and ignores unsupported pages", () => {
    const chatProvider = createFakeProvider("chat", "chat.example.test");
    const registry = createProviderRegistry([chatProvider]);

    expect(
      registry.get(new URL("https://chat.example.test/conversation")),
    ).toBe(chatProvider);
    expect(registry.get(new URL("https://unsupported.example.test/"))).toBe(
      undefined,
    );
  });

  it("allows a minimal second provider to be registered independently", () => {
    const registry = createProviderRegistry();
    const secondProvider = createFakeProvider("second", "second.example.test");

    registry.register(secondProvider);

    expect(registry.urlPatterns).toEqual(["https://second.example.test/*"]);
    expect(
      registry.get(new URL("https://second.example.test/conversation")),
    ).toBe(secondProvider);
  });

  it("replaces a provider with the same id", () => {
    const original = createFakeProvider("chat", "chat.example.test");
    const replacement = createFakeProvider("chat", "new-chat.example.test");
    const registry = createProviderRegistry([original]);

    registry.register(replacement);

    expect(registry.get(new URL("https://chat.example.test/"))).toBeUndefined();
    expect(registry.get(new URL("https://new-chat.example.test/"))).toBe(
      replacement,
    );
  });
});
