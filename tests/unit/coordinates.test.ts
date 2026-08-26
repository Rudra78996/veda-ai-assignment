import {
  boxToPercent,
  clampBox,
  geminiBox2dToNormalizedBox,
  padBox,
  tightenAnswerRegions,
} from "@/lib/analysis/coordinates";
import type { AnswerBlock } from "@/lib/types";
import { describe, expect, it } from "vitest";

describe("normalized coordinates", () => {
  it("clamps boxes to the page", () => {
    expect(clampBox({ x: -20, y: 980, width: 1100, height: 80 })).toEqual({
      x: 0,
      y: 980,
      width: 1000,
      height: 20,
    });
  });

  it("converts boxes into zoom-independent percentages", () => {
    expect(boxToPercent({ x: 100, y: 250, width: 500, height: 100 })).toEqual({
      left: "10%",
      top: "25%",
      width: "50%",
      height: "10%",
    });
  });

  it("converts Gemini's native corner coordinates into dimensions", () => {
    expect(geminiBox2dToNormalizedBox([250, 100, 400, 900])).toEqual({
      x: 100,
      y: 250,
      width: 800,
      height: 150,
    });
  });

  it("pads without leaving the page", () => {
    expect(padBox({ x: 2, y: 2, width: 50, height: 50 }, 8)).toEqual({
      x: 0,
      y: 0,
      width: 66,
      height: 66,
    });
  });

  it("clips an oversized answer region before the next answer starts", () => {
    const blocks = [
      answer("a1", 200, 400),
      answer("a4", 410, 90),
      answer("a6", 530, 80),
    ];

    const tightened = tightenAnswerRegions(blocks);
    expect(tightened[0].regions[0].box).toEqual({
      x: 100,
      y: 200,
      width: 800,
      height: 206,
    });
    expect(tightened[1].regions[0].box.height).toBe(90);
  });

  it("does not use a separate column as a vertical boundary", () => {
    const left = answer("left", 100, 400, 80, 360);
    const right = answer("right", 180, 100, 560, 360);
    expect(tightenAnswerRegions([left, right])[0].regions[0].box.height).toBe(400);
  });
});

function answer(
  id: string,
  y: number,
  height: number,
  x = 100,
  width = 800,
): AnswerBlock {
  return {
    id,
    detectedLabel: id,
    normalizedDetectedLabel: id,
    transcription: id,
    pageNumber: 1,
    readingOrder: 0,
    regions: [
      {
        id: `${id}-region`,
        pageNumber: 1,
        kind: "answer",
        box: { x, y, width, height },
      },
    ],
    extractionConfidence: 1,
    continuesFromPrevious: false,
    continuesToNext: false,
  };
}
