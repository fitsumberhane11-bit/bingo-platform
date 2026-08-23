import { prisma } from "@bingo/db";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";

export const runtime = "nodejs";

export const GET = withApiHandler(async () => {
  const current = await requireCurrentUser();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: current.sub },
    select: {
      id: true,
      fullName: true,
      username: true,
      email: true,
      phone: true,
      status: true,
      emailVerifiedAt: true,
      phoneVerifiedAt: true,
      twoFactorEnabled: true,
      referralCode: true,
      createdAt: true,
      wallet: { select: { availableBalance: true, pendingBalance: true, currency: true } },
    },
  });

  return jsonOk({ user, roles: current.roles, permissions: current.permissions });
});
