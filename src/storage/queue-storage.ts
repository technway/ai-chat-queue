import { storage } from "wxt/utils/storage";
import type { QueueItem, QueueState } from "../queue/queue.types";

const QUEUE_SCHEMA_VERSION = 2;
const STORAGE_READ_TIMEOUT_MS = 2_000;

export interface QueueSettings {
  readonly autoSend: boolean;
  readonly paused: boolean;
}

export interface QueuePreferences {
  readonly collapsed: boolean;
}

export interface QueueStorageSnapshot {
  readonly items: readonly QueueItem[];
  readonly settings: QueueSettings;
  readonly preferences: QueuePreferences;
}

interface PersistedQueueState {
  readonly schemaVersion: typeof QUEUE_SCHEMA_VERSION;
  readonly items: readonly QueueItem[];
  readonly settings: QueueSettings;
  readonly preferences: QueuePreferences;
}

export interface QueueStorageItem {
  getValue(): Promise<unknown>;
  setValue(value: unknown): Promise<void>;
}

interface RemovableQueueStorageItem extends QueueStorageItem {
  removeValue(): Promise<void>;
}

export interface QueueScopeContext {
  readonly loggedOut?: boolean;
  readonly temporary?: boolean;
}

function createDefaultSnapshot(): QueueStorageSnapshot {
  return {
    items: [],
    settings: { autoSend: true, paused: false },
    preferences: { collapsed: false },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseItem(value: unknown, ids: Set<string>): QueueItem | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const { id, content, createdAt, status } = value;

  if (
    typeof id !== "string" ||
    id.length === 0 ||
    ids.has(id) ||
    typeof content !== "string" ||
    content.trim().length === 0 ||
    typeof createdAt !== "number" ||
    !Number.isFinite(createdAt) ||
    createdAt < 0 ||
    (status !== "pending" &&
      status !== "sending" &&
      status !== "sent" &&
      status !== "failed")
  ) {
    return undefined;
  }

  if (status === "sent") {
    return undefined;
  }

  ids.add(id);

  return {
    id,
    content,
    createdAt,
    // A reload interrupts the previous send attempt, so it is safe to retry.
    status: status === "sending" ? "pending" : status,
  };
}

function parseSnapshot(value: unknown): QueueStorageSnapshot {
  if (
    !isRecord(value) ||
    (value.schemaVersion !== 1 && value.schemaVersion !== QUEUE_SCHEMA_VERSION)
  ) {
    return createDefaultSnapshot();
  }

  const ids = new Set<string>();
  const items = Array.isArray(value.items)
    ? value.items
        .map((item) => parseItem(item, ids))
        .filter((item): item is QueueItem => item !== undefined)
    : [];
  const settings = isRecord(value.settings) ? value.settings : {};
  const preferences = isRecord(value.preferences) ? value.preferences : {};

  return {
    items,
    settings: {
      autoSend:
        typeof settings.autoSend === "boolean" ? settings.autoSend : true,
      paused: typeof settings.paused === "boolean" ? settings.paused : false,
    },
    preferences: {
      collapsed:
        typeof preferences.collapsed === "boolean"
          ? preferences.collapsed
          : false,
    },
  };
}

function toPersistedState(
  state: QueueState,
  settings: QueueSettings,
  preferences: QueuePreferences,
): PersistedQueueState {
  return {
    schemaVersion: QUEUE_SCHEMA_VERSION,
    // Sent messages are conversation history and do not belong in storage.
    items: state.items.filter((item) => item.status !== "sent"),
    settings,
    preferences,
  };
}

function hasTemporaryChatFlag(url: URL): boolean {
  const names = ["temporary-chat", "temporary_chat", "temporary"];

  return names.some((name) => {
    if (!url.searchParams.has(name)) {
      return false;
    }

    const value = url.searchParams.get(name)?.toLowerCase();
    return value !== "false" && value !== "0";
  });
}

export function getConversationScope(
  url: URL,
  context: QueueScopeContext = {},
): string {
  const findConversation = (
    value: string,
  ): { id: string; route: "c" | "uc" } | undefined => {
    const segments = value.split("/").filter(Boolean);

    for (let index = segments.length - 2; index >= 0; index -= 1) {
      const route = segments[index];
      const id = segments[index + 1];

      if ((route === "c" || route === "uc") && id) {
        return {
          id,
          route,
        };
      }
    }

    return undefined;
  };
  const pathConversation = findConversation(url.pathname);
  const hashValue = url.hash.slice(1);
  const hashConversation = findConversation(hashValue);
  const hashParams = new URLSearchParams(hashValue.replace(/^\?/, ""));
  const queryId =
    url.searchParams.get("conversationId") ??
    url.searchParams.get("conversation_id") ??
    hashParams.get("conversationId") ??
    hashParams.get("conversation_id");
  const conversation =
    pathConversation ??
    hashConversation ??
    (queryId ? { id: queryId, route: "c" as const } : undefined);
  const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
  const scopeId = conversation?.id ?? normalizedPath;
  const temporary =
    context.temporary === true ||
    hasTemporaryChatFlag(url) ||
    url.pathname.includes("/temporary-chat");

  if (temporary) {
    return `temporary:${scopeId}`;
  }

  if (context.loggedOut === true || conversation?.route === "uc") {
    return `unauthenticated:${scopeId}`;
  }

  if (conversation) {
    return `conversation:${conversation.id}`;
  }

  return `page:${normalizedPath}`;
}

export function isPersistentQueueScope(scope: string): boolean {
  // Only server backed chats have a stable identity across page reloads.
  return scope.startsWith("conversation:");
}

export function getQueueStorageKey(scope: string): `local:${string}` {
  return `local:message-queue:${encodeURIComponent(scope)}`;
}

function createWxtStorageItem(scope: string): RemovableQueueStorageItem {
  const fallback: PersistedQueueState = {
    schemaVersion: QUEUE_SCHEMA_VERSION,
    ...createDefaultSnapshot(),
  };

  return storage.defineItem<unknown>(getQueueStorageKey(scope), {
    fallback,
    version: QUEUE_SCHEMA_VERSION,
    migrations: {
      1: (oldValue) => ({
        schemaVersion: QUEUE_SCHEMA_VERSION,
        ...parseSnapshot(oldValue),
      }),
      2: (oldValue) => ({
        schemaVersion: QUEUE_SCHEMA_VERSION,
        ...parseSnapshot(oldValue),
      }),
    },
  });
}

function getEphemeralStorageScopes(scope: string): string[] {
  const scopes = [scope];
  const separatorIndex = scope.indexOf(":");
  const kind = scope.slice(0, separatorIndex);
  const id = scope.slice(separatorIndex + 1);

  // Older versions stored temporary and unauthenticated chat IDs as durable chats.
  if ((kind === "temporary" || kind === "unauthenticated") && id !== "/") {
    scopes.push(`conversation:${id}`);
  }

  return scopes;
}

function createEphemeralStorageItem(scope: string): QueueStorageItem {
  return {
    async getValue() {
      for (const staleScope of getEphemeralStorageScopes(scope)) {
        try {
          await createWxtStorageItem(staleScope).removeValue();
        } catch (error) {
          console.error("[message-queue] queue storage removal failed", {
            error,
            scope: staleScope,
          });
        }
      }

      return {
        schemaVersion: QUEUE_SCHEMA_VERSION,
        ...createDefaultSnapshot(),
      };
    },
    async setValue() {},
  };
}

export function createConversationQueueStorage(url: URL): QueueStorage {
  return createQueueStorageForScope(getConversationScope(url));
}

export function createQueueStorageForScope(scope: string): QueueStorage {
  const item = isPersistentQueueScope(scope)
    ? createWxtStorageItem(scope)
    : createEphemeralStorageItem(scope);

  return new QueueStorage(item);
}

export class QueueStorage {
  private writes = Promise.resolve();

  constructor(
    private readonly item: QueueStorageItem = createWxtStorageItem(
      "page:unknown",
    ),
    private readonly readTimeoutMs = STORAGE_READ_TIMEOUT_MS,
  ) {}

  async load(): Promise<QueueStorageSnapshot> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const value = await Promise.race([
        this.item.getValue(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Queue storage read timed out")),
            this.readTimeoutMs,
          );
        }),
      ]);

      return parseSnapshot(value);
    } catch (error) {
      console.error("[message-queue] queue storage read failed", { error });
      return createDefaultSnapshot();
    } finally {
      clearTimeout(timeout);
    }
  }

  save(
    state: QueueState,
    settings: QueueSettings,
    preferences: QueuePreferences,
  ): void {
    const value = toPersistedState(state, settings, preferences);

    // Serialize writes so quick queue status changes cannot finish out of order.
    this.writes = this.writes.then(async () => {
      try {
        await this.item.setValue(value);
      } catch (error) {
        console.error("[message-queue] queue storage write failed", { error });
      }
    });
  }

  async flush(): Promise<void> {
    await this.writes;
  }
}
