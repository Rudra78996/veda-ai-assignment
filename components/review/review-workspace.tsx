"use client";

import { AnswerViewer } from "@/components/review/answer-viewer";
import { QuestionList } from "@/components/review/question-list";
import type { AssessmentResult, PreparedDocument } from "@/lib/types";
import { FileText, ListChecks } from "@phosphor-icons/react";
import { useState } from "react";

export function ReviewWorkspace({
  result,
  answerDocument,
}: {
  result: AssessmentResult;
  answerDocument: PreparedDocument;
}) {
  const initialQuestion =
    result.mappings.find((mapping) => mapping.answerBlockIds.length > 0)?.questionId ??
    result.questions[0]?.id ??
    null;
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(initialQuestion);
  const [mobileView, setMobileView] = useState<"questions" | "viewer">("questions");

  function selectQuestion(questionId: string) {
    setSelectedQuestionId(questionId);
    setMobileView("viewer");
  }

  return (
    <main className="h-[calc(100dvh-64px)] overflow-hidden lg:h-[100dvh]">
      {result.warnings.length > 0 ? (
        <div className="border-b border-[#eedfb8] bg-[var(--warning-soft)] px-4 py-2 text-center text-xs font-medium text-[var(--warning)]">
          {result.warnings.join(" ")}
        </div>
      ) : null}

      <div className="flex h-full min-h-0 flex-col lg:grid lg:grid-cols-[390px_minmax(0,1fr)]">
        <div className="flex border-b border-[var(--line)] bg-[var(--surface)] p-2 lg:hidden">
          <MobileTab
            active={mobileView === "questions"}
            label="Questions"
            icon={<ListChecks size={17} />}
            onClick={() => setMobileView("questions")}
          />
          <MobileTab
            active={mobileView === "viewer"}
            label="Answer sheet"
            icon={<FileText size={17} />}
            onClick={() => setMobileView("viewer")}
          />
        </div>

        <div className={`${mobileView === "questions" ? "block" : "hidden"} min-h-0 flex-1 lg:block`}>
          <QuestionList
            questions={result.questions}
            mappings={result.mappings}
            grades={result.grades}
            answers={result.answers}
            unmatchedAnswerBlockIds={result.unmatchedAnswerBlockIds}
            selectedQuestionId={selectedQuestionId}
            onSelect={selectQuestion}
          />
        </div>
        <div className={`${mobileView === "viewer" ? "block" : "hidden"} min-h-0 flex-1 lg:block`}>
          <AnswerViewer
            answerDocument={answerDocument}
            questions={result.questions}
            answers={result.answers}
            mappings={result.mappings}
            selectedQuestionId={selectedQuestionId}
          />
        </div>
      </div>
    </main>
  );
}

function MobileTab({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[9px] text-sm font-semibold ${
        active ? "bg-[var(--ink)] text-white" : "text-[var(--muted)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
