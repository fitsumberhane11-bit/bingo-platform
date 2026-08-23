import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";
import { startEnrollment } from "@/lib/two-factor-service";

export const runtime = "nodejs";

export const POST = withApiHandler(async () => {
  const current = await requireCurrentUser();
  const { secret, qrCodeDataUri } = await startEnrollment(current.sub, current.username);
  return jsonOk({ secret, qrCodeDataUri });
});
