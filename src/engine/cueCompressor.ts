// Cue compressor.
//
// HUD cues must be tiny. Two short lines, ideally <60 chars.
// Start with the important object/action. Use direct action language.
// Never dump full transcripts. Never claim certainty we don't have.

import type { ContextState, Signal, ActionType } from "./types";

export interface CompressedCue {
  text: string;
  actionType: ActionType;
  reason: string;
}

const MAX_LINE_CHARS = 28;
const MAX_TOTAL_CHARS = 60;

function clampLine(line: string, max = MAX_LINE_CHARS): string {
  const trimmed = line.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + "…";
}

function joinLines(line1: string, line2: string): string {
  const a = clampLine(line1);
  const b = clampLine(line2);
  let combined = `${a}\n${b}`;
  if (combined.length > MAX_TOTAL_CHARS + 2) {
    combined = combined.slice(0, MAX_TOTAL_CHARS + 1) + "…";
  }
  return combined;
}

export function compressKitchenTimerCue(): CompressedCue {
  return {
    text: joinLines("Kitchen timer beeping.", "Check stove."),
    actionType: "physical",
    reason: "Audio + kitchen + cooking routine — physical action needed.",
  };
}

export function compressLeavingHomeCue(items: string[]): CompressedCue {
  const top = items.slice(0, 2).join(" + ");
  return {
    text: joinLines("Leaving home:", `${top}.`),
    actionType: "physical",
    reason: "Door + leaving + calendar match — surface key items.",
  };
}

export function compressDoorbellCue(deliveryExpected: boolean): CompressedCue {
  const line2 = deliveryExpected ? "Possible delivery." : "Someone at the door.";
  return {
    text: joinLines("Doorbell.", line2),
    actionType: deliveryExpected ? "physical" : "awareness",
    reason: deliveryExpected
      ? "Doorbell + home + delivery expected."
      : "Doorbell + home — awareness cue.",
  };
}

export function compressQuestionCue(transcript: string): CompressedCue {
  // Strip the addressed name and trailing punctuation. Never dump the full sentence.
  const stripped = transcript
    .replace(/^[A-Z][a-z]+,\s*/, "")
    .replace(/[?.!]+$/, "")
    .toLowerCase();
  const summary = stripped.length > 22 ? stripped.slice(0, 21) + "…" : stripped;
  return {
    text: joinLines("Question:", `${summary}?`),
    actionType: "awareness",
    reason: "Direct question detected — surface intent, not transcript.",
  };
}

export function compressNameCalledCue(): CompressedCue {
  return {
    text: joinLines("Your name was called.", "Look around."),
    actionType: "awareness",
    reason: "Known name detected in nearby speech.",
  };
}

export function compressPromiseCue(person: string, task: string): CompressedCue {
  const taskShort = task.length > 18 ? task.slice(0, 17) + "…" : task;
  return {
    text: joinLines("Promise saved:", `send ${person} ${taskShort}.`),
    actionType: "digital",
    reason: "Commitment intent detected — phone handles the digital task.",
  };
}

export function compressRoadAlertCue(kind: "horn" | "siren"): CompressedCue {
  return {
    text: joinLines("Road alert:", `${kind} nearby.`),
    actionType: "physical",
    reason: "Vehicle audio while walking on street — safety priority.",
  };
}

export function compressClinicCue(name: string, room: string): CompressedCue {
  return {
    text: joinLines(`${name} called.`, `Go to Room ${room}.`),
    actionType: "physical",
    reason: "Clinic announcement matched known name.",
  };
}

export function compressPharmacyArrivalCue(): CompressedCue {
  return {
    text: joinLines("At pharmacy:", "pick up prescription."),
    actionType: "physical",
    reason: "Arrival at pharmacy + open pickup task.",
  };
}

export function compressMedsCue(label: string): CompressedCue {
  const taskShort = label.length > 22 ? label.slice(0, 21) + "…" : label;
  return {
    text: joinLines("After dinner:", `${taskShort}.`),
    actionType: "physical",
    reason: "Evening routine + home — surface routine task.",
  };
}

export function idleCue(): CompressedCue {
  return {
    text: "No cue needed",
    actionType: "awareness",
    reason: "Nothing important right now.",
  };
}

export interface CandidateInput {
  scenarioId: string;
  signals: Signal[];
  context: ContextState;
}

export function compressCandidateCue(input: CandidateInput): CompressedCue {
  const { scenarioId, signals, context } = input;

  switch (scenarioId) {
    case "kitchen_timer":
      return compressKitchenTimerCue();
    case "leaving_home":
      return compressLeavingHomeCue(context.importantItems);
    case "doorbell": {
      const deliveryExpected =
        signals.some(
          (s) =>
            (s.kind === "calendar" && /delivery/i.test(s.label)) ||
            (s.kind === "memory" && /delivery|package/i.test(s.label))
        ) || false;
      return compressDoorbellCue(deliveryExpected);
    }
    case "name_called": {
      const speech = signals.find((s) => s.kind === "speech");
      if (speech && speech.kind === "speech") {
        return compressQuestionCue(speech.transcript);
      }
      return compressNameCalledCue();
    }
    case "promise_jason": {
      // Naive extraction for demo — find person and the asset noun.
      const speech = signals.find((s) => s.kind === "speech");
      const person =
        speech && speech.kind === "speech"
          ? (speech.transcript.match(/send (\w+)/i)?.[1] ?? "Jason")
          : "Jason";
      return compressPromiseCue(person, "deck");
    }
    case "road_siren": {
      const audio = signals.find((s) => s.kind === "audio");
      const kind =
        audio && audio.kind === "audio" && audio.event === "siren"
          ? "siren"
          : "horn";
      return compressRoadAlertCue(kind);
    }
    case "clinic_call": {
      const speech = signals.find((s) => s.kind === "speech");
      const transcript =
        speech && speech.kind === "speech" ? speech.transcript : "";
      const room = transcript.match(/Room\s+(\d+)/i)?.[1] ?? "204";
      const name = transcript.match(/^([A-Z][a-z]+)/)?.[1] ?? "Mihir";
      return compressClinicCue(name, room);
    }
    case "pharmacy_arrival":
      return compressPharmacyArrivalCue();
    case "evening_meds":
      return compressMedsCue("take blue pill");
    default:
      return idleCue();
  }
}
