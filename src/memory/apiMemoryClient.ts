import type { MemorySummary } from "../../shared/types";
import type { HearerApiClient } from "../api/hearerApi";
import type { MemoryClient } from "./memoryClient";

const EMPTY_SUMMARY: MemorySummary = {
  userProfile: {
    id: "default",
    displayName: "Mihir",
    alertStyle: "minimal",
    interruptionMode: "normal",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  knownPeople: [],
  importantItems: [],
  routines: [],
  commitments: [],
  locations: [],
  recentCues: [],
};

export class ApiMemoryClient implements MemoryClient {
  status: "api" | "offline" = "api";
  private api: HearerApiClient;
  private cached: MemorySummary = EMPTY_SUMMARY;

  constructor(api: HearerApiClient) {
    this.api = api;
  }

  current(): MemorySummary {
    return this.cached;
  }

  async refresh(): Promise<MemorySummary> {
    this.cached = await this.api.summary();
    this.status = "api";
    return this.cached;
  }

  async addRoutine(r: Parameters<MemoryClient["addRoutine"]>[0]) {
    const created = await this.api.addRoutine({ ...r, enabled: r.enabled ?? true });
    await this.refresh();
    return created;
  }

  async addCommitment(c: Parameters<MemoryClient["addCommitment"]>[0]) {
    const created = await this.api.addCommitment(c);
    await this.refresh();
    return created;
  }

  async addItem(i: Parameters<MemoryClient["addItem"]>[0]) {
    const created = await this.api.addItem(i);
    await this.refresh();
    return created;
  }

  async addPerson(p: Parameters<MemoryClient["addPerson"]>[0]) {
    const created = await this.api.addPerson(p);
    await this.refresh();
    return created;
  }

  async addLocation(l: Parameters<MemoryClient["addLocation"]>[0]) {
    const created = await this.api.addLocation(l);
    await this.refresh();
    return created;
  }

  async recordCue(c: Parameters<MemoryClient["recordCue"]>[0]) {
    const rec = await this.api.insertCue({ ...c, wasShown: true });
    this.cached = {
      ...this.cached,
      recentCues: [rec, ...this.cached.recentCues].slice(0, 10),
    };
    return rec;
  }

  async recordAudioDetection(input: Parameters<MemoryClient["recordAudioDetection"]>[0]) {
    return this.api.insertAudioDetection(input);
  }

  async setCueFeedback(cueId: string, feedback: Parameters<MemoryClient["setCueFeedback"]>[1]) {
    const updated = await this.api.setCueFeedback(cueId, feedback);
    this.cached = {
      ...this.cached,
      recentCues: this.cached.recentCues.map((c) => (c.id === cueId ? updated : c)),
    };
    return updated;
  }

  async extract(text: string) {
    const result = await this.api.extract(text);
    if (result.summary) this.cached = result.summary;
    return {
      extracted: result.extracted as unknown[],
      summary: this.cached,
      notes: result.notes,
    };
  }

  async reset() {
    await this.api.reset();
    await this.refresh();
  }
}
