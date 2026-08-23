import type { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma, prisma } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

export const GET = withApiHandler(async () => {
  await requireApiPermission(PERMISSIONS.GAME_VIEW);
  const rules = await prisma.prizeRule.findMany({ orderBy: { name: "asc" } });
  return jsonOk({
    rules: rules.map((r) => ({ ...r, platformFeePercent: r.platformFeePercent.toString() })),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(3).max(120),
  type: z.enum(["FIXED", "PERCENTAGE_OF_SALES", "JACKPOT", "MULTI_LEVEL"]),
  config: z.record(z.unknown()),
  tieBreakRule: z.enum(["SPLIT_EQUALLY", "FIRST_TICKET_WINS", "SHARE_BY_STAKE"]).default("SPLIT_EQUALLY"),
  platformFeePercent: z.coerce.number().min(0).max(100).default(0),
});

// PRIZE_RULE_MANAGE is restricted from GAME_OPERATOR by design (see
// packages/shared-types/src/rbac.ts) — this is financial-adjacent
// configuration, not game operation.
export const POST = withApiHandler(async (req: NextRequest) => {
  const ctx = await requireApiPermission(PERMISSIONS.PRIZE_RULE_MANAGE);
  const input = createSchema.parse(await req.json());

  const rule = await prisma.prizeRule.create({
    data: {
      name: input.name,
      type: input.type,
      config: input.config as Prisma.InputJsonValue,
      tieBreakRule: input.tieBreakRule,
      platformFeePercent: input.platformFeePercent,
    },
  });

  await writeAuditLog({
    actorUserId: ctx.userId,
    action: "PRIZE_RULE_CREATED",
    entityType: "PrizeRule",
    entityId: rule.id,
    newValue: { ...input } as unknown as Prisma.InputJsonValue,
  });

  return jsonOk({ rule: { ...rule, platformFeePercent: rule.platformFeePercent.toString() } }, { status: 201 });
});
