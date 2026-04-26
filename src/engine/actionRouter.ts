import type {
  ContextState,
  Cue,
  DigitalAction,
  ScenarioDefinition,
} from "./types";

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

export interface RoutedActions {
  digitalActions: DigitalAction[];
  // Physical actions are surfaced via the HUD cue itself; we still describe
  // them here so the action panel can label what the phone *did not* automate.
  physicalDescription?: string;
  awarenessDescription?: string;
}

export function routeActions(
  scenario: ScenarioDefinition,
  cue: Cue,
  context: ContextState
): RoutedActions {
  const digital: DigitalAction[] = [];

  switch (scenario.id) {
    case "kitchen_timer": {
      digital.push({
        id: nextId("act"),
        type: "simulate_vibration",
        label: "Urgent phone vibration simulated",
        status: "simulated",
        payload: { pattern: "urgent" },
      });
      return {
        digitalActions: digital,
        physicalDescription: "Check the stove. HUD shows the cue.",
      };
    }
    case "leaving_home": {
      // Pure physical — phone does not automate. Shown as cue on HUD only.
      return {
        digitalActions: [],
        physicalDescription: `Grab ${context.importantItems
          .slice(0, 2)
          .join(" + ")}. HUD shows the cue.`,
      };
    }
    case "doorbell": {
      digital.push({
        id: nextId("act"),
        type: "simulate_vibration",
        label: "Soft phone vibration simulated",
        status: "simulated",
        payload: { pattern: "soft" },
      });
      return {
        digitalActions: digital,
        physicalDescription: "Answer the door if expected.",
        awarenessDescription: "Audio awareness cue surfaced on HUD.",
      };
    }
    case "name_called": {
      return {
        digitalActions: [],
        awarenessDescription:
          "Awareness cue only — the user decides how to respond.",
      };
    }
    case "promise_jason": {
      digital.push({
        id: nextId("act"),
        type: "save_memory",
        label: "Saved commitment: send Jason the deck",
        status: "completed",
        payload: { person: "Jason", asset: "deck" },
      });
      digital.push({
        id: nextId("act"),
        type: "draft_text",
        label: "Draft prepared for Jason",
        status: "prepared",
        payload: {
          to: "Jason",
          body: "Hey Jason — sending the deck over tonight.",
        },
      });
      digital.push({
        id: nextId("act"),
        type: "create_reminder",
        label: "Reminder: send deck to Jason tonight",
        status: "prepared",
        payload: { when: "tonight" },
      });
      return {
        digitalActions: digital,
        awarenessDescription:
          "HUD confirms in one line — phone handles the digital follow-up.",
      };
    }
    case "road_siren": {
      digital.push({
        id: nextId("act"),
        type: "simulate_vibration",
        label: "Urgent directional vibration simulated (left)",
        status: "simulated",
        payload: { pattern: "urgent", direction: "left" },
      });
      return {
        digitalActions: digital,
        physicalDescription: "Look left, slow down. HUD shows the alert.",
      };
    }
    case "clinic_call": {
      digital.push({
        id: nextId("act"),
        type: "open_directions",
        label: "Indoor directions to Room 204 prepared",
        status: "prepared",
      });
      return {
        digitalActions: digital,
        physicalDescription: "Go to Room 204. HUD shows the cue.",
      };
    }
    case "pharmacy_arrival": {
      digital.push({
        id: nextId("act"),
        type: "create_reminder",
        label: "Reminder kept active: pick up prescription",
        status: "prepared",
      });
      return {
        digitalActions: digital,
        physicalDescription: "Walk in and pick up. HUD surfaces the task.",
      };
    }
    case "evening_meds": {
      digital.push({
        id: nextId("act"),
        type: "create_reminder",
        label: "Reminder logged: after-dinner medication",
        status: "prepared",
      });
      return {
        digitalActions: digital,
        physicalDescription: "Take the blue pill. HUD shows the cue.",
      };
    }

    // Live-audio scenarios — synthesised on the fly in liveAudioDecision.
    case "live_timer":
    case "live_alarm": {
      digital.push({
        id: nextId("act"),
        type: "simulate_vibration",
        label: "Phone vibration simulated for live audio alert",
        status: "simulated",
        payload: { pattern: "alert" },
      });
      return {
        digitalActions: digital,
        physicalDescription: "Live audio alert. HUD shows the cue.",
      };
    }
    case "live_loud_alert": {
      digital.push({
        id: nextId("act"),
        type: "simulate_vibration",
        label: "Urgent phone vibration simulated (loud alert)",
        status: "simulated",
        payload: { pattern: "urgent" },
      });
      return {
        digitalActions: digital,
        physicalDescription: "Loud alert detected. HUD shows the cue.",
      };
    }
    case "live_doorbell":
    case "live_knock":
    case "live_knock_home": {
      digital.push({
        id: nextId("act"),
        type: "simulate_vibration",
        label: "Soft phone vibration simulated",
        status: "simulated",
        payload: { pattern: "soft" },
      });
      return {
        digitalActions: digital,
        physicalDescription: "Door-side audio detected. HUD shows the cue.",
      };
    }
    case "live_speech_nearby":
    case "live_applause":
    case "live_laughter": {
      return {
        digitalActions: [],
        awarenessDescription:
          "Awareness cue only — no transcript inferred from audio.",
      };
    }

    default: {
      return {
        digitalActions: [],
        awarenessDescription: "No action routed.",
      };
    }
  }
  // Unreachable, but TS noUnusedParameters likes the cue param to be referenced.
  void cue;
}
