export interface QueueScopeLineageOptions {
  readonly isPromotion: (currentScope: string, nextScope: string) => boolean;
  readonly isProvisional: (scope: string) => boolean;
}

export interface QueueScopeTransition {
  readonly continueAutomatically: boolean;
  readonly migrate: boolean;
}

export interface QueueScopeTransitionContext {
  readonly currentScope: string;
  readonly hasQueuedItems: boolean;
  readonly nextScope: string;
  readonly unfinishedTurn: boolean;
}

const ANY_SCOPE = "*";

export class QueueScopeLineage {
  private readonly scopes = new Set<string>();
  private explicitNavigationTarget: string | null = null;

  constructor(private readonly options: QueueScopeLineageOptions) {}

  start(scope: string): void {
    if (this.options.isProvisional(scope)) {
      this.scopes.clear();
      this.scopes.add(scope);
      this.explicitNavigationTarget = null;
    }
  }

  observeUnfinishedTurn(scope: string): void {
    if (this.scopes.size === 0 && this.options.isProvisional(scope)) {
      this.scopes.add(scope);
    }
  }

  markExplicitNavigation(targetScope?: string): void {
    this.explicitNavigationTarget = targetScope ?? ANY_SCOPE;
  }

  decide({
    currentScope,
    hasQueuedItems,
    nextScope,
    unfinishedTurn,
  }: QueueScopeTransitionContext): QueueScopeTransition {
    const promotion = this.options.isPromotion(currentScope, nextScope);
    const explicitlyNavigated =
      this.explicitNavigationTarget === ANY_SCOPE ||
      this.explicitNavigationTarget === nextScope;
    const confirmed =
      promotion &&
      !explicitlyNavigated &&
      (this.scopes.has(currentScope) ||
        (this.options.isProvisional(currentScope) && unfinishedTurn));

    return {
      continueAutomatically: confirmed,
      // If the page changes a provisional identity without enough evidence,
      // retaining a paused queue is safer than destroying user input.
      migrate:
        confirmed || (promotion && !explicitlyNavigated && hasQueuedItems),
    };
  }

  complete(
    currentScope: string,
    nextScope: string,
    transition: QueueScopeTransition,
  ): void {
    const completesExplicitNavigation =
      this.explicitNavigationTarget === nextScope ||
      (this.explicitNavigationTarget === ANY_SCOPE && !transition.migrate);

    if (completesExplicitNavigation) {
      this.explicitNavigationTarget = null;
    }

    if (transition.migrate && this.options.isProvisional(nextScope)) {
      this.scopes.add(currentScope);
      this.scopes.add(nextScope);
      return;
    }

    this.scopes.clear();
  }
}
