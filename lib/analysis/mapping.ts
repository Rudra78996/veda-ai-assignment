import { normalizeQuestionLabel } from "@/lib/analysis/labels";
import type { AnswerBlock, AnswerMapping, ExtractedQuestion } from "@/lib/types";

export type DeterministicMappingResult = {
  mappings: AnswerMapping[];
  unresolvedAnswerIds: string[];
};

export function buildDeterministicMappings(
  questions: ExtractedQuestion[],
  answers: AnswerBlock[],
): DeterministicMappingResult {
  const answerIdsByQuestion = new Map<string, string[]>();
  const unresolvedAnswerIds: string[] = [];

  for (const answer of answers) {
    const answerLabel = normalizeQuestionLabel(answer.detectedLabel);
    const exactQuestion = answerLabel
      ? questions.find((question) => question.normalizedLabel === answerLabel)
      : undefined;

    if (!exactQuestion) {
      unresolvedAnswerIds.push(answer.id);
      continue;
    }

    const current = answerIdsByQuestion.get(exactQuestion.id) ?? [];
    current.push(answer.id);
    answerIdsByQuestion.set(exactQuestion.id, current);
  }

  const mappings = questions.map<AnswerMapping>((question) => {
    const answerBlockIds = answerIdsByQuestion.get(question.id) ?? [];
    return {
      questionId: question.id,
      answerBlockIds,
      status: answerBlockIds.length > 0 ? "answered" : "unanswered",
      method: answerBlockIds.length > 0 ? "exact_label" : "none",
      confidence: answerBlockIds.length > 0 ? 0.98 : 1,
      reason:
        answerBlockIds.length > 0
          ? "Matched using the handwritten question label."
          : "No answer with this question label was detected.",
    };
  });

  return { mappings, unresolvedAnswerIds };
}

export function applySemanticMatches(
  base: AnswerMapping[],
  matches: Array<{
    answerBlockId: string;
    questionId: string | null;
    confidence: number;
    reason: string;
  }>,
) {
  const next = base.map((mapping) => ({ ...mapping, answerBlockIds: [...mapping.answerBlockIds] }));
  const unmatched: string[] = [];

  for (const match of matches) {
    const target = match.questionId
      ? next.find((mapping) => mapping.questionId === match.questionId)
      : undefined;

    if (!target || match.confidence < 0.6) {
      unmatched.push(match.answerBlockId);
      continue;
    }

    target.answerBlockIds.push(match.answerBlockId);
    target.status = match.confidence >= 0.78 ? "answered" : "needs_review";
    target.method = "semantic";
    target.confidence = match.confidence;
    target.reason = match.reason;
  }

  return { mappings: next, unmatched };
}
