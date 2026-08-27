import type { NextRequest } from "next/server";
import { z } from "zod";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { disqualifyTicket } from "@/lib/game/claims";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().trim().min(3).max(500) });

export const POST = withApiHandler(async (req: NextRequest, { params }: { params: { ticketId: string } }) => {
  const ctx = await requireApiPermission(PERMISSIONS.GAME_CLAIM_CONFIRM);
  const { reason } = schema.parse(await req.json());
  const ticket = await disqualifyTicket(params.ticketId, ctx.userId, reason);
  return jsonOk({ ticket: { id: ticket.id, status: ticket.status, disqualifiedReason: ticket.disqualifiedReason } });
});
