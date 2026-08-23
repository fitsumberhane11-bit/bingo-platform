import { ChangePasswordForm } from "./ChangePasswordForm";
import { SessionsList } from "./SessionsList";
import { TwoFactorPanel } from "./TwoFactorPanel";

export const metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Security</h1>
        <p className="text-sm text-slate-500">Manage your password and active sessions.</p>
      </div>

      <div className="card">
        <h2 className="mb-4 font-semibold text-ink-900">Change password</h2>
        <p className="mb-4 text-sm text-slate-500">Changing your password logs you out of every device.</p>
        <ChangePasswordForm />
      </div>

      <div className="card">
        <h2 className="mb-1 font-semibold text-ink-900">Active sessions</h2>
        <p className="mb-4 text-sm text-slate-500">Devices currently signed in to your account.</p>
        <SessionsList />
      </div>

      <div className="card">
        <h2 className="mb-1 font-semibold text-ink-900">Two-factor authentication</h2>
        <p className="mb-4 text-sm text-slate-500">
          Add an extra layer of security with an authenticator app. Strongly recommended for administrator, finance, and support accounts.
        </p>
        <TwoFactorPanel />
      </div>
    </div>
  );
}
