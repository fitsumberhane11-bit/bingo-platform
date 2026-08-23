import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { writeAuditLog } from "@/lib/audit";
import { getGameBroadcaster } from "@/lib/game/broadcaster";
import { NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

const schema = z
  .object({
    message: z.string().trim().min(1).max(1000),
    type: z.enum(["INFO", "WARNING", "IMPORTANT", "SYSTEM"]).default("INFO"),
    targetType: z.enum(["ALL", "GAME", "USER"]),
    gameId: z.string().uuid().optional(),
    targetUserId: z.string().uuid().optional(),
    expiresInMinutes: z.coerce.number().int().min(1).max(60 * 24 * 7).optional(),
  })
  .refine((d) => d.targetType !== "GAME" || !!d.gameId, { message: "gameId is required for a game-targeted announcement.", path: ["gameId"] })
  .refine((d) => d.targetType !== "USER" || !!d.targetUserId, {
    message: "targetUserId is required for a user-targeted announcement.",
    path: ["targetUserId"],
  });

// Only SUPER_ADMIN and GAME_OPERATOR hold ANNOUNCEMENT_CREATE by default (see
// packages/shared-types/src/rbac.ts) — players cannot reach this route no
// matter what the client sends, since permission is checked server-side.
export const POST = withApiHandler(async (req: NextRequest) => {
  const ctx = await requireApiPermission(PERMISSIONS.ANNOUNCEMENT_CREATE);
  const input = schema.parse(await req.json());

  if (input.targetType === "GAME") {
    const game = await prisma.game.findUnique({ where: { id: input.gameId }, select: { id: true } });
    if (!game) throw new NotFoundError("Game not found.");
  }
  if (input.targetType === "USER") {
    const user = await prisma.user.findUnique({ where: { id: input.targetUserId }, select: { id: true } });
    if (!user) throw new NotFoundError("User not found.");
  }

  const announcement = await prisma.announcement.create({
    data: {
      message: input.message,
      type: input.type,
      targetType: input.targetType,
      gameId: input.targetType === "GAME" ? input.gameId : null,
      targetUserId: input.targetType === "USER" ? input.targetUserId : null,
      expiresAt: input.expiresInMinutes ? new Date(Date.now() + input.expiresInMinutes * 60_000) : null,
      createdByUserId: ctx.userId,
    },
  });

  await writeAuditLog({
    actorUserId: ctx.userId,
    action: "ANNOUNCEMENT_SENT",
    entityType: "Announcement",
    entityId: announcement.id,
    newValue: {
      message: announcement.message,
      type: announcement.type,
      targetType: announcement.targetType,
      gameId: announcement.gameId,
      targetUserId: announcement.targetUserId,
      expiresAt: announcement.expiresAt ? announcement.expiresAt.toISOString() : null,
    },
  });

  const payload = {
    id: announcement.id,
    type: announcement.type,
    message: announcement.message,
    createdAt: announcement.createdAt,
    expiresAt: announcement.expiresAt,
  };

  // Real-time delivery mirrors the targeting: a GAME announcement only
  // reaches that game's room; ALL reaches every room via the shared
  // "global" channel every stream connection also subscribes to; USER
  // reaches only that player, wherever they're connected, via a per-user
  // channel. See stream/route.ts for the matching subscriptions.
  const broadcaster = getGameBroadcaster();
  if (input.targetType === "ALL") {
    broadcaster.publish("global", "game:announcement", payload);
  } else if (input.targetType === "GAME") {
    broadcaster.publish(input.gameId!, "game:announcement", payload);
  } else {
    broadcaster.publish(`user:${input.targetUserId}`, "game:announcement", payload);
  }

  return jsonOk({ announcement }, { status: 201 });
});

export const GET = withApiHandler(async (req: NextRequest) => {
  await requireApiPermission(PERMISSIONS.ANNOUNCEMENT_CREATE);
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId") ?? undefined;

  const announcements = await prisma.announcement.findMany({
    where: gameId ? { gameId } : {},
    include: { createdBy: { select: { username: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return jsonOk({
    announcements: announcements.map((a) => ({
      id: a.id,
      message: a.message,
      type: a.type,
      targetType: a.targetType,
      gameId: a.gameId,
      targetUserId: a.targetUserId,
      active: a.active,
      expiresAt: a.expiresAt,
      createdAt: a.createdAt,
      createdBy: a.createdBy.username,
    })),
  });
});
