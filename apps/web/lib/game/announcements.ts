import { prisma } from "@bingo/db";
import { getGameBroadcaster } from "./broadcaster";

type AnnouncementType = "INFO" | "WARNING" | "IMPORTANT" | "SYSTEM";

/**
 * Creates a real, persisted Announcement (not just a transient SSE event —
 * it survives a reconnect/refresh, same as an operator-typed one) scoped to
 * a single game, and broadcasts it live. Shared by the manual "Send
 * announcement" admin route and system-generated announcements (e.g. a
 * confirmed winner) so both show up identically in a player's Announcements
 * panel.
 */
export async function postGameAnnouncement(input: {
  gameId: string;
  message: string;
  type?: AnnouncementType;
  createdByUserId: string;
  /** Optional — for announcements whose relevance is inherently time-boxed (e.g. a starting countdown), so it stops showing on its own once stale instead of lingering until something else pushes it out of view. */
  expiresAt?: Date;
}) {
  const announcement = await prisma.announcement.create({
    data: {
      message: input.message,
      type: input.type ?? "IMPORTANT",
      targetType: "GAME",
      gameId: input.gameId,
      createdByUserId: input.createdByUserId,
      expiresAt: input.expiresAt,
    },
  });

  getGameBroadcaster().publish(input.gameId, "game:announcement", {
    id: announcement.id,
    type: announcement.type,
    message: announcement.message,
    createdAt: announcement.createdAt,
    expiresAt: announcement.expiresAt,
  });

  return announcement;
}
