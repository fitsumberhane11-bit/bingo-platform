import { withApiHandler } from "@/lib/api-handler";
import { createCallbackHandler } from "@/lib/payment-callback-handler";

export const runtime = "nodejs";

// NOT CONNECTED — see arifpay-provider.ts.
export const POST = withApiHandler(createCallbackHandler("ARIFPAY"));
