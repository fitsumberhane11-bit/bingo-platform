import { prisma } from "@bingo/db";

export type SettingType = "string" | "number" | "boolean";

export interface SettingDefinition {
  key: string;
  label: string;
  description: string;
  type: SettingType;
  group: string;
}

/**
 * The editable subset of `SystemSetting` exposed through the admin settings
 * UI, in display order. Every key here must already be seeded (see
 * packages/db/src/seed.ts) — this is deliberately a closed list rather than
 * "edit any key" so the UI can render sensible input types and never lets
 * an admin invent an unused config key by typo.
 */
export const SETTING_DEFINITIONS: SettingDefinition[] = [
  { key: "site.name", label: "Site name", description: "Public-facing site name.", type: "string", group: "General" },
  { key: "registration.enabled", label: "Registration open", description: "Whether new signups are accepted.", type: "boolean", group: "General" },
  { key: "maintenance.enabled", label: "Maintenance mode", description: "Pauses new deposits, withdrawals, ticket purchases, and sign-ups. Live games are unaffected.", type: "boolean", group: "General" },
  { key: "eligibility.minimumAge", label: "Minimum age", description: "Minimum age to register/play.", type: "number", group: "General" },
  { key: "game.maxTicketsPerPlayerDefault", label: "Default max tickets/player", description: "Default per-player ticket limit for new games.", type: "number", group: "Game defaults" },
  { key: "deposit.min", label: "Minimum deposit (ETB)", description: "Smallest single deposit allowed.", type: "number", group: "Deposits" },
  { key: "deposit.max", label: "Maximum deposit (ETB)", description: "Largest single deposit allowed.", type: "number", group: "Deposits" },
  { key: "withdrawal.min", label: "Minimum withdrawal (ETB)", description: "Smallest single withdrawal allowed.", type: "number", group: "Withdrawals" },
  { key: "withdrawal.max", label: "Maximum withdrawal (ETB)", description: "Largest single withdrawal allowed.", type: "number", group: "Withdrawals" },
  { key: "withdrawal.dailyLimit", label: "Daily withdrawal limit (ETB)", description: "Max total withdrawals per user per day.", type: "number", group: "Withdrawals" },
  { key: "withdrawal.autoApproveThreshold", label: "Auto-approve threshold (ETB)", description: "Withdrawals at/under this are auto-approved; 0 = manual review required for everything.", type: "number", group: "Withdrawals" },
];

const DEFINITION_BY_KEY = new Map(SETTING_DEFINITIONS.map((d) => [d.key, d]));

export async function listSettings() {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: SETTING_DEFINITIONS.map((d) => d.key) } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return SETTING_DEFINITIONS.map((def) => ({ ...def, value: byKey.get(def.key) ?? null, updatedAt: rows.find((r) => r.key === def.key)?.updatedAt ?? null }));
}

export class UnknownSettingError extends Error {
  constructor(key: string) {
    super(`"${key}" is not an editable setting.`);
  }
}
export class InvalidSettingValueError extends Error {}

export async function updateSetting(key: string, rawValue: unknown, actorUserId: string) {
  const def = DEFINITION_BY_KEY.get(key);
  if (!def) throw new UnknownSettingError(key);

  let value: string | number | boolean;
  if (def.type === "boolean") {
    if (typeof rawValue !== "boolean") throw new InvalidSettingValueError(`${key} must be true or false.`);
    value = rawValue;
  } else if (def.type === "number") {
    const n = Number(rawValue);
    if (!Number.isFinite(n) || n < 0) throw new InvalidSettingValueError(`${key} must be a non-negative number.`);
    value = n;
  } else {
    if (typeof rawValue !== "string" || rawValue.trim().length === 0) throw new InvalidSettingValueError(`${key} must be a non-empty string.`);
    value = rawValue.trim();
  }

  return prisma.systemSetting.upsert({
    where: { key },
    update: { value, updatedByUserId: actorUserId },
    create: { key, value, description: def.description, updatedByUserId: actorUserId },
  });
}
