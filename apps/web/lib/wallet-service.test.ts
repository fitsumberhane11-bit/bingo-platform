import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@bingo/db";
import { applyWalletTransaction, InsufficientFundsError } from "./wallet-service";

// Integration test — requires a real Postgres reachable via DATABASE_URL
// (see docs/ARCHITECTURE.md; run against the dev docker-compose db, or any
// disposable Postgres instance). Creates and tears down its own test user.

let userId: string;

beforeAll(async () => {
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      fullName: "Wallet Test User",
      username: `wallet_test_${suffix}`,
      email: `wallet_test_${suffix}@test.local`,
      phone: `+2519${suffix.replace(/\D/g, "0").padEnd(8, "0").slice(0, 8)}`,
      passwordHash: "not-a-real-hash",
      referralCode: `WT${suffix.toUpperCase()}`,
      status: "ACTIVE",
      wallet: { create: { availableBalance: 100, pendingBalance: 0 } },
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.walletTransaction.deleteMany({ where: { userId } });
  await prisma.wallet.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("applyWalletTransaction", () => {
  it("credits the wallet and records a ledger row with before/after balances", async () => {
    const tx = await applyWalletTransaction({
      userId,
      type: "DEPOSIT",
      direction: "CREDIT",
      amount: 50,
      referenceId: `test:credit:${randomUUID()}`,
    });
    expect(tx.balanceBefore.toString()).toBe("100");
    expect(tx.balanceAfter.toString()).toBe("150");

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
    expect(wallet.availableBalance.toString()).toBe("150");
  });

  it("is idempotent: replaying the same referenceId does not double-apply", async () => {
    const referenceId = `test:idempotent:${randomUUID()}`;
    const first = await applyWalletTransaction({ userId, type: "DEPOSIT", direction: "CREDIT", amount: 20, referenceId });
    const second = await applyWalletTransaction({ userId, type: "DEPOSIT", direction: "CREDIT", amount: 20, referenceId });
    expect(second.id).toBe(first.id);

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
    // 150 (from previous test) + 20 applied exactly once, not twice.
    expect(wallet.availableBalance.toString()).toBe("170");
  });

  it("rejects a debit larger than the available balance", async () => {
    await expect(
      applyWalletTransaction({
        userId,
        type: "TICKET_PURCHASE",
        direction: "DEBIT",
        amount: 999999,
        referenceId: `test:overdraw:${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(InsufficientFundsError);
  });

  it("never lets concurrent debits overdraw the wallet", async () => {
    // Wallet has 170. Fire 5 concurrent debits of 50 each (250 total demand
    // against 170 available) — at most 3 can succeed (150), the rest must
    // fail with InsufficientFundsError. None may silently corrupt the balance.
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        applyWalletTransaction({
          userId,
          type: "TICKET_PURCHASE",
          direction: "DEBIT",
          amount: 50,
          referenceId: `test:race:${i}:${randomUUID()}`,
        }),
      ),
    );

    const succeeded = attempts.filter((a) => a.status === "fulfilled");
    const failed = attempts.filter((a) => a.status === "rejected");
    expect(succeeded.length).toBe(3);
    expect(failed.length).toBe(2);

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
    expect(wallet.availableBalance.toString()).toBe("20");
  });
});
