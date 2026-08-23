import { prisma } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

export const GET = withApiHandler(async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await requireApiPermission(PERMISSIONS.USER_VIEW);

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      fullName: true,
      username: true,
      email: true,
      phone: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
      emailVerifiedAt: true,
      phoneVerifiedAt: true,
      roles: { select: { role: { select: { name: true } } } },
      wallet: { select: { availableBalance: true, pendingBalance: true, currency: true } },
      kyc: { select: { status: true } },
      ...(ctx.permissions.has(PERMISSIONS.USER_VIEW_SENSITIVE) || ctx.isSuperAdmin
        ? {
            loginAttempts: {
              select: { success: true, ipAddress: true, userAgent: true, createdAt: true },
              orderBy: { createdAt: "desc" as const },
              take: 20,
            },
            devices: {
              select: { ipAddress: true, userAgent: true, firstSeenAt: true, lastSeenAt: true },
            },
          }
        : {}),
    },
  });

  if (!user) throw new NotFoundError("User not found.");

  return jsonOk({ user: { ...user, roles: user.roles.map((r) => r.role.name) } });
});
