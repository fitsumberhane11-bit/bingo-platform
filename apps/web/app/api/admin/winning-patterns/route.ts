import { prisma } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";

export const runtime = "nodejs";

export const GET = withApiHandler(async () => {
  await requireApiPermission(PERMISSIONS.GAME_VIEW);
  const patterns = await prisma.winningPattern.findMany({ where: { enabled: true }, orderBy: { name: "asc" } });
  return jsonOk({ patterns });
});
