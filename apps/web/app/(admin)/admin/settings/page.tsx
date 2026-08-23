import { PERMISSIONS } from "@bingo/shared-types";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasPermission, loadAccessContext } from "@/lib/rbac-server";
import { listSettings } from "@/lib/settings-service";
import { Alert } from "@/components/ui/Alert";
import { SettingsForm } from "./SettingsForm";

export const metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const ctx = await loadAccessContext(current.sub);

  if (!hasPermission(ctx, PERMISSIONS.SETTINGS_MANAGE)) {
    return (
      <Alert variant="error">
        You don&apos;t have permission to manage system settings. This section is restricted to Super Admins.
      </Alert>
    );
  }

  const settings = await listSettings();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Settings</h1>
        <p className="text-sm text-slate-500">Platform-wide configuration. Changes take effect immediately.</p>
      </div>
      <SettingsForm settings={settings.map((s) => ({ ...s, value: s.value as string | number | boolean | null }))} />
    </div>
  );
}
