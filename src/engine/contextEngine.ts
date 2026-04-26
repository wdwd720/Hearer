import { compressCandidateCue } from "./cueCompressor";
import { scorePriority } from "./priorityEngine";
import { routeActions } from "./actionRouter";
import type {
  ContextState,
  Cue,
  DecisionResult,
  DemoMemory,
  ReasoningStep,
  ScenarioDefinition,
  Signal,
} from "./types";

function buildBaseContext(memory: DemoMemory): ContextState {
  return {
    location: "unknown",
    activity: "unknown",
    activeRoutines: [],
    knownPeople: [...memory.userProfile.knownNames],
    openTasks: [...memory.openTasks],
    importantItems: [...memory.userProfile.importantItems],
    signalsCombined: 0,
  };
}

function applySignalsToContext(
  base: ContextState,
  signals: Signal[]
): ContextState {
  const next: ContextState = {
    ...base,
    activeRoutines: [...base.activeRoutines],
  };

  for (const signal of signals) {
    switch (signal.kind) {
      case "location":
        next.location = signal.location;
        break;
      case "motion":
        next.activity = signal.activity;
        break;
      case "calendar":
        next.calendarContext = signal.label;
        break;
      case "routine":
        if (!next.activeRoutines.includes(signal.routineId)) {
          next.activeRoutines.push(signal.routineId);
        }
        break;
      default:
        break;
    }
  }

  next.signalsCombined = signals.length;
  return next;
}

function reasoningFor(
  scenario: ScenarioDefinition,
  signals: Signal[],
  context: ContextState
): ReasoningStep[] {
  const steps: ReasoningStep[] = [];
  const kinds = new Set(signals.map((s) => s.kind));

  steps.push({
    label: `Scenario triggered: ${scenario.title}`,
    detail: scenario.description,
  });

  if (kinds.has("audio")) {
    const audio = signals.find((s) => s.kind === "audio");
    if (audio && audio.kind === "audio") {
      steps.push({
        label: `Detected audio: ${audio.event.replace("_", " ")}`,
        detail: `confidence ${(audio.confidence * 100).toFixed(0)}%${
          audio.direction ? ` · direction ${audio.direction}` : ""
        }`,
      });
    }
  }

  if (kinds.has("speech")) {
    const speech = signals.find((s) => s.kind === "speech");
    if (speech && speech.kind === "speech") {
      steps.push({
        label: `Speech intent: ${speech.intent ?? "unknown"}`,
        detail: `“${speech.transcript.slice(0, 60)}${
          speech.transcript.length > 60 ? "…" : ""
        }”`,
      });
    }
  }

  if (kinds.has("location") || kinds.has("motion")) {
    steps.push({
      label: `Context match: ${context.location} · ${context.activity}`,
      detail: context.calendarContext
        ? `Calendar: ${context.calendarContext}`
        : undefined,
    });
  }

  if (kinds.has("routine")) {
    const r = signals.find((s) => s.kind === "routine");
    if (r && r.kind === "routine") {
      steps.push({
        label: `Routine active: ${r.label}`,
      });
    }
  }

  if (kinds.has("memory")) {
    const m = signals.find((s) => s.kind === "memory");
    if (m && m.kind === "memory") {
      steps.push({
        label: `Memory used: ${m.label}`,
      });
    }
  }

  steps.push({
    label: `Signals combined: ${signals.length}`,
    detail: `${[...kinds].join(", ")}`,
  });

  return steps;
}

export interface DecideInput {
  scenario: ScenarioDefinition;
  memory: DemoMemory;
}

export function decide({ scenario, memory }: DecideInput): DecisionResult {
  // Build the enriched context.
  const base = buildBaseContext(memory);
  const enriched = applySignalsToContext(base, scenario.signals);

  // Apply scenario-level context patches (overrides for activity/location etc).
  const context: ContextState = {
    ...enriched,
    ...scenario.contextPatch,
    activeRoutines:
      scenario.contextPatch.activeRoutines ?? enriched.activeRoutines,
    knownPeople: enriched.knownPeople,
    openTasks: enriched.openTasks,
    importantItems: enriched.importantItems,
    signalsCombined: enriched.signalsCombined,
  };

  // Compress the cue.
  const compressed = compressCandidateCue({
    scenarioId: scenario.id,
    signals: scenario.signals,
    context,
  });

  // Score priority with full context.
  const priority = scorePriority(scenario, scenario.signals, context);

  // Build cue object.
  const avgConfidence =
    scenario.signals.reduce((acc, s) => acc + s.confidence, 0) /
    Math.max(1, scenario.signals.length);

  const cue: Cue = {
    id: `cue_${scenario.id}_${Date.now()}`,
    text: compressed.text,
    priority: priority.priority,
    reason: `${compressed.reason} · ${priority.explanation}`,
    actionType: compressed.actionType,
    confidence: Math.round(avgConfidence * 100) / 100,
    timestamp: new Date().toISOString(),
    signalsUsed: scenario.signals.map((s) => s.kind),
  };

  // Route actions.
  const routed = routeActions(scenario, cue, context);

  // Build reasoning trail.
  const reasoningSteps = [
    ...reasoningFor(scenario, scenario.signals, context),
    {
      label: `Priority assigned: ${priority.priority}`,
      detail: priority.explanation,
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
    signals: scenario.signals,
    context,
    cue,
    actions: routed.digitalActions,
    reasoningSteps,
  };
}
