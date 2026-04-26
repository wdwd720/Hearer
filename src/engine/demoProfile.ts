import type { DemoMemory, Task } from "./types";

const baseTasks: Task[] = [
  {
    id: "pickup_prescription",
    label: "Pick up prescription",
    type: "physical",
    status: "pending",
    trigger: "pharmacy + arriving",
  },
  {
    id: "send_jason_deck",
    label: "Send Jason the deck",
    type: "digital",
    status: "pending",
    person: "Jason",
  },
  {
    id: "bring_laptop",
    label: "Bring laptop",
    type: "physical",
    status: "pending",
    trigger: "home + leaving + hackathon",
  },
];

export const demoProfile: DemoMemory = {
  userProfile: {
    name: "Mihir",
    knownNames: ["Mihir", "Mom", "Jason", "Dr. Patel"],
    alertStyle: "minimal",
    importantItems: ["keys", "laptop", "wallet"],
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
    pharmacy: {
      tasksOnArrival: ["pick up prescription"],
    },
    clinic: {
      relevantSpeech: ["name_call", "clinic_call"],
    },
    street: {
      relevantSounds: ["horn", "siren"],
    },
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
  openTasks: baseTasks,
  recentCues: [],
};

export function cloneDemoProfile(): DemoMemory {
  return JSON.parse(JSON.stringify(demoProfile)) as DemoMemory;
}
