"use client";

import { Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * "Ask" — the in-app assistant (Tier-1, read-only).
 *
 * A floating button that opens a chat panel. It answers questions about
 * Romano's own money using a snapshot the server assembles from the same
 * figures the screens show; it holds no tools, so it can only talk, never act.
 * The vision is bigger (it should spot the gaps and steer, not just answer) —
 * this is the honest first version of that.
 *
 * It sits bottom-LEFT on mobile so it never collides with the + log button
 * bottom-right; on desktop, where + is hidden, it takes the bottom-right.
 */

type Turn = { role: "user" | "assistant"; content: string };

const GREETING =
  "Hi Romano — ask me anything about your money. What's left to spend this cycle, how the freedom goal is tracking, where your budget's tight. I can read your figures, but I can't change anything yet — use the app for that.";

export function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view. We deliberately do NOT auto-focus the
  // input on open: like WhatsApp, opening the chat shows the whole thread with
  // the input bar resting at the bottom, and the keyboard only rises when the
  // bar is tapped — so the conversation is readable before you commit to typing.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, busy]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setDraft("");
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await response.json()) as { reply?: string; error?: string };
      if (!response.ok || !data.reply) {
        setError(data.error ?? "The assistant couldn't answer just now.");
        return;
      }
      setTurns((prev) => [...prev, { role: "assistant", content: data.reply as string }]);
    } catch {
      setError("Couldn't reach the assistant. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Ask the assistant"
        onClick={() => setOpen(true)}
        className="ask-fab fixed left-4 z-30 grid size-12 place-items-center rounded-full border border-line bg-surface-2 text-accent shadow-[0_6px_20px_rgba(0,0,0,0.35)] transition-transform active:scale-90 md:left-auto md:right-6"
      >
        <Sparkles size={22} strokeWidth={2} />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/40 md:items-end md:justify-end md:p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Ask the assistant"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-auto flex h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface md:mt-0 md:h-[600px] md:max-h-[80dvh] md:w-[26rem] md:rounded-2xl"
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles size={16} strokeWidth={2} className="text-accent" />
                <div>
                  <p className="text-sm font-semibold tracking-tight">Ask</p>
                  <p className="text-[11px] text-faint">Reads your figures · can&apos;t change anything</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2"
              >
                <X size={18} strokeWidth={2} />
              </button>
            </header>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <Bubble role="assistant">{GREETING}</Bubble>
              {turns.map((turn, i) => (
                <Bubble key={i} role={turn.role}>
                  {turn.content}
                </Bubble>
              ))}
              {busy ? (
                <div className="flex items-center gap-1.5 px-1 text-xs text-faint" aria-live="polite">
                  <span className="size-1.5 animate-pulse rounded-full bg-muted" />
                  <span className="size-1.5 animate-pulse rounded-full bg-muted [animation-delay:150ms]" />
                  <span className="size-1.5 animate-pulse rounded-full bg-muted [animation-delay:300ms]" />
                </div>
              ) : null}
              {error ? (
                <p className="rounded-lg border border-loss/30 bg-loss/5 px-3 py-2 text-xs text-loss">
                  {error}
                </p>
              ) : null}
            </div>

            <form
              className="flex shrink-0 items-end gap-2 border-t border-line px-3 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask about your money…"
                className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none placeholder:text-faint focus:border-line-2"
                enterKeyHint="send"
              />
              <button
                type="submit"
                aria-label="Send"
                disabled={busy || draft.trim().length === 0}
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-white transition-opacity disabled:opacity-40"
              >
                <Send size={17} strokeWidth={2} />
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser ? "bg-accent text-white" : "bg-surface-2 text-ink"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
