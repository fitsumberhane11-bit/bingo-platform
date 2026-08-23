import { WithdrawForm } from "./WithdrawForm";

export const metadata = { title: "Withdraw" };

export default function WithdrawPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Withdraw Funds</h1>
        <p className="text-sm text-slate-500">Request a withdrawal to your Telebirr or CBE account.</p>
      </div>
      <WithdrawForm />
    </div>
  );
}
