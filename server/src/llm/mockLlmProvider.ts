// Mock LLM provider for tests and offline demo.
//
// We intentionally write the mock as something that *would* match a strict
// schema, so the same validators run against it as against the real
// provider. The mock applies a small set of deterministic rules so
// integration tests have stable expectations.

import { extractMemoryRules } from "../../../shared/memoryExtractorCore";
import type {
  CueReasoningInput,
  CueReasoningResult,
  ExtractedLlmItem,
  LlmProvider,
  LlmProviderStatus,
  MemoryExtractionInput,
  MemoryExtractionResult,
} from "./llmTypes";

export interface MockLlmProviderOptions {
  // Pretend to be enabled even though no API key is set.
  pretendEnabled?: boolean;
  // Inject a custom cue reasoning result for a specific test.
  reasoningOverride?: (input: CueReasoningInput) => CueReasoningResult | undefined;
  // Optional extraction override.
  extractionOverride?: (
    input: MemoryExtractionInput
  ) => MemoryExtractionResult | undefined;
  model?: string;
}

export class MockLlmProvider implements LlmProvider {
  constructor(private readonly options: MockLlmProviderOptions = {}) {}

  status(): LlmProviderStatus {
    return {
      enabled: true,
      configured: true,
      provider: "mock",
      model: this.options.model ?? "mock-model",
      reason: "Mock provider — used in tests and as a deterministic offline demo.",
    };
  }

  async extractMemory(
    input: MemoryExtractionInput
  ): Promise<MemoryExtractionResult> {
    if (this.options.extractionOverride) {
      const r = this.options.extractionOverride(input);
      if (r) return { ...r, rawSource: "mock" };
    }
    // Reuse the rule-based extractor to produce something realistic, then
    // upgrade it to the LLM item shape so callers see the same flow.
    const ruleResult = extractMemoryRules(input.text);
    const items: ExtractedLlmItem[] = ruleResult.extracted.map((e) => {
      switch (e.type) {
        case "routine":
          return {
            kind: "routine",
            label: e.name,
            triggerDescription: e.triggerDescription,
            actionType: e.actionType,
            actionLabel: e.actionLabel,
            person: null,
            deadlineText: null,
            locationLabel: null,
            priority: priorityFromTrigger(e.triggerDescription, e.actionLabel),
            confidence: 0.9,
            save: true,
            privacyNote: null,
          };
        case "commitment":
          return {
            kind: "commitment",
            label: e.task,
            triggerDescription: null,
            actionType: e.actionType,
            actionLabel: e.task,
            person: e.person ?? null,
            deadlineText: e.deadlineText ?? null,
            locationLabel: null,
            priority: "medium",
            confidence: 0.85,
            save: true,
            privacyNote: null,
          };
        case "important_item":
        case "item":
          return {
            kind: "important_item",
            label: e.label,
            triggerDescription: null,
            actionType: "physical",
            actionLabel: null,
            person: null,
            deadlineText: null,
            locationLabel: null,
            priority: e.priority,
            confidence: 0.8,
            save: true,
            privacyNote: null,
          } as ExtractedLlmItem;
        case "person":
          return {
            kind: "known_person",
            label: e.name,
            triggerDescription: null,
            actionType: "none",
            actionLabel: null,
            person: e.name,
            deadlineText: null,
            locationLabel: null,
            priority: null,
            confidence: 0.85,
            save: true,
            privacyNote: null,
          };
      }
    }) as ExtractedLlmItem[];

    return {
      items,
      confidence: items.length > 0 ? 0.85 : 0.0,
      reason:
        items.length > 0
          ? `Mock LLM extracted ${items.length} item(s) using deterministic rules.`
          : "Mock LLM found nothing structured.",
      rawSource: "mock",
    };
  }

  async reasonCue(input: CueReasoningInput): Promise<CueReasoningResult> {
    if (this.options.reasoningOverride) {
      const r = this.options.reasoningOverride(input);
      if (r) return { ...r, rawSource: "mock" };
    }

    const detection = input.audioDetection;
    const inKitchen =
      input.contextState.likelyLocation === "kitchen" ||
      input.contextState.likelyActivity === "cooking" ||
      input.contextState.activeRoutines.some((r) =>
        /cook|kitchen|stove/i.test(r)
      );
    const onStreet =
      input.contextState.likelyLocation === "street" ||
      input.contextState.likelyActivity === "walking";
    const cookingRoutine = input.memorySummary.routines.find((r) =>
      /(stove|cook|kitchen|timer\/beep|after dinner|evening)/i.test(
        r.actionLabel + " " + r.triggerDescription
      )
    );

    if (
      (detection.label === "timer_beep" || detection.label === "alarm") &&
      (inKitchen || cookingRoutine)
    ) {
      return {
        shouldInterrupt: true,
        cueText: "Kitchen timer beeping.\nCheck stove.",
        priority: "urgent",
        actionType: "physical",
        confidence: Math.max(detection.confidence, 0.85),
        reason:
          "Mock LLM matched cooking routine + repeated beep audio. Suggests physical check.",
        memoryUsed: cookingRoutine ? [cookingRoutine.id] : [],
        safetyLimits: ["no_certainty_about_hazards"],
        rawSource: "mock",
      };
    }
    if (detection.label === "siren" || detection.label === "horn") {
      const hasDir = detection.direction && detection.direction !== "unknown";
      return {
        shouldInterrupt: true,
        cueText: onStreet
          ? `Road alert:\n${detection.label}${hasDir ? ` on ${detection.direction}` : " nearby"}.`
          : "Loud alert nearby.\nLook around.",
        priority: onStreet ? "urgent" : "high",
        actionType: "physical",
        confidence: detection.confidence,
        reason: "Mock LLM road-alert path.",
        memoryUsed: [],
        safetyLimits: hasDir
          ? ["direction_only_when_known"]
          : ["direction_only_when_known", "no_certainty_about_hazards"],
        rawSource: "mock",
      };
    }
    if (detection.label === "speech") {
      return {
        shouldInterrupt: true,
        cueText: "Speech nearby.\nStay aware.",
        priority: "low",
        actionType: "awareness",
        confidence: detection.confidence,
        reason: "Mock LLM speech path — never echoes transcript.",
        memoryUsed: [],
        safetyLimits: ["no_transcript_on_hud"],
        rawSource: "mock",
      };
    }

    return {
      shouldInterrupt: false,
      cueText: "",
      priority: "low",
      actionType: "awareness",
      confidence: 0,
      reason: "Mock LLM had no actionable interpretation.",
      memoryUsed: [],
      safetyLimits: ["no_match"],
      rawSource: "mock",
    };
  }
}

function priorityFromTrigger(
  trigger: string | null | undefined,
  action: string | null | undefined
): "low" | "medium" | "high" | "urgent" | null {
  const blob = `${trigger ?? ""} ${action ?? ""}`.toLowerCase();
  if (/stove|kitchen|cooking|smoke|alarm|siren/.test(blob)) return "urgent";
  if (/leaving home|school|laptop/.test(blob)) return "high";
  if (/pharmacy|prescription/.test(blob)) return "medium";
  return null;
}
