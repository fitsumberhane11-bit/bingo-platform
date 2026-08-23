import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculatePrizePool, resolveWinnerSet, splitByStake, splitEqually } from "./prize";

describe("splitEqually", () => {
  it("splits evenly when it divides cleanly", () => {
    const shares = splitEqually(new Decimal(1000), 2);
    expect(shares.map((s) => s.toString())).toEqual(["500", "500"]);
  });

  it("distributes the rounding remainder without losing or fabricating money", () => {
    const total = new Decimal(100);
    const shares = splitEqually(total, 3);
    const sum = shares.reduce((a, b) => a.plus(b), new Decimal(0));
    expect(sum.toString()).toBe("100");
    // 100/3 = 33.33... -> 33.34, 33.33, 33.33 (one winner gets the extra cent)
    expect(shares.filter((s) => s.equals("33.34"))).toHaveLength(1);
    expect(shares.filter((s) => s.equals("33.33"))).toHaveLength(2);
  });

  it("returns an empty array for zero winners", () => {
    expect(splitEqually(new Decimal(500), 0)).toEqual([]);
  });
});

describe("splitByStake", () => {
  it("weights payouts by each winner's ticket price", () => {
    const winners = [{ purchasePrice: new Decimal(100) }, { purchasePrice: new Decimal(50) }];
    const shares = splitByStake(new Decimal(300), winners);
    expect(shares[0]!.toString()).toBe("200");
    expect(shares[1]!.toString()).toBe("100");
  });

  it("sums to exactly the total pool despite rounding", () => {
    const winners = [{ purchasePrice: new Decimal(33) }, { purchasePrice: new Decimal(33) }, { purchasePrice: new Decimal(34) }];
    const shares = splitByStake(new Decimal(100), winners);
    const sum = shares.reduce((a, b) => a.plus(b), new Decimal(0));
    expect(sum.toString()).toBe("100");
  });
});

describe("resolveWinnerSet", () => {
  const winners = [{ ticketNumber: 3 }, { ticketNumber: 1 }, { ticketNumber: 2 }];

  it("SPLIT_EQUALLY keeps every simultaneous winner", () => {
    expect(resolveWinnerSet(winners, "SPLIT_EQUALLY")).toHaveLength(3);
  });

  it("FIRST_TICKET_WINS keeps only the earliest ticket", () => {
    const result = resolveWinnerSet(winners, "FIRST_TICKET_WINS");
    expect(result).toHaveLength(1);
    expect(result[0]!.ticketNumber).toBe(1);
  });

  it("never silently drops winners for SPLIT_EQUALLY/SHARE_BY_STAKE", () => {
    expect(resolveWinnerSet(winners, "SHARE_BY_STAKE")).toHaveLength(3);
  });
});

describe("calculatePrizePool", () => {
  it("FIXED ignores sales and jackpot entirely", () => {
    const pool = calculatePrizePool({ type: "FIXED", fixedAmount: 500 }, new Decimal(99999), new Decimal(0));
    expect(pool.toString()).toBe("500");
  });

  it("PERCENTAGE_OF_SALES derives the pool from ticket sales", () => {
    const pool = calculatePrizePool({ type: "PERCENTAGE_OF_SALES", winnerPercent: 70 }, new Decimal(1000), new Decimal(0));
    expect(pool.toString()).toBe("700");
  });

  it("JACKPOT uses the jackpot amount regardless of sales", () => {
    const pool = calculatePrizePool({ type: "JACKPOT" }, new Decimal(1000), new Decimal(5000));
    expect(pool.toString()).toBe("5000");
  });
});
