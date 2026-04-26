// JSON Schemas the LLM is asked to fill, plus tiny hand-rolled validators.
//
// IMPORTANT: OpenAI strict structured outputs require:
//   - every object has type=object, properties, required, additionalProperties:false
//   - "required" lists EVERY key in "properties" (optional fields stay required
//     but allow null via type:["string","null"] or similar union)
//   - this applies recursively to nested objects, including array item schemas
//
// We use a tiny helper, `strictObject`, so it's hard to forget any of those.
// `assertStrictOpenAiSchema` walks a schema and throws if any of those
// invariants is violated; tests use it to lock the contract in place.

import type {
  CueReasoningResult,
  ExtractedLlmItem,
  MemoryExtractionResult,
} from "./llmTypes";

type JsonSchema = Record<string, unknown>;

/**
 * Build an OpenAI-strict-compatible object schema. Every key in
 * `properties` is automatically added to `required`. Pass an explicit
 * `required` only when you intentionally want a subset (rare; OpenAI
 * strict mode disallows that — keep it, but it lets us write narrow
 * sub-schemas for tests).
 */
function strictObject(
  properties: Record<string, JsonSchema>,
  options: { description?: string } = {}
): JsonSchema {
  const required = Object.keys(properties);
  const schema: JsonSchema = {
    type: "object",
    additionalProperties: false,
    required,
    properties,
  };
  if (options.description) schema.description = options.description;
  return schema;
}

const KIND_VALUES = [
  "routine",
  "commitment",
  "important_item",
  "known_person",
  "location_rule",
  "preference",
  "ignore",
] as const;
const ACTION_VALUES = ["physical", "digital", "awareness", "none"] as const;
const PRIORITY_VALUES = ["low", "medium", "high", "urgent"] as const;

// Nested item schema. Every property is in `required`; optional fields use
// nullable union types so the model can still return null when unknown.
const MEMORY_ITEM_SCHEMA: JsonSchema = strictObject({
  kind: { type: "string", enum: [...KIND_VALUES] },
  label: { type: "string" },
  triggerDescription: { type: ["string", "null"] },
  actionType: { type: "string", enum: [...ACTION_VALUES] },
  actionLabel: { type: ["string", "null"] },
  person: { type: ["string", "null"] },
  deadlineText: { type: ["string", "null"] },
  locationLabel: { type: ["string", "null"] },
  // OpenAI strict mode requires nullable enums to include `null` in `enum`
  // and the union type `["string","null"]` on `type`.
  priority: {
    type: ["string", "null"],
    enum: [...PRIORITY_VALUES, null],
  },
  confidence: { type: "number" },
  save: { type: "boolean" },
  privacyNote: { type: ["string", "null"] },
});

export const MEMORY_EXTRACTION_SCHEMA: JsonSchema = strictObject({
  items: {
    type: "array",
    items: MEMORY_ITEM_SCHEMA,
  },
  confidence: { type: "number" },
  reason: { type: "string" },
});

export const CUE_REASONING_SCHEMA: JsonSchema = strictObject({
  shouldInterrupt: { type: "boolean" },
  cueText: { type: "string" },
  priority: { type: "string", enum: [...PRIORITY_VALUES] },
  actionType: {
    type: "string",
    enum: ["physical", "digital", "awareness"],
  },
  confidence: { type: "number" },
  reason: { type: "string" },
  memoryUsed: { type: "array", items: { type: "string" } },
  safetyLimits: { type: "array", items: { type: "string" } },
});

/**
 * Walk a JSON schema and assert it complies with OpenAI strict structured
 * outputs. Throws on the first violation with a path-aware message.
 */
export function assertStrictOpenAiSchema(
  schema: unknown,
  path: string[] = []
): void {
  const here = path.join(".") || "(root)";
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error(`${here}: not an object schema`);
  }
  const s = schema as JsonSchema;
  const type = s.type;
  if (type === "object") {
    if (!s.properties || typeof s.properties !== "object") {
      throw new Error(`${here}: object missing 'properties'`);
    }
    if (s.additionalProperties !== false) {
      throw new Error(`${here}: object missing 'additionalProperties: false'`);
    }
    if (!Array.isArray(s.required)) {
      throw new Error(`${here}: object missing 'required' array`);
    }
    const propKeys = Object.keys(s.properties as Record<string, unknown>);
    const required = s.required as string[];
    for (const key of propKeys) {
      if (!required.includes(key)) {
        throw new Error(
          `${here}: 'required' must include every property key — missing '${key}'`
        );
      }
    }
    for (const extra of required) {
      if (!propKeys.includes(extra)) {
        throw new Error(
          `${here}: 'required' references unknown property '${extra}'`
        );
      }
    }
    for (const [k, v] of Object.entries(
      s.properties as Record<string, JsonSchema>
    )) {
      assertStrictOpenAiSchema(v, [...path, "properties", k]);
    }
    return;
  }
  if (type === "array") {
    const items = s.items;
    if (!items) {
      throw new Error(`${here}: array missing 'items' schema`);
    }
    assertStrictOpenAiSchema(items, [...path, "items"]);
    return;
  }
  // Primitive types, including unions like ["string","null"]. Nothing else
  // to recurse into.
}

const VALID_KINDS = new Set<string>(KIND_VALUES);
const VALID_ACTION = new Set<string>(ACTION_VALUES);
const VALID_PRIORITY = new Set<string>(PRIORITY_VALUES);

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
        actionLabel: isStringOrNull(i.actionLabel)
          ? (i.actionLabel as string | null)
          : null,
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
