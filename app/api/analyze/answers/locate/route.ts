import { targetedAnswerLocalizationPrompt } from "@/lib/ai/prompts";
import { generateStructured } from "@/lib/ai/provider";
import {
  targetedAnswerLocationJsonSchema,
  targetedAnswerLocationResponseSchema,
} from "@/lib/ai/schemas";
import { failure, publicError, success } from "@/lib/api";
import { geminiBox2dToNormalizedBox } from "@/lib/analysis/coordinates";
import type { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const formData = await request.formData();
    const page = formData.get("page");
    const pageNumber = Number(formData.get("pageNumber"));
    const questionLabel = String(formData.get("questionLabel") ?? "").trim();
    const answerLabel = String(formData.get("answerLabel") ?? "").trim();
    const transcription = String(formData.get("transcription") ?? "").trim();

    if (
      !(page instanceof File) ||
      !page.type.startsWith("image/") ||
      page.size > 3_500_000 ||
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      !questionLabel ||
      questionLabel.length > 80 ||
      answerLabel.length > 80 ||
      transcription.length > 2_000
    ) {
      return failure(
        "INVALID_LOCATION_INPUT",
        "A valid page and target question are required.",
        400,
        false,
      );
    }

    const generationRequest = {
      prompt: `${targetedAnswerLocalizationPrompt}\n\nTARGET:\n${JSON.stringify({
        questionLabel,
        visibleAnswerLabel: answerLabel || null,
        answerPreview: transcription.slice(0, 500),
        pageNumber,
      })}`,
      schema: targetedAnswerLocationResponseSchema,
      jsonSchema: targetedAnswerLocationJsonSchema,
      image: {
        data: Buffer.from(await page.arrayBuffer()).toString("base64"),
        mimeType: page.type,
      },
      useMinimalThinking: false,
      timeoutMs: 30_000,
    } as const;
    const configuredModel = process.env.GEMINI_LOCALIZATION_MODEL?.trim();
    const models = configuredModel
      ? [configuredModel, "gemini-2.5-flash-lite", "gemini-3.1-flash-lite"]
      : ["gemini-2.5-flash-lite", "gemini-3.1-flash-lite"];
    let located: z.infer<typeof targetedAnswerLocationResponseSchema> | undefined;
    let lastError: unknown;
    for (const model of [...new Set(models)]) {
      try {
        located = await generateStructured({
          ...generationRequest,
          model,
          schema: targetedAnswerLocationResponseSchema,
          jsonSchema: targetedAnswerLocationJsonSchema,
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!located) throw lastError ?? new Error("No localization model succeeded.");

    if (!located.found || !located.box_2d || located.confidence < 0.7) {
      return success({ found: false, box: null, confidence: located.confidence }, requestId);
    }

    return success(
      {
        found: true,
        box: geminiBox2dToNormalizedBox(located.box_2d),
        confidence: located.confidence,
      },
      requestId,
    );
  } catch (error) {
    return publicError(error, { route: "answers/locate" }, requestId);
  }
}
