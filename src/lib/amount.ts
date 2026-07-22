/**
 * Parsing amounts the way they're actually typed here (CLAUDE.md §7).
 *
 * South Africa writes R1 234 567,89 — space for thousands, comma for the
 * decimal. An <input type="number"> rejects that outright: the HTML value
 * sanitisation algorithm only accepts a full stop, so typing "50,50" leaves the
 * field empty and the cents silently vanish. That is why every amount field is
 * a text input parsed through here instead.
 *
 * Both conventions are accepted, because a figure pasted from a bank statement
 * may well arrive in either.
 */

/**
 * Which separator is the decimal point:
 *
 *   "50,50"      -> 50.5    (en-ZA: comma is the decimal separator)
 *   "50.50"      -> 50.5    (also accepted; plenty of sources use a full stop)
 *   "1 234,56"   -> 1234.56 (space is a thousands separator)
 *   "1,234.56"   -> 1234.56 (US style: the last separator is the decimal one)
 *   "1.234,56"   -> 1234.56 (European style, same rule)
 *
 * When both appear, the rightmost wins — it is the only reading that makes
 * sense of every convention above.
 */
export function parseAmount(input: string | number | null | undefined): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (input === null || input === undefined) return null;

  // Strip spaces of every kind, including the non-breaking ones Intl emits.
  const text = input.replace(/[\s  ]/g, "").replace(/^R/i, "");
  if (text === "") return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  let normalised: string;
  if (lastComma === -1 && lastDot === -1) {
    normalised = text;
  } else if (lastComma > lastDot) {
    // Comma is the decimal separator; any full stops are thousands separators.
    normalised = text.replace(/\./g, "").replace(",", ".");
  } else {
    normalised = text.replace(/,/g, "");
  }

  // Reject anything that isn't a plain signed decimal, so "12ab" doesn't become
  // 12 and a typo doesn't become a silent write.
  if (!/^-?\d*\.?\d*$/.test(normalised) || !/\d/.test(normalised)) return null;

  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

/** True when the text is a usable amount. Blank counts as valid-but-absent. */
export function isValidAmount(input: string): boolean {
  return input.trim() === "" || parseAmount(input) !== null;
}
