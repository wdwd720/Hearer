// Safety guard.
//
// The LLM is allowed to be wrong, but the HUD is not. Anything heading to
// the glasses passes through these checks. We reject overconfident hazard
// claims, direction claims without evidence, medical/diagnostic language,
// long text, and obvious transcript leakage.

import type { Cue, Priority, ActionType } from "../../../src/engine/types";
import type { LlmConfig } from "../llm/llmConfig";
import type { CueReasoningResult } from "../llm/llmTypes";

export interface CueValidationOutcome {
  ok: boolean;
  cue?: Cue;
  reasonRejected?: string;
}

const DENY_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bstove is on\b/i, label: "no_certainty_about_hazards" },
  { pattern: /\bfire (?:in|at)\b/i, label: "no_unverified_emergency" },
  { pattern: /\bemergency\b/i, label: "no_unverified_emergency" },
  { pattern: /\bdanger(ous)?\b/i, label: "no_certainty_about_hazards" },
  { pattern: /\byou forgot\b/i, label: "no_unverified_blame" },
  { pattern: /\bdiagnos(?:is|e)\b/i, label: "no_medical_claims" },
  {
    pattern: /\b(seizure|stroke|heart attack|overdose)\b/i,
    label: "no_medical_claims",
  },
  {
    pattern: /\b(dangerous|unsafe) (?:neighborhood|area|street)\b/i,
    label: "no_location_bias",
  },
];

const MAX_LINES = 2;
const MAX_TOTAL_CHARS = 80; // small cushion above the 60-char preference

export interface ValidateInput {
  reasoning: CueReasoningResult;
  detectionDirection?: "front" | "left" | "right" | "behind" | "unknown";
  transcriptSnippet?: string;
}

/**
 * Validate an LLM-proposed cue and turn it into a real Cue ready to ship to
 * the HUD adapter, OR reject it with a compact reason.
 */
export function validateAndRejectUnsafeCue(input: ValidateInput): CueValidationOutcome {
  const { reasoning, detectionDirection, transcriptSnippet } = input;
  if (!reasoning.shouldInterrupt) {
    return { ok: false, reasonRejected: "shouldInterrupt=false" };
  }
  const text = reasoning.cueText.trim();
  if (!text) return { ok: false, reasonRejected: "empty_cue" };

  const lines = text.split("\n");
  if (lines.length > MAX_LINES) {
    return { ok: false, reasonRejected: `too_many_lines(${lines.length})` };
  }
  if (text.length > MAX_TOTAL_CHARS) {
    return { ok: false, reasonRejected: `too_long(${text.length})` };
  }

  // Hard deny patterns.
  for (const rule of DENY_PATTERNS) {
    if (rule.pattern.test(text)) {
      return {
        ok: false,
        reasonRejected: rule.label,
      };
    }
  }

  // Direction guard: cue may only mention left/right/front/behind if the
  // detection actually had a direction.
  if (
    /\b(on (?:the )?(?:left|right|front|behind))\b/i.test(text) ||
    /\b(left|right|behind|front)\s*$/i.test(text)
  ) {
    if (!detectionDirection || detectionDirection === "unknown") {
      return { ok: false, reasonRejected: "direction_unknown" };
    }
  }

  // Transcript leakage: don't repeat user transcript verbatim on the HUD.
  if (transcriptSnippet && transcriptSnippet.length > 12) {
    if (text.toLowerCase().includes(transcriptSnippet.toLowerCase().slice(0, 16))) {
      return { ok: false, reasonRejected: "transcript_leakage" };
    }
  }

  const cue: Cue = {
    id: `cue_llm_${Date.now()}`,
    text,
    priority: reasoning.priority as Priority,
    actionType: reasoning.actionType as ActionType,
    confidence: clamp01(reasoning.confidence),
    timestamp: new Date().toISOString(),
    signalsUsed: ["audio", "memory"],
    reason: reasoning.reason,
  };
  return { ok: true, cue };
}

export function shouldStoreRawTranscript(
  cfg: LlmConfig,
  isSpeech: boolean
): boolean {
  if (!isSpeech) return true; // typed text is fair game
  return cfg.storeRawTranscripts;
}

export function sanitizeTranscriptForStorage(
  text: string,
  maxChars: number
): string {
  if (!text) return "";
  // Strip obvious phone/email/credit card patterns; keep this conservative.
  const stripped = text
    .replace(/\b\d{3}[-\s]?\d{3}[-\s]?\d{4}\b/g, "[redacted-phone]")
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "[redacted-email]")
    .replace(/\b(?:\d[ -]*?){13,16}\b/g, "[redacted-card]");
  return stripped.length > maxChars ? stripped.slice(0, maxChars - 1) + "…" : stripped;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
