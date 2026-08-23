import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";
import { purchaseTickets } from "@/lib/game/tickets";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

export const runtime = "nodejs";

const schema = z.object({
  gameId: z.string().uuid(),
  ticketCount: z.coerce.number().int().min(1).max(20),
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const current = await requireCurrentUser();
  await enforceRateLimit(`ticket-purchase:${current.sub}`, 30, 60 * 60);
  await enforceRateLimit(`ticket-purchase:ip:${getClientIp(req)}`, 60, 60 * 60);

  const { gameId, ticketCount } = schema.parse(await req.json());
  const result = await purchaseTickets({ gameId, userId: current.sub, ticketCount });

  return jsonOk(
    {
      tickets: result.tickets.map((t) => ({ id: t.id, ticketNumber: t.ticketNumber, cardNumbers: t.cardNumbers })),
      wallet: result.wallet,
    },
    { status: 201 },
  );
});
