import {
  detectGenerationState,
  type GenerationState,
} from "./generation-state";

type ObservableRoot = ParentNode & Node;

interface MutationObserverHandle {
  observe(target: Node, options?: MutationObserverInit): void;
  disconnect(): void;
}

type MutationObserverFactory = (
  callback: MutationCallback,
) => MutationObserverHandle | undefined;

export type GenerationStateCallback = (state: GenerationState) => void;

export interface ChatGptAdapterOptions {
  readonly root?: ObservableRoot | null;
  readonly createMutationObserver?: MutationObserverFactory;
}

const OBSERVER_OPTIONS: MutationObserverInit = {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: [
    "disabled",
    "aria-disabled",
    "aria-hidden",
    "hidden",
    "style",
    "class",
  ],
};

function getDefaultRoot(): ObservableRoot | null {
  return typeof document === "undefined" ? null : document;
}

function createDefaultMutationObserver(
  callback: MutationCallback,
): MutationObserverHandle | undefined {
  return typeof MutationObserver === "undefined"
    ? undefined
    : new MutationObserver(callback);
}

export class ChatGptAdapter {
  private readonly root: ObservableRoot | null;
  private readonly createMutationObserver: MutationObserverFactory;

  constructor(options: ChatGptAdapterOptions = {}) {
    this.root = options.root === undefined ? getDefaultRoot() : options.root;
    this.createMutationObserver =
      options.createMutationObserver ?? createDefaultMutationObserver;
  }

  getState(): GenerationState {
    return detectGenerationState(this.root);
  }

  isGenerating(): boolean {
    return this.getState() === "generating";
  }

  observeState(callback: GenerationStateCallback): () => void {
    let previousState = this.getState();
    callback(previousState);

    if (!this.root) {
      return () => undefined;
    }

    let observer: MutationObserverHandle | undefined;

    try {
      observer = this.createMutationObserver(() => {
        const state = this.getState();

        if (state !== previousState) {
          previousState = state;
          callback(state);
        }
      });

      observer?.observe(this.root, OBSERVER_OPTIONS);
    } catch {
      observer?.disconnect();
      return () => undefined;
    }

    if (!observer) {
      return () => undefined;
    }

    let observing = true;

    return () => {
      if (observing) {
        observing = false;
        observer.disconnect();
      }
    };
  }
}
