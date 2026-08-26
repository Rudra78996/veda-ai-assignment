import { z } from "zod";

export const box2dSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .refine(
    ([yMin, xMin, yMax, xMax]) => yMax > yMin && xMax > xMin,
    "box_2d must use [ymin, xmin, ymax, xmax] with positive dimensions",
  );

export const questionPageResponseSchema = z.object({
  questions: z.array(
    z.object({
      originalLabel: z.string(),
      parentLabel: z.string().nullable(),
      subpartLabel: z.string().nullable(),
      sharedStem: z.string().nullable(),
      text: z.string(),
      fullText: z.string(),
      maxMarks: z.number().nullable(),
      readingOrder: z.number(),
      box_2d: box2dSchema,
      confidence: z.number(),
      continuesFromPrevious: z.boolean(),
      continuesToNext: z.boolean(),
    }),
  ),
});

export const answerPageResponseSchema = z.object({
  blocks: z.array(
    z.object({
      detectedLabel: z.string().nullable(),
      transcription: z.string(),
      readingOrder: z.number(),
      regions: z.array(z.object({ box_2d: box2dSchema })),
      confidence: z.number(),
      continuesFromPrevious: z.boolean(),
      continuesToNext: z.boolean(),
    }),
  ),
});

export const answerLocalizationResponseSchema = z.object({
  locations: z.array(
    z.object({
      targetIndex: z.number().int().nonnegative(),
      box_2d: box2dSchema,
      confidence: z.number(),
    }),
  ),
});

export const targetedAnswerLocationResponseSchema = z.object({
  found: z.boolean(),
  box_2d: box2dSchema.nullable(),
  confidence: z.number(),
});

export const semanticMappingResponseSchema = z.object({
  matches: z.array(
    z.object({
      answerBlockId: z.string(),
      questionId: z.string().nullable(),
      confidence: z.number(),
      reason: z.string(),
    }),
  ),
});

export const gradingResponseSchema = z.object({
  grades: z.array(
    z.object({
      questionId: z.string(),
      awardedMarks: z.number().nullable(),
      maxMarks: z.number().nullable(),
      verdict: z.enum(["correct", "partially_correct", "incorrect", "not_graded"]),
      feedback: z.string(),
      evidence: z.array(z.string()),
      confidence: z.number(),
    }),
  ),
});

export const questionPageJsonSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          originalLabel: { type: "string" },
          parentLabel: { type: ["string", "null"] },
          subpartLabel: { type: ["string", "null"] },
          sharedStem: { type: ["string", "null"] },
          text: { type: "string" },
          fullText: { type: "string" },
          maxMarks: { type: ["number", "null"] },
          readingOrder: { type: "integer" },
          box_2d: { $ref: "#/$defs/box_2d" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          continuesFromPrevious: { type: "boolean" },
          continuesToNext: { type: "boolean" },
        },
        required: [
          "originalLabel",
          "parentLabel",
          "subpartLabel",
          "sharedStem",
          "text",
          "fullText",
          "maxMarks",
          "readingOrder",
          "box_2d",
          "confidence",
          "continuesFromPrevious",
          "continuesToNext",
        ],
      },
    },
  },
  required: ["questions"],
  $defs: {
    box_2d: {
      type: "array",
      items: { type: "number", minimum: 0, maximum: 1000 },
      minItems: 4,
      maxItems: 4,
    },
  },
};

export const answerPageJsonSchema = {
  type: "object",
  properties: {
    blocks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          detectedLabel: { type: ["string", "null"] },
          transcription: { type: "string" },
          readingOrder: { type: "integer" },
          regions: {
            type: "array",
            items: {
              type: "object",
              properties: { box_2d: { $ref: "#/$defs/box_2d" } },
              required: ["box_2d"],
            },
            minItems: 1,
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          continuesFromPrevious: { type: "boolean" },
          continuesToNext: { type: "boolean" },
        },
        required: [
          "detectedLabel",
          "transcription",
          "readingOrder",
          "regions",
          "confidence",
          "continuesFromPrevious",
          "continuesToNext",
        ],
      },
    },
  },
  required: ["blocks"],
  $defs: questionPageJsonSchema.$defs,
};

export const answerLocalizationJsonSchema = {
  type: "object",
  properties: {
    locations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          targetIndex: { type: "integer", minimum: 0 },
          box_2d: { $ref: "#/$defs/box_2d" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["targetIndex", "box_2d", "confidence"],
      },
    },
  },
  required: ["locations"],
  $defs: questionPageJsonSchema.$defs,
};

export const targetedAnswerLocationJsonSchema = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    box_2d: {
      anyOf: [{ $ref: "#/$defs/box_2d" }, { type: "null" }],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["found", "box_2d", "confidence"],
  $defs: questionPageJsonSchema.$defs,
};

export const semanticMappingJsonSchema = {
  type: "object",
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          answerBlockId: { type: "string" },
          questionId: { type: ["string", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          reason: { type: "string" },
        },
        required: ["answerBlockId", "questionId", "confidence", "reason"],
      },
    },
  },
  required: ["matches"],
};

export const gradingJsonSchema = {
  type: "object",
  properties: {
    grades: {
      type: "array",
      items: {
        type: "object",
        properties: {
          questionId: { type: "string" },
          awardedMarks: { type: ["number", "null"] },
          maxMarks: { type: ["number", "null"] },
          verdict: {
            type: "string",
            enum: ["correct", "partially_correct", "incorrect", "not_graded"],
          },
          feedback: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: [
          "questionId",
          "awardedMarks",
          "maxMarks",
          "verdict",
          "feedback",
          "evidence",
          "confidence",
        ],
      },
    },
  },
  required: ["grades"],
};
