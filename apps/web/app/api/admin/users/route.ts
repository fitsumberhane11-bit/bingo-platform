import type { NextRequest } from "next/server";
import { prisma } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { withApiHandler, jsonOk } from "@/lib/api-handler";
import { requireApiPermission } from "@/lib/require-permission";

export const runtime = "nodejs";

export const GET = withApiHandler(async (req: NextRequest) => {
  await requireApiPermission(PERMISSIONS.USER_VIEW);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") ?? "20")));

  const where = q
    ? {
        OR: [
          { username: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q } },
          { fullName: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        username: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        roles: { select: { role: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return jsonOk({
    users: users.map((u) => ({ ...u, roles: u.roles.map((r) => r.role.name) })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
});
