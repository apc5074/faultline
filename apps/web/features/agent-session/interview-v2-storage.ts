"use client";

import { validateArchitecture, type Architecture, type InterviewScenarioCalibration } from "@faultline/core";
import type { InterviewV2Event, InterviewV2StartEvent, InterviewV2State } from "@faultline/agent-capabilities";

const STORAGE_VERSION = 4 as const;
const MAX_EVENTS = 240;
const MAX_BYTES = 500_000;
const PREFIX = "faultline:design-interview:v4:";

export type BrowserInterviewV2Record = {
  readonly version: typeof STORAGE_VERSION;
  readonly revision: number;
  readonly state: InterviewV2State;
  readonly baselineArchitecture: Architecture;
  readonly events: readonly { readonly eventId: string; readonly event: InterviewV2StartEvent | InterviewV2Event }[];
  readonly updatedAt: string;
};

export class BrowserInterviewV2StorageError extends Error {
  override name = "BrowserInterviewV2StorageError";
  readonly code: "unavailable" | "malformed" | "conflict" | "too_large";
  constructor(code: "unavailable" | "malformed" | "conflict" | "too_large", message: string) { super(message); this.code = code; }
}

function store(): Storage {
  if (typeof window === "undefined" || !window.localStorage) throw new BrowserInterviewV2StorageError("unavailable", "Interview v2 storage is unavailable.");
  return window.localStorage;
}
function key(ownerKey: string): string {
  if (!ownerKey.trim() || ownerKey.length > 160) throw new BrowserInterviewV2StorageError("malformed", "Interview owner key is invalid.");
  return PREFIX + encodeURIComponent(ownerKey.trim());
}
function recordShape(value: unknown): value is BrowserInterviewV2Record {
  const candidate = value as Record<string, unknown>;
  return typeof value === "object" && value !== null && candidate.version === STORAGE_VERSION && typeof candidate.revision === "number" && Number.isSafeInteger(candidate.revision) && candidate.revision >= 0 && typeof candidate.state === "object" && validateArchitecture(candidate.baselineArchitecture).success && Array.isArray(candidate.events) && candidate.events.length <= MAX_EVENTS && typeof candidate.updatedAt === "string";
}
function encode(record: BrowserInterviewV2Record): string {
  const raw = JSON.stringify(record);
  if (raw.length > MAX_BYTES) throw new BrowserInterviewV2StorageError("too_large", "Interview v2 history is too large.");
  return raw;
}
function loadRecord(storage: Storage, storageKey: string): BrowserInterviewV2Record | null {
  const raw = storage.getItem(storageKey);
  if (raw === null) return null;
  if (raw.length > MAX_BYTES) throw new BrowserInterviewV2StorageError("too_large", "Stored interview v2 history is too large.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new BrowserInterviewV2StorageError("malformed", "Stored interview v2 history is not valid JSON."); }
  if (!recordShape(parsed)) throw new BrowserInterviewV2StorageError("malformed", "Stored interview is not v4; restart the v2 interview.");
  return parsed;
}

/** v4 repository deliberately does not coerce the legacy v2/v3 record shape. */
export function createBrowserInterviewV2Repository(ownerKey: string) {
  const storageKey = key(ownerKey);
  return {
    load: () => loadRecord(store(), storageKey),
    saveStarted(state: InterviewV2State, event: InterviewV2StartEvent, baselineArchitecture: Architecture): BrowserInterviewV2Record {
      if (event.type !== "start" || event.interviewId !== state.interviewId) throw new BrowserInterviewV2StorageError("malformed", "The v2 start event does not match state.");
      const record: BrowserInterviewV2Record = { version: STORAGE_VERSION, revision: 0, state, baselineArchitecture, events: [{ eventId: event.interviewId, event }], updatedAt: event.startedAt };
      store().setItem(storageKey, encode(record)); return record;
    },
    commit(input: { readonly expectedRevision: number; readonly eventId: string; readonly event: InterviewV2Event; readonly state: InterviewV2State }): BrowserInterviewV2Record {
      const current = loadRecord(store(), storageKey);
      if (!current) throw new BrowserInterviewV2StorageError("malformed", "No active v2 interview exists.");
      if (current.events.some((entry) => entry.eventId === input.eventId)) return current;
      if (current.revision !== input.expectedRevision) throw new BrowserInterviewV2StorageError("conflict", "Interview v2 revision changed; reload before committing.");
      if (current.events.length >= MAX_EVENTS) throw new BrowserInterviewV2StorageError("too_large", "Interview v2 event history is full.");
      const next: BrowserInterviewV2Record = { ...current, revision: current.revision + 1, state: input.state, events: [...current.events, { eventId: input.eventId, event: input.event }], updatedAt: new Date().toISOString() };
      store().setItem(storageKey, encode(next)); return next;
    },
    clear: () => { store().removeItem(storageKey); },
  };
}
