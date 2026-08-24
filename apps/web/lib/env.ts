import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_NAME: z.string().default("Ethiopia Bingo"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().optional(),

  AUTH_JWT_ACCESS_SECRET: z.string().min(16, "AUTH_JWT_ACCESS_SECRET must be set"),
  AUTH_JWT_REFRESH_SECRET: z.string().min(16, "AUTH_JWT_REFRESH_SECRET must be set"),
  AUTH_JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  AUTH_JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
  APP_ENCRYPTION_KEY: z.string().min(16, "APP_ENCRYPTION_KEY must be set"),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  SMS_PROVIDER: z.enum(["mock"]).default("mock"),

  ENABLE_MOCK_PAYMENTS: z
    .string()
    .optional()
    .default("true")
    .transform((v) => v === "true"),
  PAYMENTS_LIVE_MODE: z
    .string()
    .optional()
    .default("false")
    .transform((v) => v === "true"),

  // Independent of ENABLE_MOCK_PAYMENTS: this specifically gates ticket
  // purchases / game participation. Since Telebirr/CBE aren't wired yet,
  // real money structurally cannot enter a wallet regardless of this flag
  // — but it's a second, explicit gate so game-money handling is never
  // "accidentally real" purely because a payment provider gets connected
  // later without this being revisited.
  GAME_MONEY_MODE: z.enum(["TEST", "REAL"]).default("TEST"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Lazily validated, memoized environment. Throws loudly at first use if
 * required secrets are missing — we'd rather fail fast at boot than silently
 * run with an empty JWT secret.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  // Gated on PAYMENTS_LIVE_MODE, not NODE_ENV=production: NODE_ENV=production
  // is just "this is an optimized build" and is required for ANY real
  // deployment, including this DEMO platform running with test money — a
  // NODE_ENV-based gate would make it impossible to ever deploy the demo
  // with `next build`. PAYMENTS_LIVE_MODE is the explicit, deliberate "real
  // money is now live" switch (see docs/PRODUCTION_READINESS.md's sign-off
  // section) that actually needs the money-safety checks below.
  if (parsed.data.PAYMENTS_LIVE_MODE && parsed.data.ENABLE_MOCK_PAYMENTS) {
    throw new Error(
      "ENABLE_MOCK_PAYMENTS must be false when PAYMENTS_LIVE_MODE is true. Refusing to boot with mock payments enabled alongside live payments.",
    );
  }
  if (parsed.data.PAYMENTS_LIVE_MODE && parsed.data.GAME_MONEY_MODE !== "REAL") {
    throw new Error(
      "GAME_MONEY_MODE must be explicitly set to REAL when PAYMENTS_LIVE_MODE is true. Refusing to boot a live-payments environment still in test-money mode.",
    );
  }
  cached = parsed.data;
  return cached;
}
