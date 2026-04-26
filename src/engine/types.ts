// Core types for the Hearer engine.
//
// The phone is the brain. The HUD is the final compressed output.
// These types describe the signals the agent receives, the context
// it builds up, the cue it surfaces, and the actions it routes.

export type Priority = "low" | "medium" | "high" | "urgent";

export type ActionType = "physical" | "digital" | "awareness";

export type SignalKind =
  | "audio"
  | "speech"
  | "location"
  | "calendar"
  | "motion"
  | "routine"
  | "memory";

export type AudioEvent =
  | "timer_beep"
  | "doorbell"
  | "alarm"
  | "siren"
  | "horn"
  | "name_called"
  | "laughter"
  | "applause";

export type SpeechIntent =
  | "question"
  | "instruction"
  | "deadline"
  | "commitment"
  | "name_call"
  | "clinic_call";

export type LocationName =
  | "home"
  | "kitchen"
  | "street"
  | "clinic"
  | "school"
  | "pharmacy"
  | "event"
  | "unknown";

export type MotionActivity =
  | "stationary"
  | "walking"
  | "leaving"
  | "arriving"
  | "cooking"
  | "meeting"
  | "unknown";

export interface AudioSignal {
  kind: "audio";
  event: AudioEvent;
  confidence: number;
  timestamp: string;
  direction?: "front" | "left" | "right" | "behind" | "unknown";
}

export interface SpeechSignal {
  kind: "speech";
  transcript: string;
  intent?: SpeechIntent;
  confidence: number;
  timestamp: string;
}

export interface LocationSignal {
  kind: "location";
  location: LocationName;
  transition?: "arriving" | "leaving" | "stationary";
  confidence: number;
  timestamp: string;
}

export interface CalendarSignal {
  kind: "calendar";
  label: string;
  confidence: number;
  timestamp: string;
}

export interface MotionSignal {
  kind: "motion";
  activity: MotionActivity;
  confidence: number;
  timestamp: string;
}

export interface RoutineSignal {
  kind: "routine";
  routineId: string;
  label: string;
  confidence: number;
  timestamp: string;
}

export interface MemorySignal {
  kind: "memory";
  label: string;
  refId?: string;
  confidence: number;
  timestamp: string;
}

export type Signal =
  | AudioSignal
  | SpeechSignal
  | LocationSignal
  | CalendarSignal
  | MotionSignal
  | RoutineSignal
  | MemorySignal;

export interface Task {
  id: string;
  label: string;
  type: "physical" | "digital";
  status: "pending" | "done" | "drafted" | "ignored";
  trigger?: string;
  person?: string;
}

export interface ContextState {
  location: LocationName;
  activity: MotionActivity;
  calendarContext?: string;
  activeRoutines: string[];
  knownPeople: string[];
  openTasks: Task[];
  importantItems: string[];
  signalsCombined: number;
}

export interface Cue {
  id: string;
  text: string;
  priority: Priority;
  reason: string;
  actionType: ActionType;
  confidence: number;
  timestamp: string;
  signalsUsed: string[];
}

export type DigitalActionType =
  | "draft_text"
  | "open_directions"
  | "save_memory"
  | "create_reminder"
  | "notify_contact"
  | "simulate_vibration";

export interface DigitalAction {
  id: string;
  type: DigitalActionType;
  label: string;
  payload?: Record<string, unknown>;
  status: "prepared" | "simulated" | "completed";
}

export interface ReasoningStep {
  label: string;
  detail?: string;
}

export interface DecisionResult {
  scenarioId: string;
  title: string;
  signals: Signal[];
  context: ContextState;
  cue: Cue;
  actions: DigitalAction[];
  reasoningSteps: ReasoningStep[];
  suppressedCues?: Cue[];
}

export type ScenarioCategory =
  | "Safety"
  | "Memory"
  | "Hearing"
  | "Speech"
  | "Digital"
  | "Clinic";

export interface ScenarioDefinition {
  id: string;
  title: string;
  category: ScenarioCategory;
  description: string;
  signals: Signal[];
  contextPatch: Partial<ContextState>;
  expectedActionType: ActionType;
  expectedPriority: Priority;
}

export interface DemoMemory {
  userProfile: {
    name: string;
    knownNames: string[];
    alertStyle: "minimal" | "standard";
    importantItems: string[];
  };
  locations: Record<
    string,
    {
      tasksOnExit?: string[];
      tasksOnArrival?: string[];
      relevantSounds?: AudioEvent[];
      routines?: string[];
      relevantSpeech?: SpeechIntent[];
    }
  >;
  routines: Record<
    string,
    {
      trigger: string;
      physicalAction?: string;
      digitalAction?: string;
    }
  >;
  openTasks: Task[];
  recentCues: Cue[];
}

export interface EventLogEntry {
  id: string;
  timestamp: string;
  scenarioId: string;
  scenarioTitle: string;
  cueText: string;
  priority: Priority;
  actionType: ActionType;
  reasoningSteps: ReasoningStep[];
  signalKinds: SignalKind[];
}
