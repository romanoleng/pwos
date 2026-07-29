"use client";

import { useEffect, useRef, useState } from "react";

import { Money } from "./Money";

/**
 * A money figure that rolls to its value instead of snapping (Romano's ask,
 * 2026-07-29 — "I want the numbers moving, it looks cool"). It's an honest
 * count-up, not a fake live drift: it animates from the previous figure to the
 * real one over ~0.85s and then sits on the true number — a finance app must
 * never *display* a value that isn't the actual one, so the movement is a
 * reveal, not an invented balance.
 *
 * Wraps <Money>, so privacy masking ("R ••••"), tabular figures and tone all
 * carry through unchanged. Honours prefers-reduced-motion by snapping.
 */
export function CountUpMoney(props: React.ComponentProps<typeof Money>) {
  const { value, ...rest } = props;
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0); // first reveal counts up from zero
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    if (reduce || from === value) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const duration = 850;
    let startTs: number | null = null;
    const tick = (ts: number) => {
      if (startTs === null) startTs = ts;
      const t = Math.min(1, (ts - startTs) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic — quick then settle
      setDisplay(from + (value - from) * eased);
      if (t < 1) {
        raf.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
        setDisplay(value);
      }
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value]);

  return <Money value={display} {...rest} />;
}
