import { prisma } from "@bingo/db";
import { ROLES, type PermissionKey } from "@bingo/shared-types";
import { ForbiddenError } from "./errors";

export interface AccessContext {
  userId: string;
  roles: string[];
  permissions: Set<string>;
  isSuperAdmin: boolean;
}

/**
 * Always re-derived from the database, never trusted solely from a JWT —
 * a role/permission change (e.g. an admin being demoted or suspended)
 * must take effect immediately, not after the access token expires.
 */
export async function loadAccessContext(userId: string): Promise<AccessContext> {
  const roles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });

  const roleNames = roles.map((r) => r.role.name);
  const isSuperAdmin = roleNames.includes(ROLES.SUPER_ADMIN);
  const permissions = new Set<string>();
  for (const r of roles) {
    for (const rp of r.role.permissions) {
      permissions.add(rp.permission.key);
    }
  }

  return { userId, roles: roleNames, permissions, isSuperAdmin };
}

export function hasPermission(ctx: AccessContext, permission: PermissionKey): boolean {
  return ctx.isSuperAdmin || ctx.permissions.has(permission);
}

export function requirePermission(ctx: AccessContext, permission: PermissionKey): void {
  if (!hasPermission(ctx, permission)) {
    throw new ForbiddenError(`Missing required permission: ${permission}`);
  }
}

export function requireAnyRole(ctx: AccessContext, roles: string[]): void {
  if (ctx.isSuperAdmin) return;
  if (!roles.some((r) => ctx.roles.includes(r))) {
    throw new ForbiddenError("You do not have the required role for this action.");
  }
}
