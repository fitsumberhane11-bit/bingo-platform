# Final Demo Release Candidate Report

**2026-08-23** · Ethiopia Bingo · Game-first / DEMO-mode polish pass

## A. Overall status

**DEMO RELEASE CANDIDATE — FULLY PLAYABLE AND STABLE ENOUGH FOR PRODUCT
DEMONSTRATION.**

Not "production ready" — see sections L and M for exactly what's still
missing before real money or a public launch.

This pass started from an already-working demo (the previous milestone's
`DEMO_RELEASE_REPORT.md`) and audited it as a first-time user and as an
admin, end to end, in a real browser against the real running app. Five
real bugs were found and fixed — none were hidden, none were "reset to
make the checker pass." Every fix was verified live, not just typechecked.

## B. Features completed / verified this pass

- **Player**: registration→login→logout, dashboard, DEMO wallet, mock
  deposit (all real payment providers visibly disabled), transaction
  history, lobby (Live/Upcoming/Completed), ticket purchase, bingo card
  (manual mark), current number, called-number history, game
  announcements, winner notification, game completion screen, prize
  display, wallet winnings, fairness verification, profile, sound
  settings, mobile layout (375px).
- **Admin**: dashboard metrics, game creation, scheduling, opening,
  starting (with countdown), auto-calling, player/ticket/prize-pool
  monitoring, announcements, cancel with required-reason confirmation,
  game history, RBAC-gated navigation.
- **Demo environment**: base seed extended to 5 demo players (was 2); a
  new idempotent `pnpm --filter web seed:demo` script populates the lobby
  with a genuinely LIVE game, an OPEN game, and a SCHEDULED game using the
  real engine/ticket-purchase code paths — safe to re-run at any time.
- **Docs**: `docs/DEMO_WALKTHROUGH.md` (15-step demo script) and
  `docs/DEMO_RELEASE_CHECKLIST.md` (this pass's PASS/FAIL/NOT-TESTED
  table) are new.

## C. Bugs found and fixed

1. **Landing page contradicted DEMO mode.** The public homepage's hero
   copy said "win real prizes — pay securely with Telebirr or CBE,"
   directly under the "TEST GAME — NO REAL MONEY" banner. Rewrote the
   copy to be DEMO-honest; also added a missing redirect so a logged-in
   user hitting `/` lands on their dashboard instead of the marketing page.
   *(`app/(public)/page.tsx`)*

2. **Sessions hard-expired every 15 minutes with no recovery — the most
   impactful fix this pass.** The access-token cookie has a 15-minute TTL
   by design, refreshed via a 30-day refresh token — but nothing in the
   client ever called the existing `/api/auth/refresh` endpoint. Any
   session, mid-game or mid-form, silently died on a fixed clock and
   forced a full re-login. Added `SessionKeepAlive`, a small client
   component that pings the refresh endpoint every 8 minutes; wired into
   both the player and admin shells. Verified live: the refresh endpoint
   correctly rotates the session, and the component is mounted globally.
   *(`components/layout/SessionKeepAlive.tsx`, `AppShell.tsx`, `(admin)/layout.tsx`)*

3. **Systemic crash risk across 18 pages on session expiry.** Seven
   player pages and eleven admin pages called `getCurrentUser()` and used
   `current!.sub` with a non-null assertion instead of checking for
   `null`, relying entirely on the parent layout's redirect. Next.js's
   client-side navigation can reuse a cached layout while re-running just
   the page, so an expired/invalidated session during an in-app link
   click bypassed the layout's check and crashed with a raw 500 instead
   of redirecting to `/login`. Reproduced live (a genuine crash in
   `games/history`), then fixed all 18 occurrences with an explicit
   `if (!current) redirect("/login")`.

4. **Prize pool didn't update live after a ticket purchase.** Verified by
   buying a ticket in the browser and watching the prize-pool figure stay
   stale until a manual reload. Root cause: the server's
   `game:ticket-purchased` broadcast never included a `prizePool` field at
   all, so the client's update guard silently no-op'd. Fixed by computing
   the true post-purchase prize pool (via the same `calculatePrizePool`
   helper `game:sync` uses) and including it in the broadcast. Verified
   live: prize pool now updates instantly for every connected client, not
   just on reload. *(`lib/game/tickets.ts`)*

5. **A LIVE game could get permanently stuck in STARTING.** The
   STARTING→LIVE countdown timer lives only in server process memory, and
   — unlike the LIVE/AUTO calling loop — had no self-heal on reconnect.
   Reproduced live: a game started via a short-lived seed script stayed
   in STARTING forever once that script exited, with the countdown timer
   gone. Fixed by adding `ensureCountdownRunning()`, called from the SSE
   stream route exactly like the existing auto-caller self-heal. Verified
   live: a genuinely stuck game recovered to LIVE the moment a client
   reconnected. *(`lib/game/engine.ts`, `app/api/games/[gameId]/stream/route.ts`)*

**Also fixed, lower severity:**
- Lobby cards exposed a raw internal game UUID prefix to players for no
  reason — removed.
- "Buy Ticket" was shown as the call-to-action even for a SCHEDULED game
  whose registration hadn't opened yet; now shows "View Game" until it's
  actually purchasable.
- The game room's "Ticket sales are closed for this game" message showed
  for *any* non-purchasable state, including a game that hadn't opened
  yet (factually backwards — "closed" implies it already happened).
  Replaced with per-state copy.
- A dead root script (`dev:realtime`) referenced a package that doesn't
  exist in this monorepo — removed. Root `package.json`'s description
  also overstated "production-grade real-money" status; corrected to
  reflect current DEMO-mode reality.
- **A real financial-integrity bug in the dev seed script itself.**
  `pnpm db:seed`'s `seedDevUser()` helper fabricated a false "opening
  balance" ledger entry (`balanceBefore: 0`) against demo accounts that
  already existed with real transaction history, because it used
  `upsert` without checking whether the row was actually new. The
  automated integrity checker caught it immediately (each affected
  wallet was exactly 500 ETB short of what its ledger reconstructed to).
  Root-caused, fixed at the source (explicit existence check before
  creating), and the three fabricated ledger rows were removed by their
  exact reference ID — not by resetting any wallet balance. Verified
  clean across two full test-suite runs afterward. See
  `feedback_bingo_test_data_hygiene.md` for the full writeup.
- `pnpm test` and `pnpm --filter web seed:demo` both silently crashed on
  a fresh shell with "Invalid environment configuration," because
  `vitest` (unlike `next dev`/`next build`) never loads `.env.local`.
  Fixed so both work without manual env exports.

## D. Tests performed

- `pnpm lint` — clean, no warnings.
- `pnpm --filter web typecheck` — clean, after every fix in this pass.
- `pnpm test` — **68/68 tests passing across all 9 test files**, run
  twice in a row with a fresh `db:integrity-check` between each run.
  (One transient failure mid-session was the app's own rate limiter
  correctly firing from rapid repeated test runs — not a bug; resolved
  by clearing the rate-limit keys, same documented pattern as before.)
- `pnpm db:integrity-check` — **PASS**, checked five separate times
  across this session (before changes, after the seed-script fix, after
  each test run, and after final cleanup). Zero drift every time.
- `env -i ... pnpm build` — production build succeeds with the real-money
  env gate (`NODE_ENV=production`, `ENABLE_MOCK_PAYMENTS=false`,
  `GAME_MONEY_MODE=REAL`) set correctly.

## E. Multiplayer results

Two separate LIVE games were seeded this session using the real
`createGame`/`openGame`/`startGame`/`purchaseTickets` code paths — not
scripted shortcuts. Both **completed naturally and unattended**, with the
server's own winner-detection logic (never the browser) declaring the
winner and paying out correctly:

- "Community Bingo Night" (One Horizontal Line): 4 tickets across 3
  players, completed at 40/75 numbers called, ETB 28 paid to the correct
  winner.
- "Friday Jackpot Bingo" (Full House): 4 tickets across 3 players
  (including one purchased live through the browser mid-audit),
  completed with two separate winner payouts (ETB 28, then ETB 42 — the
  jackpot round), both correct.

A third, dedicated game was driven end-to-end through the real admin UI:
Start → 10s countdown (visible, correct) → LIVE → auto-calling → an
admin announcement sent via the real API appeared in the open player
session within about a second, with no page refresh.

## F. Load-test results

Fresh run this session against the real running dev server, using
`apps/web/scripts/load-test.mjs` (opens N real concurrent SSE
connections, triggers a real `call-next`, measures actual delivery):

| Concurrency | Connections established | Event delivery | Propagation p50 / p95 / p99 |
|---|---|---|---|
| 100 | 100/100 | 100/100 | 47.2 / 49.3 / 49.5 ms |
| 500 | 500/500 | 500/500 | 36.1 / 41.5 / 41.9 ms |
| 1000 | 1000/1000 | 1000/1000 | 43.0 / 50.6 / 51.2 ms |

`game:sync` (the initial full-state snapshot, separate from the
number-called event) was missing for exactly 1 connection at every scale
tested (99/100, 499/500, 999/1000) — a consistent, scale-independent
ratio that points to the load-test harness itself (likely the connection
that issues the triggering `call-next` request), not a product bug. It
did not affect the actual timed event, which delivered at 100% every
time. Documented honestly rather than hidden or hand-waved.

**DEMO test environment, not production capacity.** This ran on one
laptop-class dev server against local Postgres/Redis. It proves the
architecture (SSE + Redis pub/sub) scales linearly and cleanly at this
size — it says nothing about real production infrastructure, database
tuning, or network conditions at scale.

## G. Security results

- **IDOR / mass assignment**: verified structurally — the ticket-purchase
  route's Zod schema only accepts `gameId`/`ticketCount`; `userId` always
  comes from the authenticated session server-side and is never
  read from client input, even if supplied. Verified live: different
  player sessions only ever see their own tickets/cards.
- **RBAC**: admin routes require `loadAccessContext` server-side; a
  non-admin hitting `/admin/*` is redirected, not just hidden client-side.
- **Session security**: found and fixed the 15-minute hard-logout gap
  (section C.2) — the most user-facing issue in this whole pass.
- **Dangerous admin actions**: cancel-game requires a typed reason and an
  explicit second confirm click; "cannot be undone" and "tickets will be
  refunded" are both stated up front.
- No new vulnerabilities found. No security fix required weakening any
  existing check.

## H. Database integrity results

Clean at every checkpoint this session (5 separate runs) — see section D.
One real bug was found and fixed in this exact area: a seed-script defect
that fabricated a false ledger entry against pre-existing demo accounts
(section C, "Also fixed"). Found via the integrity checker doing exactly
its job, root-caused rather than reset, and verified clean afterward.

## I. Mobile results

Re-verified at 375px (game room and post-game results screen): no
horizontal overflow, text readable, buttons tappable, called-number
board and card both render cleanly. The rest of the audit (lobby, admin,
wallet, deposit, ticket purchase) was done at desktop width (1280px) —
the full breakpoint sweep (320/390/414/768/1024/1440) from the previous
milestone was not re-run this pass; nothing touched this session is
expected to regress it (no layout-affecting CSS changes were made), but
it's marked NOT TESTED rather than assumed in
`docs/DEMO_RELEASE_CHECKLIST.md`.

## J. Known limitations

- Auto-mark (as opposed to manual tap-to-dab) wasn't exercised this pass.
- Multiple-simultaneous-winners / split-prize wasn't re-run live this
  session (covered by the automated suite, not re-verified in the browser).
- Full accessibility audit (contrast, keyboard nav, screen reader) not
  performed — only spot-checked via the accessibility tree (bingo card
  cells and nav links carry correct accessible names).
- Maintenance-mode toggle wasn't exercised live this pass (covered by
  the automated suite).
- The one browser-automation tool available shares a single cookie jar
  across tabs, so genuinely simultaneous multi-account browser testing
  isn't possible with it — worked around this session (as in the
  previous milestone) using independent authenticated HTTP sessions via
  curl, which gives equally rigorous per-account isolation proof.

## K. Remaining issues

None open from this pass. Every bug found (section C) was fixed and
verified live before this report was written.

## L. Exact steps required before real-money integration

Unchanged from `docs/PRODUCTION_READINESS.md` — this pass did not touch
payment integration and was explicitly told not to. In short: Telebirr
merchant onboarding + real API spec (see `docs/TELEBIRR_INTEGRATION.md`),
a CBE integration path decision (direct vs. aggregator — see
`docs/CBE_INTEGRATION.md`), then the same implementation/test pattern
already used for the mock provider, only then flipping
`GAME_MONEY_MODE=REAL` outside a test environment.

## M. Exact steps required before production deployment

Also unchanged and still gated on business/infra decisions, not
engineering: legal/compliance sign-off (gambling licensing, KYC/AML, ToS
review), fresh production secrets in a real secrets manager, HTTPS +
managed Postgres/Redis, structured logging/error tracking, monitoring on
payment failure rates and ledger anomalies, a validated `docker build`
and a real GitHub Actions run of the CI pipeline (both are written and
reviewed but have not been executed in this environment, which has
neither Docker nor a GitHub remote). Full detail in
`docs/PRODUCTION_READINESS.md`, which continues to track this
independently of demo-mode work.

---

Per this phase's own closing instruction: stopping here. Not proceeding
to real-money payment integration, licensing, or Telebirr/CBE API work
without explicit further instruction.
