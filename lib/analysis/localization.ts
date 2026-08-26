import { geminiBox2dToNormalizedBox } from "@/lib/analysis/coordinates";
import type { AnswerBlock } from "@/lib/types";

export type AnswerLocation = {
  targetIndex: number;
  box_2d: readonly number[];
  confidence: number;
};

export function applyAnswerLocations(
  blocks: AnswerBlock[],
  locations: AnswerLocation[],
): AnswerBlock[] {
  if (blocks.length === 0 || locations.length === 0) return blocks;

  const orderedBlocks = [...blocks].sort(
    (a, b) => a.readingOrder - b.readingOrder || a.id.localeCompare(b.id),
  );
  const validLocations = locations.filter(
    (location) =>
      location.targetIndex >= 0 &&
      location.targetIndex < orderedBlocks.length &&
      location.confidence >= 0.45,
  );

  const locationByBlockId = new Map<string, AnswerLocation>();
  if (validLocations.length === orderedBlocks.length) {
    const spatiallyOrdered = [...validLocations].sort(
      (a, b) => a.box_2d[0] - b.box_2d[0] || a.box_2d[1] - b.box_2d[1],
    );
    orderedBlocks.forEach((block, index) => {
      locationByBlockId.set(block.id, spatiallyOrdered[index]);
    });
  } else {
    for (const location of validLocations) {
      const block = orderedBlocks[location.targetIndex];
      if (block && !locationByBlockId.has(block.id)) {
        locationByBlockId.set(block.id, location);
      }
    }
  }

  return blocks.map((block) => {
    const location = locationByBlockId.get(block.id);
    const seedRegion = block.regions[0];
    if (!location || !seedRegion) return block;

    return {
      ...block,
      regions: [
        {
          ...seedRegion,
          id: `${seedRegion.id}-localized`,
          box: geminiBox2dToNormalizedBox(location.box_2d),
        },
      ],
    };
  });
}
