// World-state engine.
//
// Hearer is not a sound classifier. The classifier emits a likely event;
// the world-state engine decides whether that event MATTERS for this user
// in this context, and what physical action would be useful. It deliberately
// avoids hard claims it can't back up — "Stove is on" requires a sensor we
// don't have, so we say "Check stove" instead.
//
// Inputs: classifier output (already converted into an AudioSignal),
//         live context override, persisted memory (routines, items),
//         optional time-of-day and recent activity.
// Output: a candidate "world-state interpretation" that the cue compressor
//         and priority engine then turn into a tiny HUD line.

import type { Routine } from "../../shared/types";
import type {
  AudioEvent,
  AudioSignal,
  ContextState,
  Priority,
  ActionType,
} from "./types";

export interface WorldStateInputs {
  audio: AudioSignal;
  override: {
    location: ContextState["location"];
    activity: ContextState["activity"];
    cookingRoutine: boolean;
    deliveryExpected: boolean;
    eventMode: boolean;
  };
  persistedRoutines: Routine[];
  hourOfDay?: number; // 0..23 — used for cooking-time inference.
}

export type WorldRiskKind =
  | "possible_unattended_cooking"
  | "possible_appliance_alert"
  | "possible_road_alert"
  | "possible_door_arrival"
  | "possible_routine_reminder"
  | "ambient_speech"
  | "ambient_crowd"
  | "no_match";

export interface WorldStateInterpretation {
  riskKind: WorldRiskKind;
  // Tiny user-facing physical action ("check stove", "look around"). The cue
  // compressor uses this to build the HUD line.
  physicalAction?: string;
  // Hearer never asserts certainty about hazards without a sensor. This flag
  // lets the cue compressor pick "Check…" over "Stove is on.".
  certainty: "low" | "medium" | "high";
  // Why we think this matters now — for the dev/judge reasoning trail.
  reason: string;
  // Names of the routines whose triggers matched (if any).
  matchedRoutineIds: string[];
  // Hint to the priority engine — never urgent without a real sensor.
  suggestedPriority: Priority;
  suggestedActionType: ActionType;
}

const COOKING_AUDIO: AudioEvent[] = ["timer_beep", "alarm"];

function isCookingTimeOfDay(hour: number | undefined): boolean {
  if (hour === undefined) return false;
  // Loosely: 6–10am and 5–9pm.
  return (hour >= 6 && hour <= 10) || (hour >= 17 && hour <= 21);
}

function findRoutinesForCooking(routines: Routine[]): Routine[] {
  return routines.filter((r) => {
    if (!r.enabled) return false;
    const desc = r.triggerDescription.toLowerCase();
    const action = r.actionLabel.toLowerCase();
    return (
      desc.includes("kitchen") ||
      desc.includes("cooking") ||
      desc.includes("dinner") ||
      desc.includes("evening") ||
      desc.includes("timer/beep") ||
      action.includes("stove") ||
      action.includes("oven")
    );
  });
}

function findRoutinesForLeavingHome(routines: Routine[]): Routine[] {
  return routines.filter((r) => {
    if (!r.enabled) return false;
    const desc = r.triggerDescription.toLowerCase();
    return (
      desc.includes("leaving home") ||
      desc.includes("home + school") ||
      desc.includes("home + leaving")
    );
  });
}

export function inferWorldState(
  inputs: WorldStateInputs
): WorldStateInterpretation {
  const { audio, override, persistedRoutines, hourOfDay } = inputs;

  const inKitchenContext =
    override.location === "kitchen" ||
    override.activity === "cooking" ||
    override.cookingRoutine;
  const atHome = override.location === "home" || override.location === "kitchen";
  const onStreet =
    override.location === "street" || override.activity === "walking";

  // 1. Cooking timer / appliance beep + cooking context => check stove.
  if (COOKING_AUDIO.includes(audio.event) && inKitchenContext) {
    const matched = findRoutinesForCooking(persistedRoutines);
    return {
      riskKind: "possible_unattended_cooking",
      physicalAction: "check stove",
      certainty: matched.length > 0 ? "medium" : "low",
      reason:
        matched.length > 0
          ? `G2 mic heard repeated beeping; saved cooking routine matched (“${matched[0].name}”); physical check is actionable.`
          : "G2 mic heard repeated beeping; cooking context active; physical check is actionable.",
      matchedRoutineIds: matched.map((r) => r.id),
      suggestedPriority: matched.length > 0 ? "urgent" : "high",
      suggestedActionType: "physical",
    };
  }

  // 2. Cooking timer with NO kitchen context but plausible cooking time +
  //    a saved cooking routine. Still actionable, but softer.
  if (
    COOKING_AUDIO.includes(audio.event) &&
    isCookingTimeOfDay(hourOfDay) &&
    findRoutinesForCooking(persistedRoutines).length > 0
  ) {
    const matched = findRoutinesForCooking(persistedRoutines);
    return {
      riskKind: "possible_unattended_cooking",
      physicalAction: "check stove",
      certainty: "low",
      reason: `Beeping at typical cooking time matched saved routine (“${matched[0].name}”).`,
      matchedRoutineIds: matched.map((r) => r.id),
      suggestedPriority: "high",
      suggestedActionType: "physical",
    };
  }

  // 3. Plain timer/appliance beep with unknown context. Soft, generic cue.
  if (COOKING_AUDIO.includes(audio.event)) {
    return {
      riskKind: "possible_appliance_alert",
      physicalAction: "check nearby",
      certainty: "low",
      reason: "Repeated beep audio without a strong context match.",
      matchedRoutineIds: [],
      suggestedPriority: audio.confidence >= 0.65 ? "high" : "medium",
      suggestedActionType: "physical",
    };
  }

  // 4. Road alert — siren / horn. Strong only on the street.
  if (audio.event === "siren" || audio.event === "horn") {
    if (onStreet) {
      return {
        riskKind: "possible_road_alert",
        physicalAction: "look around",
        certainty: "medium",
        reason: "Vehicle audio while walking on street — safety priority.",
        matchedRoutineIds: [],
        suggestedPriority: "urgent",
        suggestedActionType: "physical",
      };
    }
    return {
      riskKind: "possible_road_alert",
      physicalAction: "look around",
      certainty: "low",
      reason: "Loud vehicle-like audio without a street context.",
      matchedRoutineIds: [],
      suggestedPriority: "high",
      suggestedActionType: "physical",
    };
  }

  // 5. Doorbell / knock — door arrival.
  if (audio.event === "doorbell" || audio.event === "knock") {
    if (atHome) {
      return {
        riskKind: "possible_door_arrival",
        physicalAction: "check door",
        certainty: "medium",
        reason: "Door audio at home — possible delivery or visitor.",
        matchedRoutineIds: [],
        suggestedPriority: override.deliveryExpected ? "high" : "high",
        suggestedActionType: "physical",
      };
    }
    return {
      riskKind: "possible_door_arrival",
      physicalAction: "check door",
      certainty: "low",
      reason: "Door audio without home context.",
      matchedRoutineIds: [],
      suggestedPriority: "medium",
      suggestedActionType: "awareness",
    };
  }

  // 6. Speech-like — never hallucinate transcript.
  if (audio.event === "speech_nearby" || audio.event === "name_called") {
    return {
      riskKind: "ambient_speech",
      certainty: "low",
      reason: "Speech-like audio detected. Hearer does not infer transcript.",
      matchedRoutineIds: [],
      suggestedPriority: "low",
      suggestedActionType: "awareness",
    };
  }

  // 7. Crowd-like.
  if (audio.event === "applause" || audio.event === "laughter") {
    return {
      riskKind: "ambient_crowd",
      certainty: "low",
      reason: "Crowd-like audio — awareness only.",
      matchedRoutineIds: [],
      suggestedPriority: "low",
      suggestedActionType: "awareness",
    };
  }

  // Leaving-home is currently surfaced via scripted scenarios, but the
  // world-state engine should still acknowledge a saved leaving-home routine
  // if a future signal triggers it.
  const leaving = findRoutinesForLeavingHome(persistedRoutines);
  if (leaving.length > 0 && override.activity === "leaving") {
    return {
      riskKind: "possible_routine_reminder",
      physicalAction: leaving[0].actionLabel,
      certainty: "medium",
      reason: `Saved leaving-home routine matched (“${leaving[0].name}”).`,
      matchedRoutineIds: leaving.map((r) => r.id),
      suggestedPriority: "high",
      suggestedActionType: "physical",
    };
  }

  return {
    riskKind: "no_match",
    certainty: "low",
    reason: "No actionable interpretation for this audio + context.",
    matchedRoutineIds: [],
    suggestedPriority: "low",
    suggestedActionType: "awareness",
  };
}
