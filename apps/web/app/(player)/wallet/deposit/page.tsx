import { DepositForm } from "./DepositForm";

export const metadata = { title: "Deposit" };

export default function DepositPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Deposit Funds</h1>
        <p className="text-sm text-slate-500">Add money to your wallet to buy Bingo tickets.</p>
      </div>
      <DepositForm />
    </div>
  );
}
