import { describe, expect, it } from "vitest";
import {
  hasSameMessageContent,
  normalizeMessageContent,
} from "./message-content";

describe("message content comparison", () => {
  it("accepts editor-only space and line-ending normalization", () => {
    expect(hasSameMessageContent("two  spaces", "two\u00a0 spaces")).toBe(true);
    expect(hasSameMessageContent("narrow space", "narrow\u202fspace")).toBe(
      true,
    );
    expect(hasSameMessageContent("first\r\nsecond", "first\nsecond")).toBe(
      true,
    );
  });

  it("accepts canonically equivalent Unicode", () => {
    expect(hasSameMessageContent("caf\u00e9", "cafe\u0301")).toBe(true);
  });

  it("still detects visible edits", () => {
    expect(hasSameMessageContent("Queued message", "Changed message")).toBe(
      false,
    );
  });

  it("keeps meaningful whitespace changes distinct", () => {
    expect(normalizeMessageContent("two  spaces")).not.toBe(
      normalizeMessageContent("two spaces"),
    );
  });
});
