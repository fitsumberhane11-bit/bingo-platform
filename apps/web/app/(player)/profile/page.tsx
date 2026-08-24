import { redirect } from "next/navigation";
import { prisma } from "@bingo/db";
import { getCurrentUser } from "@/lib/current-user";
import { EditProfileForm } from "./EditProfileForm";
import { CheckCircle2, XCircle } from "lucide-react";
import { SoundSettingsPanel } from "@/components/sound/SoundSettingsPanel";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: current.sub },
    select: {
      fullName: true,
      username: true,
      email: true,
      phone: true,
      emailVerifiedAt: true,
      phoneVerifiedAt: true,
      referralCode: true,
      createdAt: true,
    },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Profile</h1>
        <p className="text-sm text-slate-500">Manage your personal information.</p>
      </div>

      <div className="card">
        <h2 className="mb-4 font-semibold text-ink-900">Account details</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Username" value={`@${user.username}`} />
          <Field label="Referral code" value={user.referralCode} />
          <Field
            label="Email"
            value={user.email}
            verified={!!user.emailVerifiedAt}
          />
          <Field
            label="Phone"
            value={user.phone}
            verified={!!user.phoneVerifiedAt}
          />
          <Field label="Member since" value={new Date(user.createdAt).toLocaleDateString()} />
        </dl>
      </div>

      <div className="card">
        <h2 className="mb-4 font-semibold text-ink-900">Edit name</h2>
        <EditProfileForm defaultFullName={user.fullName} />
      </div>

      <SoundSettingsPanel />
    </div>
  );
}

function Field({ label, value, verified }: { label: string; value: string; verified?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-ink-900">
        {value}
        {verified === true && <CheckCircle2 className="h-3.5 w-3.5 text-brand-600" aria-label="Verified" />}
        {verified === false && <XCircle className="h-3.5 w-3.5 text-amber-500" aria-label="Not verified" />}
      </dd>
    </div>
  );
}
