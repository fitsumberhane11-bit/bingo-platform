import { withApiHandler } from "@/lib/api-handler";
import { createCallbackHandler } from "@/lib/payment-callback-handler";

export const runtime = "nodejs";

// Will 400/503 until TelebirrProvider is implemented against the real
// Telebirr notification contract (Phase 5) — see telebirr-provider.ts.
export const POST = withApiHandler(createCallbackHandler("TELEBIRR"));
