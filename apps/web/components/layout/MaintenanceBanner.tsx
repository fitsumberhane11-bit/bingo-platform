import { AlertTriangle } from "lucide-react";
import { isMaintenanceModeEnabled } from "@/lib/system-settings";

/**
 * What stays operational during maintenance mode (deliberately, not by
 * accident): games already LIVE keep running — number calling, SSE
 * delivery, reconnection, and viewing results are untouched. What's
 * paused: new deposits, new withdrawal requests, new ticket purchases, and
 * new registrations (each enforced server-side in its own service function,
 * not just hidden in the UI — see MaintenanceModeError call sites). Admin
 * actions (approving withdrawals, running games, editing settings) are
 * never gated by this flag.
 */
export async function MaintenanceBanner() {
  const enabled = await isMaintenanceModeEnabled();
  if (!enabled) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-red-600 px-4 py-1.5 text-center text-xs font-semibold text-white">
      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
      Maintenance in progress — deposits, withdrawals, ticket purchases, and new sign-ups are temporarily paused. Live games continue as normal.
    </div>
  );
}
