# ChatGPT generation adapter

This adapter is the only place that knows how to read ChatGPT's DOM.

`getState()` returns:

- `generating` when a visible stop or pause button exists
- `available` when the send button is visible and enabled
- `unavailable` when the send button is visible but disabled
- `unknown` when the expected controls cannot be found safely

`isGenerating()` is the boolean form used by queue consumers. `observeState()` immediately reports the current state, reports later state changes through a `MutationObserver`, and returns a cleanup function.

Selector fallbacks and duplicate matches are scanned until a visible control is found. Update `selectors.ts` when ChatGPT changes its controls. Queue code should not query these selectors directly.
