import Decimal from "decimal.js";

export type TieBreakRule = "SPLIT_EQUALLY" | "FIRST_TICKET_WINS" | "SHARE_BY_STAKE";

/**
 * Splits a prize pool equally among N winners, distributing the unavoidable
 * rounding remainder (money doesn't divide evenly into cents) one cent at a
 * time to the first winners rather than losing or fabricating money — the
 * sum of the returned amounts always exactly equals `total`.
 */
export function splitEqually(total: Decimal, winnerCount: number): Decimal[] {
  if (winnerCount <= 0) return [];
  const cents = total.mul(100).toDecimalPlaces(0, Decimal.ROUND_DOWN);
  const baseCents = cents.dividedToIntegerBy(winnerCount);
  const remainderCents = cents.minus(baseCents.mul(winnerCount)).toNumber();

  return Array.from({ length: winnerCount }, (_, i) => {
    const extra = i < remainderCents ? 1 : 0;
    return baseCents.plus(extra).dividedBy(100);
  });
}

/**
 * Given a full set of simultaneous winners (same called number) and the
 * configured tie-break rule, decides which of them actually receive a
 * prize. `SPLIT_EQUALLY` keeps everyone; `FIRST_TICKET_WINS` keeps only the
 * earliest ticket (by purchase order); `SHARE_BY_STAKE` also keeps everyone
 * — the *splitting* by stake happens in `splitByStake`, not here.
 */
export function resolveWinnerSet<T extends { ticketNumber: number }>(winners: T[], tieBreakRule: TieBreakRule): T[] {
  if (winners.length === 0) return [];
  if (tieBreakRule === "FIRST_TICKET_WINS") {
    const earliest = winners.reduce((a, b) => (a.ticketNumber < b.ticketNumber ? a : b));
    return [earliest];
  }
  return winners;
}

export function splitByStake<T extends { purchasePrice: Decimal }>(total: Decimal, winners: T[]): Decimal[] {
  const totalStake = winners.reduce((sum, w) => sum.plus(w.purchasePrice), new Decimal(0));
  if (totalStake.isZero()) return splitEqually(total, winners.length);

  const cents = total.mul(100).toDecimalPlaces(0, Decimal.ROUND_DOWN);
  const rawShares = winners.map((w) => cents.mul(w.purchasePrice).dividedBy(totalStake).toDecimalPlaces(0, Decimal.ROUND_DOWN));
  const distributedCents = rawShares.reduce((sum, s) => sum.plus(s), new Decimal(0));
  const remainder = cents.minus(distributedCents).toNumber();

  return rawShares.map((share, i) => share.plus(i < remainder ? 1 : 0).dividedBy(100));
}

export interface PrizeRuleConfig {
  type: "FIXED" | "PERCENTAGE_OF_SALES" | "JACKPOT" | "MULTI_LEVEL";
  winnerPercent?: number; // for PERCENTAGE_OF_SALES: % of ticket sales that becomes the prize pool
  fixedAmount?: number; // for FIXED
}

/** Computes the total prize pool for a game from its configured rule. Server-side only — never trust a client-supplied prize amount. */
export function calculatePrizePool(config: PrizeRuleConfig, ticketSalesTotal: Decimal, jackpotAmount: Decimal): Decimal {
  switch (config.type) {
    case "FIXED":
      return new Decimal(config.fixedAmount ?? 0);
    case "PERCENTAGE_OF_SALES":
      return ticketSalesTotal.mul(config.winnerPercent ?? 0).dividedBy(100);
    case "JACKPOT":
      return jackpotAmount;
    case "MULTI_LEVEL":
      // Multi-level payout structuring (e.g. line prize + full-house prize)
      // is a future extension — the pool itself still derives from sales.
      return ticketSalesTotal.mul(config.winnerPercent ?? 0).dividedBy(100);
  }
}
