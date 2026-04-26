// LocalMemoryClient — pure localStorage fallback for when the API is offline.
// Mirrors the API shape so MemoryClient consumers don't care which is active.

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
import { extractMemoryRules } from "../../shared/memoryExtractorCore";
import type { MemoryClient } from "./memoryClient";

const STORAGE_KEY = "hearer.memory.v2";

const EMPTY_SUMMARY = (): MemorySummary => ({
  userProfile: {
    id: "default",
    displayName: "Mihir",
    alertStyle: "minimal",
    interruptionMode: "normal",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  knownPeople: [],
  importantItems: [],
  routines: [],
  commitments: [],
  locations: [],
  recentCues: [],
});

function readStorage(): MemorySummary {
  if (typeof window === "undefined") return EMPTY_SUMMARY();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_SUMMARY();
    return { ...EMPTY_SUMMARY(), ...JSON.parse(raw) };
  } catch {
    return EMPTY_SUMMARY();
  }
}

function writeStorage(s: MemorySummary): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class LocalMemoryClient implements MemoryClient {
  status: "local" = "local";
  private state: MemorySummary;

  constructor() {
    this.state = readStorage();
  }

  current(): MemorySummary {
    return this.state;
  }

  async refresh(): Promise<MemorySummary> {
    this.state = readStorage();
    return this.state;
  }

  private save(): void {
    writeStorage(this.state);
  }

  async addRoutine(r: Parameters<MemoryClient["addRoutine"]>[0]): Promise<Routine> {
    const now = new Date().toISOString();
    const created: Routine = {
      id: uid("rout"),
      name: r.name,
      triggerType: r.triggerType,
      triggerDescription: r.triggerDescription,
      actionType: r.actionType,
      actionLabel: r.actionLabel,
      enabled: r.enabled ?? true,
      confidence: 0.85,
      source: "typed",
      createdAt: now,
      updatedAt: now,
    };
    this.state = { ...this.state, routines: [...this.state.routines, created] };
    this.save();
    return created;
  }

  async addCommitment(c: Parameters<MemoryClient["addCommitment"]>[0]): Promise<Commitment> {
    const now = new Date().toISOString();
    const existing = this.state.commitments.find(
      (x) =>
        x.status !== "done" &&
        x.task.trim().toLowerCase() === c.task.trim().toLowerCase() &&
        (x.person ?? "") === (c.person ?? "")
    );
    if (existing) {
      const updated: Commitment = {
        ...existing,
        deadlineText: c.deadlineText ?? existing.deadlineText,
        actionType: c.actionType ?? existing.actionType,
        updatedAt: now,
      };
      this.state = {
        ...this.state,
        commitments: this.state.commitments.map((x) =>
          x.id === existing.id ? updated : x
        ),
      };
      this.save();
      return updated;
    }
    const created: Commitment = {
      id: uid("commit"),
      person: c.person,
      task: c.task,
      deadlineText: c.deadlineText,
      actionType: c.actionType ?? "digital",
      status: "pending",
      source: c.source ?? "manual",
      createdAt: now,
      updatedAt: now,
    };
    this.state = { ...this.state, commitments: [...this.state.commitments, created] };
    this.save();
    return created;
  }

  async addItem(i: Parameters<MemoryClient["addItem"]>[0]): Promise<ImportantItem> {
    const created: ImportantItem = {
      id: uid("item"),
      label: i.label,
      contexts: i.contexts ?? ["custom"],
      priority: i.priority ?? "high",
      createdAt: new Date().toISOString(),
    };
    this.state = { ...this.state, importantItems: [...this.state.importantItems, created] };
    this.save();
    return created;
  }

  async addPerson(p: Parameters<MemoryClient["addPerson"]>[0]): Promise<KnownPerson> {
    const created: KnownPerson = {
      id: uid("person"),
      name: p.name,
      aliases: p.aliases ?? [],
      importance: p.importance ?? "normal",
      relationship: p.relationship,
      createdAt: new Date().toISOString(),
    };
    this.state = { ...this.state, knownPeople: [...this.state.knownPeople, created] };
    this.save();
    return created;
  }

  async addLocation(l: Parameters<MemoryClient["addLocation"]>[0]): Promise<LocationMemory> {
    const created: LocationMemory = {
      id: uid("loc"),
      label: l.label,
      type: l.type,
      cuesOnArrival: l.cuesOnArrival ?? [],
      cuesOnExit: l.cuesOnExit ?? [],
      relevantSounds: l.relevantSounds ?? [],
      createdAt: new Date().toISOString(),
    };
    this.state = { ...this.state, locations: [...this.state.locations, created] };
    this.save();
    return created;
  }

  async recordCue(c: Parameters<MemoryClient["recordCue"]>[0]): Promise<CueRecord> {
    const created: CueRecord = {
      id: uid("cue"),
      cueText: c.cueText,
      priority: c.priority,
      actionType: c.actionType,
      sourceEventId: c.sourceEventId,
      wasShown: true,
      createdAt: new Date().toISOString(),
    };
    this.state = {
      ...this.state,
      recentCues: [created, ...this.state.recentCues].slice(0, 10),
    };
    this.save();
    return created;
  }

  async recordAudioDetection(): Promise<unknown> {
    // Local fallback doesn't persist audio detections by default — keep it lightweight.
    return null;
  }

  async setCueFeedback(cueId: string, feedback: CueFeedback): Promise<CueRecord | null> {
    const idx = this.state.recentCues.findIndex((c) => c.id === cueId);
    if (idx < 0) return null;
    const updated: CueRecord = {
      ...this.state.recentCues[idx],
      userFeedback: feedback,
      feedbackAt: new Date().toISOString(),
    };
    this.state = {
      ...this.state,
      recentCues: this.state.recentCues.map((c) => (c.id === cueId ? updated : c)),
    };
    this.save();
    return updated;
  }

  async extract(text: string) {
    const result = extractMemoryRules(text);
    for (const e of result.extracted) {
      switch (e.type) {
        case "routine":
          await this.addRoutine({
            name: e.name,
            triggerType: e.triggerType,
            triggerDescription: e.triggerDescription,
            actionType: e.actionType,
            actionLabel: e.actionLabel,
          });
          break;
        case "commitment":
          await this.addCommitment({
            person: e.person,
            task: e.task,
            deadlineText: e.deadlineText,
            actionType: e.actionType,
            source: "typed",
          });
          break;
        case "item":
          await this.addItem({ label: e.label, contexts: e.contexts, priority: e.priority });
          break;
        case "person":
          await this.addPerson({ name: e.name, importance: e.importance });
          break;
      }
    }
    return {
      extracted: result.extracted as unknown[],
      notes: result.notes,
      summary: this.state,
    };
  }

  async reset(): Promise<void> {
    this.state = EMPTY_SUMMARY();
    this.save();
  }
}
