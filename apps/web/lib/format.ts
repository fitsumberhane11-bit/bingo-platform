/**
 * Shared Ethiopian-context formatting helpers. Money is always displayed
 * with thousands separators (never floating-point math — this only ever
 * touches display strings, real amounts stay Decimal end to end). Dates are
 * always shown in Africa/Addis_Ababa regardless of the viewer's own browser
 * timezone or where the Node process happens to be running — this is an
 * Ethiopia-focused platform, so game start times etc. should read the same
 * for every player rather than silently reflecting whoever's machine clock
 * they're on.
 */

const ETB_FORMATTER = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function formatETB(amount: number | string | { toString(): string }): string {
  const n = typeof amount === "object" ? Number(amount.toString()) : Number(amount);
  if (!Number.isFinite(n)) return "ETB 0";
  return `ETB ${ETB_FORMATTER.format(n)}`;
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Africa/Addis_Ababa",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DATE_ONLY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Africa/Addis_Ababa",
  year: "numeric",
  month: "short",
  day: "numeric",
});

const TIME_ONLY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Africa/Addis_Ababa",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatEthiopianDateTime(date: Date | string): string {
  return DATE_TIME_FORMATTER.format(new Date(date));
}

export function formatEthiopianDate(date: Date | string): string {
  return DATE_ONLY_FORMATTER.format(new Date(date));
}

export function formatEthiopianTime(date: Date | string): string {
  return TIME_ONLY_FORMATTER.format(new Date(date));
}
