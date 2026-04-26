// JSON Schemas the LLM is asked to fill, plus tiny hand-rolled validators.
//
// Hand-rolled rather than zod because the schema surface is small and the
// dependency surface stays low — important for keeping the server cold-start
// fast and the dependency tree honest.

import type {
  CueReasoningResult,
  ExtractedLlmItem,
  MemoryExtractionResult,
} from "./llmTypes";

export const MEMORY_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items", "confidence", "reason"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "label", "actionType", "confidence", "save"],
        properties: {
          kind: {
            type: "string",
            enum: [
              "routine",
              "commitment",
              "important_item",
              "known_person",
              "location_rule",
              "preference",
              "ignore",
            ],
          },
          label: { type: "string" },
          triggerDescription: { type: ["string", "null"] },
          actionType: {
            type: "string",
            enum: ["physical", "digital", "awareness", "none"],
          },
          actionLabel: { type: ["string", "null"] },
          person: { type: ["string", "null"] },
          deadlineText: { type: ["string", "null"] },
          locationLabel: { type: ["string", "null"] },
          priority: {
            type: ["string", "null"],
            enum: ["low", "medium", "high", "urgent", null],
          },
          confidence: { type: "number" },
          save: { type: "boolean" },
          privacyNote: { type: ["string", "null"] },
        },
      },
    },
    confidence: { type: "number" },
    reason: { type: "string" },
  },
} as const;

export const CUE_REASONING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "shouldInterrupt",
    "cueText",
    "priority",
    "actionType",
    "confidence",
    "reason",
    "memoryUsed",
    "safetyLimits",
  ],
  properties: {
    shouldInterrupt: { type: "boolean" },
    cueText: { type: "string" },
    priority: {
      type: "string",
      enum: ["low", "medium", "high", "urgent"],
    },
    actionType: {
      type: "string",
      enum: ["physical", "digital", "awareness"],
    },
    confidence: { type: "number" },
    reason: { type: "string" },
    memoryUsed: { type: "array", items: { type: "string" } },
    safetyLimits: { type: "array", items: { type: "string" } },
  },
} as const;

const VALID_KINDS = new Set([
  "routine",
  "commitment",
  "important_item",
  "known_person",
  "location_rule",
  "preference",
  "ignore",
]);
const VALID_ACTION = new Set(["physical", "digital", "awareness", "none"]);
const VALID_PRIORITY = new Set(["low", "medium", "high", "urgent"]);

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

export interface ValidationOutcome<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

export function validateMemoryExtraction(
  raw: unknown
): ValidationOutcome<MemoryExtractionResult> {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["root is not an object"] };
  }
  const obj = raw as Record<string, unknown>;
  const items = obj.items;
  if (!Array.isArray(items)) {
    errors.push("`items` must be an array");
  }
  const cleaned: ExtractedLlmItem[] = [];
  if (Array.isArray(items)) {
    items.forEach((it, idx) => {
      if (!it || typeof it !== "object") {
        errors.push(`items[${idx}] is not an object`);
        return;
      }
      const i = it as Record<string, unknown>;
      const kind = String(i.kind ?? "");
      if (!VALID_KINDS.has(kind)) {
        errors.push(`items[${idx}].kind invalid: "${kind}"`);
        return;
      }
      const actionType = String(i.actionType ?? "");
      if (!VALID_ACTION.has(actionType)) {
        errors.push(`items[${idx}].actionType invalid`);
        return;
      }
      if (typeof i.label !== "string" || i.label.trim().length === 0) {
        errors.push(`items[${idx}].label missing`);
        return;
      }
      if (typeof i.confidence !== "number") {
        errors.push(`items[${idx}].confidence missing/non-number`);
        return;
      }
      if (typeof i.save !== "boolean") {
        errors.push(`items[${idx}].save must be boolean`);
        return;
      }
      if (i.priority !== null && i.priority !== undefined) {
        if (typeof i.priority !== "string" || !VALID_PRIORITY.has(i.priority)) {
          errors.push(`items[${idx}].priority invalid`);
          return;
        }
      }
      cleaned.push({
        kind: kind as ExtractedLlmItem["kind"],
        label: String(i.label).trim(),
        triggerDescription: isStringOrNull(i.triggerDescription)
          ? (i.triggerDescription as string | null)
          : null,
        actionType: actionType as ExtractedLlmItem["actionType"],
        actionLabel: isStringOrNull(i.actionLabel) ? (i.actionLabel as string | null) : null,
        person: isStringOrNull(i.person) ? (i.person as string | null) : null,
        deadlineText: isStringOrNull(i.deadlineText)
          ? (i.deadlineText as string | null)
          : null,
        locationLabel: isStringOrNull(i.locationLabel)
          ? (i.locationLabel as string | null)
          : null,
        priority: (i.priority ?? null) as ExtractedLlmItem["priority"],
        confidence: clamp01(Number(i.confidence)),
        save: Boolean(i.save),
        privacyNote: isStringOrNull(i.privacyNote)
          ? (i.privacyNote as string | null)
          : null,
      });
    });
  }
  if (typeof obj.confidence !== "number") errors.push("confidence missing");
  if (typeof obj.reason !== "string") errors.push("reason missing");
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      items: cleaned,
      confidence: clamp01(Number(obj.confidence)),
      reason: String(obj.reason),
      rawSource: "llm",
    },
    errors: [],
  };
}

export function validateCueReasoning(
  raw: unknown
): ValidationOutcome<CueReasoningResult> {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["root is not an object"] };
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.shouldInterrupt !== "boolean") errors.push("shouldInterrupt");
  if (typeof obj.cueText !== "string") errors.push("cueText");
  const priority = String(obj.priority ?? "");
  if (!VALID_PRIORITY.has(priority)) errors.push("priority invalid");
  const actionType = String(obj.actionType ?? "");
  if (!["physical", "digital", "awareness"].includes(actionType))
    errors.push("actionType invalid");
  if (typeof obj.confidence !== "number") errors.push("confidence");
  if (typeof obj.reason !== "string") errors.push("reason");
  if (!Array.isArray(obj.memoryUsed)) errors.push("memoryUsed");
  if (!Array.isArray(obj.safetyLimits)) errors.push("safetyLimits");
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      shouldInterrupt: obj.shouldInterrupt as boolean,
      cueText: String(obj.cueText),
      priority: priority as CueReasoningResult["priority"],
      actionType: actionType as CueReasoningResult["actionType"],
      confidence: clamp01(Number(obj.confidence)),
      reason: String(obj.reason),
      memoryUsed: (obj.memoryUsed as unknown[]).map(String),
      safetyLimits: (obj.safetyLimits as unknown[]).map(String),
      rawSource: "llm",
    },
    errors: [],
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
