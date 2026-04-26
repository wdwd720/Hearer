import type {
  AudioEvent,
  AudioSignal,
  CalendarSignal,
  LocationName,
  LocationSignal,
  MemorySignal,
  MotionActivity,
  MotionSignal,
  RoutineSignal,
  ScenarioDefinition,
  SpeechIntent,
  SpeechSignal,
} from "./types";

const ts = (offsetSeconds = 0) => {
  // Stable-ish timestamps for demos. The exact value doesn't matter for the UI;
  // this is mostly for ordering and display.
  const base = Date.now() - 1500 + offsetSeconds * 1000;
  return new Date(base).toISOString();
};

const sig = {
  audio: (
    event: AudioEvent,
    confidence = 0.92,
    direction: "front" | "left" | "right" | "behind" | "unknown" = "front"
  ): AudioSignal => ({
    kind: "audio",
    event,
    confidence,
    direction,
    timestamp: ts(0),
  }),
  speech: (
    transcript: string,
    intent: SpeechIntent,
    confidence = 0.88
  ): SpeechSignal => ({
    kind: "speech",
    transcript,
    intent,
    confidence,
    timestamp: ts(1),
  }),
  location: (
    location: LocationName,
    transition?: "arriving" | "leaving" | "stationary",
    confidence = 0.95
  ): LocationSignal => ({
    kind: "location",
    location,
    transition,
    confidence,
    timestamp: ts(-1),
  }),
  calendar: (label: string, confidence = 0.8): CalendarSignal => ({
    kind: "calendar",
    label,
    confidence,
    timestamp: ts(-2),
  }),
  motion: (
    activity: MotionActivity,
    confidence = 0.9
  ): MotionSignal => ({
    kind: "motion",
    activity,
    confidence,
    timestamp: ts(-1),
  }),
  routine: (
    routineId: string,
    label: string,
    confidence = 0.85
  ): RoutineSignal => ({
    kind: "routine",
    routineId,
    label,
    confidence,
    timestamp: ts(-2),
  }),
  memory: (
    label: string,
    refId?: string,
    confidence = 0.9
  ): MemorySignal => ({
    kind: "memory",
    label,
    refId,
    confidence,
    timestamp: ts(-3),
  }),
};

export const scenarios: ScenarioDefinition[] = [
  {
    id: "kitchen_timer",
    title: "Kitchen timer beeping",
    category: "Safety",
    description: "Repeated beep at home in the kitchen while cooking.",
    signals: [
      sig.audio("timer_beep", 0.94),
      sig.location("kitchen", "stationary", 0.96),
      sig.motion("cooking", 0.9),
      sig.routine("cooking_watch", "Cooking watch active", 0.88),
      sig.memory("User sometimes misses kitchen timers", "user-misses-timers"),
    ],
    contextPatch: {
      location: "kitchen",
      activity: "cooking",
      activeRoutines: ["cooking_watch"],
      calendarContext: undefined,
    },
    expectedActionType: "physical",
    expectedPriority: "urgent",
  },
  {
    id: "leaving_home",
    title: "Leaving home",
    category: "Memory",
    description: "Front door opening; calendar shows hackathon today.",
    signals: [
      sig.location("home", "leaving", 0.93),
      sig.motion("leaving", 0.9),
      sig.calendar("Hackathon — AGI House Build Day", 0.82),
      sig.memory("Important items: keys, laptop, wallet", "important-items"),
    ],
    contextPatch: {
      location: "home",
      activity: "leaving",
      calendarContext: "Hackathon — AGI House Build Day",
      activeRoutines: [],
    },
    expectedActionType: "physical",
    expectedPriority: "high",
  },
  {
    id: "doorbell",
    title: "Doorbell / delivery",
    category: "Hearing",
    description: "Doorbell sound at home, delivery expected.",
    signals: [
      sig.audio("doorbell", 0.91, "front"),
      sig.location("home", "stationary", 0.95),
      sig.calendar("Package out for delivery", 0.7),
      sig.memory("Open task: package pickup expected", "delivery-expected"),
    ],
    contextPatch: {
      location: "home",
      activity: "stationary",
      calendarContext: "Package out for delivery",
      activeRoutines: [],
    },
    expectedActionType: "awareness",
    expectedPriority: "high",
  },
  {
    id: "name_called",
    title: "Name called / question",
    category: "Speech",
    description:
      "Direct question to the user during a hackathon event — “Mihir, are you ready to demo?”",
    signals: [
      sig.speech(
        "Mihir, are you ready to demo?",
        "question",
        0.86
      ),
      sig.location("event", "stationary", 0.85),
      sig.calendar("Hackathon — AGI House Build Day", 0.82),
      sig.memory("Known name: Mihir", "name-mihir"),
    ],
    contextPatch: {
      location: "event",
      activity: "stationary",
      calendarContext: "Hackathon — AGI House Build Day",
      activeRoutines: [],
    },
    expectedActionType: "awareness",
    expectedPriority: "high",
  },
  {
    id: "promise_jason",
    title: "Promise made: send deck",
    category: "Digital",
    description:
      "User says “I'll send Jason the deck tonight.” — phone prepares the digital action.",
    signals: [
      sig.speech(
        "I'll send Jason the deck tonight.",
        "commitment",
        0.9
      ),
      sig.memory("Known contact: Jason", "contact-jason"),
      sig.calendar("Tonight — open evening", 0.6),
    ],
    contextPatch: {
      location: "unknown",
      activity: "unknown",
      activeRoutines: [],
    },
    expectedActionType: "digital",
    expectedPriority: "medium",
  },
  {
    id: "road_siren",
    title: "Road siren / horn",
    category: "Safety",
    description: "Walking on the street; a horn / siren is detected nearby.",
    signals: [
      sig.audio("horn", 0.93, "left"),
      sig.location("street", "stationary", 0.9),
      sig.motion("walking", 0.88),
    ],
    contextPatch: {
      location: "street",
      activity: "walking",
      activeRoutines: [],
    },
    expectedActionType: "physical",
    expectedPriority: "urgent",
  },
  {
    id: "clinic_call",
    title: "Clinic: room called",
    category: "Clinic",
    description:
      "At the clinic — “Mihir Modi? Room 204 down the hall.”",
    signals: [
      sig.speech(
        "Mihir Modi? Room 204 down the hall.",
        "clinic_call",
        0.89
      ),
      sig.location("clinic", "stationary", 0.95),
      sig.memory("Known name: Mihir", "name-mihir"),
    ],
    contextPatch: {
      location: "clinic",
      activity: "stationary",
      activeRoutines: [],
    },
    expectedActionType: "physical",
    expectedPriority: "high",
  },
  {
    id: "pharmacy_arrival",
    title: "Arriving at pharmacy",
    category: "Memory",
    description:
      "Arrived at the pharmacy — open task: pick up prescription.",
    signals: [
      sig.location("pharmacy", "arriving", 0.94),
      sig.motion("arriving", 0.86),
      sig.memory("Open task: pick up prescription", "pickup_prescription"),
    ],
    contextPatch: {
      location: "pharmacy",
      activity: "arriving",
      activeRoutines: [],
    },
    expectedActionType: "physical",
    expectedPriority: "medium",
  },
  {
    id: "evening_meds",
    title: "After-dinner medication",
    category: "Memory",
    description:
      "Evening routine at home — after-dinner medication reminder.",
    signals: [
      sig.location("home", "stationary", 0.95),
      sig.motion("stationary", 0.9),
      sig.calendar("Evening — after dinner", 0.8),
      sig.routine("after_dinner_meds", "After dinner meds", 0.9),
    ],
    contextPatch: {
      location: "home",
      activity: "stationary",
      activeRoutines: ["after_dinner_meds"],
      calendarContext: "Evening — after dinner",
    },
    expectedActionType: "physical",
    expectedPriority: "medium",
  },
];

export function getScenario(id: string): ScenarioDefinition | undefined {
  return scenarios.find((s) => s.id === id);
}
