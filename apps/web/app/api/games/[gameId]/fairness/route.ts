import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { getFairnessReport } from "@/lib/game/fairness";

export const runtime = "nodejs";

// Deliberately public/unauthenticated — provably-fair verification only
// works as a trust mechanism if anyone can independently check it.
export const GET = withApiHandler(async (_req: Request, { params }: { params: { gameId: string } }) => {
  const report = await getFairnessReport(params.gameId);
  return jsonOk(report);
});
