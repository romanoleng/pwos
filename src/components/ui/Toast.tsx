"use client";

import { Check, Undo2, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Undo toasts (CLAUDE.md §9b).
 *
 * The app applies destructive actions optimistically and offers an undo window
 * rather than asking "are you sure?" first. Confirmation dialogs train you to
 * dismiss without reading, which is how accidents actually happen; an undo
 * window is both faster in the common case and safer in the rare one.
 */

export type Toast = {
  id: string;
  message: string;
  tone: "neutral" | "success" | "error";
  /** When present, the toast shows an Undo button for `durationMs`. */
  onUndo?: () => void | Promise<void>;
  durationMs: number;
};

type ToastInput = {
  message: string;
  tone?: Toast["tone"];
  onUndo?: () => void | Promise<void>;
  durationMs?: number;
};

type ToastApi = {
  show: (toast: ToastInput) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (input: ToastInput) => {
      counter += 1;
      const id = `toast-${counter}`;
      // 8s for undoable actions — long enough to notice a mistake on a phone,
      // short enough not to linger. Plain confirmations go sooner.
      const durationMs = input.durationMs ?? (input.onUndo ? 8000 : 4000);
      const toast: Toast = {
        id,
        message: input.message,
        tone: input.tone ?? "neutral",
        onUndo: input.onUndo,
        durationMs,
      };
      setToasts((current) => [...current, toast]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), durationMs),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        // Assertive: an undo offer is time-limited, so a screen reader must not
        // queue it behind other announcements.
        role="status"
        aria-live="assertive"
        className="pb-safe pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-20 md:pb-6"
      >
        {toasts.map((toast) => (
          <ToastRow key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const toneClass =
    toast.tone === "error"
      ? "border-loss/40"
      : toast.tone === "success"
        ? "border-gain/40"
        : "border-line-2";

  return (
    <div
      className={`pointer-events-auto relative flex w-full max-w-md items-center gap-3 overflow-hidden rounded-xl border ${toneClass} bg-raise px-3.5 py-2.5 shadow-lg`}
    >
      {toast.tone === "success" ? (
        <Check size={14} strokeWidth={2} className="shrink-0 text-gain" />
      ) : null}

      <p className="min-w-0 flex-1 truncate text-xs">{toast.message}</p>

      {toast.onUndo ? (
        <button
          type="button"
          onClick={async () => {
            onDismiss();
            await toast.onUndo?.();
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line-2 px-2 py-1 text-[11px] font-medium transition-colors hover:bg-surface-2"
        >
          <Undo2 size={12} strokeWidth={2} />
          Undo
        </button>
      ) : null}

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 text-faint transition-colors hover:text-ink"
      >
        <X size={13} strokeWidth={2} />
      </button>

      {/* Draining bar makes the undo window visible rather than a guess. */}
      {toast.onUndo ? (
        <span
          aria-hidden
          className="absolute inset-x-3.5 bottom-1 h-px origin-left bg-accent/40"
          style={{ animation: `pwos-drain ${toast.durationMs}ms linear forwards` }}
        />
      ) : null}
    </div>
  );
}
