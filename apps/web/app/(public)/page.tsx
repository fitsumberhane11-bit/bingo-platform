import Link from "next/link";
import { ShieldCheck, Smartphone, Trophy, Zap } from "lucide-react";

export default function LandingPage() {
  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-950 via-ink-900 to-ink-900 text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-200">
              <Zap className="h-3.5 w-3.5" /> Live multiplayer Bingo
            </span>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Play Bingo live with thousands of players across Ethiopia
            </h1>
            <p className="mt-4 max-w-xl text-lg text-slate-300">
              Buy your card, watch numbers called in real time, and win real prizes — pay securely with
              Telebirr or CBE.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="btn-primary px-6 py-3 text-base">
                Create free account
              </Link>
              <Link href="/login" className="btn-secondary bg-white/10 px-6 py-3 text-base text-white hover:bg-white/20 border-white/20">
                Log in
              </Link>
            </div>
            <p className="mt-6 text-xs text-slate-400">
              18+ only. Play responsibly. See our{" "}
              <Link href="/legal/responsible-gaming" className="underline">
                Responsible Gaming policy
              </Link>
              .
            </p>
          </div>
          <div className="mx-auto grid w-full max-w-sm grid-cols-5 gap-1.5 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 sm:gap-2 sm:p-6">
            {["B", "I", "N", "G", "O"].map((letter) => (
              <div key={letter} className="pb-1 text-center text-sm font-bold text-gold-400 sm:text-base">
                {letter}
              </div>
            ))}
            {Array.from({ length: 25 }).map((_, i) => (
              <div
                key={i}
                className={`flex aspect-square items-center justify-center rounded-lg text-sm font-semibold sm:text-base ${
                  i === 12 ? "bg-gold-500 text-ink-900" : "bg-white/10 text-white"
                }`}
              >
                {i === 12 ? "FREE" : Math.floor(Math.random() * 60) + 1}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-3">
          <Feature
            icon={<Zap className="h-5 w-5" />}
            title="Real-time everything"
            body="Numbers, countdowns, and winners update instantly — no refreshing, even on slower mobile connections."
          />
          <Feature
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Provably fair"
            body="Every game's number sequence is cryptographically committed before it starts and verifiable after it ends."
          />
          <Feature
            icon={<Smartphone className="h-5 w-5" />}
            title="Telebirr & CBE"
            body="Deposit and withdraw using the payment methods Ethiopians already trust."
          />
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white py-16">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 text-center sm:px-6">
          <Trophy className="h-8 w-8 text-gold-500" />
          <h2 className="text-2xl font-bold text-ink-900">Ready to play?</h2>
          <p className="max-w-md text-slate-500">Sign up in under a minute and join your first game today.</p>
          <Link href="/register" className="btn-primary px-6 py-3 text-base">
            Get started
          </Link>
        </div>
      </section>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="card">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{icon}</div>
      <h3 className="mb-1 font-semibold text-ink-900">{title}</h3>
      <p className="text-sm text-slate-500">{body}</p>
    </div>
  );
}
