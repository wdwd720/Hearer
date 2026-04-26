// OpenAI-compatible LLM provider.
//
// Server-side only. Talks to any provider that exposes the
// `/chat/completions` endpoint (OpenAI, Together, OpenRouter with the right
// base URL, or self-hosted). Uses JSON mode + a strict schema; we still
// validate the response server-side before trusting it.

import { LlmError } from "./llmErrors";
import { getLlmConfig, maskApiKey } from "./llmConfig";
import {
  CUE_REASONING_SCHEMA,
  MEMORY_EXTRACTION_SCHEMA,
  validateCueReasoning,
  validateMemoryExtraction,
} from "./llmSchemas";
import {
  CUE_REASONING_SYSTEM_PROMPT,
  cueReasoningUserPrompt,
  MEMORY_EXTRACTION_SYSTEM_PROMPT,
  memoryExtractionUserPrompt,
} from "./llmPrompts";
import type {
  CueReasoningInput,
  CueReasoningResult,
  LlmProvider,
  LlmProviderStatus,
  MemoryExtractionInput,
  MemoryExtractionResult,
} from "./llmTypes";

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export class OpenAiCompatibleProvider implements LlmProvider {
  status(): LlmProviderStatus {
    const cfg = getLlmConfig();
    if (!cfg.enabled) {
      return {
        enabled: false,
        configured: !!cfg.apiKey,
        provider: "disabled",
        model: cfg.model,
        reason: "HEARER_LLM_ENABLED is false",
      };
    }
    if (!cfg.apiKey) {
      return {
        enabled: true,
        configured: false,
        provider: "disabled",
        model: cfg.model,
        reason: "OPENAI_API_KEY is empty",
      };
    }
    return {
      enabled: true,
      configured: true,
      provider: "openai_compatible",
      model: cfg.model,
      reason: `Using ${cfg.model} via ${cfg.baseUrl} (key ${maskApiKey(cfg.apiKey)}).`,
    };
  }

  async extractMemory(
    input: MemoryExtractionInput
  ): Promise<MemoryExtractionResult> {
    const cfg = getLlmConfig();
    const text = trim(input.text, cfg.maxInputChars);
    const messages: ChatMessage[] = [
      { role: "system", content: MEMORY_EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: memoryExtractionUserPrompt({ ...input, text }) },
    ];

    const json = await this.chatJson(
      cfg.model,
      messages,
      MEMORY_EXTRACTION_SCHEMA
    );
    const validated = validateMemoryExtraction(json);
    if (!validated.ok || !validated.value) {
      throw new LlmError(
        "schema",
        `Memory extraction schema validation failed: ${validated.errors
          .slice(0, 3)
          .join("; ")}`
      );
    }
    return { ...validated.value, rawSource: "llm" };
  }

  async reasonCue(input: CueReasoningInput): Promise<CueReasoningResult> {
    const cfg = getLlmConfig();
    const messages: ChatMessage[] = [
      { role: "system", content: CUE_REASONING_SYSTEM_PROMPT },
      { role: "user", content: cueReasoningUserPrompt(input) },
    ];

    const json = await this.chatJson(
      cfg.reasoningModel,
      messages,
      CUE_REASONING_SCHEMA
    );
    const validated = validateCueReasoning(json);
    if (!validated.ok || !validated.value) {
      throw new LlmError(
        "schema",
        `Cue reasoning schema validation failed: ${validated.errors
          .slice(0, 3)
          .join("; ")}`
      );
    }
    return { ...validated.value, rawSource: "llm" };
  }

  private async chatJson(
    model: string,
    messages: ChatMessage[],
    schema: unknown
  ): Promise<unknown> {
    const cfg = getLlmConfig();
    if (!cfg.apiKey) {
      throw new LlmError("config", "OPENAI_API_KEY missing");
    }
    const url = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const body = {
      model,
      messages,
      // Most OpenAI-compatible servers honour at least one of these:
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "hearer_response",
          schema,
          strict: true,
        },
      },
      temperature: 0,
    } as Record<string, unknown>;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await safeText(res);
        throw new LlmError(
          "provider",
          `LLM provider HTTP ${res.status}: ${shortDetail(detail)}`,
          res.status
        );
      }
      const payload = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new LlmError("provider", "LLM provider returned empty content");
      }
      try {
        return JSON.parse(content);
      } catch (err) {
        throw new LlmError(
          "schema",
          `LLM did not return valid JSON: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        throw new LlmError("timeout", `LLM call timed out after ${cfg.timeoutMs}ms`);
      }
      if (err instanceof LlmError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new LlmError("network", `LLM network error: ${msg}`);
    } finally {
      clearTimeout(t);
    }
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function shortDetail(s: string): string {
  if (!s) return "(no body)";
  return s.length > 200 ? s.slice(0, 200) + "…" : s;
}

function trim(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
