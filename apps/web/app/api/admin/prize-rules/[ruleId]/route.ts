import type { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma, prisma } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { writeAuditLog } from "@/lib/audit";
import { ConflictError, NotFoundError } from "@/lib/errors";

export const runtime = "nodejs";

const updateSchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  config: z.record(z.unknown()).optional(),
  tieBreakRule: z.enum(["SPLIT_EQUALLY", "FIRST_TICKET_WINS", "SHARE_BY_STAKE"]).optional(),
  platformFeePercent: z.coerce.number().min(0).max(100).optional(),
});

/**
 * A PrizeRule is a reusable template referenced by many games. Editing it
 * after a game that uses it has left DRAFT would retroactively change that
 * game's economics — the prize pool percentage or platform fee a player
 * saw when they bought a ticket must never move under them. Once ANY game
 * referencing this rule has registration open or further along, the rule
 * is permanently locked; create a new rule instead. DRAFT games aren't
 * player-visible yet, so a rule only used by DRAFT games remains editable.
 */
export const PATCH = withApiHandler(async (req: NextRequest, { params }: { params: { ruleId: string } }) => {
  const ctx = await requireApiPermission(PERMISSIONS.PRIZE_RULE_MANAGE);
  const input = updateSchema.parse(await req.json());

  const rule = await prisma.prizeRule.findUnique({ where: { id: params.ruleId } });
  if (!rule) throw new NotFoundError("Prize rule not found.");

  const inUseByNonDraftGame = await prisma.game.findFirst({
    where: { prizeRuleId: rule.id, status: { not: "DRAFT" } },
    select: { id: true, name: true, status: true },
  });
  if (inUseByNonDraftGame) {
    throw new ConflictError(
      `This prize rule is locked: it's already in use by "${inUseByNonDraftGame.name}" (${inUseByNonDraftGame.status}), which has left DRAFT. Create a new prize rule instead of editing this one.`,
    );
  }

  const updated = await prisma.prizeRule.update({
    where: { id: rule.id },
    data: {
      name: input.name,
      config: input.config as Prisma.InputJsonValue | undefined,
      tieBreakRule: input.tieBreakRule,
      platformFeePercent: input.platformFeePercent,
    },
  });

  await writeAuditLog({
    actorUserId: ctx.userId,
    action: "PRIZE_RULE_CHANGED",
    entityType: "PrizeRule",
    entityId: rule.id,
    oldValue: {
      name: rule.name,
      config: rule.config,
      tieBreakRule: rule.tieBreakRule,
      platformFeePercent: rule.platformFeePercent.toString(),
    } as unknown as Prisma.InputJsonValue,
    newValue: input as unknown as Prisma.InputJsonValue,
  });

  return jsonOk({ rule: { ...updated, platformFeePercent: updated.platformFeePercent.toString() } });
});
