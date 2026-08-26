import { semanticMappingPrompt } from "@/lib/ai/prompts";
import { generateStructured } from "@/lib/ai/provider";
import {
  semanticMappingJsonSchema,
  semanticMappingResponseSchema,
} from "@/lib/ai/schemas";
import { failure, success } from "@/lib/api";
import {
  applySemanticMatches,
  buildDeterministicMappings,
} from "@/lib/analysis/mapping";
import { normalizeQuestionLabel } from "@/lib/analysis/labels";
import type { AnswerBlock, ExtractedQuestion } from "@/lib/types";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  questions: z.array(z.custom<ExtractedQuestion>()),
  answers: z.array(z.custom<AnswerBlock>()),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return failure("INVALID_MAPPING_INPUT", "Questions and answers are required.", 400, false);
  }

  const { questions, answers } = parsed.data;
  const deterministic = buildDeterministicMappings(questions, answers);
  if (deterministic.unresolvedAnswerIds.length === 0) {
    return success({
      mappings: deterministic.mappings,
      unmatchedAnswerBlockIds: [],
      warnings: [],
    });
  }

  const unresolvedAnswers = answers.filter((answer) =>
    deterministic.unresolvedAnswerIds.includes(answer.id),
  );
  const semanticCandidates = unresolvedAnswers.filter(
    (answer) => normalizeQuestionLabel(answer.detectedLabel).length === 0,
  );
  const labelledUnmatchedIds = unresolvedAnswers
    .filter((answer) => normalizeQuestionLabel(answer.detectedLabel).length > 0)
    .map((answer) => answer.id);

  if (semanticCandidates.length === 0) {
    return success({
      mappings: deterministic.mappings,
      unmatchedAnswerBlockIds: labelledUnmatchedIds,
      warnings: [],
    });
  }

  try {
    const semantic = process.env.AI_MOCK_MODE === "true"
      ? mockSemanticMatches(questions, unresolvedAnswers)
      : await generateStructured({
          prompt: `${semanticMappingPrompt}\n\nQUESTIONS:\n${JSON.stringify(
            questions.map((question) => ({
              id: question.id,
              label: question.originalLabel,
              text: question.fullText,
            })),
          )}\n\nUNRESOLVED ANSWERS:\n${JSON.stringify(
            semanticCandidates.map((answer) => ({
              id: answer.id,
              label: answer.detectedLabel,
              transcription: answer.transcription,
            })),
          )}`,
          schema: semanticMappingResponseSchema,
          jsonSchema: semanticMappingJsonSchema,
          timeoutMs: 60_000,
        });

    const combined = applySemanticMatches(deterministic.mappings, semantic.matches);
    const returnedIds = new Set(semantic.matches.map((match) => match.answerBlockId));
    const unreturned = semanticCandidates
      .map((answer) => answer.id)
      .filter((id) => !returnedIds.has(id));

    return success({
      mappings: combined.mappings,
      unmatchedAnswerBlockIds: [
        ...new Set([...labelledUnmatchedIds, ...combined.unmatched, ...unreturned]),
      ],
      warnings: [],
    });
  } catch {
    return success({
      mappings: deterministic.mappings,
      unmatchedAnswerBlockIds: deterministic.unresolvedAnswerIds,
      warnings: ["Some unlabelled answers could not be mapped automatically."],
    });
  }
}

function mockSemanticMatches(questions: ExtractedQuestion[], answers: AnswerBlock[]) {
  return {
    matches: answers.map((answer) => {
      const isRootAnswer = answer.transcription.toLowerCase().includes("roots absorb");
      const target = isRootAnswer
        ? questions.find((question) => question.normalizedLabel === "2a")
        : null;
      return {
        answerBlockId: answer.id,
        questionId: target?.id ?? null,
        confidence: target ? 0.91 : 0.2,
        reason: target
          ? "The response directly states a function of roots."
          : "The work does not answer a detected question.",
      };
    }),
  };
}
