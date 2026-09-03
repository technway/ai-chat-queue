# Privacy

ChatGPT Message Queue is designed to operate locally in the browser.

## Data handling

- The extension does not collect, transmit, sell, or share user data.
- There is no Message Queue backend, analytics service, telemetry, account system, or remote database.
- Message text is read only to intercept a busy-state send, display the local queue, and submit the queued text through the ChatGPT composer.
- Queued messages and queue preferences are stored with `chrome.storage.local` and scoped to the current ChatGPT conversation.
- Sent items are removed from queue storage. After a reload, interrupted queue work is restored as pending and waits for the user to resume it.

## Permissions and site access

- `storage`: persists queued messages and UI preferences locally across reloads.
- `https://chatgpt.com/*` and `https://chat.openai.com/*`: limits the content script to ChatGPT pages where it must observe generation controls, intercept sends while ChatGPT is busy, inject the queue panel, and submit queued messages.

The extension does not request tabs, scripting, identity, downloads, or other API permissions. Its background service worker is currently empty and does not process user data.

This document describes the extension's current behavior. It should be reviewed whenever permissions, storage, analytics, or network behavior changes.
