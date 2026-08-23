import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getGameBroadcaster, type GameEvent } from "@/lib/game/broadcaster";
import { getGameSnapshot } from "@/lib/game/snapshot";
import { ensureAutoCallerRunning } from "@/lib/game/engine";

export const runtime = "nodejs";

function sseFormat(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Server-Sent Events stream for one game room. Gated on authentication
 * only, not game-player membership — a visitor deciding whether to buy a
 * ticket should still see the room live (current number, player count,
 * status), the same way a spectator can watch a bingo hall before playing.
 * None of the broadcast events carry another player's private data: winner
 * announcements only include what's already public on the game's results
 * page (username, ticket number, prize amount). See lib/game/broadcaster.ts
 * for why SSE rather than Socket.IO here.
 *
 * `game:sync` is built from `getGameSnapshot()` — the exact same function
 * that serves the initial page load (GET /api/games/:id) — both on first
 * connect AND every time this route is hit again (a browser reconnect after
 * a dropped connection, or a client-triggered resync). One source of truth
 * for "what does the client currently believe," never two independently
 * maintained versions.
 */
export async function GET(req: NextRequest, { params }: { params: { gameId: string } }) {
  const current = await getCurrentUser();
  if (!current) return new Response("Unauthorized", { status: 401 });

  const snapshot = await getGameSnapshot(params.gameId, current.sub);
  if (!snapshot) return new Response("Not found", { status: 404 });

  // Self-heals a lost AUTO-mode calling timer after a realtime-process
  // restart — see ensureAutoCallerRunning's doc comment. A no-op if the
  // timer is already running, so this is safe to call on every connect.
  ensureAutoCallerRunning(params.gameId, snapshot.game.status, snapshot.game.callMode);

  const encoder = new TextEncoder();
  const broadcaster = getGameBroadcaster();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sseFormat("game:sync", snapshot)));

      const forward = (event: GameEvent) => {
        try {
          controller.enqueue(encoder.encode(sseFormat(event.type, event.payload)));
        } catch {
          // controller already closed; the abort handler below will clean up.
        }
      };

      // Three channels feed this one connection: the game room itself, the
      // "global" channel for platform-wide announcements, and a per-user
      // channel for announcements targeted at this specific player — all
      // delivered through the same SSE stream so the client only ever
      // manages one EventSource per room.
      const unsubscribeGame = broadcaster.subscribe(params.gameId, forward);
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
        unsubscribeGame();
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
