# Adding a provider

Providers keep website-specific DOM behavior out of the shared queue runtime.

1. Add a provider implementation with URL patterns and the `Provider` contract.
2. Keep generation controls, composer selectors, conversation scope, and theme detection in that provider.
3. Register the provider in `src/providers/registry.ts`.
4. Add provider unit tests and a fake-page E2E fixture for its send and generation behavior.

The queue domain, storage, drainer, send integration, and queue UI should not need provider-specific changes.
