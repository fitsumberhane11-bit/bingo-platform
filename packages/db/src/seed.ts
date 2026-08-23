/**
 * Development seed data. NEVER run against a production database — the
 * accounts created here use publicly-known, clearly-labeled passwords and
 * exist purely so the app is testable end-to-end without manual setup.
 */
import { hash } from "@node-rs/argon2";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLES } from "@bingo/shared-types";
import { PRESET_PATTERNS } from "@bingo/game-core";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEV_PASSWORD = "DevPass123!"; // DEVELOPMENT ONLY — never used in production seeding.

async function hashDevPassword(): Promise<string> {
  // algorithm: 2 = Algorithm.Argon2id (inlined — see apps/web/lib/password.ts for why).
  return hash(DEV_PASSWORD, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

async function seedRbac() {
  const allPermissionKeys = Object.values(PERMISSIONS);
  for (const key of allPermissionKeys) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }

  const allRoleNames = Object.values(ROLES);
  const roleRecords: Record<string, { id: string }> = {};
  for (const name of allRoleNames) {
    roleRecords[name] = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, isSystem: true, description: `${name} (system role)` },
    });
  }

  // SUPER_ADMIN gets every permission explicitly (app logic also treats it
  // as implicitly all-powerful, but explicit rows keep the admin UI honest).
  const superAdminPerms = allPermissionKeys;
  const roleGrants: Record<string, string[]> = {
    [ROLES.SUPER_ADMIN]: superAdminPerms,
    ...DEFAULT_ROLE_PERMISSIONS,
  };

  // Full sync, not just additive upserts: a permission removed from a role's
  // list in code (e.g. the ADMIN/SETTINGS_MANAGE tightening on 2026-08-17)
  // must actually be revoked here too, or the stale grant sits in the DB
  // forever and the code's permission matrix silently lies about what a
  // role can really do.
  for (const [roleName, permKeys] of Object.entries(roleGrants)) {
    const role = roleRecords[roleName]!;
    const permissions = await Promise.all(permKeys.map((key) => prisma.permission.findUniqueOrThrow({ where: { key } })));
    const desiredIds = new Set(permissions.map((p) => p.id));

    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }

    const existingGrants = await prisma.rolePermission.findMany({ where: { roleId: role.id }, select: { permissionId: true } });
    const staleIds = existingGrants.map((g) => g.permissionId).filter((id) => !desiredIds.has(id));
    if (staleIds.length > 0) {
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: { in: staleIds } } });
    }
  }

  return roleRecords;
}

async function seedDevUser(input: {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  roleId: string;
  passwordHash: string;
  walletBalance?: number;
}) {
  // Deliberately NOT prisma.user.upsert(): an upsert's `update: {}` branch
  // still returns the *existing* row, and code below that assumes "this
  // wallet was just created with balance 0" would then write a fabricated
  // opening-balance WalletTransaction (balanceBefore: 0) against a wallet
  // that may have real, unrelated transaction history already — a false
  // ledger entry that breaks reconciliation for that user without ever
  // touching the actual balance (so it's easy to miss). Found live: running
  // this seed against a username that already existed with real activity
  // (from manual testing) fabricated exactly that phantom DEPOSIT row.
  // Checking existence first and skipping entirely for existing users is
  // the only way to make the opening-balance transaction genuinely
  // conditional on genuine first creation, not just on referenceId
  // uniqueness (which the fabricated row would have satisfied fine).
  const existingUser = await prisma.user.findUnique({ where: { username: input.username }, include: { wallet: true } });
  if (existingUser) return existingUser;

  const referralCode = input.username.toUpperCase().slice(0, 8) + "0001";
  const user = await prisma.user.create({
    data: {
      fullName: input.fullName,
      username: input.username,
      email: input.email,
      phone: input.phone,
      passwordHash: input.passwordHash,
      referralCode,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      termsAcceptedAt: new Date(),
      roles: { create: { roleId: input.roleId } },
      wallet: { create: { availableBalance: input.walletBalance ?? 0, pendingBalance: 0 } },
    },
    include: { wallet: true },
  });

  // Every balance change should be traceable through WalletTransaction — a
  // seeded opening balance is no exception. Without this, the seeded amount
  // is real money sitting in the wallet with no ledger entry to explain it,
  // which breaks platform-wide financial reconciliation (see docs/STATUS.md
  // Phase 9: this exact gap was caught live by the reconciliation dashboard).
  // Safe to assume a fresh wallet here — the existing-user case returned above.
  if (input.walletBalance && input.walletBalance > 0 && user.wallet) {
    const referenceId = `seed-opening-balance:${user.id}`;
    const existing = await prisma.walletTransaction.findUnique({ where: { referenceId } });
    if (!existing) {
      await prisma.walletTransaction.create({
        data: {
          walletId: user.wallet.id,
          userId: user.id,
          type: "DEPOSIT",
          status: "COMPLETED",
          amount: input.walletBalance,
          balanceBefore: 0,
          balanceAfter: input.walletBalance,
          provider: "SEED",
          referenceId,
          metadata: { note: "Development seed opening balance, not a real deposit." },
        },
      });
    }
  }

  return user;
}

async function seedSystemSettings() {
  const defaults: Array<{ key: string; value: unknown; description: string }> = [
    { key: "site.name", value: "Ethiopia Bingo", description: "Public-facing site name" },
    { key: "site.currency", value: "ETB", description: "Platform currency (ISO-ish code)" },
    { key: "registration.enabled", value: true, description: "Whether new signups are accepted" },
    { key: "maintenance.enabled", value: false, description: "Global maintenance mode switch" },
    { key: "deposit.min", value: 20, description: "Minimum deposit amount (ETB)" },
    { key: "deposit.max", value: 50000, description: "Maximum single deposit amount (ETB)" },
    { key: "withdrawal.min", value: 50, description: "Minimum withdrawal amount (ETB)" },
    { key: "withdrawal.max", value: 20000, description: "Maximum single withdrawal amount (ETB)" },
    { key: "withdrawal.dailyLimit", value: 30000, description: "Max total withdrawals per user per day (ETB)" },
    { key: "withdrawal.autoApproveThreshold", value: 0, description: "Withdrawals at/under this are auto-approved; 0 = manual review required for everything" },
    { key: "game.maxTicketsPerPlayerDefault", value: 5, description: "Default max tickets/player for new games" },
    { key: "eligibility.minimumAge", value: 18, description: "Minimum age to register/play" },
  ];

  for (const setting of defaults) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: { key: setting.key, value: setting.value as any, description: setting.description },
    });
  }
}

async function seedPlatformAccount() {
  await prisma.platformAccount.upsert({
    where: { singleton: 1 },
    update: {},
    create: { singleton: 1 },
  });
}

async function seedWinningPatterns() {
  for (const preset of PRESET_PATTERNS) {
    await prisma.winningPattern.upsert({
      where: { name: preset.name },
      update: {},
      create: {
        name: preset.name,
        description: preset.description,
        matchType: preset.definition.matchType,
        matrix: preset.definition.matrix ?? undefined,
        config: preset.definition.linesRequired ? { linesRequired: preset.definition.linesRequired } : undefined,
        isSystem: true,
      },
    });
  }
}

async function seedPrizeRules() {
  await prisma.prizeRule.upsert({
    where: { name: "Standard 70/30 Split" },
    update: {},
    create: {
      name: "Standard 70/30 Split",
      type: "PERCENTAGE_OF_SALES",
      config: { type: "PERCENTAGE_OF_SALES", winnerPercent: 70 },
      tieBreakRule: "SPLIT_EQUALLY",
      platformFeePercent: 30,
    },
  });
  await prisma.prizeRule.upsert({
    where: { name: "Winner Takes All" },
    update: {},
    create: {
      name: "Winner Takes All",
      type: "PERCENTAGE_OF_SALES",
      config: { type: "PERCENTAGE_OF_SALES", winnerPercent: 90 },
      tieBreakRule: "SPLIT_EQUALLY",
      platformFeePercent: 10,
    },
  });
  await prisma.prizeRule.upsert({
    where: { name: "Fixed ETB 500 Prize" },
    update: {},
    create: {
      name: "Fixed ETB 500 Prize",
      type: "FIXED",
      config: { type: "FIXED", fixedAmount: 500 },
      tieBreakRule: "SPLIT_EQUALLY",
      platformFeePercent: 0,
    },
  });
}

async function main() {
  console.log("Seeding roles & permissions...");
  const roles = await seedRbac();

  console.log("Seeding system settings...");
  await seedSystemSettings();

  console.log("Seeding platform account...");
  await seedPlatformAccount();

  console.log("Seeding winning patterns...");
  await seedWinningPatterns();

  console.log("Seeding prize rules...");
  await seedPrizeRules();

  console.log("Seeding DEVELOPMENT ONLY users (all share password: %s)...", DEV_PASSWORD);
  const passwordHash = await hashDevPassword();

  await seedDevUser({
    fullName: "Super Admin (Dev)",
    username: "superadmin",
    email: "superadmin@dev.local",
    phone: "+251911000001",
    roleId: roles[ROLES.SUPER_ADMIN]!.id,
    passwordHash,
  });
  await seedDevUser({
    fullName: "Admin (Dev)",
    username: "admin",
    email: "admin@dev.local",
    phone: "+251911000002",
    roleId: roles[ROLES.ADMIN]!.id,
    passwordHash,
  });
  await seedDevUser({
    fullName: "Game Operator (Dev)",
    username: "operator",
    email: "operator@dev.local",
    phone: "+251911000003",
    roleId: roles[ROLES.GAME_OPERATOR]!.id,
    passwordHash,
  });
  await seedDevUser({
    fullName: "Finance (Dev)",
    username: "finance",
    email: "finance@dev.local",
    phone: "+251911000004",
    roleId: roles[ROLES.FINANCE]!.id,
    passwordHash,
  });
  await seedDevUser({
    fullName: "Support (Dev)",
    username: "support",
    email: "support@dev.local",
    phone: "+251911000005",
    roleId: roles[ROLES.SUPPORT]!.id,
    passwordHash,
  });
  await seedDevUser({
    fullName: "Test Player One",
    username: "player1",
    email: "player1@dev.local",
    phone: "+251911000006",
    roleId: roles[ROLES.PLAYER]!.id,
    passwordHash,
    walletBalance: 500,
  });
  await seedDevUser({
    fullName: "Test Player Two",
    username: "player2",
    email: "player2@dev.local",
    phone: "+251911000007",
    roleId: roles[ROLES.PLAYER]!.id,
    passwordHash,
    walletBalance: 250,
  });
  await seedDevUser({
    fullName: "Test Player Three",
    username: "player3",
    email: "player3@dev.local",
    phone: "+251911000008",
    roleId: roles[ROLES.PLAYER]!.id,
    passwordHash,
    walletBalance: 500,
  });
  await seedDevUser({
    fullName: "Test Player Four",
    username: "player4",
    email: "player4@dev.local",
    phone: "+251911000009",
    roleId: roles[ROLES.PLAYER]!.id,
    passwordHash,
    walletBalance: 500,
  });
  await seedDevUser({
    fullName: "Test Player Five",
    username: "player5",
    email: "player5@dev.local",
    phone: "+251911000010",
    roleId: roles[ROLES.PLAYER]!.id,
    passwordHash,
    walletBalance: 500,
  });

  console.log("\nDEVELOPMENT ONLY credentials (do not use in production):");
  console.log("  superadmin / admin / operator / finance / support / player1 / player2 / player3 / player4 / player5");
  console.log("  password for all: %s", DEV_PASSWORD);
  console.log("\nSeed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
