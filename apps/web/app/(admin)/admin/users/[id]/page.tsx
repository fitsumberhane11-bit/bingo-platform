import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { prisma } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { getCurrentUser } from "@/lib/current-user";
import { hasPermission, loadAccessContext } from "@/lib/rbac-server";
import { Alert } from "@/components/ui/Alert";
import { UserActions } from "./UserActions";

export const metadata = { title: "User Detail" };

export default async function AdminUserDetailPage({ params }: { params: { id: string } }) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const ctx = await loadAccessContext(current.sub);

  if (!hasPermission(ctx, PERMISSIONS.USER_VIEW)) {
    return <Alert variant="error">You don&apos;t have permission to view users.</Alert>;
  }
  const canSeeSensitive = hasPermission(ctx, PERMISSIONS.USER_VIEW_SENSITIVE);

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      fullName: true,
      username: true,
      email: true,
      phone: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
      emailVerifiedAt: true,
      phoneVerifiedAt: true,
      referralCode: true,
      roles: { select: { role: { select: { name: true } } } },
      wallet: { select: { availableBalance: true, pendingBalance: true, currency: true } },
      kyc: { select: { status: true } },
      ...(canSeeSensitive
        ? {
            loginAttempts: { select: { success: true, ipAddress: true, userAgent: true, createdAt: true }, orderBy: { createdAt: "desc" as const }, take: 10 },
            devices: { select: { ipAddress: true, userAgent: true, firstSeenAt: true, lastSeenAt: true } },
          }
        : {}),
    },
  });
  if (!user) notFound();

  const [ticketCount, gameCount, winningsAgg] = await Promise.all([
    prisma.bingoTicket.count({ where: { userId: user.id } }),
    prisma.gamePlayer.count({ where: { userId: user.id } }),
    prisma.winner.aggregate({ where: { userId: user.id }, _sum: { prizeAmount: true }, _count: true }),
  ]);

  const loginAttempts = "loginAttempts" in user ? user.loginAttempts : undefined;
  const devices = "devices" in user ? user.devices : undefined;

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Back to users
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">{user.fullName}</h1>
          <p className="text-sm text-slate-500">@{user.username}</p>
        </div>
        <StatusBadge status={user.status} />
      </div>

      <UserActions
        userId={user.id}
        status={user.status}
        canSuspend={hasPermission(ctx, PERMISSIONS.USER_SUSPEND)}
        canActivate={hasPermission(ctx, PERMISSIONS.USER_ACTIVATE)}
      />

      <div className="card">
        <h2 className="mb-3 font-semibold text-ink-900">Account details</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <Field label="Email" value={user.email} verified={!!user.emailVerifiedAt} />
          <Field label="Phone" value={user.phone} verified={!!user.phoneVerifiedAt} />
          <Field label="Referral code" value={user.referralCode} />
          <Field label="Roles" value={user.roles.map((r) => r.role.name).join(", ") || "—"} />
          <Field label="KYC status" value={user.kyc?.status ?? "NOT_STARTED"} />
          <Field label="Joined" value={new Date(user.createdAt).toLocaleDateString()} />
          <Field label="Last login" value={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"} />
        </dl>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Available balance" value={`ETB ${user.wallet?.availableBalance.toString() ?? "0"}`} />
        <StatCard label="Games played" value={String(gameCount)} />
        <StatCard label="Tickets purchased" value={String(ticketCount)} />
        <StatCard label="Games won" value={String(winningsAgg._count)} />
        <StatCard label="Total winnings" value={`ETB ${(winningsAgg._sum.prizeAmount ?? 0).toString()}`} />
        <StatCard label="Pending balance" value={`ETB ${user.wallet?.pendingBalance.toString() ?? "0"}`} />
      </div>

      {canSeeSensitive && loginAttempts && (
        <div className="card">
          <h2 className="mb-3 font-semibold text-ink-900">Recent login attempts</h2>
          {loginAttempts.length === 0 ? (
            <p className="text-sm text-slate-400">No login attempts recorded.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {loginAttempts.map((a, i) => (
                <li key={i} className="flex items-center justify-between py-2">
                  <span className={a.success ? "text-brand-700" : "text-red-600"}>{a.success ? "Success" : "Failed"}</span>
                  <span className="text-xs text-slate-400">{a.ipAddress}</span>
                  <span className="text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {canSeeSensitive && devices && devices.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-semibold text-ink-900">Known devices</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {devices.map((d, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <span className="text-xs text-slate-500">{d.ipAddress}</span>
                <span className="text-xs text-slate-400">Last seen {new Date(d.lastSeenAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, verified }: { label: string; value: string; verified?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="flex items-center gap-1.5 font-medium text-ink-900">
        {value}
        {verified === true && <CheckCircle2 className="h-3.5 w-3.5 text-brand-600" aria-label="Verified" />}
        {verified === false && <XCircle className="h-3.5 w-3.5 text-amber-500" aria-label="Not verified" />}
      </dd>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-ink-900">{value}</p>
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
  return <span className={`rounded-full px-3 py-1 text-sm font-semibold ${styles[status] ?? "bg-slate-100"}`}>{status.replace("_", " ")}</span>;
}
