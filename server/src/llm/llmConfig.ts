// Hearer LLM config.
//
// All settings come from environment variables. Loading `.env` is centralised
// here so that any module that imports from this file gets a populated
// process.env, even when imported indirectly.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

let loaded = false;
function loadDotenvOnce(): void {
  if (loaded) return;
  loaded = true;
  // Try repo root .env, then server/.env (lower precedence).
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "server", ".env"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      dotenv.config({ path: p, override: false });
    }
  }
}
loadDotenvOnce();

export interface LlmConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  reasoningModel: string;
  timeoutMs: number;
  maxInputChars: number;
  storeRawTranscripts: boolean;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalised = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalised)) return true;
  if (["false", "0", "no", "off", ""].includes(normalised)) return false;
  return fallback;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function getLlmConfig(): LlmConfig {
  const enabled = parseBool(process.env.HEARER_LLM_ENABLED, false);
  return {
    enabled,
    apiKey: (process.env.OPENAI_API_KEY ?? "").trim(),
    baseUrl: (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").trim(),
    model: (process.env.OPENAI_MODEL ?? "gpt-4.1-mini").trim(),
    reasoningModel: (
      process.env.OPENAI_REASONING_MODEL ??
      process.env.OPENAI_MODEL ??
      "gpt-4.1-mini"
    ).trim(),
    timeoutMs: parseNumber(process.env.HEARER_LLM_TIMEOUT_MS, 12000),
    maxInputChars: parseNumber(process.env.HEARER_LLM_MAX_INPUT_CHARS, 4000),
    storeRawTranscripts: parseBool(
      process.env.HEARER_STORE_RAW_TRANSCRIPTS,
      false
    ),
  };
}

/** Mask everything except the last 4 chars. Empty input returns "(empty)". */
export function maskApiKey(key: string): string {
  if (!key) return "(empty)";
  if (key.length <= 6) return "***";
  return `***${key.slice(-4)}`;
}
