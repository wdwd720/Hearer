// Frontend client for the Hearer Memory API.
//
// This client is intentionally tolerant: if the API is unreachable, callers
// fall back to the local-only memory store. The default base URL is
// http://localhost:8788 and can be overridden via VITE_HEARER_API_URL.

import type {
  ApiHealth,
  AudioDetectionRecord,
  Commitment,
  CueFeedback,
  CueRecord,
  ExtractResponse,
  ImportantItem,
  KnownPerson,
  LocationMemory,
  MemorySummary,
  Routine,
} from "../../shared/types";

export interface HearerApiClient {
  baseUrl: string;
  health(): Promise<ApiHealth>;
  summary(): Promise<MemorySummary>;
  addPerson(input: Partial<KnownPerson> & { name: string }): Promise<KnownPerson>;
  addItem(input: Partial<ImportantItem> & { label: string }): Promise<ImportantItem>;
  addLocation(
    input: Partial<LocationMemory> & { label: string; type: LocationMemory["type"] }
  ): Promise<LocationMemory>;
  addRoutine(input: {
    name: string;
    triggerType: Routine["triggerType"];
    triggerDescription: string;
    actionType: Routine["actionType"];
    actionLabel: string;
    enabled?: boolean;
    confidence?: number;
  }): Promise<Routine>;
  addCommitment(input: {
    person?: string;
    task: string;
    deadlineText?: string;
    actionType?: Commitment["actionType"];
    source?: Commitment["source"];
  }): Promise<Commitment>;
  insertEvent(source: string, payload: unknown): Promise<unknown>;
  insertAudioDetection(
    input: Omit<AudioDetectionRecord, "id" | "createdAt">
  ): Promise<AudioDetectionRecord>;
  insertCue(input: Omit<CueRecord, "id" | "createdAt">): Promise<CueRecord>;
  setCueFeedback(cueId: string, feedback: CueFeedback): Promise<CueRecord>;
  extract(
    text: string,
    source?: "typed" | "speech" | "manual"
  ): Promise<ExtractResponse & { persisted?: unknown; summary?: MemorySummary }>;
  reset(): Promise<{ ok: boolean }>;
}

export interface CreateApiClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

const DEFAULT_BASE = (() => {
  if (typeof window !== "undefined") {
    const env = (import.meta as unknown as { env?: { VITE_HEARER_API_URL?: string } }).env;
    if (env?.VITE_HEARER_API_URL) return env.VITE_HEARER_API_URL;
    // If we're served from a dev URL, assume the API is on the same host at 8788.
    const { hostname, protocol } = window.location;
    if (hostname && hostname !== "") {
      return `${protocol}//${hostname}:8788`;
    }
  }
  return "http://localhost:8788";
})();

async function request<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = init.timeoutMs ?? 4000;
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export function createHearerApiClient(
  opts: CreateApiClientOptions = {}
): HearerApiClient {
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");

  return {
    baseUrl,

    health: () => request<ApiHealth>(`${baseUrl}/api/health`, { timeoutMs: 1500 }),
    summary: () => request<MemorySummary>(`${baseUrl}/api/memory/summary`),

    addPerson: (input) =>
      request<KnownPerson>(`${baseUrl}/api/memory/person`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    addItem: (input) =>
      request<ImportantItem>(`${baseUrl}/api/memory/item`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    addLocation: (input) =>
      request<LocationMemory>(`${baseUrl}/api/memory/location`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    addRoutine: (input) =>
      request<Routine>(`${baseUrl}/api/routines`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    addCommitment: (input) =>
      request<Commitment>(`${baseUrl}/api/commitments`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    insertEvent: (source, payload) =>
      request(`${baseUrl}/api/events`, {
        method: "POST",
        body: JSON.stringify({ source, payload }),
      }),
    insertAudioDetection: (input) =>
      request<AudioDetectionRecord>(`${baseUrl}/api/audio-detections`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    insertCue: (input) =>
      request<CueRecord>(`${baseUrl}/api/cues`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    setCueFeedback: (cueId, feedback) =>
      request<CueRecord>(`${baseUrl}/api/cue-feedback`, {
        method: "POST",
        body: JSON.stringify({ cueId, feedback }),
      }),
    extract: (text, source = "typed") =>
      request(`${baseUrl}/api/memory/extract`, {
        method: "POST",
        body: JSON.stringify({ text, source }),
      }),
    reset: () =>
      request<{ ok: boolean }>(`${baseUrl}/api/memory/reset`, {
        method: "POST",
        body: "{}",
      }),
  };
}
