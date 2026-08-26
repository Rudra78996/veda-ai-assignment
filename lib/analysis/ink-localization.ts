import type { AnswerLocation } from "@/lib/analysis/localization";
import type { AnswerBlock } from "@/lib/types";
import sharp from "sharp";

type InkBand = {
  yMin: number;
  yMax: number;
  xMin: number;
  xMax: number;
  inkPixels: number;
};

export async function snapDenseAnswerLocationsToInk(
  image: Buffer,
  orderedBlocks: AnswerBlock[],
  locations: AnswerLocation[],
): Promise<AnswerLocation[]> {
  const compactEvidenceIndices = orderedBlocks
    .map((block, targetIndex) => ({ block, targetIndex }))
    .filter(({ block }) => isCompactAnswer(block))
    .map(({ targetIndex }) => targetIndex);
  if (compactEvidenceIndices.length < 5) return locations;

  const firstCompact = compactEvidenceIndices[0];
  const lastCompact = compactEvidenceIndices.at(-1)!;
  const denseIndices = orderedBlocks
    .map((block, targetIndex) => ({ block, targetIndex }))
    .filter(
      ({ block, targetIndex }) =>
        targetIndex >= firstCompact &&
        targetIndex <= lastCompact &&
        /^\d+[a-z0-9]*$/i.test(block.normalizedDetectedLabel ?? ""),
    )
    .map(({ targetIndex }) => targetIndex);
  const evidenceRatio = compactEvidenceIndices.length / Math.max(denseIndices.length, 1);
  if (denseIndices.length < 5 || evidenceRatio < 0.6) return locations;

  const denseIndexSet = new Set(denseIndices);
  const suppliedByIndex = new Map(
    locations
      .filter((location) => denseIndexSet.has(location.targetIndex))
      .map((location) => [location.targetIndex, location]),
  );
  const denseLocations = denseIndices.map((targetIndex) => {
    const supplied = suppliedByIndex.get(targetIndex);
    if (supplied) return supplied;

    const box = orderedBlocks[targetIndex].regions[0]?.box;
    if (!box) return null;
    return {
      targetIndex,
      box_2d: [box.y, box.x, box.y + box.height, box.x + box.width],
      confidence: 0.5,
    } satisfies AnswerLocation;
  }).filter((location): location is AnswerLocation => location !== null);
  if (denseLocations.length !== denseIndices.length) return locations;

  const xMins = denseLocations.map((location) => location.box_2d[1]).sort(numberSort);
  const xMaxes = denseLocations.map((location) => location.box_2d[3]).sort(numberSort);
  let roiXMin = percentile(xMins, 0.3) - 18;
  let roiXMax = percentile(xMaxes, 0.7) + 18;
  const center = (roiXMin + roiXMax) / 2;
  if (roiXMax - roiXMin < 65) {
    roiXMin = center - 32.5;
    roiXMax = center + 32.5;
  }
  roiXMin = clamp(roiXMin, 0, 1000);
  roiXMax = clamp(roiXMax, 0, 1000);
  if (roiXMax - roiXMin > 280) return locations;

  const { data, info } = await sharp(image)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const xStart = Math.floor((roiXMin / 1000) * info.width);
  const xEnd = Math.ceil((roiXMax / 1000) * info.width);
  const bands = detectInkBands(data, info.width, info.height, xStart, xEnd);
  const selectedBands = selectRegularBandSequence(bands, denseIndices.length);
  console.info(
    `[answer-ink-localization] ${JSON.stringify({
      compactEvidence: compactEvidenceIndices.length,
      denseTargets: denseIndices.length,
      targetRange: [denseIndices[0], denseIndices.at(-1)],
      detectedInkBands: bands.length,
      applied: Boolean(selectedBands),
      bandCenters: selectedBands?.map((band) =>
        Math.round(toNormalized((band.yMin + band.yMax) / 2, info.height)),
      ),
    })}`,
  );
  if (!selectedBands) return locations;

  const snappedByIndex = new Map<number, AnswerLocation>();
  denseIndices.forEach((targetIndex, position) => {
    const band = selectedBands[position];
    const xPadding = Math.max(2, Math.round(info.width * 0.003));
    const yPadding = Math.max(2, Math.round(info.height * 0.003));
    snappedByIndex.set(targetIndex, {
      targetIndex,
      box_2d: [
        toNormalized(band.yMin - yPadding, info.height),
        toNormalized(band.xMin - xPadding, info.width),
        toNormalized(band.yMax + yPadding + 1, info.height),
        toNormalized(band.xMax + xPadding + 1, info.width),
      ],
      confidence: 1,
    });
  });

  const retained = locations.filter((location) => !denseIndexSet.has(location.targetIndex));
  return [...retained, ...denseIndices.map((index) => snappedByIndex.get(index)!)];
}

function isCompactAnswer(block: AnswerBlock) {
  const label = block.normalizedDetectedLabel ?? "";
  const region = block.regions.length === 1 ? block.regions[0].box : null;
  const hasCompactGeometry = Boolean(
    region && region.width <= 260 && region.height <= 150,
  );
  const text = block.transcription
    .replace(/^\s*(?:answer|ans(?:wer)?|question|q)?\s*\d+\s*[).:\-]?\s*/i, "")
    .trim();
  return (
    /^\d+[a-z0-9]*$/i.test(label) &&
    ((text.length > 0 && text.length <= 12) || hasCompactGeometry)
  );
}

function detectInkBands(
  pixels: Buffer,
  width: number,
  height: number,
  xStart: number,
  xEnd: number,
): InkBand[] {
  const minimumPixelsPerRow = Math.max(2, Math.round((xEnd - xStart) * 0.015));
  const activeRows: Array<{ y: number; inkPixels: number }> = [];

  for (let y = 0; y < height; y += 1) {
    let inkPixels = 0;
    for (let x = xStart; x < xEnd; x += 1) {
      const offset = (y * width + x) * 3;
      if (isHandwritingPixel(pixels[offset], pixels[offset + 1], pixels[offset + 2])) {
        inkPixels += 1;
      }
    }
    if (inkPixels >= minimumPixelsPerRow) activeRows.push({ y, inkPixels });
  }

  const maximumGap = Math.max(2, Math.round(height * 0.003));
  const grouped: InkBand[] = [];
  for (const row of activeRows) {
    const previous = grouped.at(-1);
    if (previous && row.y <= previous.yMax + maximumGap) {
      previous.yMax = row.y;
      previous.inkPixels += row.inkPixels;
    } else {
      grouped.push({
        yMin: row.y,
        yMax: row.y,
        xMin: xEnd,
        xMax: xStart,
        inkPixels: row.inkPixels,
      });
    }
  }

  const minimumBandHeight = Math.max(4, Math.round(height * 0.004));
  return grouped
    .filter((band) => band.yMax - band.yMin + 1 >= minimumBandHeight)
    .map((band) => {
      for (let y = band.yMin; y <= band.yMax; y += 1) {
        for (let x = xStart; x < xEnd; x += 1) {
          const offset = (y * width + x) * 3;
          if (isHandwritingPixel(pixels[offset], pixels[offset + 1], pixels[offset + 2])) {
            band.xMin = Math.min(band.xMin, x);
            band.xMax = Math.max(band.xMax, x);
          }
        }
      }
      return band;
    })
    .filter((band) => band.xMax >= band.xMin);
}

function isHandwritingPixel(red: number, green: number, blue: number) {
  const blueInk = blue > red + 22 && blue > green + 7 && blue < 248;
  const darkInk = red < 105 && green < 105 && blue < 105;
  return blueInk || darkInk;
}

function selectRegularBandSequence(bands: InkBand[], count: number): InkBand[] | null {
  if (bands.length < count) return null;
  if (bands.length === count) return bands;

  let best: { bands: InkBand[]; score: number } | null = null;
  for (let start = 0; start <= bands.length - count; start += 1) {
    const candidate = bands.slice(start, start + count);
    const centers = candidate.map((band) => (band.yMin + band.yMax) / 2);
    const gaps = centers.slice(1).map((center, index) => center - centers[index]);
    const mean = gaps.reduce((sum, gap) => sum + gap, 0) / Math.max(gaps.length, 1);
    const variance =
      gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / Math.max(gaps.length, 1);
    const regularity = Math.sqrt(variance) / Math.max(mean, 1);
    const thinBandPenalty =
      candidate.filter((band) => band.yMax - band.yMin + 1 < 6).length / count;
    const score = regularity + thinBandPenalty;
    if (!best || score < best.score) best = { bands: candidate, score };
  }
  return best?.bands ?? null;
}

function percentile(values: number[], position: number) {
  if (values.length === 0) return 0;
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * position))];
}

function toNormalized(value: number, dimension: number) {
  return clamp((value / dimension) * 1000, 0, 1000);
}

function numberSort(a: number, b: number) {
  return a - b;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
