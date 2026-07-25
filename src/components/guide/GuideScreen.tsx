"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Card, CardBody } from "@/components/ui/Card";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { formatDate } from "@/lib/format";
import {
  CHANGELOG,
  GUIDE_UPDATED,
  HELP,
  UNDER_HOOD,
  type GuideBlock,
} from "@/lib/guide";

type Tab = "help" | "new" | "hood";

const TABS: { key: Tab; label: string }[] = [
  { key: "help", label: "Help" },
  { key: "new", label: "What's new" },
  { key: "hood", label: "Under the hood" },
];

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/**
 * The Guide hub (Romano's ask, 2026-07-25) — Help, What's new and Under the
 * hood. Content is in lib/guide.ts, versioned with the code so it can't drift
 * from what the app actually does.
 */
export function GuideScreen() {
  const [tab, setTab] = useState<Tab>("help");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                tab === t.key ? "bg-accent text-white" : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="hidden text-[11px] text-faint sm:block">
          Updated {formatDate(GUIDE_UPDATED)}
        </span>
      </div>

      {tab === "help" ? <HelpTab /> : null}
      {tab === "new" ? <ChangelogTab /> : null}
      {tab === "hood" ? <UnderHoodTab /> : null}
    </div>
  );
}

function HelpTab() {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const shown = useMemo(() => {
    if (!query) return HELP;
    return HELP.filter((b) => {
      const hay = [b.heading, ...b.paragraphs, ...(b.bullets ?? [])].join(" ").toLowerCase();
      return hay.includes(query);
    });
  }, [query]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
        <Search size={15} strokeWidth={1.75} className="shrink-0 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the guide…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-faint"
        />
      </div>

      {shown.length === 0 ? (
        <Card>
          <CardBody className="py-8 text-center text-sm text-muted">
            Nothing matches “{q}”. Try a screen name, like “budget” or “milestone”.
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {shown.map((block) => (
            <CollapsibleSection
              key={block.heading}
              id={`help-${slug(block.heading)}`}
              title={block.heading}
              defaultCollapsed={!query}
            >
              <BlockBody block={block} />
            </CollapsibleSection>
          ))}
        </div>
      )}
    </div>
  );
}

function ChangelogTab() {
  return (
    <div className="space-y-2.5">
      {CHANGELOG.map((entry) => (
        <Card key={`${entry.date}-${entry.title}`}>
          <CardBody>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold tracking-tight">{entry.title}</h3>
              <span className="shrink-0 text-[11px] text-faint">{formatDate(entry.date)}</span>
            </div>
            <ul className="mt-2 space-y-1.5">
              {entry.points.map((point, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-muted">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function UnderHoodTab() {
  return (
    <div className="space-y-2.5">
      {UNDER_HOOD.map((block) => (
        <Card key={block.heading}>
          <CardBody>
            <h3 className="text-sm font-semibold tracking-tight">{block.heading}</h3>
            <BlockBody block={block} className="mt-2" />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function BlockBody({ block, className = "" }: { block: GuideBlock; className?: string }) {
  return (
    <div className={`space-y-2 pb-3 pr-2 ${className}`}>
      {block.paragraphs.map((p, i) => (
        <p key={i} className="text-[13px] leading-relaxed text-muted">
          {p}
        </p>
      ))}
      {block.bullets ? (
        <ul className="space-y-1.5 pt-0.5">
          {block.bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-muted">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
