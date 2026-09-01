export const CHATGPT_SELECTORS = {
  composer: [
    "#mobile-composer-prompt",
    "textarea.wm-composer-textarea",
    "#prompt-textarea",
    'textarea[data-testid="prompt-textarea"]',
    'div[contenteditable="true"][data-testid="prompt-textarea"]',
  ],
  sendButton: [
    "#composer-submit-button",
    'button[data-testid="composer-submit-button"]',
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
