import { withApiHandler } from "@/lib/api-handler";
import { createCallbackHandler } from "@/lib/payment-callback-handler";

export const runtime = "nodejs";

// PENDING OFFICIAL CBE MERCHANT/API SPECIFICATION — see cbe-provider.ts.
export const POST = withApiHandler(createCallbackHandler("CBE"));
