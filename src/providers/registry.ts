import { chatGptProvider } from "./chatgpt";
import type { Provider } from "./provider";

export interface ProviderRegistry {
  readonly urlPatterns: string[];
  register(provider: Provider): void;
  get(url: URL): Provider | undefined;
}

export function createProviderRegistry(
  initialProviders: readonly Provider[] = [],
): ProviderRegistry {
  const providers = [...initialProviders];

  return {
    get urlPatterns() {
      return [
        ...new Set(providers.flatMap((provider) => provider.urlPatterns)),
      ];
    },
    register(provider) {
      const existingIndex = providers.findIndex(
        (candidate) => candidate.id === provider.id,
      );

      if (existingIndex === -1) {
        providers.push(provider);
      } else {
        providers[existingIndex] = provider;
      }
    },
    get(url) {
      return providers.find((provider) => provider.matches(url));
    },
  };
}

export const providerRegistry = createProviderRegistry([chatGptProvider]);
