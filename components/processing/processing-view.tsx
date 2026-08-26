"use client";

import { ArrowCounterClockwise, Sparkle, WarningCircle, X } from "@phosphor-icons/react";

export function ProcessingView({
  progress,
  title,
  detail,
  error,
  onRetry,
  onCancel,
}: {
  progress: number;
  title: string;
  detail: string;
  error: string | null;
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <main className="processing-grid grid min-h-[calc(100dvh-64px)] place-items-center px-4 py-12 lg:min-h-[100dvh]">
      <section className="w-full max-w-[480px] rounded-[var(--radius-card)] border border-[var(--line)] bg-[rgba(253,253,252,0.94)] p-6 text-center shadow-[var(--shadow-soft)] backdrop-blur-sm sm:p-8">
        {error ? (
          <>
            <span className="mx-auto grid size-14 place-items-center rounded-[14px] bg-[var(--danger-soft)] text-[var(--danger)]">
              <WarningCircle size={28} weight="duotone" />
            </span>
            <h1 className="mt-5 text-xl font-semibold tracking-[-0.025em]">Processing stopped</h1>
            <p role="alert" className="mx-auto mt-2 max-w-[38ch] text-sm leading-6 text-[var(--muted)]">
              {error}
            </p>
            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--ink)] px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-white active:scale-[0.98]"
              >
                <ArrowCounterClockwise size={17} />
                Try again
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--line)] px-4 py-2.5 text-sm font-semibold whitespace-nowrap"
              >
                <X size={17} />
                Back to upload
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="processing-mark mx-auto grid size-14 place-items-center rounded-[14px] bg-[var(--accent)] text-white shadow-[0_12px_30px_rgba(239,114,71,0.22)]">
              <Sparkle size={27} weight="fill" />
            </span>
            <p className="mt-5 text-xs font-semibold tracking-[0.12em] text-[var(--accent-dark)] uppercase">
              {Math.round(progress)}% complete
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-[-0.025em]">{title}</h1>
            <p aria-live="polite" className="mt-2 text-sm text-[var(--muted)]">
              {detail}
            </p>
            <div
              className="mt-6 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
            >
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-transform duration-300 ease-out"
                style={{ transform: `translateX(${progress - 100}%)` }}
              />
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="mt-6 text-xs font-semibold text-[var(--muted)] underline-offset-4 hover:text-[var(--ink)] hover:underline"
            >
              Cancel processing
            </button>
          </>
        )}
      </section>
    </main>
  );
}
