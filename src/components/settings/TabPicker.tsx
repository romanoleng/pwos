"use client";

import { Home, MoreHorizontal } from "lucide-react";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { applyNavPosition, useNavPosition, type NavPosition } from "@/lib/navPosition";
import { TAB_CHOICES, setChosenTabs, useChosenTabs } from "@/lib/tabs";

/**
 * Which three screens sit in the middle of the tab bar (Romano's ask), and
 * which edge of the screen the bar lives on.
 *
 * Home and More are fixed; the rest is his. Selection order is slot order, so
 * picking Debt first puts Debt first. Stored per device — what suits a thumb
 * on the phone needn't bind the desktop. Position is per-device for the same
 * reason; the floating + button stays bottom-right regardless, because
 * reachability is a thumb question, not a navigation question.
 */
export function TabPicker() {
  const chosen = useChosenTabs();
  const position = useNavPosition();

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
        description="Pick the three middle tabs and where the bar sits. Home and More stay put. Saved on this device."
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
            label="More"
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
          bar stays one tap away under More.
        </p>

        <div
          role="radiogroup"
          aria-label="Bar position"
          className="border-t border-line pt-3"
        >
          <p className="text-xs font-medium text-muted">Bar position</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(
              [
                { id: "bottom", label: "Bottom", hint: "Under your thumb. The default." },
                { id: "top", label: "Top", hint: "Under the header, off the keyboard." },
              ] as { id: NavPosition; label: string; hint: string }[]
            ).map((option) => {
              const active = position === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => applyNavPosition(option.id)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    active ? "border-accent/50 bg-accent/10" : "border-line hover:border-line-2"
                  }`}
                >
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-faint">
                    {option.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </CardBody>
    </Card>
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
