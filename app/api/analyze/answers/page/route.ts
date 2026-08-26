import { answerExtractionPrompt, answerLocalizationPrompt } from "@/lib/ai/prompts";
import { generateStructured } from "@/lib/ai/provider";
import {
  answerLocalizationJsonSchema,
  answerLocalizationResponseSchema,
  answerPageJsonSchema,
  answerPageResponseSchema,
} from "@/lib/ai/schemas";
import { failure, publicError, success } from "@/lib/api";
import {
  geminiBox2dToNormalizedBox,
  tightenAnswerRegions,
} from "@/lib/analysis/coordinates";
import { detectQuestionLabel, normalizeQuestionLabel } from "@/lib/analysis/labels";
import { snapDenseAnswerLocationsToInk } from "@/lib/analysis/ink-localization";
import {
  applyAnswerLocations,
  type AnswerLocation,
} from "@/lib/analysis/localization";
import type { AnswerBlock } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let pageNumber: number | undefined;
  let totalPages: number | undefined;
  try {
    const formData = await request.formData();
    const page = formData.get("page");
    pageNumber = Number(formData.get("pageNumber"));
    totalPages = Number(formData.get("totalPages"));

    if (
      !(page instanceof File) ||
      typeof pageNumber !== "number" ||
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      typeof totalPages !== "number" ||
      !Number.isInteger(totalPages) ||
      totalPages < pageNumber
    ) {
      return failure("INVALID_PAGE", "A valid page image is required.", 400, false);
    }
    if (!page.type.startsWith("image/") || page.size > 3_500_000) {
      return failure(
        "INVALID_PAGE_FILE",
        "Page images must be under 3.5 MB and use an image format.",
        413,
        false,
      );
    }
    const validPageNumber = pageNumber!;
    const validTotalPages = totalPages!;

    const isMock = process.env.AI_MOCK_MODE === "true";
    const imageBuffer = Buffer.from(await page.arrayBuffer());
    const image = {
      data: imageBuffer.toString("base64"),
      mimeType: page.type,
    };
    const extracted = isMock
      ? mockAnswers(validPageNumber)
      : await generateStructured({
          prompt: `${answerExtractionPrompt}\nThis is page ${validPageNumber} of ${validTotalPages}.`,
          schema: answerPageResponseSchema,
          jsonSchema: answerPageJsonSchema,
          image,
        });

    const extractedBlocks = extracted.blocks.map<AnswerBlock>((block, blockIndex) => {
        const transcription = block.transcription.trim();
        const detectedLabel = detectQuestionLabel(block.detectedLabel, transcription);

        return {
          id: `a-${validPageNumber}-${block.readingOrder}-${blockIndex}`,
          detectedLabel,
          normalizedDetectedLabel: normalizeQuestionLabel(detectedLabel),
          transcription,
          pageNumber: validPageNumber,
          readingOrder: block.readingOrder,
          regions: block.regions.map((region, regionIndex) => ({
            id: `ar-${validPageNumber}-${block.readingOrder}-${blockIndex}-${regionIndex}`,
            pageNumber: validPageNumber,
            box: geminiBox2dToNormalizedBox(region.box_2d),
            kind: block.continuesFromPrevious ? "continuation" : "answer",
          })),
          extractionConfidence: clampConfidence(block.confidence),
          continuesFromPrevious: block.continuesFromPrevious,
          continuesToNext: block.continuesToNext,
        };
      });

    let localizedBlocks = extractedBlocks;
    if (!isMock && extractedBlocks.length > 0) {
      const orderedTargets = [...extractedBlocks].sort(
        (a, b) => a.readingOrder - b.readingOrder || a.id.localeCompare(b.id),
      );
      let locations: AnswerLocation[] = [];
      try {
        const localization = await generateStructured({
          prompt: `${answerLocalizationPrompt}\n\nTARGETS:\n${JSON.stringify(
            orderedTargets.map((block, targetIndex) => ({
              targetIndex,
              label: block.detectedLabel,
              transcriptionPreview: block.transcription.slice(0, 140),
            })),
          )}`,
          schema: answerLocalizationResponseSchema,
          jsonSchema: answerLocalizationJsonSchema,
          image,
          timeoutMs: 60_000,
        });
        locations = localization.locations;
      } catch (localizationError) {
        console.warn("[answer-localization-fallback]", {
          requestId,
          pageNumber: validPageNumber,
          name:
            localizationError instanceof Error
              ? localizationError.name
              : "UnknownLocalizationError",
        });
      }

      try {
        locations = await snapDenseAnswerLocationsToInk(
          imageBuffer,
          orderedTargets,
          locations,
        );
      } catch (inkError) {
        console.warn("[answer-ink-localization-fallback]", {
          requestId,
          pageNumber: validPageNumber,
          name: inkError instanceof Error ? inkError.name : "UnknownInkLocalizationError",
        });
      }
      localizedBlocks = applyAnswerLocations(extractedBlocks, locations);
    }

    const blocks = tightenAnswerRegions(localizedBlocks);

    return success({ blocks }, requestId);
  } catch (error) {
    return publicError(
      error,
      { route: "answers/page", pageNumber, totalPages },
      requestId,
    );
  }
}

function clampConfidence(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function mockAnswers(pageNumber: number) {
  if (pageNumber > 1) return { blocks: [] };
  return {
    blocks: [
      {
        detectedLabel: "2 (b)",
        transcription: "The green pigment is chlorophyll.",
        readingOrder: 0,
        regions: [{ box_2d: [90, 80, 215, 910] }],
        confidence: 0.98,
        continuesFromPrevious: false,
        continuesToNext: false,
      },
      {
        detectedLabel: "1",
        transcription: "Photosynthesis is how green plants use sunlight to make food from carbon dioxide and water.",
        readingOrder: 1,
        regions: [{ box_2d: [280, 80, 460, 910] }],
        confidence: 0.96,
        continuesFromPrevious: false,
        continuesToNext: false,
      },
      {
        detectedLabel: null,
        transcription: "Roots absorb water and minerals from the soil.",
        readingOrder: 2,
        regions: [{ box_2d: [530, 80, 670, 910] }],
        confidence: 0.84,
        continuesFromPrevious: false,
        continuesToNext: false,
      },
      {
        detectedLabel: "99",
        transcription: "Rough working that does not answer a paper question.",
        readingOrder: 3,
        regions: [{ box_2d: [745, 80, 855, 910] }],
        confidence: 0.75,
        continuesFromPrevious: false,
        continuesToNext: false,
      },
    ],
  };
}
