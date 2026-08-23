import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from "./rbac";

const FINANCIAL_PERMISSIONS = new Set([
  PERMISSIONS.WALLET_ADJUST,
  PERMISSIONS.WITHDRAWAL_APPROVE,
  PERMISSIONS.WITHDRAWAL_REJECT,
  PERMISSIONS.PAYMENT_PROVIDER_MANAGE,
  PERMISSIONS.PRIZE_RULE_MANAGE,
]);

describe("RBAC default role permissions", () => {
  it("never grants GAME_OPERATOR any financial or prize-rule permission", () => {
    const operatorPerms = new Set(DEFAULT_ROLE_PERMISSIONS.GAME_OPERATOR);
    for (const perm of FINANCIAL_PERMISSIONS) {
      expect(operatorPerms.has(perm)).toBe(false);
    }
  });

  it("never grants GAME_OPERATOR access to change payment providers", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.GAME_OPERATOR).not.toContain(PERMISSIONS.PAYMENT_PROVIDER_MANAGE);
  });

  it("gives FINANCE no game-control permissions", () => {
    const financePerms = new Set(DEFAULT_ROLE_PERMISSIONS.FINANCE);
    expect(financePerms.has(PERMISSIONS.GAME_CALL_NUMBER)).toBe(false);
    expect(financePerms.has(PERMISSIONS.GAME_START)).toBe(false);
  });

  it("gives PLAYER no permissions at all", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.PLAYER).toEqual([]);
  });

  it("gives SUPPORT read-only visibility, no suspend/approve powers", () => {
    const supportPerms = new Set(DEFAULT_ROLE_PERMISSIONS.SUPPORT);
    expect(supportPerms.has(PERMISSIONS.USER_SUSPEND)).toBe(false);
    expect(supportPerms.has(PERMISSIONS.WITHDRAWAL_APPROVE)).toBe(false);
  });
});
