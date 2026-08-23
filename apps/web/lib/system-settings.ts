import { prisma } from "@bingo/db";

/** Reads a `SystemSetting` value, falling back to `fallback` if unset — settings are seeded, but never assume. */
export async function getSystemSetting<T>(key: string, fallback: T): Promise<T> {
  const setting = await prisma.systemSetting.findUnique({ where: { key } });
  if (!setting) return fallback;
  return setting.value as T;
}

export async function isMaintenanceModeEnabled(): Promise<boolean> {
  return getSystemSetting("maintenance.enabled", false);
}

export async function isRegistrationEnabled(): Promise<boolean> {
  return getSystemSetting("registration.enabled", true);
}
