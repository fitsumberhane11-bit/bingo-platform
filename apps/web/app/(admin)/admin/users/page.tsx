import { Suspense } from "react";
import Link from "next/link";
import { prisma, type Prisma } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasPermission, loadAccessContext } from "@/lib/rbac-server";
import { Alert } from "@/components/ui/Alert";
import { UserSearch } from "./UserSearch";

export const metadata = { title: "Users" };

const PAGE_SIZE = 20;

export default async function AdminUsersPage({ searchParams }: { searchParams: { q?: string; page?: string } }) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const ctx = await loadAccessContext(current.sub);

  if (!hasPermission(ctx, PERMISSIONS.USER_VIEW)) {
    return <Alert variant="error">You don&apos;t have permission to view users.</Alert>;
  }

  const page = Math.max(1, Number(searchParams.page ?? "1"));
  const q = searchParams.q?.trim();
  const where: Prisma.UserWhereInput = q
    ? {
        OR: [
          { username: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          { fullName: { contains: q, mode: "insensitive" } },
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
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.user.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Users</h1>
        <p className="text-sm text-slate-500">{total.toLocaleString()} registered accounts.</p>
      </div>

      <Suspense>
        <UserSearch />
      </Suspense>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Contact</th>
              <th className="py-2 pr-3">Roles</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Last login</th>
              <th className="py-2 pr-3">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                <td className="py-2 pr-3">
                  <Link href={`/admin/users/${u.id}`} className="font-medium text-ink-900 hover:underline">
                    {u.fullName}
                  </Link>
                  <p className="text-xs text-slate-400">@{u.username}</p>
                </td>
                <td className="py-2 pr-3 text-xs text-slate-500">
                  <p>{u.email}</p>
                  <p>{u.phone}</p>
                </td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <span key={r.role.name} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {r.role.name}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-2 pr-3">
                  <StatusBadge status={u.status} />
                </td>
                <td className="py-2 pr-3 text-xs text-slate-400">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}</td>
                <td className="py-2 pr-3 text-xs text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No users match this search.</p>}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
          Page {page} of {totalPages}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: "bg-brand-50 text-brand-700",
    PENDING_VERIFICATION: "bg-amber-50 text-amber-700",
    SUSPENDED: "bg-red-50 text-red-700",
    BANNED: "bg-red-100 text-red-800",
    DELETED: "bg-slate-100 text-slate-500",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles[status] ?? "bg-slate-100"}`}>{status.replace("_", " ")}</span>;
}
