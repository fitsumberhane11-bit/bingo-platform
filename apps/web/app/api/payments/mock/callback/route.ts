import { withApiHandler } from "@/lib/api-handler";
import { createCallbackHandler } from "@/lib/payment-callback-handler";

export const runtime = "nodejs";

// Unauthenticated by design — this is where an external provider (or, in
// dev, our own simulate button / test suite) delivers a webhook. Trust is
// established entirely through signature verification inside the handler,
// never through a session cookie.
export const POST = withApiHandler(createCallbackHandler("MOCK"));
