// Prompts for Hearer's LLM brain.
//
// Two prompts:
//   1. memory extraction — natural-language → structured Hearer memory.
//   2. cue reasoning — detection + memory + context → tiny HUD cue.
//
// We keep the system prompt explicit about glasses-first constraints, the
// HUD character budget, and the safety rules. Raw audio is never sent.

import type {
  CueReasoningInput,
  MemoryExtractionInput,
} from "./llmTypes";

export const MEMORY_EXTRACTION_SYSTEM_PROMPT = `You are the memory layer of Hearer, a glasses-first proactive accessibility agent.
The user speaks or types short sentences telling Hearer what to remember.
Your job is to convert that into compact, structured memory items so the
Even G2 HUD can later surface a tiny physical-world cue at the right moment.

Hard rules:
- Output JSON only. Match the provided schema exactly. No commentary.
- Save only durable, future-relevant memory. Skip one-off chatter.
- Prefer one of these kinds: routine | commitment | important_item |
  known_person | location_rule | preference | ignore.
- Each item has a confidence in [0, 1]. Set save=false when ambiguous.
- Action language must be short and concrete: "check stove", "bring laptop".
- Never use medical or emergency language. Never claim certainty about
  physical hazards. Never invent details the user did not say.
- Never store arbitrary identifying info (addresses, account numbers,
  full health history). If the input contains it, set save=false and add
  a privacyNote explaining why.
- Routines for sounds (timer, doorbell, knock, siren, horn) should map
  the trigger to an audio + context combo and produce a physical action.
- Commitments: extract person, task, deadlineText. actionType usually
  digital ("send X to Jason tonight").
- Preferences for suppression are real and useful (e.g. ignore applause
  except at events).
`;

export function memoryExtractionUserPrompt(input: MemoryExtractionInput): string {
  const summary = compactMemorySummary(input.currentMemorySummary);
  const text = clamp(input.text, 1500);
  return `Source: ${input.source}
Privacy mode: ${input.privacyMode ? "do_not_store_raw_transcripts" : "default"}

Existing memory summary (for context, do not duplicate):
${summary}

User text:
"""${text}"""

Return one JSON object matching the schema. items may be empty if nothing
durable is asserted.`;
}

export const CUE_REASONING_SYSTEM_PROMPT = `You are the world-state reasoner of Hearer, a glasses-first accessibility agent.
You decide whether a tiny cue should appear on the user's Even G2 HUD given
the current audio detection, context, and stored memory.

Hard rules:
- Output JSON only. Match the provided schema exactly. No commentary.
- HUD cue text must be at most 2 lines and ideally <60 characters total.
  Use "\\n" to separate lines.
- Use direct action language: "Check stove.", "Look around.", "Heads up.".
- Never claim sensor-grade certainty. Say "Check stove." not "Stove is on.".
  Say "Loud alert nearby." not "Fire."
- Only mention direction (left/right/front/behind) if the input direction
  field is set and not "unknown".
- Set shouldInterrupt=false when:
  - confidence is low,
  - context does not match memory,
  - the cue would not be actionable, or
  - the suggested cue would violate a safety rule.
- Speech-like detections must NOT be turned into transcripts. The most a
  speech detection can say is "Speech nearby." or "Your name was called.".
- Do not infer crime/risk from a neighborhood, accent, or location name
  alone. Do not produce protected-class judgments or medical diagnoses.
- physical: actionable in the world (check stove, look around).
  digital: phone-side (draft, reminder).
  awareness: just a heads-up.
- safetyLimits should list which guard rules you applied, e.g.
  "no_certainty_about_hazards", "direction_only_when_known".
`;

export function cueReasoningUserPrompt(input: CueReasoningInput): string {
  const memory = compactMemorySummary(input.memorySummary);
  const feedbackLines = (input.recentCueFeedback ?? [])
    .slice(0, 5)
    .map((f) => `- "${clamp(f.cueText, 60)}" → ${f.feedback}`)
    .join("\n");
  const transcriptLine = input.transcriptSnippet
    ? `Transcript snippet (do NOT echo verbatim): "${clamp(
        input.transcriptSnippet,
        160
      )}"`
    : "Transcript: (none)";
  return `Detection:
- label: ${input.audioDetection.label}
- confidence: ${input.audioDetection.confidence.toFixed(2)}
- source: ${input.audioDetection.source}
- direction: ${input.audioDetection.direction ?? "unknown"}

${transcriptLine}

Context:
- likelyLocation: ${input.contextState.likelyLocation}
- likelyActivity: ${input.contextState.likelyActivity}
- timeOfDay: ${input.contextState.timeOfDay}
- activeRoutines: ${input.contextState.activeRoutines.join(", ") || "(none)"}
- recentEvents: ${input.contextState.recentEvents.slice(0, 3).join("; ") || "(none)"}

Stored memory:
${memory}

Recent cue feedback:
${feedbackLines || "(none)"}

Safety rules to honour:
${input.safetyRules.map((r) => `- ${r}`).join("\n")}

Return one JSON object matching the schema.`;
}

export function compactMemorySummary(summary: CueReasoningInput["memorySummary"]): string {
  const parts: string[] = [];
  parts.push(`profile: ${summary.userProfile.displayName}`);
  if (summary.knownPeople.length)
    parts.push(
      `people: ${summary.knownPeople.map((p) => p.name).slice(0, 8).join(", ")}`
    );
  if (summary.importantItems.length)
    parts.push(
      `items: ${summary.importantItems
        .map((i) => i.label)
        .slice(0, 8)
        .join(", ")}`
    );
  if (summary.routines.length) {
    const r = summary.routines.slice(0, 6).map(
      (r) =>
        `${r.name} [${r.triggerDescription} → ${r.actionLabel} (${r.actionType}/${r.enabled ? "on" : "off"})]`
    );
    parts.push(`routines:\n  - ${r.join("\n  - ")}`);
  }
  if (summary.commitments.length) {
    const c = summary.commitments
      .slice(0, 6)
      .map(
        (c) =>
          `${c.task}${c.person ? ` — ${c.person}` : ""}${c.deadlineText ? ` (${c.deadlineText})` : ""} [${c.status}]`
      );
    parts.push(`commitments:\n  - ${c.join("\n  - ")}`);
  }
  return parts.join("\n");
}

function clamp(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
