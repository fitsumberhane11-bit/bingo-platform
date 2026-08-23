import { prisma } from "@bingo/db";
import { getCurrentUser } from "@/lib/current-user";
import { Bell } from "lucide-react";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const current = await getCurrentUser();
  const notifications = await prisma.notification.findMany({
    where: { userId: current!.sub },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Notifications</h1>
        <p className="text-sm text-slate-500">Account and game updates.</p>
      </div>

      <div className="card">
        {notifications.length === 0 ? (
          <div className="py-10 text-center text-slate-400">
            <Bell className="mx-auto mb-2 h-8 w-8" />
            <p className="text-sm">No notifications yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {notifications.map((n) => (
              <li key={n.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink-900">{n.title}</p>
                  <span className="text-xs text-slate-400">{new Date(n.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-0.5 text-sm text-slate-500">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
