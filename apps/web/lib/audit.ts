import { prisma } from "@bingo/db";
import type { Prisma } from "@bingo/db";

export interface AuditLogInput {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Every sensitive mutation (auth events, admin actions, financial changes)
 * must call this. It never throws into the caller's success path being
 * silently swallowed — if audit logging fails we want to know, but we also
 * don't want a logging failure to roll back an otherwise-successful write,
 * so callers typically invoke this after the primary transaction commits.
 */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      oldValue: input.oldValue ?? undefined,
      newValue: input.newValue ?? undefined,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
