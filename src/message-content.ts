const EDITOR_SPACE_CHARACTERS = /[\u00a0\u202f]/g;

/**
 * I found that the queued text and the composer text had the same length but
 * were still considered different. Ignore invisible editor changes while still
 * detecting real user edits.
 */
export function normalizeMessageContent(content: string): string {
  return content
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(EDITOR_SPACE_CHARACTERS, " ");
}

export function hasSameMessageContent(left: string, right: string): boolean {
  return normalizeMessageContent(left) === normalizeMessageContent(right);
}
