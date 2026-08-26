"use client";

import { ArrowRight, ShieldCheck, Sparkle } from "@phosphor-icons/react";
import type { DocumentKind, PreparedDocument } from "@/lib/types";
import { DocumentPicker } from "@/components/upload/document-picker";

export function UploadWorkspace({
  questionDocument,
  answerDocument,
  preparingKind,
  errors,
  onFiles,
  onRemove,
  onStart,
}: {
  questionDocument: PreparedDocument | null;
  answerDocument: PreparedDocument | null;
  preparingKind: DocumentKind | null;
  errors: Partial<Record<DocumentKind, string | null>>;
  onFiles: (kind: DocumentKind, files: File[]) => void;
  onRemove: (kind: DocumentKind) => void;
  onStart: () => void;
}) {
  const ready = Boolean(questionDocument && answerDocument && !preparingKind);

  return (
    <main className="min-h-[calc(100dvh-64px)] px-4 py-10 sm:px-6 lg:min-h-[100dvh] lg:px-10 lg:py-12">
      <div className="mx-auto max-w-[920px]">
        <div className="flex flex-col items-center text-center">
          <span className="grid size-11 place-items-center rounded-[12px] bg-[var(--accent-soft)] text-[var(--accent-dark)]">
            <Sparkle size={22} weight="fill" />
          </span>
          <h1 className="mt-5 max-w-[620px] text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)] sm:text-[38px] sm:leading-[1.1]">
            Map every answer to the right question
          </h1>
          <p className="mt-3 max-w-[540px] text-sm leading-6 text-[var(--muted)] sm:text-[15px]">
            Upload a question paper and one handwritten answer sheet. VedaAI will extract, match, and locate every response.
          </p>
        </div>

        <div className="mt-9 grid gap-6 md:grid-cols-2">
          <DocumentPicker
            title="Question paper"
            description="The printed assessment students answered"
            document={questionDocument}
            preparing={preparingKind === "questions"}
            error={errors.questions ?? null}
            onFiles={(files) => onFiles("questions", files)}
            onRemove={() => onRemove("questions")}
          />
          <DocumentPicker
            title="Student answer sheet"
            description="One student submission, including all pages"
            document={answerDocument}
            preparing={preparingKind === "answers"}
            error={errors.answers ?? null}
            onFiles={(files) => onFiles("answers", files)}
            onRemove={() => onRemove("answers")}
          />
        </div>

        <div className="mt-8 flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={onStart}
            disabled={!ready}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--ink)] px-6 py-3 text-sm font-semibold whitespace-nowrap text-white transition-transform hover:bg-[#343530] active:scale-[0.98] disabled:bg-[#b8b8b2]"
          >
            Process assessment
            <ArrowRight size={17} weight="bold" />
          </button>
          <p className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            <ShieldCheck size={16} weight="duotone" />
            Files are processed for this session and are not stored by the app.
          </p>
        </div>
      </div>
    </main>
  );
}
