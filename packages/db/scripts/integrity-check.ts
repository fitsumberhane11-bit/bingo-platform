#!/usr/bin/env tsx
/**
 * Automated database integrity checks for the financial/game ledger.
 * Read-only — never mutates data. Exits non-zero if any check fails, so it
 * can run in CI or as a scheduled ops job (see docs/STATUS.md "Backup &
 * recovery" section for how this fits into the operational story).
 *
 * The actual check logic lives in ../src/integrity.ts and is shared with
 * the financial-integrity regression test in apps/web — this script is
 * just a console-reporting wrapper around it.
 *
 * Checks: per-wallet balance reconstruction from transaction history;
 * platform-wide money conservation; winner payout completeness (paid
 * exactly once, correct amount); no platform ledger entry orphaned by a
 * deleted game; WalletTransaction.referenceId global uniqueness.
 */
import { PrismaClient } from "@prisma/client";
import { runIntegrityChecks } from "../src/integrity";

const prisma = new PrismaClient();

async function main() {
  console.log("=== DATABASE INTEGRITY CHECK ===\n");
  const { passed, results } = await runIntegrityChecks(prisma);

  const failures: string[] = [];
  for (const r of results) {
    if (r.passed) {
      console.log(`  PASS  ${r.name}`);
    } else {
      console.log(`  FAIL  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
      failures.push(r.name);
    }
  }
  if (!results.some((r) => r.name.includes("paid exactly once"))) {
    console.log("  (no winners recorded yet — nothing to check)");
  }

  console.log("\n===================================");
  if (passed) {
    console.log("ALL CHECKS PASSED");
    process.exit(0);
  } else {
    console.log(`${failures.length} CHECK(S) FAILED:`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("INTEGRITY CHECK SCRIPT ERROR:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
