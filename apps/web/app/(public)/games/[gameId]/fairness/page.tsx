import { CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import { getFairnessReport } from "@/lib/game/fairness";

export const metadata = { title: "Provably Fair Verification" };

export default async function FairnessPage({ params }: { params: { gameId: string } }) {
  const report = await getFairnessReport(params.gameId);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-brand-600" />
        <h1 className="text-2xl font-bold text-ink-900">Provably Fair Verification</h1>
      </div>
      <p className="mb-6 text-sm text-slate-500">{report.gameName}</p>

      <div className="space-y-4">
        <Step
          title="1. Before the game started"
          done
          body={
            <>
              <p>
                We generated a secret random seed and published its cryptographic fingerprint (SHA-256 hash) — this
                locked in the exact order every number would be called, before anyone (including our own staff)
                could see it.
              </p>
              <Field label="Published commitment hash" value={report.commitmentHash} mono />
            </>
          }
        />

        <Step
          title="2. During the game"
          done={report.calledSequence.length > 0}
          body={
            <>
              <p>Numbers were called strictly in the order determined by that (still-secret) seed.</p>
              <Field label="Numbers called so far" value={String(report.calledSequence.length)} />
            </>
          }
        />

        <Step
          title="3. After the game"
          done={report.seedRevealed}
          body={
            report.seedRevealed ? (
              <>
                <p>The secret seed has been revealed. Anyone can now independently recompute and verify it.</p>
                <Field label="Revealed seed" value={report.seed ?? ""} mono />
              </>
            ) : (
              <p className="text-slate-400">The seed will be revealed once this game completes.</p>
            )
          }
        />
      </div>

      {report.verification && (
        <div className="card mt-6">
          <h2 className="mb-3 font-semibold text-ink-900">Independent verification result</h2>
          <div className="space-y-2 text-sm">
            <ResultRow label="Seed matches the published commitment" ok={report.verification.commitmentValid} />
            <ResultRow label="Called numbers match what the seed deterministically produces" ok={report.verification.sequenceValid} />
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Anyone can repeat this check: hash the revealed seed with SHA-256 and confirm it matches the published
            commitment, then re-run the same seeded shuffle algorithm and confirm the resulting order matches the
            numbers that were actually called, in order.
          </p>
        </div>
      )}
    </div>
  );
}

function Step({ title, done, body }: { title: string; done: boolean; body: React.ReactNode }) {
  return (
    <div className="card">
      <div className="mb-2 flex items-center gap-2">
        {done ? <CheckCircle2 className="h-4 w-4 text-brand-600" /> : <XCircle className="h-4 w-4 text-slate-300" />}
        <h2 className="font-semibold text-ink-900">{title}</h2>
      </div>
      <div className="space-y-2 text-sm text-slate-600">{body}</div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="mt-2 rounded-lg bg-slate-50 p-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={mono ? "break-all font-mono text-xs text-ink-900" : "text-sm text-ink-900"}>{value}</p>
    </div>
  );
}

function ResultRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="h-4 w-4 text-brand-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
      <span className={ok ? "text-ink-900" : "font-semibold text-red-600"}>{label}</span>
    </div>
  );
}
