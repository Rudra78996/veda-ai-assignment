import { padBox } from "@/lib/analysis/coordinates";
import { normalizeQuestionLabel } from "@/lib/analysis/labels";
import type { AnswerBlock, ExtractedQuestion } from "@/lib/types";

export function consolidateQuestions(pages: ExtractedQuestion[][]): ExtractedQuestion[] {
  const ordered = pages
    .flat()
    .sort((a, b) => a.pageNumber - b.pageNumber || a.readingOrder - b.readingOrder);

  const consolidated: ExtractedQuestion[] = [];

  for (const current of ordered) {
    const previous = consolidated.at(-1);
    const shouldMerge =
      Boolean(previous) &&
      current.continuesFromPrevious &&
      previous!.continuesToNext &&
      (!current.originalLabel ||
        normalizeQuestionLabel(current.originalLabel) === previous!.normalizedLabel);

    if (shouldMerge && previous) {
      previous.text = `${previous.text} ${current.text}`.trim();
      previous.fullText = `${previous.fullText} ${current.fullText}`.trim();
      previous.sourceRegions.push(...current.sourceRegions);
      previous.continuesToNext = current.continuesToNext;
      previous.extractionConfidence = Math.min(
        previous.extractionConfidence,
        current.extractionConfidence,
      );
      continue;
    }

    consolidated.push({
      ...current,
      normalizedLabel: normalizeQuestionLabel(current.originalLabel),
      orderIndex: consolidated.length,
      sourceRegions: current.sourceRegions.map((region) => ({
        ...region,
        box: padBox(region.box, 3),
      })),
    });
  }

  return consolidated.map((question, orderIndex) => ({ ...question, orderIndex }));
}

export function consolidateAnswers(pages: AnswerBlock[][]): AnswerBlock[] {
  const ordered = pages
    .flat()
    .sort((a, b) => a.pageNumber - b.pageNumber || a.readingOrder - b.readingOrder);

  const consolidated: AnswerBlock[] = [];

  for (const current of ordered) {
    const previous = consolidated.at(-1);
    const currentLabel = normalizeQuestionLabel(current.detectedLabel);
    const previousLabel = normalizeQuestionLabel(previous?.detectedLabel);
    const labelsAreCompatible =
      !currentLabel || !previousLabel || currentLabel === previousLabel;
    const repeatedLabelAtNextPageBoundary =
      Boolean(previous) &&
      current.pageNumber === previous!.pageNumber + 1 &&
      currentLabel.length > 0 &&
      currentLabel === previousLabel;
    const shouldMerge =
      Boolean(previous) &&
      labelsAreCompatible &&
      ((current.continuesFromPrevious && previous!.continuesToNext) ||
        repeatedLabelAtNextPageBoundary);

    if (shouldMerge && previous) {
      previous.transcription = `${previous.transcription}\n${current.transcription}`.trim();
      previous.regions.push(...current.regions);
      previous.continuesToNext = current.continuesToNext;
      previous.extractionConfidence = Math.min(
        previous.extractionConfidence,
        current.extractionConfidence,
      );
      continue;
    }

    consolidated.push({
      ...current,
      normalizedDetectedLabel: normalizeQuestionLabel(current.detectedLabel),
      regions: current.regions.map((region) => ({
        ...region,
        box: padBox(region.box, 3),
      })),
    });
  }

  return consolidated;
}
