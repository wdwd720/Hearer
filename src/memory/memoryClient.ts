// MemoryClient — unified interface for the frontend.
//
// Two backends:
//   - ApiMemoryClient: backed by the local Hearer Memory API server.
//   - LocalMemoryClient: pure localStorage fallback when the API is offline.
//
// The App polls the API health on boot and again when "Reconnect" is pressed,
// then routes all memory ops through whichever client is active.

import type {
  Commitment,
  CueFeedback,
  CueRecord,
  ImportantItem,
  KnownPerson,
  LocationMemory,
  MemorySummary,
  Routine,
} from "../../shared/types";

export type MemoryStatus = "api" | "local" | "offline";

export interface MemoryClient {
  status: MemoryStatus;
  refresh(): Promise<MemorySummary>;
  current(): MemorySummary;
  addRoutine(r: {
    name: string;
    triggerType: Routine["triggerType"];
    triggerDescription: string;
    actionType: Routine["actionType"];
    actionLabel: string;
    enabled?: boolean;
  }): Promise<Routine>;
  addCommitment(c: {
    person?: string;
    task: string;
    deadlineText?: string;
    actionType?: Commitment["actionType"];
    source?: Commitment["source"];
  }): Promise<Commitment>;
  addItem(i: { label: string; contexts?: ImportantItem["contexts"]; priority?: ImportantItem["priority"] }): Promise<ImportantItem>;
  addPerson(p: { name: string; aliases?: string[]; importance?: KnownPerson["importance"]; relationship?: string }): Promise<KnownPerson>;
  addLocation(l: { label: string; type: LocationMemory["type"]; cuesOnArrival?: string[]; cuesOnExit?: string[]; relevantSounds?: string[] }): Promise<LocationMemory>;
  recordCue(c: { cueText: string; priority: CueRecord["priority"]; actionType: CueRecord["actionType"]; sourceEventId?: string }): Promise<CueRecord>;
  recordAudioDetection(input: {
    label: string;
    confidence: number;
    source: string;
    contextSnapshot?: unknown;
    routedCueId?: string;
  }): Promise<unknown>;
  setCueFeedback(cueId: string, feedback: CueFeedback): Promise<CueRecord | null>;
  extract(text: string): Promise<{ extracted: unknown[]; summary: MemorySummary; notes?: string[] }>;
  reset(): Promise<void>;
}
