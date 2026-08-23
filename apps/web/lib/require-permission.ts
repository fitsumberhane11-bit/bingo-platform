import type { PermissionKey } from "@bingo/shared-types";
import { requireCurrentUser } from "./current-user";
import { loadAccessContext, requirePermission, type AccessContext } from "./rbac-server";

/**
 * Combines "must be logged in" with "must hold this permission, verified
 * fresh against the DB" — the standard guard for every admin API route.
 */
export async function requireApiPermission(permission: PermissionKey): Promise<AccessContext> {
  const current = await requireCurrentUser();
  const ctx = await loadAccessContext(current.sub);
  requirePermission(ctx, permission);
  return ctx;
}
