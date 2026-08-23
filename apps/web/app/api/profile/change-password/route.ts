import type { NextRequest } from "next/server";
import { changePasswordSchema } from "@bingo/shared-types";
import { prisma } from "@bingo/db";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";
import { hashPassword, verifyPassword } from "@/lib/password";
import { AuthError } from "@/lib/errors";
import { revokeAllSessionsForUser } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import { getClientIp, getUserAgent } from "@/lib/request";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export const POST = withApiHandler(async (req: NextRequest) => {
  const current = await requireCurrentUser();
  await enforceRateLimit(`change-password:${current.sub}`, 5, 15 * 60);

  const body = await req.json();
  const input = changePasswordSchema.parse(body);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: current.sub } });
  const validCurrent = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!validCurrent) throw new AuthError("Current password is incorrect.");

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await revokeAllSessionsForUser(user.id);

  await writeAuditLog({
    actorUserId: user.id,
    action: "PASSWORD_CHANGED",
    entityType: "User",
    entityId: user.id,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  return jsonOk({ message: "Password changed. Please log in again." });
});
