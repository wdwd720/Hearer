import type {
  ContextState,
  Priority,
  ScenarioDefinition,
  Signal,
} from "./types";

export interface PriorityResult {
  priority: Priority;
  explanation: string;
  score: number;
}

const PRIORITY_RANK: Record<Priority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  urgent: 3,
};

function bumpUp(p: Priority): Priority {
  switch (p) {
    case "low":
      return "medium";
    case "medium":
      return "high";
    case "high":
      return "urgent";
    case "urgent":
      return "urgent";
  }
}

function bumpDown(p: Priority): Priority {
  switch (p) {
    case "urgent":
      return "high";
    case "high":
      return "medium";
    case "medium":
      return "low";
    case "low":
      return "low";
  }
}

export function scorePriority(
  scenario: ScenarioDefinition,
  signals: Signal[],
  context: ContextState
): PriorityResult {
  let priority: Priority = scenario.expectedPriority;
  const reasons: string[] = [];

  // Confidence: average across signals (excluding memory/routine which are static).
  const live = signals.filter(
    (s) => s.kind !== "memory" && s.kind !== "routine"
  );
  const avgConf =
    live.length > 0
      ? live.reduce((acc, s) => acc + s.confidence, 0) / live.length
      : 0.8;

  // Context match boosts. Each signal kind beyond the first counts as a fusion.
  const distinctKinds = new Set(signals.map((s) => s.kind));
  if (distinctKinds.size >= 3) {
    reasons.push(`Multi-signal fusion (${distinctKinds.size} kinds)`);
  }

  // Safety scenarios cap at urgent.
  switch (scenario.id) {
    case "kitchen_timer":
      reasons.push("Timer + kitchen + cooking → safety-critical");
      if (avgConf > 0.9) priority = "urgent";
      else priority = "high";
      break;
    case "road_siren":
      reasons.push("Vehicle audio while walking on street");
      priority = "urgent";
      break;
    case "doorbell":
      reasons.push("Doorbell at home — awareness boost for HoH");
      priority = avgConf > 0.85 ? "high" : "medium";
      break;
    case "leaving_home":
      reasons.push("Door + leaving + calendar match → high");
      priority = "high";
      break;
    case "name_called":
      reasons.push("Direct address with known name");
      priority = avgConf > 0.85 ? "high" : "medium";
      break;
    case "promise_jason":
      reasons.push("Commitment intent — digital, non-urgent");
      priority = "medium";
      break;
    case "clinic_call":
      reasons.push("Clinic announcement matched user");
      priority = "high";
      break;
    case "pharmacy_arrival":
      reasons.push("Arrival + open task → actionable now");
      priority = "medium";
      break;
    case "evening_meds":
      reasons.push("Evening routine + home → soft reminder");
      priority = "medium";
      break;
    default:
      reasons.push("No specific rule, default scenario priority");
  }

  // Soft confidence guard: very low confidence → degrade one notch.
  if (avgConf < 0.6) {
    priority = bumpDown(priority);
    reasons.push("Low confidence — softened priority");
  }

  // If activity strongly matches expected (e.g. cooking + kitchen), nudge up
  // for safety-style scenarios that haven't already been pinned to urgent.
  if (
    scenario.id === "kitchen_timer" &&
    context.activity === "cooking" &&
    context.location === "kitchen" &&
    PRIORITY_RANK[priority] < PRIORITY_RANK["urgent"]
  ) {
    priority = bumpUp(priority);
    reasons.push("Location + activity match boosted priority");
  }

  return {
    priority,
    explanation: reasons.join(" · "),
    score: PRIORITY_RANK[priority] + Math.min(avgConf, 0.99),
  };
}
