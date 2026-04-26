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
      MEMORY_EXTRACTION_SCHEMA,
      "hearer_memory_extraction"
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
      CUE_REASONING_SCHEMA,
      "hearer_cue_reasoning"
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
    schema: unknown,
    schemaName: string
  ): Promise<unknown> {
    const cfg = getLlmConfig();
    if (!cfg.apiKey) {
      throw new LlmError("config", "OPENAI_API_KEY missing");
    }
    const url = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const body = {
      model,
      messages,
      // OpenAI Chat Completions strict structured output. The schema must
      // already comply with strict-mode rules (every property in `required`,
      // no `additionalProperties`, etc.) — we lock that in via
      // assertStrictOpenAiSchema in tests.
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
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
        const compact = compactErrorDetail(detail);
        // Surface the schema name + provider message, but never the API key
        // or the user's transcript. The schema/userPrompt itself is not
        // logged either — it can include short text snippets the user typed.
        // eslint-disable-next-line no-console
        console.warn(
          `[hearer-llm] provider HTTP ${res.status} on schema='${schemaName}': ${compact}`
        );
        throw new LlmError(
          "provider",
          `LLM provider HTTP ${res.status} on '${schemaName}': ${compact}`,
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

/**
 * Pull the OpenAI error.message out of a JSON body when present so the log
 * line shows what actually went wrong (e.g. schema 400). Falls back to a
 * truncated raw body if the body isn't JSON.
 */
function compactErrorDetail(s: string): string {
  if (!s) return "(no body)";
  try {
    const parsed = JSON.parse(s) as {
      error?: { message?: string; code?: string; param?: string };
    };
    const e = parsed.error;
    if (e && (e.message || e.code)) {
      const head = e.code ? `${e.code}` : "";
      const tail = e.message ?? "";
      const combined = head ? `${head}: ${tail}` : tail;
      return shortDetail(combined);
    }
  } catch {
    // not JSON — fall through to raw truncation
  }
  return shortDetail(s);
}

function trim(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
