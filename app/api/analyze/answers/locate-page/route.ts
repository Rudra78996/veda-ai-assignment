import { answerLocalizationPrompt } from "@/lib/ai/prompts";
import { generateStructured } from "@/lib/ai/provider";
import {
  answerLocalizationJsonSchema,
  answerLocalizationResponseSchema,
} from "@/lib/ai/schemas";
import { failure, publicError, success } from "@/lib/api";
import { geminiBox2dToNormalizedBox } from "@/lib/analysis/coordinates";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const targetSchema = z.object({
  targetIndex: z.number().int().nonnegative(),
  label: z.string().max(100),
  answerLabel: z.string().max(100).nullable(),
  transcriptionPreview: z.string().max(500),
});

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const formData = await request.formData();
    const page = formData.get("page");
    const pageNumber = Number(formData.get("pageNumber"));
    const targets = z.array(targetSchema).safeParse(
      JSON.parse(String(formData.get("targets") ?? "[]")),
    );
    if (
      !(page instanceof File) ||
      !page.type.startsWith("image/") ||
      page.size > 3_500_000 ||
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      !targets.success ||
      targets.data.length === 0 ||
      targets.data.length > 80
    ) {
      return failure("INVALID_PAGE_LOCATION_INPUT", "A valid page and targets are required.", 400, false);
    }

    const generationRequest = {
      prompt: `${answerLocalizationPrompt}\n\nTARGETS:\n${JSON.stringify(
        targets.data.map((target) => ({ ...target, pageNumber })),
      )}`,
      schema: answerLocalizationResponseSchema,
      jsonSchema: answerLocalizationJsonSchema,
      image: {
        data: Buffer.from(await page.arrayBuffer()).toString("base64"),
        mimeType: page.type,
      },
      useMinimalThinking: false,
      timeoutMs: 45_000,
    } as const;
    const configuredModel = process.env.GEMINI_LOCALIZATION_MODEL?.trim();
    const models = configuredModel
      ? [configuredModel, "gemini-2.5-flash-lite", "gemini-3.1-flash-lite"]
      : ["gemini-2.5-flash-lite", "gemini-3.1-flash-lite"];
    let located: z.infer<typeof answerLocalizationResponseSchema> | undefined;
    let lastError: unknown;
    for (const model of [...new Set(models)]) {
      try {
        located = await generateStructured({ ...generationRequest, model });
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!located) throw lastError ?? new Error("No localization model succeeded.");

    return success(
      {
        locations: located.locations
          .filter((location) => location.confidence >= 0.7)
          .map((location) => ({
            targetIndex: location.targetIndex,
            confidence: location.confidence,
            box: geminiBox2dToNormalizedBox(location.box_2d),
          })),
      },
      requestId,
    );
  } catch (error) {
    return publicError(error, { route: "answers/locate-page" }, requestId);
  }
}
