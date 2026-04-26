// Provider factory.
//
// Returns a real OpenAiCompatibleProvider when HEARER_LLM_ENABLED=true and a
// key is configured, or a NullProvider that mimics "disabled" status. The
// MockLlmProvider is wired in by tests directly; production never uses it.

import { getLlmConfig } from "./llmConfig";
import { OpenAiCompatibleProvider } from "./openAiCompatibleProvider";
import type { LlmProvider, LlmProviderStatus } from "./llmTypes";

export class DisabledLlmProvider implements LlmProvider {
  status(): LlmProviderStatus {
    const cfg = getLlmConfig();
    return {
      enabled: cfg.enabled,
      configured: !!cfg.apiKey,
      provider: "disabled",
      model: cfg.model,
      reason: cfg.enabled
        ? "OPENAI_API_KEY missing"
        : "HEARER_LLM_ENABLED is false",
    };
  }
  async extractMemory(): Promise<never> {
    throw new Error(
      "LLM provider disabled — caller should use the rule-based fallback."
    );
  }
  async reasonCue(): Promise<never> {
    throw new Error(
      "LLM provider disabled — caller should use the deterministic reasoner."
    );
  }
}

export function buildLlmProvider(): LlmProvider {
  const cfg = getLlmConfig();
  if (cfg.enabled && cfg.apiKey) {
    return new OpenAiCompatibleProvider();
  }
  return new DisabledLlmProvider();
}

export { OpenAiCompatibleProvider } from "./openAiCompatibleProvider";
export { MockLlmProvider } from "./mockLlmProvider";
