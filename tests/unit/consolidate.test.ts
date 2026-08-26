import { consolidateAnswers, consolidateQuestions } from "@/lib/analysis/consolidate";
import type { AnswerBlock, ExtractedQuestion } from "@/lib/types";
import { describe, expect, it } from "vitest";

describe("cross-page consolidation", () => {
  it("preserves printed page order rather than numeric label order", () => {
    const result = consolidateQuestions([
      [question("q10", "10", 1, 0)],
      [question("q2", "2", 2, 0)],
    ]);
    expect(result.map((item) => item.originalLabel)).toEqual(["10", "2"]);
    expect(result.map((item) => item.orderIndex)).toEqual([0, 1]);
  });

  it("joins answer continuations and retains both page regions", () => {
    const first = answer("a1", 1, false, true);
    const second = answer("a2", 2, true, false);
    const result = consolidateAnswers([[first], [second]]);
    expect(result).toHaveLength(1);
    expect(result[0].regions.map((region) => region.pageNumber)).toEqual([1, 2]);
    expect(result[0].transcription).toContain("page 1");
    expect(result[0].transcription).toContain("page 2");
  });

  it("joins a repeated verbose label at adjacent page boundaries without AI flags", () => {
    const first = answer("a1", 2, false, false);
    first.detectedLabel = "Q2 - Three schema architecture";
    first.transcription = "The remaining explanation is continued on the next page.";
    const second = answer("a2", 3, false, false);
    second.detectedLabel = "Q2 continued";
    second.transcription = "Q2 continued with an example.";

    const result = consolidateAnswers([[first], [second]]);
    expect(result).toHaveLength(1);
    expect(result[0].normalizedDetectedLabel).toBe("2");
    expect(result[0].regions.map((region) => region.pageNumber)).toEqual([2, 3]);
  });
});

function question(
  id: string,
  originalLabel: string,
  pageNumber: number,
  readingOrder: number,
): ExtractedQuestion {
  return {
    id,
    originalLabel,
    normalizedLabel: originalLabel,
    parentLabel: null,
    subpartLabel: null,
    sharedStem: null,
    text: "Question",
    fullText: "Question",
    maxMarks: null,
    orderIndex: 0,
    pageNumber,
    readingOrder,
    sourceRegions: [],
    extractionConfidence: 1,
    continuesFromPrevious: false,
    continuesToNext: false,
  };
}

function answer(
  id: string,
  pageNumber: number,
  continuesFromPrevious: boolean,
  continuesToNext: boolean,
): AnswerBlock {
  return {
    id,
    detectedLabel: "1",
    normalizedDetectedLabel: "1",
    transcription: `Answer page ${pageNumber}`,
    pageNumber,
    readingOrder: 0,
    regions: [
      {
        id: `r${pageNumber}`,
        pageNumber,
        kind: continuesFromPrevious ? "continuation" : "answer",
        box: { x: 100, y: 100, width: 500, height: 100 },
      },
    ],
    extractionConfidence: 1,
    continuesFromPrevious,
    continuesToNext,
  };
}
