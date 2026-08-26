import {
  applySemanticMatches,
  buildDeterministicMappings,
} from "@/lib/analysis/mapping";
import type { AnswerBlock, ExtractedQuestion } from "@/lib/types";
import { describe, expect, it } from "vitest";

const questions = [question("q1", "1"), question("q2a", "2 (a)")];
const answers = [answer("a2", "2a"), answer("a-unlabelled", null)];

describe("answer mapping", () => {
  it("maps exact aliases without AI and leaves missing questions unanswered", () => {
    const result = buildDeterministicMappings(questions, answers);
    expect(result.mappings[1]).toMatchObject({
      questionId: "q2a",
      answerBlockIds: ["a2"],
      status: "answered",
    });
    expect(result.mappings[0].status).toBe("unanswered");
    expect(result.unresolvedAnswerIds).toEqual(["a-unlabelled"]);
  });

  it("applies confident semantic mappings and keeps weak matches unmatched", () => {
    const base = buildDeterministicMappings(questions, answers).mappings;
    const confident = applySemanticMatches(base, [
      {
        answerBlockId: "a-unlabelled",
        questionId: "q1",
        confidence: 0.86,
        reason: "The content answers question 1.",
      },
    ]);
    expect(confident.mappings[0].status).toBe("answered");
    expect(confident.unmatched).toEqual([]);

    const weak = applySemanticMatches(base, [
      {
        answerBlockId: "a-unlabelled",
        questionId: "q1",
        confidence: 0.42,
        reason: "Uncertain.",
      },
    ]);
    expect(weak.unmatched).toEqual(["a-unlabelled"]);
  });
});

function question(id: string, originalLabel: string): ExtractedQuestion {
  return {
    id,
    originalLabel,
    normalizedLabel: originalLabel.replace(/[^a-z0-9]/gi, "").toLowerCase(),
    parentLabel: null,
    subpartLabel: null,
    sharedStem: null,
    text: "Question text",
    fullText: "Question text",
    maxMarks: 1,
    orderIndex: 0,
    pageNumber: 1,
    readingOrder: 0,
    sourceRegions: [],
    extractionConfidence: 1,
    continuesFromPrevious: false,
    continuesToNext: false,
  };
}

function answer(id: string, detectedLabel: string | null): AnswerBlock {
  return {
    id,
    detectedLabel,
    normalizedDetectedLabel: detectedLabel ?? "",
    transcription: "Answer text",
    pageNumber: 1,
    readingOrder: 0,
    regions: [],
    extractionConfidence: 1,
    continuesFromPrevious: false,
    continuesToNext: false,
  };
}
