import { applyAnswerLocations } from "@/lib/analysis/localization";
import type { AnswerBlock } from "@/lib/types";
import { describe, expect, it } from "vitest";

describe("answer localization", () => {
  it("aligns a complete dense-page result by spatial reading order", () => {
    const blocks = [answer("q18", 18), answer("q19", 19), answer("q20", 20)];
    const result = applyAnswerLocations(blocks, [
      { targetIndex: 2, box_2d: [300, 100, 320, 300], confidence: 0.98 },
      { targetIndex: 0, box_2d: [100, 100, 120, 300], confidence: 0.98 },
      { targetIndex: 1, box_2d: [200, 100, 220, 300], confidence: 0.98 },
    ]);

    expect(result.map((block) => block.regions[0].box.y)).toEqual([100, 200, 300]);
  });

  it("uses explicit target indices when some locations are missing", () => {
    const blocks = [answer("q18", 18), answer("q19", 19), answer("q20", 20)];
    const result = applyAnswerLocations(blocks, [
      { targetIndex: 2, box_2d: [300, 100, 320, 300], confidence: 0.98 },
    ]);

    expect(result[0].regions[0].box.y).toBe(900);
    expect(result[2].regions[0].box.y).toBe(300);
  });
});

function answer(id: string, readingOrder: number): AnswerBlock {
  return {
    id,
    detectedLabel: id,
    normalizedDetectedLabel: id,
    transcription: id,
    pageNumber: 1,
    readingOrder,
    regions: [
      {
        id: `${id}-region`,
        pageNumber: 1,
        kind: "answer",
        box: { x: 100, y: 900, width: 200, height: 20 },
      },
    ],
    extractionConfidence: 1,
    continuesFromPrevious: false,
    continuesToNext: false,
  };
}
