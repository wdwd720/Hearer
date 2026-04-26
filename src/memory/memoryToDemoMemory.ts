// Adapter: turn a server/local-store MemorySummary into the in-engine
// DemoMemory shape. The engine functions don't need to know whether the
// data came from the API server or localStorage.

import type { MemorySummary } from "../../shared/types";
import type { DemoMemory, Task } from "../engine/types";

export function memorySummaryToDemoMemory(summary: MemorySummary): DemoMemory {
  const importantItems = summary.importantItems.map((i) => i.label);

  // Open commitments and any persisted routines surface as Tasks visible in the
  // memory panel. Status-mapping is best-effort.
  const openTasks: Task[] = [];
  for (const c of summary.commitments) {
    if (c.status === "done" || c.status === "ignored") continue;
    openTasks.push({
      id: c.id,
      label: c.task + (c.person ? ` — ${c.person}` : ""),
      type: c.actionType === "physical" ? "physical" : "digital",
      status: c.status === "drafted" ? "drafted" : "pending",
      person: c.person,
    });
  }

  const knownNames = ["Mihir", ...summary.knownPeople.map((p) => p.name)];

  return {
    userProfile: {
      name: summary.userProfile.displayName,
      knownNames: Array.from(new Set(knownNames)),
      alertStyle: summary.userProfile.alertStyle === "verbose" ? "standard" : "minimal",
      importantItems:
        importantItems.length > 0 ? importantItems : ["keys", "laptop", "wallet"],
    },
    locations: {
      home: {
        tasksOnExit: ["keys", "laptop"],
        relevantSounds: ["doorbell", "timer_beep", "alarm"],
      },
      kitchen: {
        relevantSounds: ["timer_beep", "alarm"],
        routines: ["cooking_watch"],
      },
      pharmacy: { tasksOnArrival: ["pick up prescription"] },
      clinic: { relevantSpeech: ["name_call", "clinic_call"] },
      street: { relevantSounds: ["horn", "siren"] },
    },
    routines: {
      cooking_watch: {
        trigger: "kitchen + cooking + timer",
        physicalAction: "check stove",
      },
      after_dinner_meds: {
        trigger: "home + evening + after meal",
        physicalAction: "take blue pill",
      },
    },
    openTasks,
    recentCues: [],
  };
}
