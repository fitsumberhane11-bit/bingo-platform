import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Ethiopian mobile numbers: +251 9XXXXXXXX (Ethio Telecom / Safaricom Ethiopia)
 * or +251 7XXXXXXXX (Safaricom Ethiopia's newer range). Landlines are rejected —
 * this platform only accepts numbers that can plausibly receive SMS OTPs.
 */
export function normalizeEthiopianPhone(raw: string): string | null {
  const trimmed = raw.trim();
  const candidate = trimmed.startsWith("+") ? trimmed : `+251${trimmed.replace(/^0/, "")}`;
  const parsed = parsePhoneNumberFromString(candidate, "ET");
  if (!parsed || !parsed.isValid() || parsed.country !== "ET") return null;
  const national = parsed.nationalNumber; // digits without country code, e.g. "912345678"
  if (!/^[79]\d{8}$/.test(national)) return null;
  return parsed.number; // E.164, e.g. "+251912345678"
}

export function isValidEthiopianPhone(raw: string): boolean {
  return normalizeEthiopianPhone(raw) !== null;
}
