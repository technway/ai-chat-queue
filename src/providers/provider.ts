import type { MessageSender } from "../message-sender";

export type GenerationState =
  | "available"
  | "generating"
  | "unavailable"
  | "unknown";

export type ProviderTheme = "light" | "dark";

export interface ProviderGenerationAdapter {
  getState(): GenerationState;
  observeState(callback: (state: GenerationState) => void): () => void;
}

export interface ProviderComposerAdapter extends MessageSender {
  isComposerTarget(target: EventTarget | null): boolean;
  isSendButtonTarget(target: EventTarget | null): boolean;
  readMessage(): string;
  clearMessage(): void;
}

export type ProviderComposerPort = Pick<
  ProviderComposerAdapter,
  "isComposerTarget" | "isSendButtonTarget" | "readMessage" | "clearMessage"
>;

export type ProviderGenerationPort = Pick<
  ProviderGenerationAdapter,
  "getState"
>;

export interface Provider {
  readonly id: string;
  readonly name: string;
  readonly urlPatterns: readonly string[];
  readonly composerContainerSelector: string;
  matches(url: URL): boolean;
  createGenerationState(root: Document): ProviderGenerationAdapter;
  createComposer(root: Document): ProviderComposerAdapter;
  getQueueScope(url: URL, root: Document): string;
  isPersistentQueueScope(scope: string): boolean;
  getTheme(root: Document): ProviderTheme | undefined;
}
