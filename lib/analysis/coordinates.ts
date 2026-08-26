import type { AnswerBlock, NormalizedBox } from "@/lib/types";

export function clampBox(box: NormalizedBox): NormalizedBox {
  const x = clamp(box.x, 0, 1000);
  const y = clamp(box.y, 0, 1000);
  const width = clamp(box.width, 1, 1000 - x);
  const height = clamp(box.height, 1, 1000 - y);

  return { x, y, width, height };
}

export function padBox(box: NormalizedBox, padding = 8): NormalizedBox {
  return clampBox({
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + padding * 2,
    height: box.height + padding * 2,
  });
}

export function geminiBox2dToNormalizedBox(
  box2d: readonly number[],
): NormalizedBox {
  if (box2d.length !== 4) {
    throw new Error("Gemini box_2d must contain exactly four coordinates.");
  }
  const [rawYMin, rawXMin, rawYMax, rawXMax] = box2d;
  const yMin = clamp(rawYMin, 0, 1000);
  const xMin = clamp(rawXMin, 0, 1000);
  const yMax = clamp(rawYMax, yMin + 1, 1000);
  const xMax = clamp(rawXMax, xMin + 1, 1000);

  return clampBox({
    x: xMin,
    y: yMin,
    width: xMax - xMin,
    height: yMax - yMin,
  });
}

export function boxToPercent(box: NormalizedBox) {
  const safe = clampBox(box);
  return {
    left: `${safe.x / 10}%`,
    top: `${safe.y / 10}%`,
    width: `${safe.width / 10}%`,
    height: `${safe.height / 10}%`,
  };
}

/**
 * Vision models occasionally return a box that continues through the next
 * labelled response. Use the other detected response starts as hard vertical
 * boundaries while preserving disjoint regions belonging to the same answer.
 */
export function tightenAnswerRegions(blocks: AnswerBlock[]): AnswerBlock[] {
  const entries = blocks.flatMap((block) =>
    block.regions.map((region) => ({ blockId: block.id, region })),
  );

  return blocks.map((block) => ({
    ...block,
    regions: block.regions.map((region) => {
      const box = clampBox(region.box);
      const nextStart = entries
        .filter(
          (entry) =>
            entry.blockId !== block.id &&
            entry.region.pageNumber === region.pageNumber &&
            entry.region.box.y > box.y + 6 &&
            hasMeaningfulHorizontalOverlap(box, entry.region.box),
        )
        .map((entry) => clampBox(entry.region.box).y)
        .sort((a, b) => a - b)[0];

      if (nextStart === undefined || box.y + box.height <= nextStart) {
        return { ...region, box };
      }

      const bottom = Math.max(box.y + 8, nextStart - 4);
      return {
        ...region,
        box: clampBox({ ...box, height: bottom - box.y }),
      };
    }),
  }));
}

function hasMeaningfulHorizontalOverlap(a: NormalizedBox, b: NormalizedBox) {
  const safeA = clampBox(a);
  const safeB = clampBox(b);
  const overlap = Math.max(
    0,
    Math.min(safeA.x + safeA.width, safeB.x + safeB.width) - Math.max(safeA.x, safeB.x),
  );
  return overlap / Math.min(safeA.width, safeB.width) >= 0.35;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
