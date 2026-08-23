import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { createGame } from "@/lib/game/engine";
import { sanitizeGameForResponse } from "@/lib/game/serialize";

export const runtime = "nodejs";

export const GET = withApiHandler(async (req: NextRequest) => {
  await requireApiPermission(PERMISSIONS.GAME_VIEW);
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;

  const games = await prisma.game.findMany({
    where: status ? { status: status as never } : {},
    include: { winningPattern: { select: { name: true } }, _count: { select: { players: true, tickets: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return jsonOk({
    games: games.map((g) => ({
      id: g.id,
      name: g.name,
      status: g.status,
      startTime: g.startTime,
      ticketPrice: g.ticketPrice.toString(),
      playerCount: g._count.players,
      ticketCount: g._count.tickets,
      maxPlayers: g.maxPlayers,
      winningPatternName: g.winningPattern.name,
      callMode: g.callMode,
    })),
  });
});

const createGameSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().max(2000).optional(),
    gameDate: z.coerce.date(),
    startTime: z.coerce.date(),
    registrationOpenAt: z.coerce.date(),
    registrationCloseAt: z.coerce.date(),
    ticketPrice: z.coerce.number().positive(),
    maxPlayers: z.coerce.number().int().min(2).max(100000),
    maxTicketsPerPlayer: z.coerce.number().int().min(1).max(100).default(5),
    minPlayers: z.coerce.number().int().min(1).default(2),
    jackpotAmount: z.coerce.number().min(0).default(0),
    callIntervalSeconds: z.coerce.number().int().min(3).max(120).default(8),
    callMode: z.enum(["AUTO", "MANUAL"]).default("AUTO"),
    manualMarkEnabled: z.boolean().default(false),
    winningPatternId: z.string().uuid(),
    prizeRuleId: z.string().uuid(),
  })
  .refine((d) => d.minPlayers <= d.maxPlayers, { message: "minPlayers cannot exceed maxPlayers", path: ["minPlayers"] })
  .refine((d) => d.registrationOpenAt < d.registrationCloseAt, {
    message: "registrationOpenAt must be before registrationCloseAt",
    path: ["registrationCloseAt"],
  })
  .refine((d) => d.registrationCloseAt <= d.startTime, {
    message: "registrationCloseAt cannot be after startTime — registration must close before (or exactly when) the game starts",
    path: ["registrationCloseAt"],
  });

export const POST = withApiHandler(async (req: NextRequest) => {
  const ctx = await requireApiPermission(PERMISSIONS.GAME_CREATE);
  const input = createGameSchema.parse(await req.json());
  const game = await createGame(input, ctx.userId);
  return jsonOk({ game: sanitizeGameForResponse(game) }, { status: 201 });
});
