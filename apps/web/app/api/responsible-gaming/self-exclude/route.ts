import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";
import { startSelfExclusion } from "@/lib/responsible-gaming-service";

export const runtime = "nodejs";

const schema = z.object({ days: z.number().int().positive() });

export const POST = withApiHandler(async (req: NextRequest) => {
  const current = await requireCurrentUser();
  const { days } = schema.parse(await req.json());
  const until = await startSelfExclusion(current.sub, days);
  return jsonOk({ until });
});
