"use client";

import { Home, MoreHorizontal } from "lucide-react";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { TAB_CHOICES, setChosenTabs, useChosenTabs } from "@/lib/tabs";

/**
 * Which three screens sit in the middle of the tab bar (Romano's ask).
 *
 * Home and More are fixed; the rest is his. Selection order is slot order, so
 * picking Debt first puts Debt first. Stored per device — what suits a thumb
 * on the phone needn't bind the desktop.
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
        title="Tab bar"
        description="Pick the three middle tabs. Home and More stay put. Saved on this device."
      />
      <CardBody className="space-y-3">
        <div className="flex items-center gap-1.5 rounded-xl bg-tabbar px-3 py-2">
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
        fixed ? "text-tabbar-dim" : "text-black"
      }`}
    >
      {icon}
      {label}
    </span>
  );
}
