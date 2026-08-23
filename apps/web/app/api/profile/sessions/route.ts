import { prisma } from "@bingo/db";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";
import { revokeAllSessionsForUser } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

export const GET = withApiHandler(async () => {
  const current = await requireCurrentUser();
  const sessions = await prisma.session.findMany({
    where: { userId: current.sub, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, ipAddress: true, userAgent: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
  });
  return jsonOk({ sessions, currentSessionId: current.sessionId });
});

export const DELETE = withApiHandler(async () => {
  const current = await requireCurrentUser();
  await revokeAllSessionsForUser(current.sub);
  await writeAuditLog({
    actorUserId: current.sub,
    action: "ALL_SESSIONS_REVOKED",
    entityType: "User",
    entityId: current.sub,
  });
  return jsonOk({ revoked: true });
});
