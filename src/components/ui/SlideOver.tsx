"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Slide-over panel (CLAUDE.md §9b) — used for add/edit instead of a modal, so
 * the figures you're editing against stay visible behind it.
 *
 * Full-height sheet on desktop, bottom sheet on mobile where a right-hand
 * drawer is awkward to reach one-handed.
 */
export function SlideOver({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    // Stop the page scrolling behind the sheet.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the panel so keyboard and screen-reader users land here.
    const firstField = panelRef.current?.querySelector<HTMLElement>(
      "input, select, textarea, button",
    );
    firstField?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 animate-[backdrop-in_200ms_ease-out] bg-black/50 backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] animate-[sheet-up_280ms_cubic-bezier(0.32,0.72,0,1)] flex-col rounded-t-2xl border border-line-2 bg-surface md:animate-[panel-in_220ms_cubic-bezier(0.32,0.72,0,1)] md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[26rem] md:rounded-none md:rounded-l-2xl md:border-y-0 md:border-r-0"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-muted">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-0.5 shrink-0 rounded-lg p-1 text-faint transition-colors hover:text-ink"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {footer ? (
          <div className="pb-safe border-t border-line px-4 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

/** Labelled field wrapper so every form in the app lines up identically. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="mb-4 block">
      <span className="block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-faint">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-line bg-surface-2 px-3 text-base outline-none transition-colors placeholder:text-faint focus:border-accent sm:text-sm";
