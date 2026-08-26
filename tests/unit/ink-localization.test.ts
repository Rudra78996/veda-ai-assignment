import { snapDenseAnswerLocationsToInk } from "@/lib/analysis/ink-localization";
import type { AnswerLocation } from "@/lib/analysis/localization";
import type { AnswerBlock } from "@/lib/types";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

describe("dense handwritten answer localization", () => {
  it("discards a blank leading prediction and snaps MCQs to real ink rows", async () => {
    const width = 600;
    const height = 800;
    const inkRows = Array.from({ length: 8 }, (_, index) => 100 + index * 70);
    const image = await sharp({
      create: { width, height, channels: 3, background: "white" },
    })
      .composite(
        inkRows.map((top) => ({
          input: {
            create: {
              width: 60,
              height: 12,
              channels: 3,
              background: { r: 25, g: 55, b: 190 },
            },
          },
          left: 60,
          top,
        })),
      )
      .png()
      .toBuffer();

    const blocks = Array.from({ length: 8 }, (_, index) => answer(index));
    const shiftedLocations: AnswerLocation[] = Array.from({ length: 8 }, (_, index) => ({
      targetIndex: index,
      box_2d:
        index === 0
          ? [20, 100, 45, 200]
          : [
              (inkRows[index - 1] / height) * 1000,
              100,
              ((inkRows[index - 1] + 12) / height) * 1000,
              200,
            ],
      confidence: 0.95,
    }));

    const snapped = await snapDenseAnswerLocationsToInk(
      image,
      blocks,
      shiftedLocations,
    );
    const ordered = [...snapped].sort((a, b) => a.targetIndex - b.targetIndex);

    expect(ordered).toHaveLength(8);
    expect(ordered[0].box_2d[0]).toBeGreaterThan(110);
    expect(ordered[0].box_2d[0]).toBeLessThan(130);
    expect(ordered[1].box_2d[0]).toBeGreaterThan(195);
  });

  it("uses compact geometry when Gemini returns verbose MCQ wording", async () => {
    const width = 600;
    const height = 800;
    const inkRows = Array.from({ length: 6 }, (_, index) => 120 + index * 80);
    const image = await sharp({
      create: { width, height, channels: 3, background: "white" },
    })
      .composite(
        inkRows.map((top) => ({
          input: {
            create: {
              width: 65,
              height: 12,
              channels: 3,
              background: { r: 20, g: 60, b: 180 },
            },
          },
          left: 60,
          top,
        })),
      )
      .png()
      .toBuffer();
    const blocks = Array.from({ length: 6 }, (_, index) => ({
      ...answer(index),
      transcription: "The selected option is A",
      regions: [
        {
          ...answer(index).regions[0],
          box: { x: 100, y: 20, width: 110, height: 35 },
        },
      ],
    }));

    const snapped = await snapDenseAnswerLocationsToInk(image, blocks, []);
    expect(snapped).toHaveLength(6);
    expect(snapped[0].box_2d[0]).toBeGreaterThan(135);
  });

  it("snaps the entire numeric run when a few Gemini regions look non-compact", async () => {
    const width = 600;
    const height = 800;
    const inkRows = Array.from({ length: 7 }, (_, index) => 100 + index * 85);
    const image = await sharp({
      create: { width, height, channels: 3, background: "white" },
    })
      .composite(
        inkRows.map((top) => ({
          input: {
            create: {
              width: 70,
              height: 12,
              channels: 3,
              background: { r: 30, g: 55, b: 185 },
            },
          },
          left: 60,
          top,
        })),
      )
      .png()
      .toBuffer();
    const blocks = Array.from({ length: 7 }, (_, index) => {
      const block = answer(index);
      if (index === 2 || index === 5) {
        block.transcription = "The selected answer appears to be option A";
        block.regions[0].box = { x: 100, y: 20, width: 500, height: 200 };
      }
      return block;
    });

    const snapped = await snapDenseAnswerLocationsToInk(image, blocks, []);
    expect(snapped).toHaveLength(7);
    expect(snapped.map((location) => location.targetIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

function answer(index: number): AnswerBlock {
  return {
    id: `answer-${index + 1}`,
    detectedLabel: String(index + 1),
    normalizedDetectedLabel: String(index + 1),
    transcription: "A",
    pageNumber: 1,
    readingOrder: index,
    regions: [
      {
        id: `region-${index + 1}`,
        pageNumber: 1,
        kind: "answer",
        box: { x: 100, y: 20, width: 100, height: 25 },
      },
    ],
    extractionConfidence: 1,
    continuesFromPrevious: false,
    continuesToNext: false,
  };
}
