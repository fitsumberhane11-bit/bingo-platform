import Link from "next/link";
import { redirect } from "next/navigation";
import { Wallet, Trophy, Gamepad2, Bell, Ticket, Radio, CalendarClock, Megaphone } from "lucide-react";
import { prisma } from "@bingo/db";
import { getCurrentUser } from "@/lib/current-user";
import { Alert } from "@/components/ui/Alert";

export const metadata = { title: "Dashboard" };

const LOBBY_UPCOMING_STATUSES = ["SCHEDULED", "OPEN", "FULL", "STARTING"] as const;

export default async function DashboardPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const userId = current.sub;

  const [user, recentNotifications, recentTransactions, liveGamesCount, upcomingGames, myTicketsCount, winningsAgg, recentGames, announcements] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          fullName: true,
          emailVerifiedAt: true,
          wallet: { select: { availableBalance: true, pendingBalance: true, currency: true } },
        },
      }),
      prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.walletTransaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.game.count({ where: { status: "LIVE" } }),
      prisma.game.findMany({
        where: { status: { in: [...LOBBY_UPCOMING_STATUSES] } },
        orderBy: { startTime: "asc" },
        take: 4,
        select: { id: true, name: true, startTime: true, ticketPrice: true, status: true, _count: { select: { players: true } }, maxPlayers: true },
      }),
      prisma.bingoTicket.count({ where: { userId } }),
      prisma.winner.aggregate({ where: { userId }, _sum: { prizeAmount: true } }),
      prisma.gamePlayer.findMany({
        where: { userId },
        orderBy: { joinedAt: "desc" },
        take: 4,
        include: { game: { select: { id: true, name: true, status: true, startTime: true } } },
      }),
      prisma.announcement.findMany({
        where: {
          active: true,
          OR: [{ targetType: "ALL" }, { targetType: "USER", targetUserId: userId }],
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
        },
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Welcome back, {user.fullName.split(" ")[0]}</h1>
        <p className="text-sm text-slate-500">Here&apos;s what&apos;s happening with your account.</p>
      </div>

      {!user.emailVerifiedAt && (
        <Alert variant="info">
          Verify your email to secure your account for later. You&apos;re all set to play with DEMO balance right
          now — verification isn&apos;t required in this test version.
        </Alert>
      )}

      {announcements.length > 0 && (
        <div className="space-y-2">
          {announcements.map((a) => (
            <Alert key={a.id} variant={a.type === "WARNING" || a.type === "IMPORTANT" ? "error" : "info"}>
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <Megaphone className="h-3.5 w-3.5" /> Announcement
              </span>
              <span className="ml-1">{a.message}</span>
            </Alert>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Wallet className="h-5 w-5" />} label="Wallet" value={`ETB ${user.wallet?.availableBalance.toString() ?? "0.00"}`} />
        <StatCard icon={<Radio className="h-5 w-5" />} label="Live games" value={String(liveGamesCount)} />
        <StatCard icon={<CalendarClock className="h-5 w-5" />} label="Upcoming games" value={String(upcomingGames.length)} />
        <StatCard icon={<Ticket className="h-5 w-5" />} label="My tickets" value={String(myTicketsCount)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard icon={<Trophy className="h-5 w-5" />} label="Total winnings" value={`ETB ${(winningsAgg._sum.prizeAmount ?? 0).toString()}`} />
        <Link href="/play" className="card flex items-center justify-between bg-brand-600 text-white hover:bg-brand-700">
          <span>
            <span className="block font-semibold">Play Now</span>
            <span className="block text-sm text-brand-100">Browse live and upcoming games</span>
          </span>
          <Gamepad2 className="h-6 w-6" />
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">Upcoming games</h2>
            <Link href="/play" className="text-xs font-semibold text-brand-700">
              View all
            </Link>
          </div>
          {upcomingGames.length === 0 ? (
            <EmptyState message="No upcoming games right now. Check back soon!" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcomingGames.map((g) => (
                <li key={g.id} className="flex items-center justify-between py-2.5 text-sm first:pt-0 last:pb-0">
                  <div>
                    <Link href={`/play`} className="font-medium text-ink-900 hover:underline">
                      {g.name}
                    </Link>
                    <p className="text-xs text-slate-400">
                      {g.status} · {g._count.players}/{g.maxPlayers} players · {new Date(g.startTime).toLocaleString()}
                    </p>
                  </div>
                  <span className="font-semibold text-ink-900">ETB {g.ticketPrice.toString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink-900">
            <Bell className="h-4 w-4" /> Recent notifications
          </h2>
          {recentNotifications.length === 0 ? (
            <EmptyState message="No notifications yet." />
          ) : (
            <ul className="space-y-3">
              {recentNotifications.map((n) => (
                <li key={n.id} className="border-b border-slate-100 pb-2 text-sm last:border-0 last:pb-0">
                  <p className="font-medium text-ink-900">{n.title}</p>
                  <p className="text-slate-500">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">Recent games</h2>
            <Link href="/games/history" className="text-xs font-semibold text-brand-700">
              View all
            </Link>
          </div>
          {recentGames.length === 0 ? (
            <EmptyState message="You haven't joined a game yet." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentGames.map((gp) => (
                <li key={gp.id} className="flex items-center justify-between py-2.5 text-sm first:pt-0 last:pb-0">
                  <span className="text-ink-900">{gp.game.name}</span>
                  <span className="text-xs text-slate-400">{gp.game.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-ink-900">Recent transactions</h2>
            <Link href="/transactions" className="text-xs font-semibold text-brand-700">
              View all
            </Link>
          </div>
          {recentTransactions.length === 0 ? (
            <EmptyState message="Wallet deposits and ticket purchases will show up here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentTransactions.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2.5 text-sm first:pt-0 last:pb-0">
                  <span className="text-ink-900">{t.type.replaceAll("_", " ")}</span>
                  <span className="font-semibold text-ink-900">ETB {t.amount.toString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/profile" className="btn-secondary">
          Edit profile
        </Link>
        <Link href="/security" className="btn-secondary">
          Security settings
        </Link>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{icon}</div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-ink-900">{value}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="py-6 text-center text-sm text-slate-400">{message}</p>;
}
