"use client";

import { ProcessingView } from "@/components/processing/processing-view";
import { ReviewWorkspace } from "@/components/review/review-workspace";
import { AppShell } from "@/components/shell/app-shell";
import { UploadWorkspace } from "@/components/upload/upload-workspace";
import { consolidateAnswers, consolidateQuestions } from "@/lib/analysis/consolidate";
import { analyzePage, mapWithConcurrency, postJson } from "@/lib/client-api";
import {
  prepareDocument,
  revokePreparedDocument,
} from "@/lib/documents/prepare";
import type {
  AnswerBlock,
  AnswerMapping,
  AssessmentResult,
  DocumentKind,
  ExtractedQuestion,
  Grade,
  PreparedDocument,
  ProcessingPhase,
} from "@/lib/types";
import { useEffect, useRef, useState } from "react";

type PageQuestionResponse = { questions: ExtractedQuestion[] };
type PageAnswerResponse = { blocks: AnswerBlock[] };
type MappingResponse = {
  mappings: AnswerMapping[];
  unmatchedAnswerBlockIds: string[];
  warnings: string[];
};
type GradeResponse = { grades: Grade[]; warnings: string[] };

export function AssessmentApp() {
  const [questionDocument, setQuestionDocument] = useState<PreparedDocument | null>(null);
  const [answerDocument, setAnswerDocument] = useState<PreparedDocument | null>(null);
  const [preparingKind, setPreparingKind] = useState<DocumentKind | null>(null);
  const [uploadErrors, setUploadErrors] = useState<
    Partial<Record<DocumentKind, string | null>>
  >({});
  const [phase, setPhase] = useState<ProcessingPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [processingTitle, setProcessingTitle] = useState("");
  const [processingDetail, setProcessingDetail] = useState("");
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const documentsRef = useRef({ questionDocument, answerDocument });

  useEffect(() => {
    documentsRef.current = { questionDocument, answerDocument };
  }, [questionDocument, answerDocument]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      revokePreparedDocument(documentsRef.current.questionDocument);
      revokePreparedDocument(documentsRef.current.answerDocument);
    };
  }, []);

  async function handleFiles(kind: DocumentKind, files: File[]) {
    setPreparingKind(kind);
    setUploadErrors((current) => ({ ...current, [kind]: null }));
    try {
      const prepared = await prepareDocument(kind, files);
      if (kind === "questions") {
        revokePreparedDocument(questionDocument);
        setQuestionDocument(prepared);
      } else {
        revokePreparedDocument(answerDocument);
        setAnswerDocument(prepared);
      }
    } catch (error) {
      setUploadErrors((current) => ({
        ...current,
        [kind]: error instanceof Error ? error.message : "The document could not be prepared.",
      }));
    } finally {
      setPreparingKind(null);
    }
  }

  function removeDocument(kind: DocumentKind) {
    if (kind === "questions") {
      revokePreparedDocument(questionDocument);
      setQuestionDocument(null);
    } else {
      revokePreparedDocument(answerDocument);
      setAnswerDocument(null);
    }
    setUploadErrors((current) => ({ ...current, [kind]: null }));
  }

  async function processAssessment() {
    if (!questionDocument || !answerDocument) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setProcessingError(null);
    setResult(null);

    try {
      setPhase("questions");
      setProgress(10);
      setProcessingTitle("Reading the question paper");
      setProcessingDetail(`Preparing ${questionDocument.pages.length} question ${questionDocument.pages.length === 1 ? "page" : "pages"}`);

      let completedQuestions = 0;
      const questionPages = await mapWithConcurrency(
        questionDocument.pages,
        1,
        async (page) => {
          setProcessingDetail(
            `Extracting questions from page ${page.pageNumber} of ${questionDocument.pages.length}`,
          );
          const response = await analyzePage<PageQuestionResponse>(
            "questions",
            page,
            questionDocument.pages.length,
            controller.signal,
          );
          completedQuestions += 1;
          setProgress(10 + (completedQuestions / questionDocument.pages.length) * 25);
          return response.questions;
        },
      );

      setPhase("answers");
      setProcessingTitle("Finding handwritten answers");
      setProcessingDetail(`Preparing ${answerDocument.pages.length} answer ${answerDocument.pages.length === 1 ? "page" : "pages"}`);

      let completedAnswers = 0;
      const answerPages = await mapWithConcurrency(
        answerDocument.pages,
        1,
        async (page) => {
          setProcessingDetail(
            `Locating answers on page ${page.pageNumber} of ${answerDocument.pages.length}`,
          );
          const response = await analyzePage<PageAnswerResponse>(
            "answers",
            page,
            answerDocument.pages.length,
            controller.signal,
          );
          completedAnswers += 1;
          setProgress(35 + (completedAnswers / answerDocument.pages.length) * 35);
          return response.blocks;
        },
      );

      setPhase("consolidating");
      setProgress(72);
      setProcessingTitle("Joining multi-page responses");
      setProcessingDetail("Preserving question order and answer continuations");
      const questions = consolidateQuestions(questionPages);
      const answers = consolidateAnswers(answerPages);
      if (questions.length === 0) {
        throw new Error("No assessable questions were detected. Check the question paper and try again.");
      }

      setPhase("mapping");
      setProgress(78);
      setProcessingTitle("Matching answers to questions");
      setProcessingDetail("Using labels first, then checking unresolved responses by meaning");
      const mapping = await postJson<MappingResponse>(
        "/api/analyze/map",
        { questions, answers },
        controller.signal,
      );

      setPhase("grading");
      setProgress(88);
      setProcessingTitle("Preparing teacher feedback");
      setProcessingDetail("Reviewing mapped responses and calculating available marks");
      const grading = await postJson<GradeResponse>(
        "/api/analyze/grade",
        { questions, answers, mappings: mapping.mappings },
        controller.signal,
      );

      setProgress(100);
      setProcessingDetail("Assessment ready");
      setResult({
        questions,
        answers,
        mappings: mapping.mappings,
        grades: grading.grades,
        unmatchedAnswerBlockIds: mapping.unmatchedAnswerBlockIds,
        warnings: [...mapping.warnings, ...grading.warnings],
      });
      setPhase("complete");
    } catch (error) {
      if (controller.signal.aborted) {
        setPhase("idle");
        setProgress(0);
        return;
      }
      setPhase("error");
      setProcessingError(
        error instanceof Error
          ? error.message
          : "The assessment could not be processed. Please try again.",
      );
    }
  }

  function cancelProcessing() {
    abortRef.current?.abort();
    setPhase("idle");
    setProgress(0);
    setProcessingError(null);
  }

  function newAssessment() {
    abortRef.current?.abort();
    revokePreparedDocument(questionDocument);
    revokePreparedDocument(answerDocument);
    setQuestionDocument(null);
    setAnswerDocument(null);
    setResult(null);
    setPhase("idle");
    setProgress(0);
    setProcessingError(null);
    setUploadErrors({});
  }

  if (phase === "complete" && result && answerDocument) {
    return (
      <AppShell compact onNewAssessment={newAssessment}>
        <ReviewWorkspace result={result} answerDocument={answerDocument} />
      </AppShell>
    );
  }

  if (phase !== "idle") {
    return (
      <AppShell>
        <ProcessingView
          progress={progress}
          title={processingTitle}
          detail={processingDetail}
          error={processingError}
          onRetry={processAssessment}
          onCancel={cancelProcessing}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <UploadWorkspace
        questionDocument={questionDocument}
        answerDocument={answerDocument}
        preparingKind={preparingKind}
        errors={uploadErrors}
        onFiles={handleFiles}
        onRemove={removeDocument}
        onStart={processAssessment}
      />
    </AppShell>
  );
}
