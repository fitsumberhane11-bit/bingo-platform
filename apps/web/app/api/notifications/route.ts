import { prisma } from "@bingo/db";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";

export const runtime = "nodejs";

export const GET = withApiHandler(async () => {
  const current = await requireCurrentUser();
  const notifications = await prisma.notification.findMany({
    where: { userId: current.sub },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const unreadCount = await prisma.notification.count({ where: { userId: current.sub, read: false } });
  return jsonOk({ notifications, unreadCount });
});
