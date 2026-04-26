// Types shared across the LLM provider, extractor, and reasoner.

import type {
  ActionType,
  CueFeedback,
  ItemContext,
  MemorySummary,
  Priority,
} from "../../../shared/types";

export type LlmProviderId = "openai_compatible" | "mock" | "disabled";

export interface LlmProviderStatus {
  enabled: boolean;
  configured: boolean;
  provider: LlmProviderId;
  model?: string;
  reason?: string;
}

export type ExtractedItemKind =
  | "routine"
  | "commitment"
  | "important_item"
  | "known_person"
  | "location_rule"
  | "preference"
  | "ignore";

export interface ExtractedLlmItem {
  kind: ExtractedItemKind;
  label: string;
  triggerDescription?: string | null;
  actionType: ActionType | "none";
  actionLabel?: string | null;
  person?: string | null;
  deadlineText?: string | null;
  locationLabel?: string | null;
  priority?: Priority | null;
  confidence: number;
  save: boolean;
  privacyNote?: string | null;
  // Optional contexts list for important_item — allowed but not required.
  contexts?: ItemContext[];
}

export interface MemoryExtractionInput {
  text: string;
  source: "typed" | "speech";
  privacyMode: boolean;
  currentMemorySummary: MemorySummary;
}

export interface MemoryExtractionResult {
  items: ExtractedLlmItem[];
  confidence: number;
  reason: string;
  rawSource?: "llm" | "mock";
}

export interface CueReasoningInput {
  audioDetection: {
    label: string;
    confidence: number;
    source: string;
    direction?: "front" | "left" | "right" | "behind" | "unknown";
  };
  transcriptSnippet?: string;
  contextState: {
    likelyLocation: string;
    likelyActivity: string;
    timeOfDay: string;
    activeRoutines: string[];
    recentEvents: string[];
  };
  memorySummary: MemorySummary;
  recentCueFeedback: Array<{ cueText: string; feedback: CueFeedback }>;
  safetyRules: string[];
}

export interface CueReasoningResult {
  shouldInterrupt: boolean;
  cueText: string;
  priority: Priority;
  actionType: ActionType;
  confidence: number;
  reason: string;
  memoryUsed: string[];
  safetyLimits: string[];
  rawSource?: "llm" | "mock";
}

export interface LlmProvider {
  status(): LlmProviderStatus;
  extractMemory(input: MemoryExtractionInput): Promise<MemoryExtractionResult>;
  reasonCue(input: CueReasoningInput): Promise<CueReasoningResult>;
}
