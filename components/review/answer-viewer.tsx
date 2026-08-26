"use client";

import { boxToPercent } from "@/lib/analysis/coordinates";
import { locateAnswerPage } from "@/lib/client-api";
import type {
  AnswerBlock,
  AnswerMapping,
  ExtractedQuestion,
  PageRegion,
  PreparedDocument,
} from "@/lib/types";
import {
  ArrowsOutSimple,
  FileText,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";

type PageLocationState = {
  status: "pending" | "success" | "failed";
  regionsByBlockId: Record<string, PageRegion[]>;
};

export function AnswerViewer({
  answerDocument,
  questions,
  answers,
  mappings,
  selectedQuestionId,
}: {
  answerDocument: PreparedDocument;
  questions: ExtractedQuestion[];
  answers: AnswerBlock[];
  mappings: AnswerMapping[];
  selectedQuestionId: string | null;
}) {
  const [zoom, setZoom] = useState(1);
  const [pageLocations, setPageLocations] = useState<Record<number, PageLocationState>>({});
  const requestedPages = useRef(new Set<number>());
  const selectedQuestion = questions.find((question) => question.id === selectedQuestionId);
  const selectedMapping = mappings.find((mapping) => mapping.questionId === selectedQuestionId);
  const selectedBlocks = useMemo(() => {
    if (!selectedMapping) return [];
    return selectedMapping.answerBlockIds
      .map((id) => answers.find((answer) => answer.id === id))
      .filter((answer): answer is AnswerBlock => Boolean(answer));
  }, [answers, selectedMapping]);
  const baseRegions = useMemo(
    () => selectedBlocks.flatMap((block) => block.regions),
    [selectedBlocks],
  );
  const pageAnswerCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const answer of answers) {
      const pages = new Set(
        answer.regions.length > 0
          ? answer.regions.map((region) => region.pageNumber)
          : [answer.pageNumber],
      );
      for (const pageNumber of pages) {
        counts.set(pageNumber, (counts.get(pageNumber) ?? 0) + 1);
      }
    }
    return counts;
  }, [answers]);
  const densePageNumbers = useMemo(
    () => [...pageAnswerCounts.entries()].filter(([, count]) => count >= 5).map(([page]) => page),
    [pageAnswerCounts],
  );
  const targetPageNumbers = useMemo(() => {
    const pages = new Set<number>();
    for (const block of selectedBlocks) {
      const blockPages = block.regions.length > 0
        ? block.regions.map((region) => region.pageNumber)
        : [block.pageNumber];
      for (const pageNumber of blockPages) {
        if (densePageNumbers.includes(pageNumber)) pages.add(pageNumber);
      }
    }
    return [...pages].sort((a, b) => a - b);
  }, [densePageNumbers, selectedBlocks]);
  const requiresTargetedLocation = targetPageNumbers.length > 0;
  const targetPending = requiresTargetedLocation && targetPageNumbers.some(
    (pageNumber) => pageLocations[pageNumber]?.status !== "success" && pageLocations[pageNumber]?.status !== "failed",
  );
  const targetFailed = requiresTargetedLocation && !targetPending && targetPageNumbers.some(
    (pageNumber) => pageLocations[pageNumber]?.status === "failed",
  );
  const regions = useMemo(
    () => {
      if (!requiresTargetedLocation) return baseRegions;
      const densePages = new Set(targetPageNumbers);
      return selectedBlocks.flatMap((block) => {
        const blockRegions = block.regions.length > 0
          ? block.regions
          : [{ id: `${block.id}-page`, pageNumber: block.pageNumber, box: { x: 0, y: 0, width: 0, height: 0 }, kind: "answer" as const }];
        return blockRegions.flatMap((region) => {
          if (!densePages.has(region.pageNumber)) return [region];
          return pageLocations[region.pageNumber]?.regionsByBlockId[block.id] ?? [];
        });
      });
    },
    [baseRegions, pageLocations, requiresTargetedLocation, selectedBlocks, targetPageNumbers],
  );

  useEffect(() => {
    if (!requiresTargetedLocation) return;
    const controllers: AbortController[] = [];
    const startedPages: number[] = [];
    const completedPages = new Set<number>();
    const requested = requestedPages.current;
    const pageByNumber = new Map(
      answerDocument.pages.map((page) => [page.pageNumber, page]),
    );
    for (const pageNumber of targetPageNumbers) {
      if (requested.has(pageNumber)) continue;
      const page = pageByNumber.get(pageNumber);
      if (!page) continue;
      requested.add(pageNumber);
      startedPages.push(pageNumber);
      const controller = new AbortController();
      controllers.push(controller);
      void Promise.resolve().then(() => {
        setPageLocations((current) => ({
          ...current,
          [pageNumber]: { status: "pending", regionsByBlockId: {} },
        }));
      });
      const pageBlocks = answers.filter((block) => {
        const blockPages = block.regions.length > 0
          ? block.regions.map((region) => region.pageNumber)
          : [block.pageNumber];
        return blockPages.includes(pageNumber);
      }).sort((a, b) => a.readingOrder - b.readingOrder || a.id.localeCompare(b.id));
      const targets = pageBlocks.map((block, targetIndex) => ({
        targetIndex,
        label: questions.find((question) => mappings.some((mapping) =>
          mapping.questionId === question.id && mapping.answerBlockIds.includes(block.id),
        ))?.originalLabel ?? block.detectedLabel ?? "",
        answerLabel: null,
        transcriptionPreview: block.transcription.slice(0, 140),
      }));
      void locateAnswerPage(page, targets, controller.signal)
        .then((result) => {
          completedPages.add(pageNumber);
          const regionsByBlockId: Record<string, PageRegion[]> = {};
          for (const location of result.locations) {
            const block = pageBlocks[location.targetIndex];
            if (!block) continue;
            (regionsByBlockId[block.id] ??= []).push({
              id: `targeted-${pageNumber}-${block.id}`,
              pageNumber,
              box: location.box,
              kind: "answer",
            });
          }
          setPageLocations((current) => ({
            ...current,
            [pageNumber]: {
              status: Object.keys(regionsByBlockId).length > 0 ? "success" : "failed",
              regionsByBlockId,
            },
          }));
        })
        .catch(() => {
          completedPages.add(pageNumber);
          if (controller.signal.aborted) return;
          setPageLocations((current) => ({
            ...current,
            [pageNumber]: { status: "failed", regionsByBlockId: {} },
          }));
        });
    }
    return () => {
      controllers.forEach((controller) => controller.abort());
      for (const pageNumber of startedPages) {
        if (!completedPages.has(pageNumber)) requested.delete(pageNumber);
      }
    };
  }, [answerDocument, answers, mappings, questions, requiresTargetedLocation, targetPageNumbers]);

  useEffect(() => {
    const firstRegion = regions[0];
    if (!firstRegion) return;
    const element = document.getElementById(`answer-page-${firstRegion.pageNumber}`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedQuestionId, regions]);

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#e9e8e4]" aria-label="Answer sheet viewer">
      <header className="flex min-h-16 items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
            <FileText size={16} />
            Student answer sheet
          </div>
          <p className="mt-1 truncate text-sm font-semibold">
            {selectedQuestion
              ? `Question ${selectedQuestion.originalLabel}`
              : "Select a question to locate its answer"}
          </p>
        </div>
        <div className="flex shrink-0 items-center rounded-[10px] border border-[var(--line)] bg-[var(--surface)] p-1">
          <ViewerButton
            label="Zoom out"
            onClick={() => setZoom((current) => Math.max(0.72, current - 0.14))}
          >
            <MagnifyingGlassMinus size={17} />
          </ViewerButton>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="min-w-12 px-1 text-[11px] font-semibold text-[var(--muted)]"
            aria-label="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <ViewerButton
            label="Zoom in"
            onClick={() => setZoom((current) => Math.min(1.56, current + 0.14))}
          >
            <MagnifyingGlassPlus size={17} />
          </ViewerButton>
          <ViewerButton label="Fit page" onClick={() => setZoom(1)}>
            <ArrowsOutSimple size={17} />
          </ViewerButton>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-auto px-3 py-6 scrollbar-thin sm:px-6">
        {selectedMapping?.status === "unanswered" ? (
          <div className="sticky top-0 z-[2] mx-auto mb-4 max-w-[680px] rounded-[12px] border border-[var(--line)] bg-[rgba(253,253,252,0.94)] px-4 py-3 text-sm text-[var(--muted)] shadow-sm backdrop-blur">
            No corresponding answer was detected for this question.
          </div>
        ) : null}
        {requiresTargetedLocation && (targetPending || targetFailed) ? (
          <div className="sticky top-0 z-[2] mx-auto mb-4 max-w-[680px] rounded-[12px] border border-[var(--line)] bg-[rgba(253,253,252,0.94)] px-4 py-3 text-sm text-[var(--muted)] shadow-sm backdrop-blur">
            {targetFailed
              ? "The exact location could not be verified, so no potentially incorrect highlight is shown."
              : "Verifying answer locations on this page…"}
          </div>
        ) : null}

        <div className="mx-auto grid w-full justify-items-center gap-5">
          {answerDocument.pages.map((page) => (
            <AnswerPage
              key={page.id}
              page={page}
              zoom={zoom}
              regions={regions.filter((region) => region.pageNumber === page.pageNumber)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function AnswerPage({
  page,
  zoom,
  regions,
}: {
  page: PreparedDocument["pages"][number];
  zoom: number;
  regions: PageRegion[];
}) {
  return (
    <figure
      id={`answer-page-${page.pageNumber}`}
      className="relative m-0 overflow-hidden rounded-[6px] bg-white shadow-[0_16px_38px_rgba(57,52,47,0.16)] transition-[width]"
      style={{
        width: `${Math.min(96, 70 * zoom)}%`,
        maxWidth: `${760 * zoom}px`,
        aspectRatio: `${page.width} / ${page.height}`,
      }}
    >
      {/* Blob URLs are local, ephemeral page renders. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={page.previewUrl}
        alt={`Student answer sheet page ${page.pageNumber}`}
        className="absolute inset-0 h-full w-full object-contain"
      />
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {regions.map((region) => (
          <span
            key={region.id}
            className="highlight-region absolute rounded-[5px] border-2 border-[#49a36c] bg-[rgba(81,183,117,0.2)] shadow-[0_0_0_1px_rgba(255,255,255,0.65)_inset]"
            style={boxToPercent(region.box)}
          />
        ))}
      </div>
      <figcaption className="absolute right-2 bottom-2 rounded-[6px] bg-[rgba(36,37,34,0.82)] px-2 py-1 text-[10px] font-medium text-white">
        Page {page.pageNumber}
      </figcaption>
    </figure>
  );
}

function ViewerButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid size-8 place-items-center rounded-[7px] text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
      aria-label={label}
    >
      {children}
    </button>
  );
}
