"use client";

import {
  CheckCircle,
  Circle,
  Flag,
  WarningCircle,
} from "@phosphor-icons/react";
import type {
  AnswerBlock,
  AnswerMapping,
  ExtractedQuestion,
  Grade,
} from "@/lib/types";

export function QuestionList({
  questions,
  mappings,
  grades,
  answers,
  unmatchedAnswerBlockIds,
  selectedQuestionId,
  onSelect,
}: {
  questions: ExtractedQuestion[];
  mappings: AnswerMapping[];
  grades: Grade[];
  answers: AnswerBlock[];
  unmatchedAnswerBlockIds: string[];
  selectedQuestionId: string | null;
  onSelect: (questionId: string) => void;
}) {
  const answered = mappings.filter((mapping) => mapping.status === "answered").length;
  const unanswered = mappings.filter((mapping) => mapping.status === "unanswered").length;
  const review = mappings.filter((mapping) => mapping.status === "needs_review").length;
  const knownGrades = grades.filter(
    (grade) => grade.awardedMarks !== null && grade.maxMarks !== null,
  );
  const awarded = knownGrades.reduce((sum, grade) => sum + (grade.awardedMarks ?? 0), 0);
  const maximum = knownGrades.reduce((sum, grade) => sum + (grade.maxMarks ?? 0), 0);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface)]">
      <header className="border-b border-[var(--line)] px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[var(--accent-dark)]">Assessment review</p>
            <h1 className="mt-1 text-lg font-semibold tracking-[-0.025em]">Answer mapping</h1>
          </div>
          {maximum > 0 ? (
            <div className="text-right">
              <p className="text-xl font-semibold tracking-[-0.04em]">
                {formatMarks(awarded)}<span className="text-sm text-[var(--muted)]">/{formatMarks(maximum)}</span>
              </p>
              <p className="text-[10px] font-medium text-[var(--muted)]">AI estimate</p>
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <SummaryValue value={answered} label="Answered" tone="success" />
          <SummaryValue value={unanswered} label="Unanswered" tone="muted" />
          <SummaryValue value={review} label="Review" tone="warning" />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 scrollbar-thin sm:px-4">
        <div className="grid gap-2" role="list" aria-label="Extracted questions">
          {questions.map((question) => {
            const mapping = mappings.find((item) => item.questionId === question.id)!;
            const grade = grades.find((item) => item.questionId === question.id);
            const selected = question.id === selectedQuestionId;
            return (
              <button
                type="button"
                key={question.id}
                onClick={() => onSelect(question.id)}
                className={`w-full rounded-[12px] border p-3.5 text-left transition-colors active:scale-[0.995] ${
                  selected
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-transparent bg-[var(--canvas)] hover:border-[var(--line)]"
                }`}
                aria-pressed={selected}
              >
                <div className="flex items-start gap-3">
                  <StatusIcon status={mapping.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--ink)]">
                        Question {question.originalLabel}
                      </span>
                      {grade?.awardedMarks !== null && grade?.awardedMarks !== undefined ? (
                        <span className="shrink-0 text-xs font-semibold text-[var(--muted)]">
                          {formatMarks(grade.awardedMarks)}/{formatMarks(grade.maxMarks ?? 0)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-[#555751]">
                      {question.text}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <StatusLabel status={mapping.status} />
                      {mapping.answerBlockIds.length > 0 ? (
                        <span className="text-[10px] text-[var(--muted)]">
                          {countRegions(mapping, answers)} {countRegions(mapping, answers) === 1 ? "region" : "regions"}
                        </span>
                      ) : null}
                    </div>
                    {selected && grade?.feedback ? (
                      <p className="mt-3 border-t border-[rgba(239,114,71,0.22)] pt-2.5 text-xs leading-5 text-[var(--muted)]">
                        {grade.feedback}
                      </p>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {unmatchedAnswerBlockIds.length > 0 ? (
          <section className="mt-4 rounded-[12px] border border-[var(--line)] bg-[var(--canvas)] p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Flag size={16} className="text-[var(--warning)]" />
              Unmatched answers
              <span className="ml-auto text-[var(--muted)]">{unmatchedAnswerBlockIds.length}</span>
            </div>
            <div className="mt-2 grid gap-2">
              {unmatchedAnswerBlockIds.map((id) => {
                const answer = answers.find((item) => item.id === id);
                return answer ? (
                  <p key={id} className="line-clamp-2 text-xs leading-5 text-[var(--muted)]">
                    {answer.detectedLabel ? `Label ${answer.detectedLabel}: ` : ""}
                    {answer.transcription}
                  </p>
                ) : null;
              })}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: AnswerMapping["status"] }) {
  const shared = "mt-0.5 shrink-0";
  if (status === "answered") {
    return <CheckCircle size={19} weight="fill" className={`${shared} text-[var(--success)]`} />;
  }
  if (status === "needs_review") {
    return <WarningCircle size={19} weight="fill" className={`${shared} text-[var(--warning)]`} />;
  }
  return <Circle size={19} className={`${shared} text-[#aaa9a2]`} />;
}

function StatusLabel({ status }: { status: AnswerMapping["status"] }) {
  const values = {
    answered: { label: "Answered", classes: "bg-[var(--success-soft)] text-[var(--success)]" },
    unanswered: { label: "Unanswered", classes: "bg-[#e9e9e5] text-[#666862]" },
    needs_review: { label: "Needs review", classes: "bg-[var(--warning-soft)] text-[var(--warning)]" },
  };
  const value = values[status];
  return (
    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${value.classes}`}>
      {value.label}
    </span>
  );
}

function SummaryValue({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "success" | "muted" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-[var(--success)]"
      : tone === "warning"
        ? "text-[var(--warning)]"
        : "text-[var(--muted)]";
  return (
    <div className="rounded-[10px] bg-[var(--canvas)] px-2 py-2.5">
      <p className={`text-base font-semibold ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-[10px] text-[var(--muted)]">{label}</p>
    </div>
  );
}

function countRegions(mapping: AnswerMapping, answers: AnswerBlock[]) {
  return mapping.answerBlockIds.reduce(
    (total, id) => total + (answers.find((answer) => answer.id === id)?.regions.length ?? 0),
    0,
  );
}

function formatMarks(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
