"use client";

import { ChevronDown } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";

import { Card, CardBody } from "@/components/ui/Card";

/**
 * A section you can fold away once you've read it (build report item 01).
 *
 * Every screen renders fully expanded, so getting an overview means scrolling
 * past everything. Folding a section is the cheapest way to make a long screen
 * short again.
 *
 * Two deliberate choices:
 *
 * The chevron sits on the LEFT of the heading, and rows keep theirs on the
 * right. Accounts and Debt rows already expand, so without that separation
 * there would be two identical controls meaning different things a few pixels
 * apart.
 *
 * Collapsed state lives in a module-level store rather than component state,
 * so folding a section survives navigating to another tab and back — but not a
 * reload. Everything opens expanded when the app starts, which is the state
 * you want when you're looking for something rather than resuming.
 */

const collapsed = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isCollapsed(id: string): boolean {
  return collapsed.has(id);
}

export function toggleSection(id: string): void {
  if (collapsed.has(id)) collapsed.delete(id);
  else collapsed.add(id);
  emit();
}

export function CollapsibleSection({
  id,
  title,
  description,
  action,
  children,
  defaultCollapsed = false,
}: {
  /** Stable across renders — it keys the open/closed state. */
  id: string;
  title: string;
  description?: string;
  /** Totals or buttons. Kept out of the tap target so they stay usable. */
  action?: ReactNode;
  children: ReactNode;
  defaultCollapsed?: boolean;
}) {
  const open = !useSyncExternalStore(
    subscribe,
    () => isCollapsed(id),
    // The server has no collapsed state, so it always renders open. Matching
    // that on first paint avoids a hydration mismatch.
    () => defaultCollapsed,
  );

  return (
    <Card>
      <div className="flex items-center gap-1 border-b border-line px-2 py-2.5 pr-4">
        <button
          type="button"
          onClick={() => toggleSection(id)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-surface-2"
        >
          <ChevronDown
            size={16}
            strokeWidth={2}
            className={`shrink-0 text-muted transition-transform duration-200 ${
              open ? "" : "-rotate-90"
            }`}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-tight">
              {title}
            </span>
            {description ? (
              <span className="mt-0.5 block truncate text-[11px] text-faint">
                {description}
              </span>
            ) : null}
          </span>
        </button>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      {/* The content is unmounted when closed rather than hidden.
          The tidier grid-template-rows 0fr/1fr animation was tried first and
          silently failed: the track kept computing to its content height, so
          the section reported itself collapsed while still filling the screen.
          A collapse that doesn't collapse is worse than one that doesn't
          animate, so this stays blunt and certain — the open state fades in,
          which is enough to stop the jump. */}
      {open ? (
        <div className="animate-[fade-in_160ms_ease-out]">{children}</div>
      ) : null}

      {!open ? (
        <CardBody className="py-2 text-center text-[11px] text-faint">
          Collapsed — totals above still include it
        </CardBody>
      ) : null}
    </Card>
  );
}
