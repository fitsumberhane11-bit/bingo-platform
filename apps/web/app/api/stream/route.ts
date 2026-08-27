import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getGameBroadcaster, type GameEvent } from "@/lib/game/broadcaster";

export const runtime = "nodejs";

function sseFormat(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Platform-wide Server-Sent Events stream — the app-shell-level counterpart
 * to `/api/games/:id/stream` (which only exists once you're inside a game
 * room). Any authenticated user gets this the moment the app shell mounts,
 * so a platform-wide announcement or a game opening for registration
 * reaches them wherever they are, not just inside a room they've already
 * joined. Two channels: "global" (every logged-in user) and
 * `user:{userId}` (announcements targeted at this one player) — the same
 * two channels the per-room stream also subscribes to, just without
 * needing a gameId.
 */
export async function GET(req: NextRequest) {
  const current = await getCurrentUser();
  if (!current) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  const broadcaster = getGameBroadcaster();

  const stream = new ReadableStream({
    start(controller) {
      const forward = (event: GameEvent) => {
        try {
          controller.enqueue(encoder.encode(sseFormat(event.type, event.payload)));
        } catch {
          // controller already closed; the abort handler below will clean up.
        }
      };

      const unsubscribeGlobal = broadcaster.subscribe("global", forward);
      const unsubscribeUser = broadcaster.subscribe(`user:${current.sub}`, forward);

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 20000);

      req.signal.addEventListener("abort", () => {
        unsubscribeGlobal();
        unsubscribeUser();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
