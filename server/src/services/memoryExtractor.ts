// Memory extraction service.
//
// The interface here lets the server swap in an LLM-backed extractor later
// without touching callers. The actual rule-based logic lives in
// shared/memoryExtractorCore.ts so the browser fallback path uses the same
// rules.

import type { ExtractResponse } from "../../../shared/types";
import { extractMemoryRules } from "../../../shared/memoryExtractorCore";

export interface MemoryExtractor {
  id: string;
  label: string;
  isAvailable(): boolean;
  extract(text: string): Promise<ExtractResponse>;
}

export class RuleBasedMemoryExtractor implements MemoryExtractor {
  id = "rule_based_v1";
  label = "Rule-based extractor";

  isAvailable(): boolean {
    return true;
  }

  async extract(text: string): Promise<ExtractResponse> {
    return extractMemoryRules(text);
  }
}

// Stub for an optional LLM extractor. Not active in this build because we
// don't take a hard runtime dependency on any provider.
export class OptionalLLMExtractorStub implements MemoryExtractor {
  id = "llm_stub";
  label = "LLM extractor (stub)";

  isAvailable(): boolean {
    return false;
  }

  async extract(): Promise<ExtractResponse> {
    return {
      extracted: [],
      notes: ["LLM extractor is not configured in this build."],
    };
  }
}
