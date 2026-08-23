import { Prisma, prisma } from "@bingo/db";

const ZERO = new Prisma.Decimal(0);
const DAYS = 14;
const ACTIVE_WINDOW_DAYS = 7;

// Ethiopian users read "today" as the Africa/Addis_Ababa calendar day, not
// UTC — matters here because the two can disagree near midnight and, more
// subtly, because Node's local-timezone Date methods (setHours, toISOString)
// don't agree with each other: setHours(0,0,0,0) sets LOCAL midnight, but
// toISOString() always renders in UTC, so combining them silently shifts the
// date by the host's UTC offset. Every date-key in this file is therefore
// built from explicit Y/M/D components, never from mixing local mutation
// with UTC serialization.
const DISPLAY_TZ = "Africa/Addis_Ababa";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Daily-bucketed counts/sums over the last `DAYS` days, oldest first, with
 * every day present (zero-filled) even if no rows exist — required for a
 * chart to render a sensible x-axis instead of silently compressing gaps.
 * Buckets by Africa/Addis_Ababa calendar day on both the SQL and JS sides so
 * the two can never disagree about which day a row belongs to.
 */
async function dailySeries(table: string, dateColumn: string, valueExpr: string, where: string, params: unknown[]): Promise<Array<{ date: string; value: number }>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ day: Date; value: unknown }>>(
    `SELECT (("${dateColumn}") AT TIME ZONE '${DISPLAY_TZ}')::date AS day, COALESCE(${valueExpr}, 0) AS value
     FROM "${table}"
     WHERE "${dateColumn}" >= $1 ${where}
     GROUP BY day
     ORDER BY day ASC`,
    ...params,
  );
  // Postgres returns a bare `date` as a JS Date at UTC midnight for that
  // calendar date — read it with UTC getters so the key is correct
  // regardless of the host process's own timezone.
  const byDay = new Map(rows.map((r) => [`${r.day.getUTCFullYear()}-${pad2(r.day.getUTCMonth() + 1)}-${pad2(r.day.getUTCDate())}`, Number(r.value)]));
  const series: Array<{ date: string; value: number }> = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - (DAYS - 1));
  for (let i = 0; i < DAYS; i++) {
    const key = localDateKey(cursor);
    series.push({ date: key, value: byDay.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return series;
}

export async function getAdminDashboardStats() {
  const today = startOfToday();
  const activeSince = new Date();
  activeSince.setDate(activeSince.getDate() - ACTIVE_WINDOW_DAYS);
  const sinceRange = new Date();
  sinceRange.setDate(sinceRange.getDate() - DAYS);
  sinceRange.setHours(0, 0, 0, 0);

  const [
    totalPlayers,
    activePlayers,
    liveGames,
    todaysTicketAgg,
    prizePayoutAgg,
    withdrawalSummary,
    registrationsSeries,
    ticketSalesSeries,
    depositsSeries,
    withdrawalsSeries,
    platformRevenueSeries,
    winningsSeries,
    activeGamesSeries,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, lastLoginAt: { gte: activeSince } } }),
    prisma.game.count({ where: { status: "LIVE" } }),
    prisma.bingoTicket.aggregate({ where: { createdAt: { gte: today } }, _count: true, _sum: { purchasePrice: true } }),
    prisma.winner.aggregate({ _sum: { prizeAmount: true } }),
    getWithdrawalPendingTotal(),
    dailySeries("User", "createdAt", "COUNT(*)", "", [sinceRange]),
    dailySeries("BingoTicket", "createdAt", `SUM("purchasePrice")`, "", [sinceRange]),
    dailySeries("WalletTransaction", "createdAt", "SUM(amount)", `AND "type" = 'DEPOSIT' AND "status" = 'COMPLETED'`, [sinceRange]),
    dailySeries("WalletTransaction", "createdAt", "SUM(amount)", `AND "type" = 'WITHDRAWAL' AND "status" = 'COMPLETED'`, [sinceRange]),
    dailySeries("PlatformLedgerEntry", "createdAt", "SUM(amount)", `AND "type" = 'PLATFORM_FEE_REVENUE'`, [sinceRange]),
    dailySeries("Winner", "confirmedAt", `SUM("prizeAmount")`, "", [sinceRange]),
    dailySeries("Game", "createdAt", "COUNT(*)", "", [sinceRange]),
  ]);

  return {
    kpis: {
      totalPlayers,
      activePlayers,
      liveGames,
      todaysTickets: todaysTicketAgg._count,
      todaysRevenue: (todaysTicketAgg._sum.purchasePrice ?? ZERO).toString(),
      prizePayouts: (prizePayoutAgg._sum.prizeAmount ?? ZERO).toString(),
      pendingWithdrawals: withdrawalSummary.toString(),
    },
    charts: {
      registrations: registrationsSeries,
      ticketSales: ticketSalesSeries,
      deposits: depositsSeries,
      withdrawals: withdrawalsSeries,
      platformRevenue: platformRevenueSeries,
      winnings: winningsSeries,
      gamesCreated: activeGamesSeries,
    },
  };
}

async function getWithdrawalPendingTotal() {
  const result = await prisma.withdrawal.aggregate({
    where: { status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING"] } },
    _sum: { amount: true },
  });
  return result._sum.amount ?? ZERO;
}
