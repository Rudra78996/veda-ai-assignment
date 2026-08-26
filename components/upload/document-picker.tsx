"use client";

import {
  CheckCircle,
  FilePdf,
  ImageSquare,
  SpinnerGap,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
import type { PreparedDocument } from "@/lib/types";
import { useId, useRef } from "react";

export function DocumentPicker({
  title,
  description,
  document,
  preparing,
  error,
  onFiles,
  onRemove,
}: {
  title: string;
  description: string;
  document: PreparedDocument | null;
  preparing: boolean;
  error: string | null;
  onFiles: (files: File[]) => void;
  onRemove: () => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section aria-labelledby={`${inputId}-title`} className="min-w-0">
      <div className="mb-2.5 flex items-end justify-between gap-4">
        <div>
          <h2 id={`${inputId}-title`} className="text-sm font-semibold text-[var(--ink)]">
            {title}
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{description}</p>
        </div>
        <span className="shrink-0 text-[11px] font-medium text-[var(--muted)]">PDF or images</span>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="sr-only"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) onFiles(files);
          event.target.value = "";
        }}
      />

      {document ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent-dark)]">
              {document.sourceNames[0]?.toLowerCase().endsWith(".pdf") ? (
                <FilePdf size={21} weight="duotone" />
              ) : (
                <ImageSquare size={21} weight="duotone" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <CheckCircle size={17} weight="fill" className="text-[var(--success)]" />
                Ready to process
              </div>
              <p className="mt-1 truncate text-xs text-[var(--muted)]">
                {document.sourceNames.length === 1
                  ? document.sourceNames[0]
                  : `${document.sourceNames.length} image files`}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {document.pages.length} {document.pages.length === 1 ? "page" : "pages"}
              </p>
            </div>
            <button
              type="button"
              onClick={onRemove}
              className="grid size-9 shrink-0 place-items-center rounded-[9px] text-[var(--muted)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
              aria-label={`Remove ${title.toLowerCase()}`}
            >
              <Trash size={18} />
            </button>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {document.pages.map((page) => (
              <div
                key={page.id}
                className="relative h-16 w-12 shrink-0 overflow-hidden rounded-[6px] border border-[var(--line)] bg-white"
                title={page.name}
              >
                {/* Blob URLs are produced locally and need no image optimization. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={page.previewUrl} alt="" className="h-full w-full object-cover" />
                <span className="absolute right-0.5 bottom-0.5 rounded bg-[rgba(36,37,34,0.8)] px-1 text-[9px] text-white">
                  {page.pageNumber}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={preparing}
          className="group grid min-h-44 w-full place-items-center rounded-[var(--radius-card)] border border-dashed border-[#c9c7c0] bg-[rgba(253,253,252,0.62)] px-5 py-7 text-center transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-70"
        >
          <span>
            <span className="mx-auto grid size-11 place-items-center rounded-[11px] border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] shadow-sm transition-colors group-hover:text-[var(--accent-dark)]">
              {preparing ? (
                <SpinnerGap size={21} className="animate-spin" />
              ) : (
                <UploadSimple size={21} weight="duotone" />
              )}
            </span>
            <span className="mt-3 block text-sm font-semibold">
              {preparing ? "Preparing pages" : "Choose files"}
            </span>
            <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
              One PDF or ordered PNG, JPEG, WebP pages
            </span>
          </span>
        </button>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
