import { redirect } from "next/navigation";
import { prisma } from "@bingo/db";
import { getCurrentUser } from "@/lib/current-user";
import { AppShell } from "@/components/layout/AppShell";

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

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
