"use client";

import type { InterviewEvent, InterviewState } from "@faultline/agent-capabilities";

const STORAGE_VERSION = 1;
const MAX_EVENTS = 200;
const MAX_RECORD_BYTES = 500_000;
const STORAGE_PREFIX = "faultline:design-interview:v1:";

export type BrowserInterviewRecord = {
  readonly version: typeof STORAGE_VERSION;
  readonly revision: number;
  readonly state: InterviewState;
  readonly events: readonly BrowserInterviewEventRecord[];
  readonly updatedAt: string;
};

export type BrowserInterviewEventRecord = {
  readonly eventId: string;
  readonly event: InterviewEvent;
};

export type CommitBrowserInterviewInput = {
  readonly expectedRevision: number;
  readonly eventId: string;
  readonly event: InterviewEvent;
  readonly state: InterviewState;
};

export class BrowserInterviewStorageError extends Error {
  override name = "BrowserInterviewStorageError";
  readonly code: "unavailable" | "malformed" | "conflict" | "too_large";
  constructor(
    message: string,
    code: "unavailable" | "malformed" | "conflict" | "too_large",
  ) {
    super(message);
    this.code = code;
  }
}

function storage(): Storage {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new BrowserInterviewStorageError("Browser interview storage is unavailable.", "unavailable");
  }
  return window.localStorage;
}

function storageKey(ownerKey: string): string {
  const normalized = ownerKey.trim();
  if (normalized.length === 0 || normalized.length > 160) {
    throw new BrowserInterviewStorageError("Interview owner key is invalid.", "malformed");
  }
  return STORAGE_PREFIX + encodeURIComponent(normalized);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoredRecord(value: unknown): value is BrowserInterviewRecord {
  return isRecord(value)
    && value.version === STORAGE_VERSION
    && typeof value.revision === "number"
    && Number.isSafeInteger(value.revision)
    && value.revision >= 0
    && isRecord(value.state)
    && Array.isArray(value.events)
    && value.events.length <= MAX_EVENTS
    && typeof value.updatedAt === "string";
}

function encode(record: BrowserInterviewRecord): string {
  const serialized = JSON.stringify(record);
  if (serialized.length > MAX_RECORD_BYTES) {
    throw new BrowserInterviewStorageError("Interview history is too large for browser storage.", "too_large");
  }
  return serialized;
}

function readRecord(store: Storage, key: string): BrowserInterviewRecord | null {
  const raw = store.getItem(key);
  if (raw === null) return null;
  if (raw.length > MAX_RECORD_BYTES) {
    throw new BrowserInterviewStorageError("Stored interview history is too large.", "too_large");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BrowserInterviewStorageError("Stored interview history is not valid JSON.", "malformed");
  }
  if (!isStoredRecord(parsed)) {
    throw new BrowserInterviewStorageError("Stored interview history has an invalid shape.", "malformed");
  }
  return parsed;
}

/** Browser-only repository for the current product's same-profile interview resume. */
export function createBrowserInterviewRepository(ownerKey: string) {
  const key = storageKey(ownerKey);

  return {
    load(): BrowserInterviewRecord | null {
      return readRecord(storage(), key);
    },

    saveStarted(state: InterviewState, event: InterviewEvent): BrowserInterviewRecord {
      if (event.type !== "start" || event.interviewId !== state.interviewId) {
        throw new BrowserInterviewStorageError("A start event must match the interview state.", "malformed");
      }
      const record: BrowserInterviewRecord = {
        version: STORAGE_VERSION,
        revision: 0,
        state,
        events: [{ eventId: event.interviewId, event }],
        updatedAt: event.startedAt,
      };
      storage().setItem(key, encode(record));
      return record;
    },

    commit(input: CommitBrowserInterviewInput): BrowserInterviewRecord {
      const store = storage();
      const current = readRecord(store, key);
      if (!current) throw new BrowserInterviewStorageError("Interview has not been started.", "malformed");
      if (current.state.interviewId !== input.state.interviewId) {
        throw new BrowserInterviewStorageError("Interview identity does not match stored state.", "malformed");
      }
      const duplicate = current.events.find((entry) => entry.eventId === input.eventId);
      if (duplicate) return current;
      if (current.revision !== input.expectedRevision) {
        throw new BrowserInterviewStorageError("Interview revision changed; reload before committing.", "conflict");
      }
      if (current.events.length >= MAX_EVENTS) {
        throw new BrowserInterviewStorageError("Interview event history is full.", "too_large");
      }
      const next: BrowserInterviewRecord = {
        version: STORAGE_VERSION,
        revision: current.revision + 1,
        state: input.state,
        events: [...current.events, { eventId: input.eventId, event: input.event }],
        updatedAt: new Date().toISOString(),
      };
      store.setItem(key, encode(next));
      return next;
    },

    clear(): void {
      storage().removeItem(key);
    },
  };
}

/** Stable same-browser owner key for anonymous interview state. */
export function getBrowserInterviewOwnerKey(): string {
  const store = storage();
  const key = STORAGE_PREFIX + "owner";
  const existing = store.getItem(key);
  if (existing && existing.length <= 160) return existing;
  const generated = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  store.setItem(key, generated);
  return generated;
}
