"use client";

import { Home, MoreHorizontal } from "lucide-react";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { TAB_CHOICES, setChosenTabs, useChosenTabs } from "@/lib/tabs";
import {
  MAX_TOP_LINKS,
  TOP_CHOICES,
  setTopEnabled,
  setTopLinks,
  useTopEnabled,
  useTopLinkHrefs,
  type TopPlacement,
} from "@/lib/topTabs";

/**
 * Which three screens sit in the middle of the bottom tab bar, plus the
 * optional quick-access buttons and where they show (Romano's ask).
 *
 * Home and Menu are fixed; the rest is his. Selection order is slot order.
 * Stored per device — what suits a thumb on the phone needn't bind the desktop.
 * The bar is always at the bottom; the floating + button stays bottom-right.
 */
export function TabPicker() {
  const chosen = useChosenTabs();

  function toggle(href: string) {
    if (chosen.includes(href)) {
      // Refuse to drop below three: a two-tab bar with a hole invites a
      // mis-tap. Swap by picking the new one after removing an old one.
      if (chosen.length <= 3 && chosen.length > 1) {
        setChosenTabs(chosen.filter((h) => h !== href).concat(fallbackFor(chosen, href)));
        return;
      }
      return;
    }
    // Adding a fourth replaces the oldest choice, so a tap always does
    // something visible rather than being silently ignored.
    const next = chosen.length >= 3 ? [...chosen.slice(1), href] : [...chosen, href];
    setChosenTabs(next);
  }

  return (
    <Card>
      <CardHeader
        title="Navigation"
        description="Pick the three middle tabs and where the bar sits. Home and Menu stay put. Saved on this device."
      />
      <CardBody className="space-y-3">
        {/* Previews the reverted bar: dark ground, quiet labels. */}
        <div className="flex items-center gap-1.5 rounded-xl border border-line bg-bg px-3 py-2">
          <TabPreview icon={<Home size={14} strokeWidth={2} />} label="Home" fixed />
          {chosen.map((href) => {
            const choice = TAB_CHOICES.find((c) => c.href === href);
            if (!choice) return null;
            const Icon = choice.icon;
            return (
              <TabPreview
                key={href}
                icon={<Icon size={14} strokeWidth={2} />}
                label={choice.label}
              />
            );
          })}
          <TabPreview
            icon={<MoreHorizontal size={14} strokeWidth={2} />}
            label="Menu"
            fixed
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TAB_CHOICES.map((choice) => {
            const active = chosen.includes(choice.href);
            const Icon = choice.icon;
            return (
              <button
                key={choice.href}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(choice.href)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-accent/50 bg-accent/15 text-ink"
                    : "border-line text-muted hover:border-line-2 hover:text-ink"
                }`}
              >
                <Icon size={13} strokeWidth={1.75} />
                {choice.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-faint">
          Picking a fourth swaps out your oldest choice. Everything not on the
          bar stays one tap away under Menu.
        </p>

        <div className="border-t border-line pt-3">
          <p className="text-xs font-medium text-muted">Quick-access buttons</p>
          <p className="mt-0.5 text-[11px] leading-snug text-faint">
            Extra screens, one tap away. Turn on either place (or both) and pick what goes in each.
          </p>
          <div className="mt-3 space-y-4">
            <QuickAccessBlock
              placement="strip"
              title="Below the header"
              hint="A flat strip under the header."
            />
            <QuickAccessBlock
              placement="header"
              title="In the header"
              hint="Icons beside the page title."
            />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function QuickAccessBlock({
  placement,
  title,
  hint,
}: {
  placement: TopPlacement;
  title: string;
  hint: string;
}) {
  const on = useTopEnabled(placement);
  const links = useTopLinkHrefs(placement);

  function toggle(href: string) {
    if (links.includes(href)) {
      setTopLinks(placement, links.filter((h) => h !== href));
      return;
    }
    const next = links.length >= MAX_TOP_LINKS ? [...links.slice(1), href] : [...links, href];
    setTopLinks(placement, next);
  }

  return (
    <div className="rounded-xl border border-line p-3">
      <label className="flex items-center justify-between gap-4">
        <span className="min-w-0">
          <span className="block text-sm font-medium">{title}</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-faint">{hint}</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={title}
          onClick={() => setTopEnabled(placement, !on)}
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
            on ? "bg-accent" : "bg-line-2"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              on ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </label>

      {on ? (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-2 text-[11px] text-faint">
            Up to {MAX_TOP_LINKS} — a {MAX_TOP_LINKS + 1}th swaps out the oldest.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TOP_CHOICES.map((choice) => {
              const active = links.includes(choice.href);
              const Icon = choice.icon;
              return (
                <button
                  key={choice.href}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(choice.href)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "border-accent/50 bg-accent/15 text-ink"
                      : "border-line text-muted hover:border-line-2 hover:text-ink"
                  }`}
                >
                  <Icon size={13} strokeWidth={1.75} />
                  {choice.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function fallbackFor(chosen: string[], removing: string): string[] {
  const replacement = TAB_CHOICES.find(
    (c) => !chosen.includes(c.href) && c.href !== removing,
  );
  return replacement ? [replacement.href] : [];
}

function TabPreview({
  icon, label, fixed = false,
}: {
  icon: React.ReactNode;
  label: string;
  fixed?: boolean;
}) {
  return (
    <span
      className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 text-[9px] font-medium ${
        fixed ? "text-faint" : "text-muted"
      }`}
    >
      {icon}
      {label}
    </span>
  );
}
