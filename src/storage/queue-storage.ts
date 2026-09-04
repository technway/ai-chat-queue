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

export function getQueueStorageKey(
  providerId: string,
  scope: string,
): `local:${string}` {
  return `local:message-queue:${encodeURIComponent(`${providerId}:${scope}`)}`;
}

function createWxtStorageItem(scope: string): RemovableQueueStorageItem {
  const fallback: PersistedQueueState = {
    schemaVersion: QUEUE_SCHEMA_VERSION,
    ...createDefaultSnapshot(),
  };

  return storage.defineItem<unknown>(
    `local:message-queue:${encodeURIComponent(scope)}`,
    {
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
    },
  );
}

function createProviderStorageItem(
  providerId: string,
  scope: string,
): RemovableQueueStorageItem {
  const item = storage.defineItem<unknown>(
    getQueueStorageKey(providerId, scope),
    {
      // null lets us distinguish an empty new namespace from the legacy key.
      fallback: null,
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
    },
  );
  // Only ChatGPT has data from the pre-provider storage format. Other
  // providers must never fall back to another provider's legacy namespace.
  const legacyItem =
    providerId === "chatgpt" ? createWxtStorageItem(scope) : undefined;

  return {
    async getValue() {
      const value = await item.getValue();
      return value === null && legacyItem ? legacyItem.getValue() : value;
    },
    setValue: (value) => item.setValue(value),
    async removeValue() {
      await item.removeValue();
      if (legacyItem) {
        await legacyItem.removeValue();
      }
    },
  };
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

function createEphemeralStorageItem(
  providerId: string,
  scope: string,
): QueueStorageItem {
  return {
    async getValue() {
      for (const staleScope of getEphemeralStorageScopes(scope)) {
        try {
          await createProviderStorageItem(providerId, staleScope).removeValue();
        } catch (error) {
          console.error("[ai-chat-queue] queue storage removal failed", {
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

export function createQueueStorageForScope(
  providerId: string,
  scope: string,
  persistent = true,
): QueueStorage {
  const item = persistent
    ? createProviderStorageItem(providerId, scope)
    : createEphemeralStorageItem(providerId, scope);

  return new QueueStorage(item);
}

export class QueueStorage {
  private writes = Promise.resolve();

  constructor(
    private readonly item: QueueStorageItem = createProviderStorageItem(
      "chatgpt",
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
      console.error("[ai-chat-queue] queue storage read failed", { error });
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
        console.error("[ai-chat-queue] queue storage write failed", { error });
      }
    });
  }

  async flush(): Promise<void> {
    await this.writes;
  }
}
