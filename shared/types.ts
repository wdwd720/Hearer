// Shared types between the Hearer Memory API server and the frontend.
//
// Keep this file dependency-free. The frontend imports it directly from
// `../../shared/types`; the server imports it via the same relative path.

export type AlertStyle = "minimal" | "balanced" | "verbose";
export type InterruptionMode = "low" | "normal" | "high";

export type Importance = "low" | "normal" | "high";

export type ItemContext =
  | "leaving_home"
  | "school"
  | "hackathon"
  | "clinic"
  | "travel"
  | "custom";

export type LocationType =
  | "home"
  | "school"
  | "clinic"
  | "pharmacy"
  | "street"
  | "event"
  | "custom";

export type RoutineTriggerType =
  | "time"
  | "location"
  | "context"
  | "sound"
  | "speech"
  | "combined";

export type ActionType = "physical" | "digital" | "awareness";

export type CommitmentStatus = "pending" | "drafted" | "done" | "ignored";

export type CueFeedback = "helpful" | "too_much" | "wrong" | "missed";

export type ContextEventSource =
  | "audio"
  | "speech"
  | "location"
  | "motion"
  | "calendar"
  | "manual"
  | "system";

export type Priority = "low" | "medium" | "high" | "urgent";

export interface UserProfile {
  id: string;
  displayName: string;
  alertStyle: AlertStyle;
  interruptionMode: InterruptionMode;
  createdAt: string;
  updatedAt: string;
}

export interface KnownPerson {
  id: string;
  name: string;
  aliases: string[];
  importance: Importance;
  relationship?: string;
  createdAt: string;
}

export interface ImportantItem {
  id: string;
  label: string;
  contexts: ItemContext[];
  priority: Priority;
  createdAt: string;
}

export interface LocationMemory {
  id: string;
  label: string;
  type: LocationType;
  cuesOnArrival: string[];
  cuesOnExit: string[];
  relevantSounds: string[];
  createdAt: string;
}

export interface Routine {
  id: string;
  name: string;
  triggerType: RoutineTriggerType;
  triggerDescription: string;
  actionType: ActionType;
  actionLabel: string;
  enabled: boolean;
  confidence: number;
  source: "typed" | "speech" | "manual" | "demo" | "extracted";
  createdAt: string;
  updatedAt: string;
}

export interface Commitment {
  id: string;
  person?: string;
  task: string;
  deadlineText?: string;
  deadlineIso?: string;
  actionType: ActionType;
  status: CommitmentStatus;
  source: "speech" | "typed" | "manual" | "demo";
  createdAt: string;
  updatedAt: string;
}

export interface ContextEventRecord {
  id: string;
  source: ContextEventSource;
  payload: unknown;
  createdAt: string;
}

export interface CueRecord {
  id: string;
  cueText: string;
  priority: Priority;
  actionType: ActionType;
  sourceEventId?: string;
  wasShown: boolean;
  userFeedback?: CueFeedback;
  feedbackAt?: string;
  createdAt: string;
}

export interface AudioDetectionRecord {
  id: string;
  label: string;
  confidence: number;
  source: string;
  contextSnapshot?: unknown;
  routedCueId?: string;
  createdAt: string;
}

export interface MemorySummary {
  userProfile: UserProfile;
  knownPeople: KnownPerson[];
  importantItems: ImportantItem[];
  routines: Routine[];
  commitments: Commitment[];
  locations: LocationMemory[];
  recentCues: CueRecord[];
}

export interface ExtractedRoutine {
  type: "routine";
  name: string;
  triggerType: RoutineTriggerType;
  triggerDescription: string;
  actionType: ActionType;
  actionLabel: string;
}

export interface ExtractedCommitment {
  type: "commitment";
  person?: string;
  task: string;
  deadlineText?: string;
  actionType: ActionType;
}

export interface ExtractedItem {
  type: "item";
  label: string;
  contexts: ItemContext[];
  priority: Priority;
}

export interface ExtractedPerson {
  type: "person";
  name: string;
  importance: Importance;
}

export type ExtractedMemory =
  | ExtractedRoutine
  | ExtractedCommitment
  | ExtractedItem
  | ExtractedPerson;

export interface ExtractResponse {
  extracted: ExtractedMemory[];
  notes?: string[];
}

export interface ApiHealth {
  ok: boolean;
  service: "hearer-memory-api";
  storage: "sqlite" | "json";
  version: string;
}
