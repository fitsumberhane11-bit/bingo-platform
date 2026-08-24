# Implementation Status

Last updated: Phases 7–8, 12–13, and part of 15 complete (Bingo game engine, Redis-backed multi-instance realtime, announcements, prize accounting hardening, and a live 5-player + failure-mode acceptance demonstration). Phases 11 (remainder), 14, 16 still open.

## How to run this locally

```bash
# 1. Install dependencies
pnpm install

# 2. Start Postgres + Redis (see docker-compose.yml — added in Phase 16;
#    until then, point DATABASE_URL at any local Postgres 14+ instance).
#    For Redis specifically: REDIS_URL is optional — if unset, the app
#    falls back to a single-instance in-process broadcaster + in-memory
#    rate limiter (fine for solo local dev). For a real zero-install local
#    Redis (downloads a real prebuilt redis-server binary, cached after
#    first run — no Docker/Homebrew needed):
pnpm --filter web dev:redis
#    then put the REDIS_URL it prints into apps/web/.env.local.

# 3. Copy env and fill in secrets
cp .env.example apps/web/.env.local
# Fill in DATABASE_URL, AUTH_JWT_ACCESS_SECRET, AUTH_JWT_REFRESH_SECRET,
# APP_ENCRYPTION_KEY (see .env.example for generation instructions)

# 4. Run migrations + seed
pnpm db:migrate:dev
pnpm db:seed

# 5. Start the app
pnpm dev   # http://localhost:3000
```

Every phase in this project has been verified against a **real PostgreSQL
instance** (migrations applied, seed run, and the actual HTTP/browser flows
exercised) — not just `prisma validate` or mocked tests.

## Development-only seeded accounts

Created by `packages/db/src/seed.ts`. **Never use these in production** —
they're clearly excluded from any production seeding path and the password
is public in source control by design (dev convenience only).

| Username | Role | Password |
|---|---|---|
| `superadmin` | SUPER_ADMIN | `DevPass123!` |
| `admin` | ADMIN | `DevPass123!` |
| `operator` | GAME_OPERATOR | `DevPass123!` |
| `finance` | FINANCE | `DevPass123!` |
| `support` | SUPPORT | `DevPass123!` |
| `player1` / `player2` | PLAYER | `DevPass123!` |

## Phase status

- [x] **Phase 1 — Architecture & database.** Full Prisma schema (25 models),
  validated with `prisma validate`, formatted, and a real migration
  (`migrations/20260815151107_init`) applied and seeded against a live
  Postgres instance. Added `VerificationToken` model (missed in the initial
  pass) for email verification / password reset / OTP.
- [x] **Phase 2 — Authentication & users.** Registration, login, logout,
  refresh-token rotation with reuse detection, forgot/reset password, email
  verification, Argon2id hashing, DB-backed brute-force lockout + Redis (or
  in-memory fallback) rate limiting, data-driven RBAC (`Role`/`Permission`
  tables, seeded per `packages/shared-types/src/rbac.ts`), audit logging on
  every sensitive action, security headers + coarse auth gate in middleware.
  Frontend: landing, register, login, forgot/reset password, verify-email,
  dashboard, profile, security (change password + active sessions + revoke
  all), notifications — all real, mobile-first, connected to the live API.
  **Verified in-browser**: registered a real account, logged in, hit RBAC
  403 as a player against an admin endpoint, hit 200 as `admin`, triggered
  and confirmed account lockout after 5 failed attempts, completed the
  email-verification loop end to end.
- [x] **Phase 3 — Wallet & ledger.** `applyWalletTransaction` is the single
  write path for every balance change: idempotent via a unique
  `referenceId`, race-safe via optimistic concurrency (`Wallet.version`),
  every change produces an immutable `WalletTransaction` row with
  `balanceBefore`/`balanceAfter`. Admin manual adjustments
  (`POST /api/admin/wallet/:userId/adjust`, `FINANCE`/`ADMIN` only) require
  a written reason, go through the same ledger path (no direct balance
  edits exist anywhere), are audited, and notify the user.
  **Verified**: integration test fires 5 concurrent debits against a 170
  ETB balance where only 3 can legally succeed — confirmed exactly 3 succeed
  and the final balance is exactly correct (no overdraft, no lost updates).
  Also verified live via the admin API against the running dev server.
- [x] **Phase 4 — Payment abstraction + mock provider.** `PaymentProvider`
  interface (`packages/payments`) with `MockPaymentProvider`,
  `TelebirrProvider`, and `CBEProvider`. `PaymentService`
  (`apps/web/lib/payment-service.ts`) is the only caller of any provider —
  wallet/game code never touches provider specifics. Full callback pipeline:
  validate → verify signature → log every delivery (`PaymentCallbackLog`,
  even duplicates/rejections) → check idempotency → independently re-verify
  with the provider → atomically transition the payment exactly once
  (conditional `updateMany` guard, same pattern as the wallet's optimistic
  lock) → credit via `applyWalletTransaction` → audit → notify. Manual
  reconciliation (`reconcilePayment`) shares the same exactly-once
  transition logic. Deposit UI with live status polling and a development
  payment simulator (Success/Pending/Failed/Cancelled/Expired + "send N
  duplicate callbacks"). Transactions page gained type/status filters +
  pagination. Minimal Finance/Admin payments dashboard
  (`/admin/payments`) with a Reconcile action gated behind a new
  `payment:reconcile` permission (FINANCE/SUPER_ADMIN only — plain ADMIN
  and GAME_OPERATOR are both verified-blocked).
  **Verified**: 20 automated tests (all outcome states, byte-for-byte replay,
  **20 concurrent identical callbacks → exactly 1 credit**, forged/missing
  signature rejection, malformed-JSON-with-valid-signature rejection,
  tampered-amount rejection, unknown-providerOrderId rejection, a
  callback-claimed userId being structurally ignored, provider-verification
  failure leaving the wallet untouched, and reconciliation idempotency) —
  all passing against a real Postgres. Also verified live in-browser: a
  real deposit → simulate success → balance updates automatically →
  5 duplicate callbacks sent → balance unchanged → visible correctly on
  both the player Transactions page and the Finance admin dashboard;
  RBAC-blocked for a `GAME_OPERATOR` account both in the UI and via direct
  API call. One real bug found and fixed during verification: Next.js
  dev-mode compiles each API route into a separate webpack module graph, so
  the mock provider's in-memory order store needs to live on `globalThis`
  (same pattern already used for the Prisma client singleton) rather than a
  plain module-scoped variable, or state didn't survive between the
  create/simulate/callback routes.
  Repository secret-scanned before completing this phase — no committed
  secrets found; `.env.example` contains placeholders only.
- [x] **Phase 5 — Telebirr provider (research + financial-safety hardening).**
  Full research pass performed before writing any Telebirr-specific code —
  see `docs/TELEBIRR_INTEGRATION.md` for the exact search/fetch trail. The
  official developer portal (`developer.ethiotelecom.et`) is real but its
  actual API specification requires merchant login/onboarding this project
  doesn't have; no unofficial source (blog posts, third-party GitHub repos,
  a search summary asserting suspiciously specific unsourced details) was
  used. Per that finding, `TelebirrProvider` remains structure-only exactly
  as it was after Phase 4 — nothing invented.

  ```
  Telebirr
  Adapter: Implemented (structure only)
  Official API specification: NOT VERIFIED — see docs/TELEBIRR_INTEGRATION.md
  Authentication: Not implemented (pending spec)
  Payment creation: Not implemented (pending spec)
  Callback: Not implemented (pending spec)
  Signature verification: Not implemented (pending spec)
  Server-side verification: Not implemented (pending spec)
  Idempotency: N/A directly — inherited automatically from PaymentService
    once wired (provider-agnostic, already tested — see below)
  Reconciliation: N/A directly — same as above
  Sandbox: NOT AVAILABLE (requires merchant KYC/onboarding not completed)
  Live credentials: Not configured
  Live payment test: NOT YET VERIFIED
  Production status: PENDING
  ```

  What Phase 5 *did* add, provider-agnostically (so Telebirr inherits it
  automatically the moment it's wired up, with no separate Telebirr-specific
  security code needed):
  - **New `PENDING_RECONCILIATION` payment status.** A provider-verification
    call that errors (timeout/network/ambiguous response) no longer leaves
    the payment in limbo or risks being read as a failure — it's explicitly
    marked non-terminal-but-needs-attention, exactly to prevent the
    "customer paid, we assumed failure, customer double-pays" scenario.
    `reconcilePayment` now catches verification errors the same way.
  - **Invalid state transitions are structurally impossible**, not just
    "shouldn't happen": a terminal payment (`FAILED`/`CANCELLED`/etc.) can
    never move to `SUCCESS` via callback *or* reconciliation, even if the
    provider later reports success — enforced by the same conditional
    `updateMany` guard as the concurrency protection, and proven by 3 new
    tests attempting exactly these invalid transitions.
  - **Admin payment detail page** (`/admin/payments/:id`) — full financial
    audit trail (initiator, amounts, provider references, every callback
    received with its accept/reject reason, every audited state change,
    wallet ledger before/after) on one screen, plus filters (status,
    provider, username) on the list page. Verified live: viewing a real
    payment's page shows exactly 1 `APPLIED` + 5 `DUPLICATE_IGNORED`
    callback rows from earlier idempotency testing.
  - Deposit page now shows "Currently unavailable" for unconfigured
    providers and a real description ("Deposit securely using Telebirr")
    once configured, per spec.
  - 24 payment-service tests passing (up from 20), including the two new
    `PENDING_RECONCILIATION` tests and three invalid-transition tests.
- [ ] **Phase 6 — CBE provider interface.** Adapter structure exists
  (`CBEProvider`) with every method failing closed —
  **PENDING OFFICIAL MERCHANT/API SPECIFICATION.** A research pass (see
  `docs/CBE_INTEGRATION.md`) found a CBE merchant login portal
  (`merchantapp.cbe.com.et`, unreachable for further inspection from this
  environment) and a separate "Merchant App (Powered by CBEBirr)" product —
  but no publicly accessible API specification, developer documentation, or
  sandbox. Nothing has been guessed or invented. `isConfigured` remains
  hardcoded `false`.
- [x] **Phases 7–10 — Bingo game-core, game engine, realtime, player/admin
  game UI.** Built and tested as one coherent unit, per instruction. Summary
  below; full detail (APIs, events, concurrency tests, known limitations)
  was given directly to the user at end-of-phase.

  **game-core** (`packages/game-core`, framework-free, 141 tests): CSPRNG
  card generator (`crypto.randomInt` Fisher–Yates, no duplicates, correct
  B/I/N/G/O ranges, FREE center — proven across 1,000 generations); a
  generic pattern evaluator (`EXACT_MATCH` for matrix-driven shapes —
  four corners, X, plus, both diagonals, full house; `ANY_ROWS`/`ANY_COLUMNS`
  for line patterns, since "any row" is standard bingo semantics a single
  fixed matrix can't express) with 10 preset patterns seeded; an exhaustive
  game-status state machine (all 81 from/to pairs tested — 17 legal, 64
  correctly rejected); a provably-fair commitment scheme (SHA-256 commitment,
  HMAC-counter-mode seeded Fisher–Yates for the deterministic call sequence,
  full verify-after-reveal roundtrip tested including tamper detection);
  prize-pool math using `Decimal` throughout (equal-split and stake-weighted,
  with remainder-cent distribution so payouts always sum to exactly the
  pool, never lose or fabricate money).

  **Game engine** (`apps/web/lib/game/`): `createGame` (generates and
  commits the seed immediately, before the game is ever opened);
  `transitionGame`/`startGame`/`pauseGame`/`resumeGame`/`cancelGame`/
  `completeGame`, every one a conditional `UPDATE ... WHERE status = <expected>`
  guard (same exactly-once pattern as Payment/Wallet — two operators racing
  to start the same game: exactly one wins, verified by test); `callNextNumber`
  atomically increments `Game.calledCount` (conditional update, retried with
  backoff+jitter on conflict) and reads the ball from
  `deriveCallSequence(seed)[calledCount]` — **the operator controls *when*,
  never *which*; no code path accepts a ball number as input from a
  request.** Ticket purchase (`lib/game/tickets.ts`) runs inside a single
  Postgres `SERIALIZABLE` transaction (capacity check + card generation +
  wallet debit + ledger row + `GamePlayer` upsert, all atomic — see
  `serializable-retry.ts`). Winner detection (`lib/game/winners.ts`) runs
  after every call, evaluates all `ACTIVE` tickets, handles simultaneous
  winners via the prize rule's tie-break setting, and is idempotent per
  ticket (`Winner.ticketId` unique — a retried detection pass can't double-pay).

  **Realtime**: implemented as Server-Sent Events, not the originally-planned
  separate Socket.IO service — see `docs/ARCHITECTURE.md` §9 for the full
  "what changed and why," including the explicit scaling caveat (SSE +
  in-memory broadcaster is single-instance only).

  **UI**: player lobby (`/play`), live game room (`/room/:id` — current
  number with animation, 75-number board, player's card(s) with automatic
  server-driven marking, called-number history, countdown, buy-ticket flow),
  game history (`/games/history`), public fairness verification page
  (`/games/:id/fairness`); admin game list + create-game form
  (`/admin/games`, `/admin/games/new`) and the game operator control panel
  (`/admin/games/:id/control` — status, current ball, prize pool, controls
  gated to the legal next transitions only, cancel requires a typed reason,
  live event log, fairness commitment display).

  **Verified live in-browser, exactly the flow requested**: created a real
  game through the actual admin UI form → scheduled → opened → two seeded
  player accounts bought tickets through the actual lobby/room UI → started
  (countdown → LIVE) → called numbers one at a time through the operator
  panel, watching the UI update via SSE with no manual reload → after 54
  calls a player's card completed "One Horizontal Line" → game
  auto-completed → `Winner` row created → wallet credited exactly the
  configured prize (`WalletTransaction` ledger shows `TICKET_PURCHASE -10`
  then `WINNING_PAYOUT +14`, matching the 70%-of-sales prize rule on ETB 20
  total sales) → public fairness page independently recomputed the
  commitment hash and the full 75-number sequence from the revealed seed
  and confirmed both matched. One real bug was found and fixed during this
  session: the SSE stream originally required existing `GamePlayer`
  membership, which 403'd a visitor watching *before* buying a ticket, and
  the browser's `EventSource` didn't recover after that error — fixed by
  gating the stream on authentication only (spectating is not a security
  boundary; none of the broadcast events carry another player's private data).

  **Automated tests** (`apps/web/lib/game/engine.test.ts`, 16 tests, all
  against a real Postgres): full lifecycle win with correct wallet credit;
  simultaneous winners sharing a prize pool on the identical call; ticket
  purchase validation (insufficient balance, registration closed, max
  tickets exceeded, game-at-capacity); **20 concurrent purchase attempts
  against an 8-seat game — exactly 8 succeed, exactly 8 `GamePlayer`/
  `BingoTicket` rows exist, never more**; **two simultaneous `startGame()`
  calls — exactly one succeeds**; **10 concurrent `callNextNumber()` calls
  — exactly N distinct sequential balls consumed, zero duplicates, zero
  gaps**; state-durability/recovery (fresh DB reads after simulated
  "restart" continue the sequence correctly, never repeat a ball); 4 invalid
  end-to-end transition rejections; cancellation refunds every active ticket
  and voids them; LIVE→CANCELLED is audited as `GAME_EMERGENCY_CANCELLED`,
  distinct from a pre-start cancel. A real robustness bug was found and
  fixed while writing these: under 20-way contention the original 6-retry
  budget was sometimes exhausted by *legitimate* requests, not just the
  ones that should fail — fixed with more retries (20) plus randomized
  backoff so retries don't all collide again immediately.

  **Known limitations, stated plainly (at the end of Phase 7 — see the
  Phase 8 entry above for what's since been resolved)**: realtime was
  single-instance-only at this point (resolved in Phase 8 via Redis); no
  load test had been run yet (done in Phase 8, up to 1,000 concurrent SSE
  connections); "My Tickets" as a cross-game standalone page and full
  withdrawal-side game economics are still not built; the admin game list
  itself (as opposed to the player game-history page, which now has
  filters — Phase 8) has no filters/search yet (remaining Phase 11 work).
- [x] **Phase 8 — Realtime + financial hardening.** Approved-Phase-7
  follow-up covering 25 stated priorities: Redis-backed multi-instance
  realtime, a canonical reconnect-safe game snapshot, announcements,
  prize-pool/platform-fee ledger separation, atomic idempotent payouts,
  cancellation refund policy, recovery self-healing, and a battery of
  real HTTP-level security/fairness tests. Details:

  **Realtime (Priorities 1, 2, 21).** `RedisBroadcaster` replaces the
  single-instance in-memory broadcaster whenever `REDIS_URL` is configured
  (falls back to the old in-process Map for zero-dependency local dev).
  Verified two independent Redis connections both receive a publish
  (`broadcaster.test.ts`), and live: a number called via the HTTP API
  appeared in a browser session through Redis pub/sub, not in-memory
  state. A 5-player + admin live demo (script below) confirmed every
  player's independent SSE stream received identical `game:sync`,
  ticket-purchase, announcement, winner, and completion events. See
  `docs/ARCHITECTURE.md` §9 for the full design and what's *not* proven
  (a literal two-Next.js-process test, as opposed to two independent
  Redis connections).

  **Game snapshot + reconnect (Priorities 9, 10, 11, 12).**
  `getGameSnapshot()` is now the single function behind the initial page
  load, `GET /api/games/:id`, and every SSE `game:sync` — one canonical
  shape, `serverTimestamp` included so clients never trust their own
  clock. `lib/game/recovery.test.ts` proves game state (status,
  calledCount, called numbers) survives a simulated realtime-process
  restart (in-memory timer maps cleared directly) by reading only from
  Postgres, and that the AUTO-mode calling timer — the one piece of state
  that genuinely lives only in memory — self-heals via
  `ensureAutoCallerRunning()` the next time any client connects or
  reconnects. The STARTING→LIVE countdown timer does not yet have the
  same self-heal treatment (documented limitation, §9.4 of the
  architecture doc).

  **Announcements (Priorities 3, 4).** `POST /api/admin/announcements`
  (SUPER_ADMIN/GAME_OPERATOR only via the existing `ANNOUNCEMENT_CREATE`
  permission, audited) distributes to a game channel, a global channel,
  or a per-user channel depending on targeting, delivered through the
  same SSE connection every player already has open. Verified live via
  raw SSE capture (both game-scoped and platform-wide) and in the 5-player
  demo (5/5 players received it).

  **Prize accounting (Priorities 5, 6, 7).** New `PlatformAccount` /
  `PlatformLedgerEntry` models custody the split between prize-pool
  liability and platform-fee revenue at the moment a ticket is purchased
  (`PRIZE_POOL_CONTRIBUTION` + `PLATFORM_FEE_REVENUE`, using the
  `PrizeRule.platformFeePercent` field so the split is well-defined for
  every `PrizeRuleType`). Winner payout (`payWinner()`) debits the
  platform account and credits the winner's wallet in one transaction —
  verified with **10 concurrent `payWinner()` calls producing exactly one
  real payout** and a separate test proving a winner recorded-but-crashed
  before payment still gets paid exactly once on retry. `PrizeRule`
  editing is blocked once any non-DRAFT game references it (verified via
  real HTTP: editable while DRAFT, 409 once scheduled). A genuine
  concurrency bug was found and fixed here: the original P2002 recovery
  path tried to run a follow-up query inside a Postgres transaction that
  had already aborted (SQLSTATE 25P02) — fixed by letting the abort
  propagate and retrying with a fresh transaction instead of attempting
  same-transaction recovery.

  **Cancellation/refunds (Priority 8).** Pre-LIVE cancellations
  auto-refund every active ticket (idempotent, `TicketStatus.REFUNDED`).
  LIVE/PAUSED ("emergency") cancellations deliberately do **not**
  auto-refund — a fair refund policy after gameplay has started is a
  business/legal decision, not an engineering one — instead they audit
  `GAME_CANCELLED_LIVE_REQUIRES_MANUAL_REFUND_REVIEW` and notify affected
  players that Finance will review manually.

  **Security & fairness testing (Priorities 13, 14, 15, 22).** New
  `lib/http-security.test.ts` runs real `fetch()` calls with real cookies
  against a live server (not just calling TS functions): 401
  unauthenticated, 403 player→admin/other-player's-payment/announcements,
  200 own-resource, 403 GAME_OPERATOR→financial APIs, 200
  GAME_OPERATOR→legitimate game-control actions, and a controlled-mode
  test that POSTs `{"number":75}` to call-next and independently
  recomputes (via seed decryption + `deriveCallSequence`, not the
  engine's own verifier) that the actual ball called was unaffected.
  `fairness-independent.test.ts` re-implements the SHA-256 commitment and
  HMAC-counter-mode shuffle from scratch (not importing the engine's
  functions) and confirms it matches for 50+ random seeds — the point
  being that a test which calls the engine's own functions to check the
  engine's own output can't catch a shared bug. Also found and fixed:
  every admin game-lifecycle response (`POST /api/admin/games` and all 6
  lifecycle transitions) was leaking the raw `secretSeedEncrypted` blob;
  now stripped by `sanitizeGameForResponse()`.

  **Live 5-player + admin acceptance demonstration.** A scripted run
  (`scripts/final-acceptance-demo.mjs`) authenticated 5 independent
  players + 1 admin, connected all 5 realtime streams simultaneously,
  purchased 25 tickets across them, sent and confirmed delivery of an
  announcement to all 5, ran the game to a real winner via AUTO-mode
  calling, confirmed `game:winner`/`game:completed` reached all 5
  streams, independently re-verified fairness, reconciled the ledger
  (ETB 250 ticket sales → ETB 175 prize pool, the configured 70%), then
  ran 5 failure-mode checks (duplicate call-next after completion,
  unauthenticated admin action, number-manipulation attempt, pre-completion
  secret access, duplicate cancellation refund) — all passed. The first
  run of this exact script is what caught the P2002/25P02 bug above and
  a second real bug: retrying a cancel on an already-cancelled game
  returned a raw 500 instead of 409, because `InvalidGameTransitionError`
  (deliberately a plain `Error` in the framework-agnostic `game-core`
  package) wasn't recognized by `withApiHandler`'s error mapping — fixed
  by translating it to `ConflictError` at the one call site in
  `engine.ts`. Neither bug was caught by any existing unit test, since
  those call the engine functions directly and only assert
  `.rejects.toThrow()` — a real HTTP round trip was necessary.

  **Load testing (Priority 20).** `scripts/load-test.mjs` opened
  concurrent SSE connections against the real dev server and measured
  event-propagation latency for a real `call-next`:

  | Concurrency | Connections established | Event propagation (p50 / p95 / p99) |
  |---|---|---|
  | 100 | 100/100 | 181ms / 182ms / 182ms |
  | 500 | 500/500 | 22ms / 25ms / 25ms |
  | 1,000 | 1,000/1,000 | 26ms / 32ms / 33ms |

  (Propagation latency includes the `call-next` HTTP round trip itself;
  at higher concurrency the round trip was faster, which is why 500/1,000
  show *lower* propagation than 100 — not a scaling regression.) Server
  RSS after the 1,000-connection run: ~826MB; Postgres active connections
  stayed at 26 throughout, since SSE connections hold no DB connection —
  only Redis and the Node process's own memory scale with connection
  count. **What this does and doesn't prove**: it's a single-machine,
  single-Postgres-instance, single-Redis-instance test of realtime fan-out
  latency and connection handling — genuinely useful signal, not a
  production capacity guarantee. It does not include 500/1,000
  *concurrent ticket purchases* (a different bottleneck — Postgres
  SERIALIZABLE contention — already covered separately by the 20-way
  purchase-race test), sustained load over time, or a literal
  multi-server/multi-region deployment.

  **Everything above (55 web-package tests including 12
  HTTP-security-matrix tests, 5 accounting tests, 2 recovery tests, 5
  independent-fairness tests, plus the pre-existing suites) passes
  against real Postgres and real Redis** — 226 tests total across the
  monorepo (146 game-core, 60 web, 5 payments, 15 shared-types).

- [ ] **Phase 11 — Admin dashboard (remainder).** Game admin (list, create,
  operator control panel, announcement sending) is done. User management,
  platform-wide reports, and settings navigation are still not built.
- [x] **Phase 12 — Announcements.** Built as part of Phase 8 above.
- [x] **Phase 13 — Winner/prize engine hardening.** Payout atomicity,
  prize-pool/platform-fee ledger separation, and prize-rule immutability
  built as part of Phase 8 above.
- [ ] **Phase 14 — Security hardening pass.** Baseline security is in from
  Phase 2 (rate limiting, lockout, RBAC, audit log, secure cookies), plus
  the HTTP-level security-matrix testing added in Phase 8. 2FA, CSRF token
  enforcement on top of the `X-Requested-With` check, and step-up re-auth
  for high-risk actions are still deferred to this phase.
- [x] **Phase 15 — Full test suites (game engine + load testing).** Game
  engine, concurrency, recovery, fairness, and HTTP-security test suites
  built across Phases 7–8 (226 tests total). Payment-callback test
  coverage from Phase 4–6 remains as originally built. Load testing done
  as part of Phase 8 (see above) — 1,000 concurrent SSE connections
  proven; sustained/soak testing and literal multi-process deployment
  testing are not done.
- [ ] **Phase 16 — Dockerization & deployment.** Not started. Local dev
  currently runs against a manually-provisioned Postgres and Redis —
  `docker-compose.yml` for `web` + `postgres` + `redis` is this phase's
  deliverable.

## Known simplifications (documented, not hidden)

- Password strength is rule-based (length + character-class + a small
  breached-password denylist) rather than using an entropy-scoring library
  like zxcvbn, to keep the shared package dependency-light. Documented in
  `packages/shared-types/src/password.ts`.
- SMS provider is mock-only (`SMS_PROVIDER=mock`) — OTPs log to the server
  console instead of sending. The `SmsProvider` interface is in place so a
  real Ethiopian gateway is a config + one adapter class away.
- 2FA/MFA fields exist on `User` (`twoFactorEnabled`, `twoFactorSecret`) but
  the TOTP flow itself is not implemented yet — planned for Phase 14 and
  required specifically for `ADMIN`/`SUPER_ADMIN`/`FINANCE` before high-risk
  actions, per the architecture doc.
- The deposit page polls `GET /api/payments/:id` every 1.5s while a payment
  is open, instead of pushing status over WebSocket. This is an honest
  interim solution, not a placeholder — real-time push arrives with the
  Phase 9 realtime service and should replace this polling loop.
- `MockPaymentProvider`'s order state lives in an in-process `Map` (on
  `globalThis`, so it survives Next.js's per-route dev bundling — see
  Phase 4 notes above). This is correct for a single dev server or test
  run but is **not** a production pattern; it doesn't need to be, since
  mock payments are hard-disabled the moment real money goes live —
  `getEnv()` refuses to boot with `ENABLE_MOCK_PAYMENTS=true` (or
  `GAME_MONEY_MODE` other than `REAL`) whenever `PAYMENTS_LIVE_MODE=true`.
  This is deliberately *not* keyed on `NODE_ENV=production`, since an
  optimized production build is also how this DEMO platform itself gets
  deployed while intentionally staying in test-money mode — see the
  2026-08-24 fix noted in `docs/PRODUCTION_READINESS.md`.
- See `docs/PRODUCTION_READINESS.md` for the full pre-launch checklist —
  legal, secrets, infrastructure, and data-integrity items that are
  explicitly not yet satisfied.
