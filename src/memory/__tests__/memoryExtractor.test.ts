import { describe, expect, it } from "vitest";
import { extractMemoryRules } from "../../../shared/memoryExtractorCore";

describe("rule-based memory extractor", () => {
  it("saves a routine from 'When I leave home for school, remind me to bring my laptop.'", () => {
    const result = extractMemoryRules(
      "When I leave home for school, remind me to bring my laptop."
    );
    const routine = result.extracted.find((e) => e.type === "routine");
    expect(routine).toBeDefined();
    if (routine && routine.type === "routine") {
      expect(routine.triggerDescription.toLowerCase()).toContain("home");
      expect(routine.triggerDescription.toLowerCase()).toContain("school");
      expect(routine.actionLabel.toLowerCase()).toContain("laptop");
      expect(routine.actionType).toBe("physical");
    }
  });

  it("saves a commitment from \"I'll send Jason the deck tonight.\"", () => {
    const result = extractMemoryRules("I'll send Jason the deck tonight.");
    const commitment = result.extracted.find((e) => e.type === "commitment");
    expect(commitment).toBeDefined();
    if (commitment && commitment.type === "commitment") {
      expect(commitment.person).toBe("Jason");
      expect(commitment.task.toLowerCase()).toContain("deck");
      expect(commitment.deadlineText?.toLowerCase()).toBe("tonight");
      expect(commitment.actionType).toBe("digital");
    }
    const person = result.extracted.find((e) => e.type === "person");
    expect(person).toBeDefined();
    if (person && person.type === "person") {
      expect(person.name).toBe("Jason");
    }
  });

  it("saves a pharmacy routine from 'At the pharmacy, remind me to pick up my prescription.'", () => {
    const result = extractMemoryRules(
      "At the pharmacy, remind me to pick up my prescription."
    );
    const routine = result.extracted.find((e) => e.type === "routine");
    expect(routine).toBeDefined();
    if (routine && routine.type === "routine") {
      expect(routine.triggerDescription.toLowerCase()).toContain("pharmacy");
      expect(routine.actionLabel.toLowerCase()).toContain("prescription");
    }
  });

  it("returns an explanatory note for ambiguous input", () => {
    const result = extractMemoryRules("Hello there");
    expect(result.extracted).toHaveLength(0);
    expect((result.notes ?? []).length).toBeGreaterThan(0);
  });
});
