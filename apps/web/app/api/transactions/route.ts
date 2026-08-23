import type { NextRequest } from "next/server";
import { prisma } from "@bingo/db";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireCurrentUser } from "@/lib/current-user";

export const runtime = "nodejs";

export const GET = withApiHandler(async (req: NextRequest) => {
  const current = await requireCurrentUser();
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") ?? "20")));

  const [transactions, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { userId: current.sub },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.walletTransaction.count({ where: { userId: current.sub } }),
  ]);

  return jsonOk({
    transactions,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
});
