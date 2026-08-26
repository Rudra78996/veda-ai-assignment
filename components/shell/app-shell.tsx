"use client";

import {
  FileText,
  Gear,
  House,
  Question,
  Sparkle,
  UserCircle,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

export function AppShell({
  children,
  compact = false,
  onNewAssessment,
}: {
  children: ReactNode;
  compact?: boolean;
  onNewAssessment?: () => void;
}) {
  return (
    <div className="min-h-[100dvh] bg-[var(--canvas)] lg:grid lg:grid-cols-[196px_minmax(0,1fr)]">
      <aside className="hidden border-r border-[var(--line)] bg-[var(--surface)] lg:flex lg:h-[100dvh] lg:flex-col lg:justify-between lg:px-4 lg:py-5">
        <div>
          <Brand />
          <nav aria-label="Primary navigation" className="mt-9 grid gap-1.5">
            <NavItem icon={<House size={19} weight="duotone" />} label="Overview" />
            <NavItem
              icon={<FileText size={19} weight="duotone" />}
              label="Assessments"
              active
            />
          </nav>
          {compact && onNewAssessment ? (
            <button
              type="button"
              onClick={onNewAssessment}
              className="mt-6 w-full rounded-[var(--radius-control)] bg-[var(--ink)] px-3 py-2.5 text-sm font-semibold whitespace-nowrap text-white transition-transform active:scale-[0.98]"
            >
              New assessment
            </button>
          ) : null}
        </div>

        <nav aria-label="Support navigation" className="grid gap-1.5">
          <NavItem icon={<Question size={19} />} label="Help" />
          <NavItem icon={<Gear size={19} />} label="Settings" />
          <div className="mt-3 flex items-center gap-2.5 border-t border-[var(--line)] pt-4">
            <UserCircle size={30} weight="duotone" className="text-[var(--muted)]" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Teacher</p>
              <p className="truncate text-xs text-[var(--muted)]">Review workspace</p>
            </div>
          </div>
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="flex h-16 items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-4 lg:hidden">
          <Brand />
          {compact && onNewAssessment ? (
            <button
              type="button"
              onClick={onNewAssessment}
              className="rounded-[var(--radius-control)] border border-[var(--line)] px-3 py-2 text-sm font-semibold"
            >
              New
            </button>
          ) : (
            <UserCircle size={30} weight="duotone" aria-label="Teacher profile" />
          )}
        </header>
        {children}
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5" aria-label="VedaAI">
      <span className="grid size-8 place-items-center rounded-[9px] bg-[var(--accent)] text-white">
        <Sparkle size={18} weight="fill" aria-hidden="true" />
      </span>
      <span className="text-[15px] font-bold tracking-[-0.02em]">VedaAI</span>
    </div>
  );
}

function NavItem({
  icon,
  label,
  active = false,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-left text-sm font-medium transition-colors ${
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent-dark)]"
          : "text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
