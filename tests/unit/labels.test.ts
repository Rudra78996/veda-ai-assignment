import {
  detectQuestionLabel,
  labelsMatch,
  normalizeQuestionLabel,
} from "@/lib/analysis/labels";
import { describe, expect, it } from "vitest";

describe("question label normalization", () => {
  it.each([
    ["Q. 11 (a)", "11a"],
    ["Question 2 (ii)", "2ii"],
    [" 4-B ", "4b"],
    [null, ""],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeQuestionLabel(input)).toBe(expected);
  });

  it("matches punctuation aliases", () => {
    expect(labelsMatch("Q11-a", "11 (a)")).toBe(true);
    expect(labelsMatch("11 (a)", "11 (b)")).toBe(false);
  });

  it("matches common handwritten answer prefixes to question labels", () => {
    expect(normalizeQuestionLabel("Ans 2(b)")).toBe("2b");
    expect(normalizeQuestionLabel("Answer: 4")).toBe("4");
    expect(labelsMatch("Question 6", "Q.6")).toBe(true);
  });

  it("ignores descriptive text and continuation markers after a label", () => {
    expect(normalizeQuestionLabel("Q2 - Three schema architecture")).toBe("2");
    expect(normalizeQuestionLabel("Q2 continued")).toBe("2");
    expect(normalizeQuestionLabel("Answer 4(b) - BCNF")).toBe("4b");
  });

  it("recovers an explicit label from the first transcription line", () => {
    expect(detectQuestionLabel(null, "Answer 4\nSELECT * FROM Employee")).toBe("4");
    expect(detectQuestionLabel(null, "A DBMS reduces duplication.")).toBeNull();
  });
});
