import { prisma } from "@bingo/db";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";

export const runtime = "nodejs";

/**
 * Active platform-wide (and this-user-targeted) announcements — the same
 * query the dashboard runs server-side on first load, exposed as an API so
 * `GlobalAnnouncementBanner` can re-fetch it on any player page, not just
 * /dashboard. Deliberately unscoped by permission (unlike
 * /api/admin/announcements, which requires ANNOUNCEMENT_CREATE) — every
 * logged-in user is the intended audience for their own announcements.
 */
export const GET = withApiHandler(async () => {
  const current = await requireCurrentUser();

  const announcements = await prisma.announcement.findMany({
    where: {
      active: true,
      OR: [{ targetType: "ALL" }, { targetType: "USER", targetUserId: current.sub }],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return jsonOk({
    announcements: announcements.map((a) => ({
      id: a.id,
      type: a.type,
      message: a.message,
      createdAt: a.createdAt,
      expiresAt: a.expiresAt,
    })),
  });
});
