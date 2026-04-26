// Decision pipeline for live-audio detections.
//
// The scenario-mode pipeline (`decide`) takes a fully scripted scenario.
// Live audio gives us one AudioSignal plus a partial context override.
// This builder synthesises a scenario on the fly so it can flow through
// the same priority engine, cue compressor, and action router.

import {
  compressDoorbellCue,
  compressKitchenTimerCue,
  compressLiveAlarm,
  compressLiveApplause,
  compressLiveDoorbellUnknown,
  compressLiveKnock,
  compressLiveLaughter,
  compressLiveLoudAlertUnknown,
  compressLiveSpeechNearby,
  compressLiveTimerUnknown,
  compressRoadAlertCue,
} from "./cueCompressor";
import { routeActions } from "./actionRouter";
import { scorePriority } from "./priorityEngine";
import type {
  AudioSignal,
  Cue,
  DecisionResult,
  DemoMemory,
  Priority,
  ScenarioDefinition,
  Signal,
} from "./types";

export interface LiveAudioContextOverride {
  location: import("./types").LocationName;
  activity: import("./types").MotionActivity;
  cookingRoutine: boolean;
  deliveryExpected: boolean;
  eventMode: boolean;
}

interface LiveDecideInput {
  audioSignal: AudioSignal;
  override: LiveAudioContextOverride;
  memory: DemoMemory;
  classifierExplanation?: string;
}

const HORN_LIKE: AudioSignal["event"][] = ["horn", "siren"];

export function decideFromLiveAudio(input: LiveDecideInput): DecisionResult {
  const { audioSignal, override, memory, classifierExplanation } = input;

  const now = new Date().toISOString();
  const signals: Signal[] = [audioSignal];

  // Synthesize derived signals from the live context override.
  signals.push({
    kind: "location",
    location: override.location,
    transition: override.activity === "leaving"
      ? "leaving"
      : override.activity === "arriving"
      ? "arriving"
      : "stationary",
    confidence: 0.7,
    timestamp: now,
  });
  signals.push({
    kind: "motion",
    activity: override.activity,
    confidence: 0.7,
    timestamp: now,
  });
  if (override.cookingRoutine) {
    signals.push({
      kind: "routine",
      routineId: "cooking_watch",
      label: "Cooking watch active",
      confidence: 0.8,
      timestamp: now,
    });
  }
  if (override.deliveryExpected) {
    signals.push({
      kind: "calendar",
      label: "Package out for delivery",
      confidence: 0.7,
      timestamp: now,
    });
  }
  if (override.eventMode) {
    signals.push({
      kind: "calendar",
      label: "Event / hackathon",
      confidence: 0.7,
      timestamp: now,
    });
  }

  // Decide which scripted scenario the live signal best matches, since the
  // existing priority engine has scenario-specific rules.
  const matched = matchScenario(audioSignal, override);

  // Compose a synthetic scenario object — never inserted into the scenarios
  // catalogue; only used for engine internals.
  const scenario: ScenarioDefinition = {
    id: matched.scenarioId,
    title: `Live: ${audioSignal.event.replace("_", " ")}`,
    category: "Hearing",
    description:
      classifierExplanation ?? "Live audio detection routed through Hearer.",
    signals,
    contextPatch: {
      location: override.location,
      activity: override.activity,
      activeRoutines: override.cookingRoutine ? ["cooking_watch"] : [],
      calendarContext: override.deliveryExpected
        ? "Package out for delivery"
        : override.eventMode
        ? "Event / hackathon"
        : undefined,
    },
    expectedActionType: matched.expectedActionType,
    expectedPriority: matched.expectedPriority,
  };

  // Compress the live cue.
  const compressed = matched.compressed;

  // Score priority via the same engine as scripted scenarios.
  const context = {
    location: override.location,
    activity: override.activity,
    activeRoutines: override.cookingRoutine ? ["cooking_watch"] : [],
    calendarContext: scenario.contextPatch.calendarContext,
    knownPeople: [...memory.userProfile.knownNames],
    openTasks: [...memory.openTasks],
    importantItems: [...memory.userProfile.importantItems],
    signalsCombined: signals.length,
  };

  const priorityResult = scorePriority(scenario, signals, context);

  // For unknown-context safety events we still want a strong cue.
  let priority: Priority = priorityResult.priority;
  if (HORN_LIKE.includes(audioSignal.event) && override.location === "unknown") {
    priority = "high";
  }
  if (audioSignal.event === "timer_beep" && override.location === "unknown") {
    priority = audioSignal.confidence >= 0.65 ? "high" : "medium";
  }
  if (audioSignal.event === "speech_nearby") {
    priority = "low";
  }
  if (audioSignal.event === "applause" || audioSignal.event === "laughter") {
    priority = "low";
  }

  const cue: Cue = {
    id: `cue_live_${audioSignal.event}_${Date.now()}`,
    text: compressed.text,
    priority,
    reason: `${compressed.reason} · ${priorityResult.explanation}`,
    actionType: compressed.actionType,
    confidence: Math.round(audioSignal.confidence * 100) / 100,
    timestamp: now,
    signalsUsed: signals.map((s) => s.kind),
  };

  const routed = routeActions(scenario, cue, context);

  const reasoningSteps = [
    {
      label: `Live audio detected: ${audioSignal.event.replace("_", " ")}`,
      detail: classifierExplanation,
    },
    {
      label: `Confidence: ${(audioSignal.confidence * 100).toFixed(0)}%`,
    },
    {
      label: `Live context: ${override.location} · ${override.activity}`,
      detail:
        [
          override.cookingRoutine ? "cooking routine on" : null,
          override.deliveryExpected ? "delivery expected" : null,
          override.eventMode ? "event mode" : null,
        ]
          .filter(Boolean)
          .join(" · ") || "no context toggles",
    },
    {
      label: `Signals combined: ${signals.length}`,
      detail: signals.map((s) => s.kind).join(", "),
    },
    {
      label: `Priority assigned: ${cue.priority}`,
      detail: priorityResult.explanation,
    },
    {
      label: `Cue compressed (${cue.text.replace(/\n/g, " · ").length} chars)`,
      detail: cue.text.replace(/\n/g, " · "),
    },
    {
      label: `Action routed: ${cue.actionType}`,
      detail:
        routed.physicalDescription ??
        routed.awarenessDescription ??
        (routed.digitalActions.length > 0
          ? `${routed.digitalActions.length} digital action(s) prepared`
          : "No follow-up action"),
    },
  ];

  return {
    scenarioId: scenario.id,
    title: scenario.title,
    signals,
    context,
    cue,
    actions: routed.digitalActions,
    reasoningSteps,
  };
}

interface MatchedScenario {
  scenarioId: string;
  expectedPriority: Priority;
  expectedActionType: import("./types").ActionType;
  compressed: { text: string; actionType: import("./types").ActionType; reason: string };
}

function matchScenario(
  audio: AudioSignal,
  override: LiveAudioContextOverride
): MatchedScenario {
  const inKitchen =
    override.location === "kitchen" ||
    (override.location === "home" && override.cookingRoutine) ||
    override.activity === "cooking" ||
    override.cookingRoutine;
  const onStreet =
    override.location === "street" || override.activity === "walking";
  const atHome = override.location === "home" || override.location === "kitchen";

  switch (audio.event) {
    case "timer_beep":
    case "alarm": {
      if (inKitchen) {
        return {
          scenarioId: "kitchen_timer",
          expectedPriority: "urgent",
          expectedActionType: "physical",
          compressed: compressKitchenTimerCue(),
        };
      }
      if (audio.event === "alarm") {
        return {
          scenarioId: "live_alarm",
          expectedPriority: "high",
          expectedActionType: "physical",
          compressed: compressLiveAlarm(atHome),
        };
      }
      return {
        scenarioId: "live_timer",
        expectedPriority: "high",
        expectedActionType: "physical",
        compressed: compressLiveTimerUnknown(),
      };
    }
    case "siren":
    case "horn": {
      if (onStreet) {
        return {
          scenarioId: "road_siren",
          expectedPriority: "urgent",
          expectedActionType: "physical",
          compressed: compressRoadAlertCue(audio.event === "siren" ? "siren" : "horn"),
        };
      }
      return {
        scenarioId: "live_loud_alert",
        expectedPriority: "high",
        expectedActionType: "physical",
        compressed: compressLiveLoudAlertUnknown(),
      };
    }
    case "doorbell": {
      if (atHome) {
        return {
          scenarioId: "doorbell",
          expectedPriority: "high",
          expectedActionType: override.deliveryExpected ? "physical" : "awareness",
          compressed: compressDoorbellCue(override.deliveryExpected),
        };
      }
      return {
        scenarioId: "live_doorbell",
        expectedPriority: "medium",
        expectedActionType: "awareness",
        compressed: compressLiveDoorbellUnknown(),
      };
    }
    case "knock": {
      return {
        scenarioId: atHome ? "live_knock_home" : "live_knock",
        expectedPriority: atHome ? "high" : "medium",
        expectedActionType: atHome ? "physical" : "awareness",
        compressed: compressLiveKnock(atHome),
      };
    }
    case "speech_nearby":
    case "name_called": {
      return {
        scenarioId: "live_speech_nearby",
        expectedPriority: "low",
        expectedActionType: "awareness",
        compressed: compressLiveSpeechNearby(),
      };
    }
    case "applause": {
      return {
        scenarioId: "live_applause",
        expectedPriority: "low",
        expectedActionType: "awareness",
        compressed: compressLiveApplause(),
      };
    }
    case "laughter": {
      return {
        scenarioId: "live_laughter",
        expectedPriority: "low",
        expectedActionType: "awareness",
        compressed: compressLiveLaughter(),
      };
    }
  }
}
