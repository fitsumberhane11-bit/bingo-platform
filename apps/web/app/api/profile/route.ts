import type { NextRequest } from "next/server";
import { updateProfileSchema } from "@bingo/shared-types";
import { prisma } from "@bingo/db";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { getClientIp, getUserAgent } from "@/lib/request";

export const runtime = "nodejs";

export const PATCH = withApiHandler(async (req: NextRequest) => {
  const current = await requireCurrentUser();
  const body = await req.json();
  const input = updateProfileSchema.parse(body);

  const before = await prisma.user.findUniqueOrThrow({ where: { id: current.sub }, select: { fullName: true } });
  const updated = await prisma.user.update({
    where: { id: current.sub },
    data: { fullName: input.fullName },
    select: { id: true, fullName: true, username: true, email: true, phone: true },
  });

  await writeAuditLog({
    actorUserId: current.sub,
    action: "PROFILE_UPDATED",
    entityType: "User",
    entityId: current.sub,
    oldValue: before,
    newValue: { fullName: updated.fullName },
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  return jsonOk({ user: updated });
});
