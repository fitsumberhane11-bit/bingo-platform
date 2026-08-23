import { prisma } from "@bingo/db";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";
import { getRemainingRecoveryCodeCount } from "@/lib/two-factor-service";

export const runtime = "nodejs";

export const GET = withApiHandler(async () => {
  const current = await requireCurrentUser();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: current.sub }, select: { twoFactorEnabled: true } });
  const remainingRecoveryCodes = user.twoFactorEnabled ? await getRemainingRecoveryCodeCount(current.sub) : 0;
  return jsonOk({ enabled: user.twoFactorEnabled, remainingRecoveryCodes });
});
