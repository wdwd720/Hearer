// LLM cue reasoner.
//
// Takes a stable audio detection + the live context override + persisted
// memory, asks the LLM what (if anything) the HUD should show, and runs the
// safety guard before letting that text reach the glasses.
//
// The deterministic world-state engine remains the source of truth on the
// frontend. This service is the optional uplift: it only steps in when the
// LLM is enabled, the detection cleared the cooldown threshold, and the
// safety guard accepts the proposed cue.

import { LlmError } from "../llm/llmErrors";
import type {
  CueReasoningInput,
  LlmProvider,
  CueReasoningResult,
} from "../llm/llmTypes";
import type {
  CueFeedback,
  MemorySummary,
  Routine,
} from "../../../shared/types";
import type { Cue } from "../../../src/engine/types";
import {
  validateAndRejectUnsafeCue,
  type CueValidationOutcome,
} from "./safetyGuard";

export const SAFETY_RULES: string[] = [
  "no_certainty_about_hazards: say 'Check stove.' not 'Stove is on.'",
  "direction_only_when_known: do not say left/right/front/behind unless the detection has a direction",
  "no_transcript_on_hud: never echo a user transcript verbatim",
  "no_medical_claims: do not assert diagnoses or risk levels",
  "no_location_bias: do not infer crime/risk from neighborhood or location names",
  "max_two_lines: HUD payload is at most two short lines",
];

export interface ReasonerInput {
  audioDetection: CueReasoningInput["audioDetection"];
  contextState: CueReasoningInput["contextState"];
  memorySummary: MemorySummary;
  recentCueFeedback?: Array<{ cueText: string; feedback: CueFeedback }>;
  transcriptSnippet?: string;
}

export interface ReasonerOutput {
  cue?: Cue;
  raw?: CueReasoningResult;
  rejected?: { reason: string; raw?: CueReasoningResult };
  fallbackReason?: string;
}

export class LlmCueReasoner {
  constructor(private readonly llm: LlmProvider | null) {}

  isAvailable(): boolean {
    if (!this.llm) return false;
    const status = this.llm.status();
    return status.provider !== "disabled" && status.configured !== false;
  }

  async reason(input: ReasonerInput): Promise<ReasonerOutput> {
    if (!this.llm || !this.isAvailable()) {
      return { fallbackReason: "LLM provider not available" };
    }
    const llmInput: CueReasoningInput = {
      audioDetection: input.audioDetection,
      transcriptSnippet: input.transcriptSnippet,
      contextState: input.contextState,
      memorySummary: input.memorySummary,
      recentCueFeedback: input.recentCueFeedback ?? [],
      safetyRules: SAFETY_RULES,
    };

    let raw: CueReasoningResult;
    try {
      raw = await this.llm.reasonCue(llmInput);
    } catch (err) {
      const reason =
        err instanceof LlmError
          ? `LLM cue reasoning failed (${err.kind}): ${shortMsg(err.message)}`
          : `LLM cue reasoning failed: ${shortMsg(
              err instanceof Error ? err.message : String(err)
            )}`;
      return { fallbackReason: reason };
    }

    const validated: CueValidationOutcome = validateAndRejectUnsafeCue({
      reasoning: raw,
      detectionDirection: input.audioDetection.direction,
      transcriptSnippet: input.transcriptSnippet,
    });
    if (!validated.ok || !validated.cue) {
      return {
        rejected: {
          reason: validated.reasonRejected ?? "unknown",
          raw,
        },
        raw,
      };
    }
    return { cue: validated.cue, raw };
  }
}

export function summariseRoutines(routines: Routine[]): string[] {
  return routines
    .filter((r) => r.enabled)
    .slice(0, 6)
    .map(
      (r) =>
        `${r.name}: ${r.triggerDescription} → ${r.actionLabel} (${r.actionType})`
    );
}

function shortMsg(s: string): string {
  if (!s) return "";
  return s.length > 200 ? s.slice(0, 200) + "…" : s;
}
