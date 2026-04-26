// Memory service — turns API requests into Storage operations and converts
// the rule-based extractor's output into persisted records.

import { randomUUID } from "node:crypto";

import type {
  Commitment,
  ExtractedMemory,
  ExtractResponse,
  ImportantItem,
  KnownPerson,
  LocationMemory,
  MemorySummary,
  Routine,
} from "../../../shared/types";
import { type Storage } from "../db";
import {
  RuleBasedMemoryExtractor,
  type MemoryExtractor,
} from "./memoryExtractor";

export class MemoryService {
  private storage: Storage;
  private extractor: MemoryExtractor;

  constructor(storage: Storage, extractor?: MemoryExtractor) {
    this.storage = storage;
    this.extractor = extractor ?? new RuleBasedMemoryExtractor();
  }

  summary(): MemorySummary {
    return this.storage.summary();
  }

  addPerson(input: Partial<KnownPerson> & { name: string }): KnownPerson {
    const now = new Date().toISOString();
    const person: KnownPerson = {
      id: input.id ?? `person_${randomUUID()}`,
      name: input.name,
      aliases: input.aliases ?? [],
      importance: input.importance ?? "normal",
      relationship: input.relationship,
      createdAt: now,
    };
    return this.storage.upsertPerson(person);
  }

  addItem(input: Partial<ImportantItem> & { label: string }): ImportantItem {
    const now = new Date().toISOString();
    const item: ImportantItem = {
      id: input.id ?? `item_${randomUUID()}`,
      label: input.label,
      contexts: input.contexts ?? ["custom"],
      priority: input.priority ?? "high",
      createdAt: now,
    };
    return this.storage.upsertItem(item);
  }

  addLocation(
    input: Partial<LocationMemory> & { label: string; type: LocationMemory["type"] }
  ): LocationMemory {
    const now = new Date().toISOString();
    const location: LocationMemory = {
      id: input.id ?? `loc_${randomUUID()}`,
      label: input.label,
      type: input.type,
      cuesOnArrival: input.cuesOnArrival ?? [],
      cuesOnExit: input.cuesOnExit ?? [],
      relevantSounds: input.relevantSounds ?? [],
      createdAt: now,
    };
    return this.storage.upsertLocation(location);
  }

  addRoutine(input: Partial<Routine> & {
    name: string;
    triggerType: Routine["triggerType"];
    triggerDescription: string;
    actionType: Routine["actionType"];
    actionLabel: string;
  }): Routine {
    const now = new Date().toISOString();
    const routine: Routine = {
      id: input.id ?? `rout_${randomUUID()}`,
      name: input.name,
      triggerType: input.triggerType,
      triggerDescription: input.triggerDescription,
      actionType: input.actionType,
      actionLabel: input.actionLabel,
      enabled: input.enabled ?? true,
      confidence: input.confidence ?? 0.85,
      source: input.source ?? "extracted",
      createdAt: now,
      updatedAt: now,
    };
    return this.storage.upsertRoutine(routine);
  }

  addCommitment(input: Partial<Commitment> & {
    task: string;
    actionType?: Commitment["actionType"];
    source?: Commitment["source"];
  }): Commitment {
    const now = new Date().toISOString();
    const existing = this.storage
      .listCommitments()
      .find(
        (c) =>
          c.status !== "done" &&
          c.task.trim().toLowerCase() === input.task.trim().toLowerCase() &&
          (c.person ?? "") === (input.person ?? "")
      );
    if (existing) {
      const updated: Commitment = {
        ...existing,
        deadlineText: input.deadlineText ?? existing.deadlineText,
        deadlineIso: input.deadlineIso ?? existing.deadlineIso,
        actionType: input.actionType ?? existing.actionType,
        updatedAt: now,
      };
      return this.storage.upsertCommitment(updated);
    }
    const commitment: Commitment = {
      id: input.id ?? `commit_${randomUUID()}`,
      person: input.person,
      task: input.task,
      deadlineText: input.deadlineText,
      deadlineIso: input.deadlineIso,
      actionType: input.actionType ?? "digital",
      status: input.status ?? "pending",
      source: input.source ?? "manual",
      createdAt: now,
      updatedAt: now,
    };
    return this.storage.upsertCommitment(commitment);
  }

  async extractFromText(text: string): Promise<ExtractResponse> {
    return this.extractor.extract(text);
  }

  // Persist the structured output of an extraction round as concrete records.
  async extractAndPersist(
    text: string,
    source: "typed" | "speech" | "manual" = "typed"
  ): Promise<{
    extracted: ExtractedMemory[];
    notes?: string[];
    persisted: {
      routines: Routine[];
      commitments: Commitment[];
      items: ImportantItem[];
      people: KnownPerson[];
    };
    summary: MemorySummary;
  }> {
    const result = await this.extractor.extract(text);
    const persisted = {
      routines: [] as Routine[],
      commitments: [] as Commitment[],
      items: [] as ImportantItem[],
      people: [] as KnownPerson[],
    };

    for (const e of result.extracted) {
      switch (e.type) {
        case "routine":
          persisted.routines.push(
            this.addRoutine({ ...e, source: source === "typed" ? "typed" : "extracted" })
          );
          break;
        case "commitment":
          persisted.commitments.push(
            this.addCommitment({
              ...e,
              source,
            })
          );
          break;
        case "item":
          persisted.items.push(this.addItem(e));
          break;
        case "person":
          persisted.people.push(this.addPerson(e));
          break;
      }
    }

    return {
      extracted: result.extracted,
      notes: result.notes,
      persisted,
      summary: this.summary(),
    };
  }
}
