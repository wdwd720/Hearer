// Pure rule-based memory extractor.
//
// Lives in shared/ so both the Node server and the browser fallback path
// can use the same logic without depending on each other.
//
// Returns a list of structured memory descriptors. Persisting them is the
// caller's job.

import type {
  ActionType,
  ExtractResponse,
  ExtractedCommitment,
  ExtractedItem,
  ExtractedMemory,
  ExtractedPerson,
  ExtractedRoutine,
  ItemContext,
  RoutineTriggerType,
} from "./types";

const KNOWN_LOCATIONS: Array<{
  keyword: RegExp;
  label: string;
  contextHint?: ItemContext;
}> = [
  { keyword: /\bhome\b/i, label: "home", contextHint: "leaving_home" },
  { keyword: /\bschool\b/i, label: "school", contextHint: "school" },
  { keyword: /\bhackathon\b/i, label: "hackathon", contextHint: "hackathon" },
  { keyword: /\bclinic\b/i, label: "clinic", contextHint: "clinic" },
  { keyword: /\bpharmacy\b/i, label: "pharmacy" },
  { keyword: /\bkitchen\b/i, label: "kitchen" },
  { keyword: /\bstreet\b/i, label: "street" },
  { keyword: /\bevent\b/i, label: "event" },
];

function inferActionType(text: string, fallback: ActionType): ActionType {
  if (/\b(send|email|text|message|draft|reminder)\b/i.test(text)) return "digital";
  if (/\b(bring|grab|take|carry|check|pick up|go|stop|turn off|answer)\b/i.test(text)) return "physical";
  return fallback;
}

function normaliseSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

interface ParsedTrigger {
  triggerType: RoutineTriggerType;
  triggerDescription: string;
  contexts: ItemContext[];
}

function parseTrigger(text: string): ParsedTrigger {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  const contexts = new Set<ItemContext>();

  for (const loc of KNOWN_LOCATIONS) {
    if (loc.keyword.test(lower)) {
      matched.push(loc.label);
      if (loc.contextHint) contexts.add(loc.contextHint);
    }
  }

  let triggerType: RoutineTriggerType = "context";
  if (/\bleav(e|ing)\b/i.test(lower)) triggerType = "context";
  if (/\barriv(e|ing)\b|\bat\b/i.test(lower)) triggerType = "location";
  if (/\b(timer|alarm|beep|siren|horn|knock|doorbell)\b/i.test(lower))
    triggerType = "sound";
  if (
    /\b(every|when I|after|before|tonight|morning|evening|usually)\b/i.test(
      lower
    )
  )
    triggerType = matched.length > 0 ? "combined" : "time";

  let triggerDescription = matched.join(" + ");
  if (/\bleav(e|ing)\b/i.test(lower) && matched.includes("home")) {
    triggerDescription = matched.includes("school")
      ? "leaving home + school"
      : "leaving home";
  }
  if (/\barriving|\bat\b/i.test(lower) && matched.length > 0) {
    triggerDescription = `arriving at ${matched[matched.length - 1]}`;
  }
  if (
    /\b(after dinner|evening|cook(ing)?|stove|kitchen|beep|timer)\b/i.test(
      lower
    )
  ) {
    const parts = ["evening", "home/kitchen", "timer/beep"];
    triggerDescription = parts.join(" + ");
  }
  if (!triggerDescription) triggerDescription = normaliseSpaces(text).slice(0, 60);

  return { triggerType, triggerDescription, contexts: [...contexts] };
}

function extractActionLabel(text: string): string | null {
  const remindMatch = text.match(
    /\b(?:remind me to|remind myself to|i need to|i should|don'?t forget to|please remind me to)\s+([^.]+)/i
  );
  if (remindMatch) return normaliseSpaces(remindMatch[1]);

  const rememberMatch = text.match(/\bremember to\s+([^.]+)/i);
  if (rememberMatch) return normaliseSpaces(rememberMatch[1]);

  const bringMatch = text.match(/\b(bring|grab|take|pick up|check|turn off)\s+([^.]+)/i);
  if (bringMatch) return normaliseSpaces(`${bringMatch[1]} ${bringMatch[2]}`);

  return null;
}

function stripDeadline(s: string): string {
  return s.replace(
    /\b(tonight|tomorrow|today|this (?:morning|afternoon|evening)|by [a-z0-9: ]+|in \d+ (?:hours|minutes|days))\b/gi,
    ""
  );
}

function extractDeadline(s: string): string | undefined {
  const m = s.match(
    /\b(tonight|tomorrow|today|this (?:morning|afternoon|evening)|by [a-z0-9: ]+|in \d+ (?:hours|minutes|days))\b/i
  );
  return m ? m[0].trim() : undefined;
}

function extractCommitment(text: string): ExtractedCommitment | null {
  const commitmentMatch = text.match(
    /\bI(?:'ll| will|'ve got to|'m going to|'m gonna)\s+([^.]+)/i
  );
  if (!commitmentMatch) return null;

  const tail = commitmentMatch[1];
  const withPerson = tail.match(
    /^(send|email|text|message|call|meet|tell|ask|remind)\s+([A-Z][a-zA-Z]+|the|a)\s+(.+)$/i
  );

  let person: string | undefined;
  let task: string;
  if (withPerson) {
    const verb = withPerson[1];
    const maybePerson = withPerson[2];
    const rest = withPerson[3];
    if (/^[A-Z]/.test(maybePerson)) {
      person = maybePerson;
      task = `${verb} ${stripDeadline(rest).trim()}`;
    } else {
      task = `${verb} ${maybePerson} ${stripDeadline(rest).trim()}`;
    }
  } else {
    task = stripDeadline(tail).trim();
  }

  task = task.replace(/\s+/g, " ").replace(/[.!?]+$/, "");
  if (person) {
    task = task
      .replace(new RegExp(`\\b${person}\\b`, "i"), "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const deadlineText = extractDeadline(tail);
  const actionType = inferActionType(text, "digital");

  return { type: "commitment", person, task, deadlineText, actionType };
}

function extractItems(text: string): ExtractedItem[] {
  const importanceMatch = text.match(
    /\bmy\s+([^.]+?)\s+(?:matter|are important|need to come with me)\b/i
  );
  if (!importanceMatch) return [];
  const list = importanceMatch[1]
    .split(/(?:,|\band\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const contexts: ItemContext[] = /\bleave home\b/i.test(text)
    ? ["leaving_home"]
    : ["custom"];
  return list.map((label) => ({
    type: "item",
    label,
    contexts,
    priority: "high",
  }));
}

function extractPeopleFromName(name?: string): ExtractedPerson[] {
  if (!name) return [];
  return [{ type: "person", name, importance: "normal" }];
}

function deriveRoutineName(action: string, trigger: string): string {
  const cleanedAction = action.replace(/^(bring|grab|pick up|check|turn off)\s+/i, "");
  const noun = cleanedAction.split(" ").slice(0, 3).join(" ");
  // Cooking / stove takes precedence over location triggers — the user is
  // teaching a sound-driven safety cue, not a leaving-home cue.
  if (
    /\b(stove|oven|kitchen|cook(ing)?|beep|timer|after dinner|evening)\b/i.test(
      action + " " + trigger
    )
  ) {
    return "Cooking timer safety cue";
  }
  if (trigger.includes("pharmacy")) return `Pick up at pharmacy`;
  if (trigger.includes("school")) return `Bring ${noun} for school`;
  if (trigger.includes("leaving home")) return `Leaving home: ${noun}`;
  return action.length > 40 ? action.slice(0, 39) + "…" : action;
}

export function extractMemoryRules(text: string): ExtractResponse {
  const trimmed = normaliseSpaces(text);
  if (!trimmed) return { extracted: [], notes: ["empty input"] };
  const lower = trimmed.toLowerCase();
  const extracted: ExtractedMemory[] = [];
  const notes: string[] = [];

  const isRoutine =
    /\b(when|whenever|every time|at\b|usually|after dinner|after lunch|after breakfast|before bed|before dinner|in the (?:morning|evening))\b/i.test(
      lower
    ) &&
    /\b(remind me|i need to|don'?t forget|i should|remember to|bring|pick up|check|turn off|grab)\b/i.test(
      lower
    );
  if (isRoutine) {
    const trigger = parseTrigger(trimmed);
    const action = extractActionLabel(trimmed);
    if (action) {
      const routine: ExtractedRoutine = {
        type: "routine",
        name: deriveRoutineName(action, trigger.triggerDescription),
        triggerType: trigger.triggerType,
        triggerDescription: trigger.triggerDescription,
        actionType: inferActionType(action, "physical"),
        actionLabel: action,
      };
      extracted.push(routine);
    } else {
      notes.push("Could not extract action from routine sentence.");
    }
  }

  const commitment = extractCommitment(trimmed);
  if (commitment) extracted.push(commitment);

  const items = extractItems(trimmed);
  extracted.push(...items);

  if (commitment?.person) extracted.push(...extractPeopleFromName(commitment.person));

  if (extracted.length === 0) {
    notes.push(
      "No structured memory matched. Try phrases like 'When I leave home for school, remind me to bring my laptop.'"
    );
  }
  return { extracted, notes };
}
