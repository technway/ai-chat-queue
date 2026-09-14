import { describe, expect, it } from "vitest";
import { QueueScopeLineage } from "./queue-scope-lineage";

const isProvisional = (scope: string) =>
  scope === "page:/" || scope.startsWith("conversation:WEB:");
const isPromotion = (currentScope: string, nextScope: string) =>
  (currentScope === "page:/" && nextScope.startsWith("conversation:")) ||
  (currentScope.startsWith("conversation:WEB:") &&
    nextScope.startsWith("conversation:") &&
    !nextScope.startsWith("conversation:WEB:"));

function createLineage(): QueueScopeLineage {
  return new QueueScopeLineage({ isPromotion, isProvisional });
}

describe("QueueScopeLineage", () => {
  it("follows a new chat through provisional and canonical scopes", () => {
    const lineage = createLineage();
    lineage.start("page:/");

    const provisional = lineage.decide({
      currentScope: "page:/",
      hasQueuedItems: false,
      nextScope: "conversation:WEB:temporary-id",
      unfinishedTurn: true,
    });
    expect(provisional).toEqual({
      continueAutomatically: true,
      migrate: true,
    });
    lineage.complete("page:/", "conversation:WEB:temporary-id", provisional);

    expect(
      lineage.decide({
        currentScope: "conversation:WEB:temporary-id",
        hasQueuedItems: true,
        nextScope: "conversation:canonical-id",
        unfinishedTurn: true,
      }),
    ).toEqual({ continueAutomatically: true, migrate: true });
  });

  it("does not follow an explicit navigation to another conversation", () => {
    const lineage = createLineage();
    lineage.start("conversation:WEB:temporary-id");
    lineage.markExplicitNavigation("conversation:existing-id");

    expect(
      lineage.decide({
        currentScope: "conversation:WEB:temporary-id",
        hasQueuedItems: true,
        nextScope: "conversation:existing-id",
        unfinishedTurn: true,
      }),
    ).toEqual({ continueAutomatically: false, migrate: false });
  });

  it("retains navigation intent while an earlier promotion finishes", () => {
    const lineage = createLineage();
    lineage.start("page:/");
    const provisional = lineage.decide({
      currentScope: "page:/",
      hasQueuedItems: false,
      nextScope: "conversation:WEB:temporary-id",
      unfinishedTurn: true,
    });

    lineage.markExplicitNavigation("conversation:existing-id");
    lineage.complete("page:/", "conversation:WEB:temporary-id", provisional);

    expect(
      lineage.decide({
        currentScope: "conversation:WEB:temporary-id",
        hasQueuedItems: true,
        nextScope: "conversation:existing-id",
        unfinishedTurn: true,
      }),
    ).toEqual({ continueAutomatically: false, migrate: false });
  });

  it("recovers a provisional lineage from an unfinished turn", () => {
    const lineage = createLineage();
    lineage.observeUnfinishedTurn("conversation:WEB:temporary-id");

    expect(
      lineage.decide({
        currentScope: "conversation:WEB:temporary-id",
        hasQueuedItems: true,
        nextScope: "conversation:canonical-id",
        unfinishedTurn: true,
      }),
    ).toEqual({ continueAutomatically: true, migrate: true });
  });

  it("preserves an uncertain promoted queue without continuing it", () => {
    const lineage = createLineage();

    expect(
      lineage.decide({
        currentScope: "conversation:WEB:temporary-id",
        hasQueuedItems: true,
        nextScope: "conversation:canonical-id",
        unfinishedTurn: false,
      }),
    ).toEqual({ continueAutomatically: false, migrate: true });
  });

  it("keeps established conversation navigation separate", () => {
    const lineage = createLineage();

    expect(
      lineage.decide({
        currentScope: "conversation:first-id",
        hasQueuedItems: true,
        nextScope: "conversation:second-id",
        unfinishedTurn: true,
      }),
    ).toEqual({ continueAutomatically: false, migrate: false });
  });
});
