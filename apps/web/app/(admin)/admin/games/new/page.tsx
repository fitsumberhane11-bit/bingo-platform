import { prisma } from "@bingo/db";
import { PERMISSIONS } from "@bingo/shared-types";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasPermission, loadAccessContext } from "@/lib/rbac-server";
import { Alert } from "@/components/ui/Alert";
import { CreateGameForm } from "./CreateGameForm";

export const metadata = { title: "Create Game" };

export default async function NewGamePage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const ctx = await loadAccessContext(current.sub);

  if (!hasPermission(ctx, PERMISSIONS.GAME_CREATE)) {
    return <Alert variant="error">You don&apos;t have permission to create games.</Alert>;
  }

  const [patterns, prizeRules] = await Promise.all([
    prisma.winningPattern.findMany({ where: { enabled: true }, orderBy: { name: "asc" } }),
    prisma.prizeRule.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Create Game</h1>
        <p className="text-sm text-slate-500">All timing, capacity, and prize rules are validated server-side.</p>
      </div>
      <CreateGameForm
        patterns={patterns.map((p) => ({ id: p.id, name: p.name, description: p.description }))}
        prizeRules={prizeRules.map((r) => ({ id: r.id, name: r.name }))}
      />
    </div>
  );
}
