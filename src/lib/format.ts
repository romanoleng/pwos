/**
 * Money / number / date formatting — en-ZA, Africa/Johannesburg (CLAUDE.md §7).
 *
 * Pure and dependency-free so it runs identically on server and client. Every
 * figure in the app goes through here; nothing calls Intl directly.
 *
 * NOTE ON STYLE: `en-ZA` renders 1234567.89 as "R 1 234 567,89" — space
 * grouping, comma decimal. That is the correct South African convention and
 * what Capitec/FNB statements use. The spec's prose writes "R2,000,000"
 * (US style), so if you'd rather see "R1,234,567.89", flip MONEY_LOCALE to
 * "en-US" below — everything else follows automatically.
 */

const MONEY_LOCALE = "en-ZA";
export const TIME_ZONE = "Africa/Johannesburg";

export type Currency = "ZAR" | "USD";

const moneyFormatters = new Map<string, Intl.NumberFormat>();

function moneyFormatter(
  currency: Currency,
  minimumFractionDigits: number,
  maximumFractionDigits: number,
): Intl.NumberFormat {
  const key = `${currency}:${minimumFractionDigits}:${maximumFractionDigits}`;
  let formatter = moneyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(MONEY_LOCALE, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits,
      maximumFractionDigits,
    });
    moneyFormatters.set(key, formatter);
  }
  return formatter;
}

/**
 * en-ZA emits a non-breaking space between the symbol and the digits
 * ("R 1 234"). Bank apps don't. Strip it so the symbol hugs the number, while
 * leaving the *grouping* separators (also NBSP) untouched.
 */
function tightenSymbol(formatted: string): string {
  return formatted.replace(/^([^\d-]+)[\s ]+/u, "$1");
}

/** Standard money. R1 234 567,89 / $1 234,56 */
export function formatMoney(
  value: number,
  currency: Currency = "ZAR",
  options: { decimals?: number } = {},
): string {
  if (!Number.isFinite(value)) return "—";
  const decimals = options.decimals ?? 2;
  return tightenSymbol(moneyFormatter(currency, decimals, decimals).format(value));
}

/** Whole-rand money for headline figures. R1 234 568 */
export function formatMoneyWhole(value: number, currency: Currency = "ZAR"): string {
  return formatMoney(value, currency, { decimals: 0 });
}

/**
 * Crypto unit prices span ~8 orders of magnitude (BTC ≈ R2m, SHIB ≈ R0.0004).
 * A fixed 2dp would render most of the portfolio as "R0,00", so scale the
 * precision to the magnitude.
 */
export function formatUnitPrice(value: number, currency: Currency = "ZAR"): string {
  if (!Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value);
  let decimals: number;
  if (magnitude === 0) decimals = 2;
  else if (magnitude >= 1000) decimals = 0;
  else if (magnitude >= 10) decimals = 2;
  else if (magnitude >= 1) decimals = 3;
  else if (magnitude >= 0.01) decimals = 4;
  else if (magnitude >= 0.0001) decimals = 6;
  else decimals = 8;
  return formatMoney(value, currency, { decimals });
}

/** Compact money for chart axes and tight cells. R1,2M */
export function formatMoneyCompact(value: number, currency: Currency = "ZAR"): string {
  if (!Number.isFinite(value)) return "—";
  return tightenSymbol(
    new Intl.NumberFormat(MONEY_LOCALE, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value),
  );
}

/** Coin quantities. Trims trailing zeros; never uses exponent notation. */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value);
  const decimals = magnitude >= 1000 ? 2 : magnitude >= 1 ? 4 : 8;
  return new Intl.NumberFormat(MONEY_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** 12,4% — pass 12.4, not 0.124. */
export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat(MONEY_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)}%`;
}

/** +12,4% / −3,1% — explicit sign, for deltas where direction is the point. */
export function formatPercentSigned(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPercent(value, decimals)}`;
}

/** +R1 234 / −R1 234 */
export function formatMoneySigned(
  value: number,
  currency: Currency = "ZAR",
  options: { decimals?: number } = {},
): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatMoney(value, currency, options)}`;
}

/** Which token a figure should be painted with. Zero is neutral, not green. */
export function directionOf(value: number): "gain" | "loss" | "flat" {
  if (!Number.isFinite(value) || value === 0) return "flat";
  return value > 0 ? "gain" : "loss";
}

/** 21 Jul 2026 */
export function formatDate(value: Date | string | number): string {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(MONEY_LOCALE, {
    timeZone: TIME_ZONE,
    dateStyle: "medium",
  }).format(date);
}

/** 21 Jul 2026, 19:04 */
export function formatDateTime(value: Date | string | number): string {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(MONEY_LOCALE, {
    timeZone: TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * Airtable stores some dates as free text (Snapshots.`Snapshot Date` is a
 * singleLineText field), so anything date-shaped gets parsed defensively and
 * returns null rather than an Invalid Date that poisons a chart axis.
 */
export function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "updated 4s ago" — the live indicator on the crypto module. */
export function formatRelativeAge(fromMs: number, nowMs: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
