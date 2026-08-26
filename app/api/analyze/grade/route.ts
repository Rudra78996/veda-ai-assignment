import { gradingPrompt } from "@/lib/ai/prompts";
import { generateStructured } from "@/lib/ai/provider";
import { gradingJsonSchema, gradingResponseSchema } from "@/lib/ai/schemas";
import { failure, success } from "@/lib/api";
import type { AnswerBlock, AnswerMapping, ExtractedQuestion, Grade } from "@/lib/types";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  questions: z.array(z.custom<ExtractedQuestion>()),
  answers: z.array(z.custom<AnswerBlock>()),
  mappings: z.array(z.custom<AnswerMapping>()),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return failure("INVALID_GRADING_INPUT", "Mapped answers are required.", 400, false);
  }

  const { questions, answers, mappings } = parsed.data;
  const gradeable = mappings
    .filter((mapping) => mapping.answerBlockIds.length > 0)
    .map((mapping) => {
      const question = questions.find((item) => item.id === mapping.questionId)!;
      return {
        questionId: question.id,
        question: question.fullText,
        maxMarks: question.maxMarks,
        answer: mapping.answerBlockIds
          .map((id) => answers.find((answer) => answer.id === id)?.transcription)
          .filter(Boolean)
          .join("\n"),
      };
    });

  const unansweredGrades = mappings
    .filter((mapping) => mapping.answerBlockIds.length === 0)
    .map<Grade>((mapping) => {
      const question = questions.find((item) => item.id === mapping.questionId)!;
      return {
        questionId: question.id,
        awardedMarks: question.maxMarks === null ? null : 0,
        maxMarks: question.maxMarks,
        verdict: "not_graded",
        feedback: "No answer was detected for this question.",
        evidence: [],
        confidence: 1,
      };
    });

  if (gradeable.length === 0) {
    return success({ grades: unansweredGrades, warnings: [] });
  }

  try {
    const evaluated = process.env.AI_MOCK_MODE === "true"
      ? mockGrades(gradeable)
      : await generateStructured({
          prompt: `${gradingPrompt}\n\nQUESTION AND ANSWER PAIRS:\n${JSON.stringify(gradeable)}`,
          schema: gradingResponseSchema,
          jsonSchema: gradingJsonSchema,
          timeoutMs: 60_000,
        });

    return success({ grades: [...evaluated.grades, ...unansweredGrades], warnings: [] });
  } catch {
    const fallback = gradeable.map<Grade>((item) => ({
      questionId: item.questionId,
      awardedMarks: null,
      maxMarks: item.maxMarks,
      verdict: "not_graded",
      feedback: "AI feedback is temporarily unavailable.",
      evidence: [],
      confidence: 0,
    }));
    return success({
      grades: [...fallback, ...unansweredGrades],
      warnings: ["Grading could not be completed, but answer mapping is available."],
    });
  }
}

function mockGrades(items: Array<{ questionId: string; maxMarks: number | null; answer: string }>) {
  return {
    grades: items.map<Grade>((item) => ({
      questionId: item.questionId,
      awardedMarks: item.maxMarks,
      maxMarks: item.maxMarks,
      verdict: "correct",
      feedback: "The response directly answers the question with the expected key idea.",
      evidence: [item.answer.slice(0, 90)],
      confidence: 0.92,
    })),
  };
}
