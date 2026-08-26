import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { z } from "zod";

let client: GoogleGenAI | null = null;

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export async function generateStructured<T>({
  prompt,
  schema,
  jsonSchema,
  image,
  model,
  useMinimalThinking = true,
  timeoutMs = 90_000,
}: {
  prompt: string;
  schema: z.ZodType<T>;
  jsonSchema: unknown;
  image?: { data: string; mimeType: string };
  model?: string;
  useMinimalThinking?: boolean;
  timeoutMs?: number;
}): Promise<T> {
  const parts = image
    ? [{ inlineData: image }, { text: prompt }]
    : [{ text: prompt }];

  let lastOutputError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await getClient().models.generateContent({
      model: model?.trim() || process.env.GEMINI_MODEL?.trim() || "gemini-3.7-flash",
      contents: [
        {
          role: "user",
          parts:
            attempt === 1
              ? parts
              : [
                  ...parts,
                  {
                    text: "Return a complete response that strictly matches the JSON schema. Keep wording concise so the response is not truncated.",
                  },
                ],
        },
      ],
      config: {
        temperature: 0,
        topP: 0.2,
        maxOutputTokens: 16_384,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
        thinkingConfig:
          image && useMinimalThinking
            ? { thinkingLevel: ThinkingLevel.MINIMAL }
            : undefined,
        httpOptions: {
          timeout: timeoutMs,
          retryOptions: {
            attempts: 3,
            initialDelay: 1,
            maxDelay: 6,
            expBase: 2,
            jitter: 0.5,
            httpStatusCodes: [408, 429, 500, 502, 503, 504],
          },
        },
      },
    });

    if (!response.text) {
      lastOutputError = new StructuredOutputError("Gemini returned an empty response.");
      continue;
    }

    try {
      return schema.parse(JSON.parse(response.text));
    } catch (error) {
      lastOutputError = new StructuredOutputError(
        "Gemini returned structured output that failed validation.",
        error,
      );
    }
  }

  throw lastOutputError;
}

export class StructuredOutputError extends Error {
  constructor(message: string, options?: unknown) {
    super(message, { cause: options });
    this.name = "StructuredOutputError";
  }
}
