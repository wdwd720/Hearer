import { describe, expect, it } from "vitest";
import {
  CUE_REASONING_SCHEMA,
  MEMORY_EXTRACTION_SCHEMA,
  assertStrictOpenAiSchema,
} from "../llm/llmSchemas";

const KIND_KEYS = [
  "kind",
  "label",
  "triggerDescription",
  "actionType",
  "actionLabel",
  "person",
  "deadlineText",
  "locationLabel",
  "priority",
  "confidence",
  "save",
  "privacyNote",
];

describe("OpenAI strict structured output schemas", () => {
  it("MEMORY_EXTRACTION_SCHEMA passes assertStrictOpenAiSchema", () => {
    expect(() => assertStrictOpenAiSchema(MEMORY_EXTRACTION_SCHEMA)).not.toThrow();
  });

  it("CUE_REASONING_SCHEMA passes assertStrictOpenAiSchema", () => {
    expect(() => assertStrictOpenAiSchema(CUE_REASONING_SCHEMA)).not.toThrow();
  });

  it("nested memory item schema lists every property in `required`", () => {
    const s = MEMORY_EXTRACTION_SCHEMA as {
      properties: { items: { items: { required: string[]; properties: Record<string, unknown> } } };
    };
    const item = s.properties.items.items;
    for (const key of KIND_KEYS) {
      expect(item.required).toContain(key);
      expect(Object.keys(item.properties)).toContain(key);
    }
    // strict mode forbids extras and partial required
    expect(item.required.sort()).toEqual(
      Object.keys(item.properties).sort()
    );
  });

  it("the assertion catches a schema with a missing `required` entry", () => {
    const broken = {
      type: "object",
      additionalProperties: false,
      required: ["a"], // intentionally missing 'b'
      properties: { a: { type: "string" }, b: { type: "string" } },
    };
    expect(() => assertStrictOpenAiSchema(broken)).toThrow(/'required' must include/);
  });

  it("the assertion catches a schema missing `additionalProperties: false`", () => {
    const broken = {
      type: "object",
      required: ["a"],
      properties: { a: { type: "string" } },
    };
    expect(() => assertStrictOpenAiSchema(broken)).toThrow(/additionalProperties/);
  });

  it("the assertion recurses into array item schemas", () => {
    const broken = {
      type: "object",
      additionalProperties: false,
      required: ["arr"],
      properties: {
        arr: {
          type: "array",
          items: {
            // Inner object is missing `additionalProperties: false`.
            type: "object",
            required: ["x"],
            properties: { x: { type: "string" } },
          },
        },
      },
    };
    expect(() => assertStrictOpenAiSchema(broken)).toThrow(/additionalProperties/);
  });
});
