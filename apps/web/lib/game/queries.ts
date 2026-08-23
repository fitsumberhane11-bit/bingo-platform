import { Prisma, prisma } from "@bingo/db";
import { calculatePrizePool } from "@bingo/game-core";

const LOBBY_STATUSES = ["SCHEDULED", "OPEN", "FULL", "STARTING", "LIVE"] as const;
const COMPLETED_LOBBY_LIMIT = 10;

/**
 * Games grouped the way the lobby actually presents them (Live Now /
 * Upcoming / Completed), each with a live-computed prize pool using the
 * same `calculatePrizePool` the game room itself uses — so the number a
 * player sees before buying a ticket matches what they'll see after.
 */
export async function listLobbyGames() {
  const games = await prisma.game.findMany({
    where: { status: { in: [...LOBBY_STATUSES] } },
    include: {
      winningPattern: { select: { name: true } },
      prizeRule: { select: { name: true, type: true, config: true, platformFeePercent: true } },
      _count: { select: { players: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const gameIds = games.map((g) => g.id);
  const salesByGame = gameIds.length
    ? await prisma.bingoTicket.groupBy({ by: ["gameId"], where: { gameId: { in: gameIds } }, _sum: { purchasePrice: true }, _count: true })
    : [];
  const salesMap = new Map(salesByGame.map((s) => [s.gameId, s]));

  const withPrizePool = games.map((g) => {
    const sales = salesMap.get(g.id);
    const ticketSalesTotal = sales?._sum.purchasePrice ?? new Prisma.Decimal(0);
    const prizePool = calculatePrizePool(
      g.prizeRule.config as { type: typeof g.prizeRule.type; winnerPercent?: number; fixedAmount?: number },
      ticketSalesTotal,
      g.jackpotAmount,
    );
    return {
      ...g,
      ticketsSold: sales?._count ?? 0,
      prizePool: prizePool.toString(),
      prizePercent: g.prizeRule.type === "PERCENTAGE_OF_SALES" ? String((g.prizeRule.config as { winnerPercent?: number })?.winnerPercent ?? "") : null,
    };
  });

  return {
    live: withPrizePool.filter((g) => g.status === "LIVE" || g.status === "STARTING"),
    upcoming: withPrizePool.filter((g) => g.status === "SCHEDULED" || g.status === "OPEN" || g.status === "FULL"),
  };
}

export async function listRecentCompletedGames() {
  return prisma.game.findMany({
    where: { status: "COMPLETED" },
    include: {
      winningPattern: { select: { name: true } },
      _count: { select: { players: true, winners: true } },
      winners: { select: { prizeAmount: true }, take: 1 },
    },
    orderBy: { completedAt: "desc" },
    take: COMPLETED_LOBBY_LIMIT,
  });
}

export async function getGameForRoom(gameId: string) {
  return prisma.game.findUnique({
    where: { id: gameId },
    include: {
      winningPattern: true,
      prizeRule: true,
      calledNumbers: { orderBy: { sequenceNumber: "asc" } },
      _count: { select: { players: true } },
    },
  });
}

export async function getPlayerTickets(gameId: string, userId: string) {
  return prisma.bingoTicket.findMany({
    where: { gameId, userId },
    orderBy: { ticketNumber: "asc" },
  });
}

export async function getGameWinners(gameId: string) {
  return prisma.winner.findMany({
    where: { gameId },
    include: { user: { select: { username: true, fullName: true } }, ticket: { select: { ticketNumber: true } } },
    orderBy: { confirmedAt: "asc" },
  });
}

const PLAYER_HISTORY_STATUSES = ["COMPLETED", "CANCELLED"] as const;

export interface PlayerGameHistoryFilters {
  status?: "COMPLETED" | "CANCELLED";
  search?: string;
  winningPatternId?: string;
  wonOnly?: boolean;
  from?: Date;
  to?: Date;
}

// Players only ever see games they were eligible to view (i.e. actually
// joined — `players: { some: { userId } }` scopes every query here).
// Admins get the full unscoped history via /api/admin/games instead.
export async function getPlayerGameHistory(userId: string, page: number, pageSize: number, filters: PlayerGameHistoryFilters = {}) {
  const where: Prisma.GameWhereInput = {
    status: { in: filters.status ? [filters.status] : [...PLAYER_HISTORY_STATUSES] },
    players: { some: { userId } },
    ...(filters.search ? { name: { contains: filters.search, mode: "insensitive" as const } } : {}),
    ...(filters.winningPatternId ? { winningPatternId: filters.winningPatternId } : {}),
    ...(filters.wonOnly ? { winners: { some: { userId } } } : {}),
    ...(filters.from || filters.to
      ? { completedAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
      : {}),
  };
  const [games, total] = await Promise.all([
    prisma.game.findMany({
      where,
      include: {
        winningPattern: { select: { id: true, name: true } },
        _count: { select: { players: true, winners: true } },
        winners: { where: { userId }, select: { prizeAmount: true } },
      },
      orderBy: { completedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.game.count({ where }),
  ]);
  return { games, total };
}
