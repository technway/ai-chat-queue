export const CHATGPT_SELECTORS = {
  sendButton: [
    'button[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label="Send message"]',
  ],
  stopButton: [
    'button[data-testid="stop-button"]',
    'button[aria-label="Stop streaming"]',
    'button[aria-label="Stop generating"]',
  ],
  pauseButton: [
    'button[data-testid="pause-button"]',
    'button[aria-label="Pause streaming"]',
    'button[aria-label="Pause generating"]',
  ],
} as const;
