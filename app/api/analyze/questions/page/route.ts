import { questionExtractionPrompt } from "@/lib/ai/prompts";
import { generateStructured } from "@/lib/ai/provider";
import {
  questionPageJsonSchema,
  questionPageResponseSchema,
} from "@/lib/ai/schemas";
import { failure, publicError, success } from "@/lib/api";
import { geminiBox2dToNormalizedBox } from "@/lib/analysis/coordinates";
import { normalizeQuestionLabel } from "@/lib/analysis/labels";
import type { ExtractedQuestion } from "@/lib/types";

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

    const extracted = process.env.AI_MOCK_MODE === "true"
      ? mockQuestions(validPageNumber)
      : await generateStructured({
          prompt: `${questionExtractionPrompt}\nThis is page ${validPageNumber} of ${validTotalPages}.`,
          schema: questionPageResponseSchema,
          jsonSchema: questionPageJsonSchema,
          image: {
            data: Buffer.from(await page.arrayBuffer()).toString("base64"),
            mimeType: page.type,
          },
        });

    const questions = extracted.questions.map<ExtractedQuestion>((question, index) => ({
      id: `q-${validPageNumber}-${question.readingOrder}-${index}`,
      originalLabel: question.originalLabel.trim(),
      normalizedLabel: normalizeQuestionLabel(question.originalLabel),
      parentLabel: question.parentLabel,
      subpartLabel: question.subpartLabel,
      sharedStem: question.sharedStem,
      text: question.text.trim(),
      fullText: question.fullText.trim(),
      maxMarks: question.maxMarks,
      orderIndex: 0,
      pageNumber: validPageNumber,
      readingOrder: question.readingOrder,
      sourceRegions: [
        {
          id: `qr-${validPageNumber}-${question.readingOrder}-${index}`,
          pageNumber: validPageNumber,
          box: geminiBox2dToNormalizedBox(question.box_2d),
          kind: "label",
        },
      ],
      extractionConfidence: clampConfidence(question.confidence),
      continuesFromPrevious: question.continuesFromPrevious,
      continuesToNext: question.continuesToNext,
    }));

    return success({ questions }, requestId);
  } catch (error) {
    return publicError(
      error,
      { route: "questions/page", pageNumber, totalPages },
      requestId,
    );
  }
}

function clampConfidence(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function mockQuestions(pageNumber: number) {
  if (pageNumber > 1) return { questions: [] };
  return {
    questions: [
      {
        originalLabel: "1",
        parentLabel: null,
        subpartLabel: null,
        sharedStem: null,
        text: "What is photosynthesis?",
        fullText: "What is photosynthesis?",
        maxMarks: 2,
        readingOrder: 0,
        box_2d: [120, 90, 225, 900],
        confidence: 0.99,
        continuesFromPrevious: false,
        continuesToNext: false,
      },
      {
        originalLabel: "2 (a)",
        parentLabel: "2",
        subpartLabel: "a",
        sharedStem: "Answer the following about plants.",
        text: "State one function of roots.",
        fullText: "Answer the following about plants. State one function of roots.",
        maxMarks: 1,
        readingOrder: 1,
        box_2d: [310, 90, 400, 900],
        confidence: 0.98,
        continuesFromPrevious: false,
        continuesToNext: false,
      },
      {
        originalLabel: "2 (b)",
        parentLabel: "2",
        subpartLabel: "b",
        sharedStem: "Answer the following about plants.",
        text: "Name the green pigment found in leaves.",
        fullText: "Answer the following about plants. Name the green pigment found in leaves.",
        maxMarks: 1,
        readingOrder: 2,
        box_2d: [450, 90, 540, 900],
        confidence: 0.98,
        continuesFromPrevious: false,
        continuesToNext: false,
      },
    ],
  };
}
