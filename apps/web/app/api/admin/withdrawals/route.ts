import type { NextRequest } from "next/server";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";
import { listWithdrawals, getWithdrawalAdminSummary, type WithdrawalFilters } from "@/lib/withdrawal-service";
import type { PaymentProviderType, WithdrawalStatus } from "@bingo/db";

export const runtime = "nodejs";

export const GET = withApiHandler(async (req: NextRequest) => {
  await requireApiPermission(PERMISSIONS.WITHDRAWAL_VIEW);
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") ?? "20")));

  const status = searchParams.get("status") as WithdrawalStatus | null;
  const provider = searchParams.get("provider") as PaymentProviderType | null;
  const userId = searchParams.get("userId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const minAmount = searchParams.get("minAmount");
  const maxAmount = searchParams.get("maxAmount");

  const filters: WithdrawalFilters = {
    status: status ?? undefined,
    provider: provider ?? undefined,
    userId: userId ?? undefined,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    minAmount: minAmount ? Number(minAmount) : undefined,
    maxAmount: maxAmount ? Number(maxAmount) : undefined,
  };

  const [result, summary] = await Promise.all([listWithdrawals(filters, page, pageSize), getWithdrawalAdminSummary()]);
  return jsonOk({ ...result, summary });
});
