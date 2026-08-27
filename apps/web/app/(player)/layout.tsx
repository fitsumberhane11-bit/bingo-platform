import { redirect } from "next/navigation";
import { prisma } from "@bingo/db";
import { getCurrentUser } from "@/lib/current-user";
import { loadAccessContext } from "@/lib/rbac-server";
import { AppShell } from "@/components/layout/AppShell";

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  // Staff-only accounts (operator, admin, finance, support) don't play —
  // they run the floor from /admin, so the whole player shell (buying
  // tickets, wallet, marking cards, and its own profile/security pages)
  // is out of scope for them. Super admin is exempted, consistent with its
  // unrestricted access everywhere else in the app.
  const ctx = await loadAccessContext(current.sub);
  if (!ctx.isSuperAdmin && !ctx.roles.includes("PLAYER")) redirect("/admin");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: current.sub },
    select: { fullName: true, username: true, wallet: { select: { availableBalance: true } } },
  });

  return (
    <AppShell user={{ fullName: user.fullName, username: user.username }} walletBalance={(user.wallet?.availableBalance ?? 0).toString()}>
      {children}
    </AppShell>
  );
}
