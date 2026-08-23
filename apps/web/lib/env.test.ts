import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const REQUIRED_SECRETS = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  AUTH_JWT_ACCESS_SECRET: "a".repeat(32),
  AUTH_JWT_REFRESH_SECRET: "b".repeat(32),
  APP_ENCRYPTION_KEY: "c".repeat(32),
};

async function getEnvWithFreshModule() {
  vi.resetModules();
  const mod = await import("./env");
  return mod.getEnv;
}

beforeEach(() => {
  for (const [key, value] of Object.entries(REQUIRED_SECRETS)) vi.stubEnv(key, value);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getEnv production safety gates", () => {
  it("refuses to boot in production with GAME_MONEY_MODE still TEST", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GAME_MONEY_MODE", "TEST");
    vi.stubEnv("ENABLE_MOCK_PAYMENTS", "false");
    const getEnv = await getEnvWithFreshModule();
    expect(() => getEnv()).toThrow(/GAME_MONEY_MODE must be explicitly set to REAL/);
  });

  it("refuses to boot in production with mock payments enabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GAME_MONEY_MODE", "REAL");
    vi.stubEnv("ENABLE_MOCK_PAYMENTS", "true");
    const getEnv = await getEnvWithFreshModule();
    expect(() => getEnv()).toThrow(/ENABLE_MOCK_PAYMENTS must be false in production/);
  });

  it("boots cleanly in production with correct real-money configuration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GAME_MONEY_MODE", "REAL");
    vi.stubEnv("ENABLE_MOCK_PAYMENTS", "false");
    const getEnv = await getEnvWithFreshModule();
    expect(() => getEnv()).not.toThrow();
    expect(getEnv().GAME_MONEY_MODE).toBe("REAL");
  });

  it("allows GAME_MONEY_MODE=TEST and mock payments in development (the default dev posture)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GAME_MONEY_MODE", undefined);
    vi.stubEnv("ENABLE_MOCK_PAYMENTS", undefined);
    const getEnv = await getEnvWithFreshModule();
    expect(() => getEnv()).not.toThrow();
    expect(getEnv().GAME_MONEY_MODE).toBe("TEST");
    expect(getEnv().ENABLE_MOCK_PAYMENTS).toBe(true);
  });

  it("refuses to boot at all without required secrets, in any environment", async () => {
    vi.stubEnv("AUTH_JWT_ACCESS_SECRET", undefined);
    const getEnv = await getEnvWithFreshModule();
    expect(() => getEnv()).toThrow(/Invalid environment configuration/);
  });
});
