# ChatGPT provider adapters

These adapters implement the ChatGPT provider contract. They are the only
place, together with `src/providers/chatgpt.ts`, that knows how to read
ChatGPT's DOM.

`getState()` returns:

- `generating` when a visible stop or pause button exists
- `awaiting` when a tool approval / native "Follow up" surface is visible and the current turn is still unfinished
- `available` when the send button is visible and enabled (and no approval is pending)
- `unavailable` when the send button is visible but disabled
- `unknown` when the expected controls cannot be found safely

`isGenerating()` is the boolean form used by queue consumers. `observeState()` immediately reports the current state, reports later state changes through a `MutationObserver`, and returns a cleanup function.

Selector fallbacks and duplicate matches are scanned until a visible control is found. Update `selectors.ts` when ChatGPT changes its controls. Queue code should not query these selectors directly.
