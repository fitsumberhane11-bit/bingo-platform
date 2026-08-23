import type { NextRequest } from "next/server";
import { prisma } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit";
import { getClientIp, getUserAgent } from "@/lib/request";

export const runtime = "nodejs";

export const POST = withApiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const ctx = await requireApiPermission(PERMISSIONS.USER_ACTIVATE);

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) throw new NotFoundError("User not found.");
  if (user.status === "ACTIVE") throw new ValidationError("User is already active.");
  if (user.status === "BANNED") {
    throw new ValidationError("Banned users cannot be reactivated through this action.");
  }

  await prisma.user.update({ where: { id: user.id }, data: { status: "ACTIVE" } });

  await writeAuditLog({
    actorUserId: ctx.userId,
    action: "USER_ACTIVATED",
    entityType: "User",
    entityId: user.id,
    oldValue: { status: user.status },
    newValue: { status: "ACTIVE" },
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  return jsonOk({ activated: true });
});
