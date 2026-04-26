// LLM memory extractor service.
//
// Wraps an LlmProvider, asks it for structured items, validates them against
// our schema, and persists the ones the model marked save=true. Falls back
// to the rule-based extractor when the LLM provider is disabled or fails.

import { extractMemoryRules } from "../../../shared/memoryExtractorCore";
import type { ExtractedMemory, MemorySummary } from "../../../shared/types";
import { LlmError } from "../llm/llmErrors";
import { getLlmConfig } from "../llm/llmConfig";
import type {
  ExtractedLlmItem,
  LlmProvider,
  MemoryExtractionInput,
  MemoryExtractionResult,
} from "../llm/llmTypes";
import { MemoryService } from "./memoryService";
import { sanitizeTranscriptForStorage, shouldStoreRawTranscript } from "./safetyGuard";

export type ExtractMode = "llm" | "rule_based";

export interface ExtractServiceResult {
  mode: ExtractMode;
  extracted: ExtractedMemory[];
  llmItems?: ExtractedLlmItem[];
  persisted: ReturnType<MemoryService["extractAndPersist"]> extends Promise<infer R>
    ? R extends { persisted: infer P }
      ? P
      : never
    : never;
  summary: MemorySummary;
  confidence: number;
  fallbackUsed: boolean;
  reason: string;
}

export class LlmMemoryExtractorService {
  constructor(
    private readonly memory: MemoryService,
    private readonly llm: LlmProvider | null
  ) {}

  async extract(
    text: string,
    source: "typed" | "speech" | "manual"
  ): Promise<ExtractServiceResult> {
    const cfg = getLlmConfig();
    const status = this.llm?.status();
    const useLlm =
      !!this.llm &&
      status?.provider !== "disabled" &&
      status?.configured !== false;

    if (!useLlm) {
      return await this.runRuleBased(text, source, "LLM disabled — rule-based fallback.");
    }

    let llmResult: MemoryExtractionResult;
    try {
      const summary = this.memory.summary();
      const input: MemoryExtractionInput = {
        text: shouldStoreRawTranscript(cfg, source === "speech")
          ? text
          : sanitizeTranscriptForStorage(text, cfg.maxInputChars),
        source: source === "speech" ? "speech" : "typed",
        privacyMode: !shouldStoreRawTranscript(cfg, source === "speech"),
        currentMemorySummary: summary,
      };
      llmResult = await this.llm!.extractMemory(input);
    } catch (err) {
      const reason =
        err instanceof LlmError
          ? `LLM extraction failed (${err.kind}): ${shortMsg(err.message)}`
          : `LLM extraction failed: ${shortMsg(
              err instanceof Error ? err.message : String(err)
            )}`;
      return await this.runRuleBased(text, source, reason);
    }

    // Persist items the model said are worth saving.
    const persisted = await this.persistLlmItems(llmResult.items, source);
    return {
      mode: "llm",
      extracted: persisted.compatExtracted,
      llmItems: llmResult.items,
      persisted: persisted.persisted,
      summary: this.memory.summary(),
      confidence: llmResult.confidence,
      fallbackUsed: false,
      reason: llmResult.reason,
    };
  }

  private async runRuleBased(
    text: string,
    source: "typed" | "speech" | "manual",
    reason: string
  ): Promise<ExtractServiceResult> {
    const result = await this.memory.extractAndPersist(text, source);
    const ruleConfidence = result.extracted.length > 0 ? 0.7 : 0;
    return {
      mode: "rule_based",
      extracted: result.extracted,
      llmItems: undefined,
      persisted: result.persisted,
      summary: result.summary,
      confidence: ruleConfidence,
      fallbackUsed: true,
      reason,
    };
  }

  private async persistLlmItems(
    items: ExtractedLlmItem[],
    source: "typed" | "speech" | "manual"
  ): Promise<{
    persisted: {
      routines: ReturnType<MemoryService["addRoutine"]>[];
      commitments: ReturnType<MemoryService["addCommitment"]>[];
      items: ReturnType<MemoryService["addItem"]>[];
      people: ReturnType<MemoryService["addPerson"]>[];
    };
    compatExtracted: ExtractedMemory[];
  }> {
    // Pretend `extractMemory` only returns sync-able values.
    type RoutineRec = Awaited<ReturnType<MemoryService["addRoutine"]>>;
    type CommitRec = Awaited<ReturnType<MemoryService["addCommitment"]>>;
    type ItemRec = Awaited<ReturnType<MemoryService["addItem"]>>;
    type PersonRec = Awaited<ReturnType<MemoryService["addPerson"]>>;
    const persisted = {
      routines: [] as RoutineRec[],
      commitments: [] as CommitRec[],
      items: [] as ItemRec[],
      people: [] as PersonRec[],
    };
    const compat: ExtractedMemory[] = [];

    for (const item of items) {
      if (!item.save) continue;
      switch (item.kind) {
        case "routine":
        case "location_rule": {
          const routine = this.memory.addRoutine({
            name: item.label,
            triggerType: pickTriggerType(item.triggerDescription ?? ""),
            triggerDescription: item.triggerDescription ?? item.label,
            actionType:
              item.actionType === "none" ? "awareness" : item.actionType,
            actionLabel: item.actionLabel ?? item.label,
            confidence: item.confidence,
            source: source === "typed" ? "typed" : "extracted",
          });
          persisted.routines.push(routine);
          compat.push({
            type: "routine",
            name: routine.name,
            triggerType: routine.triggerType,
            triggerDescription: routine.triggerDescription,
            actionType: routine.actionType,
            actionLabel: routine.actionLabel,
          });
          break;
        }
        case "commitment": {
          const c = this.memory.addCommitment({
            person: item.person ?? undefined,
            task: item.label,
            deadlineText: item.deadlineText ?? undefined,
            actionType:
              item.actionType === "physical" || item.actionType === "digital"
                ? item.actionType
                : "digital",
            source: source === "speech" ? "speech" : source === "typed" ? "typed" : "manual",
          });
          persisted.commitments.push(c);
          compat.push({
            type: "commitment",
            person: c.person,
            task: c.task,
            deadlineText: c.deadlineText,
            actionType: c.actionType,
          });
          break;
        }
        case "important_item": {
          const i = this.memory.addItem({
            label: item.label,
            contexts: item.contexts ?? ["custom"],
            priority: (item.priority as "low" | "medium" | "high" | "urgent" | null) ?? "high",
          });
          persisted.items.push(i);
          compat.push({
            type: "item",
            label: i.label,
            contexts: i.contexts,
            priority: i.priority,
          });
          break;
        }
        case "known_person": {
          const p = this.memory.addPerson({ name: item.person ?? item.label });
          persisted.people.push(p);
          compat.push({ type: "person", name: p.name, importance: p.importance });
          break;
        }
        case "preference":
        case "ignore":
          // Preferences are not stored as routines today; we skip them and
          // surface them in the response so the UI can show what was
          // suggested without fabricating durable state.
          break;
      }
    }
    return { persisted, compatExtracted: compat };
  }
}

function pickTriggerType(
  trigger: string
):
  | "time"
  | "location"
  | "context"
  | "sound"
  | "speech"
  | "combined" {
  const t = trigger.toLowerCase();
  const hasTime = /(morning|evening|night|after dinner|usually|every|time)/.test(t);
  const hasLoc = /(home|kitchen|street|clinic|pharmacy|school|event|leaving|arriving)/.test(
    t
  );
  const hasSound = /(timer|beep|alarm|siren|horn|knock|doorbell|applause)/.test(t);
  const count = [hasTime, hasLoc, hasSound].filter(Boolean).length;
  if (count >= 2) return "combined";
  if (hasSound) return "sound";
  if (hasLoc) return "location";
  if (hasTime) return "time";
  return "context";
}

function shortMsg(s: string): string {
  if (!s) return "";
  return s.length > 200 ? s.slice(0, 200) + "…" : s;
}
