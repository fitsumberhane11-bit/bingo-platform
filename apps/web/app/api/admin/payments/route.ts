import type { NextRequest } from "next/server";
import { prisma } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";

export const runtime = "nodejs";

export const GET = withApiHandler(async (req: NextRequest) => {
  await requireApiPermission(PERMISSIONS.PAYMENT_VIEW);

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;
  const provider = searchParams.get("provider") ?? undefined;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") ?? "20")));

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(provider ? { provider: provider as never } : {}),
  };

  const [payments, total, summary] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: { user: { select: { username: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payment.count({ where }),
    prisma.payment.groupBy({ by: ["status"], _count: { _all: true }, _sum: { amount: true } }),
  ]);

  return jsonOk({
    payments,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    summary: summary.map((s) => ({ status: s.status, count: s._count._all, totalAmount: s._sum.amount?.toString() ?? "0" })),
  });
});
