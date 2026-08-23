import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { revokeAllSessionsForUser } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import { getClientIp, getUserAgent } from "@/lib/request";

export const runtime = "nodejs";

const bodySchema = z.object({ reason: z.string().trim().min(3, "A reason is required to suspend a user.") });

export const POST = withApiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const ctx = await requireApiPermission(PERMISSIONS.USER_SUSPEND);
  const { reason } = bodySchema.parse(await req.json());

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) throw new NotFoundError("User not found.");
  if (user.status === "SUSPENDED") throw new ValidationError("User is already suspended.");

  await prisma.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
  await revokeAllSessionsForUser(user.id);

  await writeAuditLog({
    actorUserId: ctx.userId,
    action: "USER_SUSPENDED",
    entityType: "User",
    entityId: user.id,
    oldValue: { status: user.status },
    newValue: { status: "SUSPENDED", reason },
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });

  return jsonOk({ suspended: true });
});
