# Bingo Platform — Phase 1: Architecture & Database

Status: **DRAFT for approval**. Nothing beyond this document and `prisma/schema.prisma`
has been built yet. Do not proceed to Phase 2 until this is reviewed.

---

## 1. System Architecture

### 1.1 High-level shape

A single Next.js application (App Router) serves the player-facing web app, the admin
console, and the HTTP API via Route Handlers. A **separate long-running Node.js
real-time service** handles WebSocket connections and owns the authoritative game loop
(number calling, timers, winner detection). These are split into two deployable
processes because:

- Next.js API routes on serverless/edge-style hosting are not a good fit for
  long-lived stateful connections or in-memory game timers that must survive across
  many concurrent requests.
- The game engine needs a single authoritative process per game (or a
  leader-elected shard) so number-calling order and winner detection can never race.
- It lets us scale the web tier and the real-time tier independently — most load
  during a live game is WebSocket fan-out, not HTTP.

```
                                   ┌─────────────────────┐
                                   │   Players / Admins   │
                                   │  (Browser, mobile)   │
                                   └──────────┬───────────┘
                                              │ HTTPS
                          ┌───────────────────┼────────────────────┐
                          │                                        │
                 ┌────────▼─────────┐                    ┌─────────▼─────────┐
                 │   Next.js Web     │                    │  Realtime Service  │
                 │  (App Router UI + │◄──── Redis Pub/Sub ─►│  (Node + Socket.IO)│
                 │   API routes)     │                    │  Game Engine Core  │
                 └────────┬──────────┘                    └─────────┬──────────┘
                          │                                          │
                          │              ┌──────────────┐            │
                          └─────────────►│  PostgreSQL  │◄───────────┘
                                         │  (Prisma)     │
                                         └───────┬───────┘
                                                 │
                                    ┌────────────▼────────────┐
                                    │  Redis (cache, pub/sub,  │
                                    │  rate limiting, sessions)│
                                    └──────────────────────────┘
                          ┌──────────────────────┴───────────────────────┐
                          │                                              │
                 ┌────────▼─────────┐                          ┌─────────▼────────┐
                 │  PaymentProvider  │                          │  Notification     │
                 │  (Telebirr / CBE  │                          │  Service (Email/  │
                 │   / Mock)         │                          │  SMS abstraction) │
                 └───────────────────┘                          └────────────────────┘
```

Both the Next.js app and the Realtime Service talk to the **same PostgreSQL database
via Prisma** and coordinate through **Redis** (pub/sub for cross-process event
fan-out, distributed locks for ticket purchase / winner-detection races, and a cache
for hot read paths like "current game state").

### 1.2 Why this stack

| Concern | Choice | Why |
|---|---|---|
| Frontend | Next.js 14+ (App Router), React, TypeScript, Tailwind | SSR for fast first paint on slow Ethiopian mobile networks, file-based routing, one language across the stack |
| API | Next.js Route Handlers for CRUD/REST; dedicated Node service for realtime | Avoids forcing stateful game-loop logic into a request/response model |
| Realtime | Socket.IO | Battle-tested reconnection/backoff, room support (per-game channels), fallback transport for flaky mobile networks |
| DB | PostgreSQL + Prisma | Strong transactional guarantees (needed for money), relational integrity, Prisma gives typed queries + migrations |
| Cache/coordination | Redis | Pub/sub for cross-process broadcast, distributed locks (`SET NX PX`) for race-sensitive operations, session/rate-limit storage |
| Auth | JWT access token (short-lived) + opaque refresh token in httpOnly cookie, backed by `Session` table | Stateless verification for API calls, revocable sessions for logout/admin-kill, no plaintext secrets in the browser |
| Password hashing | Argon2id | Winner of the Password Hashing Competition, resistant to GPU cracking, tunable memory cost |
| Validation | Zod | Shared schemas between client forms and server route handlers |
| Payments | Adapter pattern (`PaymentProvider` interface) | Isolates Telebirr/CBE-specific code, allows a `MockPaymentProvider` for dev/test, easy to add more providers later |

### 1.3 Monorepo layout

A single pnpm workspace keeps shared types (Zod schemas, Prisma client, game-logic
pure functions) in one place, consumed by both the web app and the realtime service.

---

## 2. Project Folder Structure

```
bingo-platform/
├── apps/
│   ├── web/                        # Next.js app (players + admin UI + REST API)
│   │   ├── app/
│   │   │   ├── (public)/           # landing, terms, responsible-gaming, login, register
│   │   │   ├── (player)/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── play/           # game lobby / list
│   │   │   │   ├── room/[gameId]/  # live bingo room
│   │   │   │   ├── tickets/
│   │   │   │   ├── wallet/         # deposit, withdraw, transactions
│   │   │   │   ├── profile/
│   │   │   │   └── notifications/
│   │   │   ├── (admin)/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── users/
│   │   │   │   ├── games/
│   │   │   │   ├── operator/[gameId]/   # live game-control screen
│   │   │   │   ├── payments/
│   │   │   │   ├── withdrawals/
│   │   │   │   ├── announcements/
│   │   │   │   ├── reports/
│   │   │   │   └── settings/
│   │   │   └── api/
│   │   │       ├── auth/
│   │   │       ├── games/
│   │   │       ├── tickets/
│   │   │       ├── payments/telebirr/  create|callback
│   │   │       ├── payments/cbe/       create|callback
│   │   │       ├── wallet/
│   │   │       ├── withdrawals/
│   │   │       └── admin/
│   │   ├── components/             # UI components (bingo-card, ball, countdown, ...)
│   │   ├── lib/                    # server-only helpers (auth, rbac, rate-limit)
│   │   └── middleware.ts           # auth guard, RBAC gate, security headers
│   │
│   └── realtime/                   # Standalone Node service
│       ├── src/
│       │   ├── server.ts           # Socket.IO bootstrap, auth handshake
│       │   ├── gateway/            # socket event handlers (thin, delegate to engine)
│       │   ├── engine/             # GameEngine, NumberCaller, WinnerDetector, StateMachine
│       │   ├── locks/              # Redis-backed distributed locks
│       │   └── pubsub/             # Redis pub/sub bridge to web app
│       └── package.json
│
├── packages/
│   ├── db/                         # Prisma schema + generated client (shared)
│   │   └── prisma/schema.prisma
│   ├── game-core/                  # PURE functions: card gen, pattern matching,
│   │   │                           # prize calc, RNG/commitment scheme — framework-free,
│   │   │                           # 100% unit-testable, used by both apps
│   │   └── src/
│   ├── payments/                   # PaymentProvider interface + Telebirr/CBE/Mock impls
│   │   └── src/
│   ├── shared-types/                # Zod schemas + inferred TS types (API contracts, socket events)
│   └── config/                      # eslint, tsconfig, tailwind presets
│
├── infra/
│   ├── docker/                     # Dockerfiles per app
│   ├── docker-compose.yml
│   └── k8s/ (later, if/when horizontal scale requires it)
│
├── docs/
│   ├── ARCHITECTURE.md             # this file
│   ├── API.md
│   ├── DEPLOYMENT.md
│   └── RUNBOOK.md
│
├── .env.example
├── package.json                    # pnpm workspaces root
├── pnpm-workspace.yaml
└── turbo.json                      # (or nx) for build/test orchestration across packages
```

`packages/game-core` is deliberately framework-free: card generation, pattern
detection, and prize math are pure, side-effect-free TypeScript so they can be unit
tested exhaustively and imported by both the web app (for previews/history rendering)
and the realtime engine (for authoritative decisions) without duplication.

---

## 3. Database — Entity Relationship Overview

Full field-level definitions live in [`prisma/schema.prisma`](../prisma/schema.prisma).
Summary of entities and relationships:

```
User ──1:1── Wallet ──1:N── WalletTransaction
User ──1:N── UserRole ──N:1── Role ──N:1── RolePermission ──N:1── Permission
User ──1:1── KycRecord
User ──1:N── Session, LoginAttempt, UserDevice
User ──1:N── Payment
User ──1:N── Withdrawal
User ──1:N── BingoTicket
User ──1:N── GamePlayer  ─── Game
User ──1:N── Notification
User ──1:N── AuditLog (as actor)

Game ──1:N── GamePlayer
Game ──1:N── BingoTicket
Game ──1:N── BingoNumber
Game ──1:N── Winner
Game ──1:N── GameEvent
Game ──1:N── Announcement
Game ──N:1── WinningPattern
Game ──N:1── PrizeRule

BingoTicket ──1:1── Winner
WalletTransaction ──N:1── Payment | Withdrawal | BingoTicket | Game  (nullable FKs,
                                                                      whichever caused it)
```

Key design decisions:

- **Money is `Decimal(18,2)`, never `Float`.** All arithmetic happens server-side in
  Prisma/PostgreSQL-safe decimal operations.
- **`WalletTransaction` is an append-only ledger.** No code path ever does
  `wallet.balance -= amount` without first (in the same DB transaction) inserting a
  `WalletTransaction` row with `balanceBefore`/`balanceAfter`. Corrections are new
  rows (`REVERSAL`, `ADJUSTMENT`), never edits to historical rows.
- **`referenceId` / `idempotencyKey` unique constraints** on `WalletTransaction` and
  `Payment` make retried requests and duplicate webhook deliveries safe no-ops.
- **`PaymentCallbackLog`** records every inbound webhook delivery (even duplicates or
  invalid-signature ones) independent of whether it was applied — this is what makes
  reconciliation and audit possible, and is what "handle duplicate callbacks" means in
  practice: log everything, apply state changes exactly once.
  - **`GameEvent`** is a dedicated high-frequency timeline (separate from the generic
  `AuditLog`) so the operator UI and the provably-fair audit trail can query a single
  game's history cheaply, without scanning platform-wide audit rows.
- **RBAC is data-driven** (`Role`/`Permission`/`RolePermission`/`UserRole`), not an
  enum baked into code, so the admin can define new roles (e.g. a restricted
  "Night Shift Operator") without a deploy.
- **UUIDs everywhere** so IDs are never guessable/enumerable (ticket IDs, payment IDs).
- **Soft delete** (`deletedAt`) on `User` — financial history must never be deleted
  when an account is closed.

---

## 4. Authentication Architecture

- **Registration:** full name, username, email, phone (`+2519XXXXXXXX` format,
  validated with a strict E.164-Ethiopia regex + libphonenumber), password (zxcvbn
  strength check, minimum entropy, not just length), confirm password, optional
  referral code, mandatory ToS acceptance timestamp. Duplicate prevention on
  username/email/phone at the DB (`@unique`) and application layer, plus a
  `UserDevice` fingerprint check flagged for manual review (never silently blocked)
  when the same device attempts to create a second account — a legitimate shared
  device (internet café, family phone) is common in Ethiopia, so this is a signal for
  review, not an automatic hard block.
- **Password storage:** Argon2id, tuned parameters (memory ≥ 19 MiB, iterations ≥ 2,
  parallelism per OWASP recommendation), never bcrypt-truncation pitfalls.
- **Login:** email or username + password → on success, issue a short-lived JWT
  access token (15 min, holds `sub`, `roles`, `permissions` snapshot) + a long-lived
  opaque refresh token stored **hashed** in the `Session` table and set as an
  httpOnly, `Secure`, `SameSite=Lax` cookie. Access token is used for API calls and
  the WebSocket handshake; refresh token rotates on each use (rotation +
  reuse-detection: if a revoked/used refresh token is replayed, all sessions for that
  user are killed).
- **Logout:** revokes the `Session` row (`revokedAt`), clears cookie.
- **Forgot/reset password:** time-limited, single-use signed token emailed (or
  SMS'd) to the verified contact; invalidates all existing sessions on reset.
- **Account verification:** email link and/or phone OTP (via the SMS abstraction);
  unverified accounts can browse but not deposit/play, configurable via
  `SystemSetting`.
- **Rate limiting & brute force:** Redis sliding-window counters per IP and per
  identifier on `/auth/login`, `/auth/register`, `/auth/forgot-password`; exponential
  lockout after N failed attempts recorded in `LoginAttempt`; CAPTCHA trigger after
  repeated failures.
- **2FA/MFA (admin-focused, optional for players):** TOTP (RFC 6238), secret
  encrypted at rest. Required for `ADMIN`/`SUPER_ADMIN`/`FINANCE` roles before
  high-risk actions (see §9 Security).
- **Server-side session middleware** on every protected route validates the JWT
  signature + expiry + checks the `Session` isn't revoked, then loads permissions
  fresh (not just trusting stale JWT claims) for sensitive admin actions.

---

## 5. Wallet Architecture

Single source of truth: **`Wallet.availableBalance` is a materialized, cached
projection of the `WalletTransaction` ledger**, not the ledger itself. Every mutation
follows this pattern inside one Prisma `$transaction`:

1. `SELECT ... FOR UPDATE` (or Prisma's serializable transaction) the `Wallet` row to
   lock it.
2. Verify preconditions (sufficient `availableBalance`, wallet not frozen).
3. Compute `balanceAfter`.
4. Insert the `WalletTransaction` row (`status = COMPLETED`, `balanceBefore`,
   `balanceAfter`, `referenceId` idempotency key).
5. Update `Wallet.availableBalance` to `balanceAfter` and bump `version`.
6. Commit. On any failure, the whole transaction rolls back — no partial state.

`pendingBalance` is used for funds that are reserved-but-not-final (e.g. a withdrawal
that's `PROCESSING`): moved out of `availableBalance` into `pendingBalance` at request
time, then either released back (rejected) or removed entirely (completed) — always
via a ledger row, never a silent field edit.

Idempotency: every caller of a wallet mutation must supply a `referenceId` (e.g.
`payment:<paymentId>`, `ticket-purchase:<gameId>:<userId>:<attemptId>`,
`withdrawal:<withdrawalId>`). The unique constraint on `WalletTransaction.referenceId`
turns retried requests into a no-op instead of double-processing.

---

## 6. Payment Architecture

**Status: implemented and tested as of Phase 4** (mock provider + full pipeline;
Telebirr/CBE are adapter *structure* only — see §6.4).

```
interface PaymentProvider {          // packages/payments/src/types.ts
  readonly isConfigured: boolean
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>
  verifyTransaction(providerOrderId: string): Promise<VerificationResult>
  isCallbackSignatureValid(req: CallbackRequest): boolean
  parseCallback(req: CallbackRequest): ParsedCallback
}

getPaymentProvider(name)             // packages/payments/src/provider-factory.ts
├── MockPaymentProvider   (packages/payments/src/mock)      — dev/test only
├── TelebirrProvider      (packages/payments/src/telebirr)  — structure only, not wired
└── CBEProvider           (packages/payments/src/cbe)       — structure only, not wired

PaymentService                       // apps/web/lib/payment-service.ts
  createDeposit() / processPaymentCallback() / reconcilePayment()
```

`PaymentService` is the **only** caller of `PaymentProvider` methods. The wallet
ledger, the deposit UI, and every API route work against `PaymentService`, never
against a provider directly — swapping mock for real, or adding a fourth provider,
touches `packages/payments` and nothing else.

### 6.1 Deposit flow

1. Player submits an amount + provider → `createDeposit()` validates against
   `SystemSetting` deposit min/max, creates a `Payment` row (`status: INITIATED`),
   calls `provider.createOrder()`, then updates the row to `PENDING` with the
   returned `providerOrderId`.
2. The frontend polls `GET /api/payments/:id` (interim — see §9's realtime note)
   and shows the live status. **The frontend never marks a payment successful
   itself** — it only ever displays what the server last reported.

### 6.2 Callback pipeline (`processPaymentCallback`)

Exactly the sequence validated by Phase 4's test suite:

```
validate request → verify signature → log the raw delivery (PaymentCallbackLog,
unconditionally — even rejected/duplicate ones) → look up the Payment by
(provider, providerOrderId) → reject if the claimed amount doesn't match →
reject if the payment is already terminal (duplicate) → independently call
provider.verifyTransaction() (never trust the callback body's status alone;
if this call itself errors — timeout/network/ambiguous — the payment is
marked PENDING_RECONCILIATION, NEVER assumed FAILED) → atomically transition
the payment (conditional UPDATE ... WHERE status IN (INITIATED, PENDING,
PENDING_RECONCILIATION) — exactly one concurrent caller ever wins, and a
payment already in a terminal state can never be reopened) → on SUCCESS,
applyWalletTransaction(DEPOSIT, referenceId="payment:<id>") → audit log → notify
```

`PaymentStatus` lifecycle: `INITIATED → PENDING → {SUCCESS | FAILED |
CANCELLED | EXPIRED}`, with `PENDING`/`INITIATED`/`PENDING_RECONCILIATION`
all able to reach `PENDING_RECONCILIATION` if provider verification itself
fails, and `SUCCESS → REVERSED` as the only transition permitted *out of* a
terminal state (manual, audited, not automatic). No other transition is
possible — enforced by the conditional-update guard above, not just
convention — and proven by tests attempting `FAILED → SUCCESS` via both a
callback and reconciliation.

`PaymentCallbackLog` rows are **never deduped** — every delivery (including 19
duplicates of the same webhook) gets its own row with a `processedResult` of
`APPLIED`, `DUPLICATE_IGNORED`, `REJECTED_BAD_SIGNATURE`, `REJECTED_TAMPERED`,
`REJECTED_UNKNOWN_PAYMENT`, `REJECTED_VERIFICATION_FAILED`, or `ERROR` — so a
payment dispute can be fully reconstructed after the fact.

The concurrency guard is the same pattern as the wallet's optimistic lock (§5):
a conditional `updateMany` whose `WHERE` clause encodes "still non-terminal" is
the only thing allowed to flip a payment to a terminal state, so N simultaneous
identical callbacks produce exactly one `count: 1` result and N-1 no-ops —
proven by an automated test that fires 20 concurrent identical SUCCESS callbacks
and asserts exactly one wallet credit.

### 6.3 Reconciliation (`reconcilePayment`)

Independently asks the provider for a payment's current status and applies the
exact same atomic-transition logic as the callback pipeline (shared internal
function), so a payment can be safely reconciled whether or not its webhook ever
arrived, without risking a double credit. Exposed to Finance/Super Admin via
`POST /api/admin/payments/:id/reconcile` (permission `payment:reconcile`) and the
`/admin/payments` dashboard. A recurring scheduled reconciliation job (rather than
only the manual button) is listed in `docs/PRODUCTION_READINESS.md` as a
pre-launch requirement, not yet built.

### 6.4 Telebirr & CBE status

Both ship as full `PaymentProvider` implementations whose methods throw
`ProviderNotConfiguredError` with a specific reason:

- **Telebirr** (`packages/payments/src/telebirr/telebirr-provider.ts`): reads
  `TELEBIRR_APP_ID`/`APP_KEY`/`SHORT_CODE`/`PRIVATE_KEY`/`PUBLIC_KEY` and requires
  `TELEBIRR_MODE=sandbox|production` to even consider itself configured. No
  request signing, endpoint, or callback field has been implemented — doing so
  without the official Telebirr merchant/developer documentation in hand would
  mean inventing an API. **CODE IMPLEMENTED (adapter structure), PROVIDER
  INTEGRATION NOT VERIFIED.** Phase 5 did a documented research pass
  (`docs/TELEBIRR_INTEGRATION.md`) confirming a real developer portal exists
  at `developer.ethiotelecom.et` but its actual API spec requires merchant
  login/onboarding not yet completed — nothing was implemented against
  unverified secondary sources.
- **CBE** (`packages/payments/src/cbe/cbe-provider.ts`): `isConfigured` is
  hardcoded `false` — there is no "supply credentials and it works" path yet,
  because **no official CBE merchant/API specification has been obtained**
  (see `docs/CBE_INTEGRATION.md`). This is additionally blocked on a business
  decision — direct CBE/CBEBirr integration vs. a third-party aggregator —
  not purely an engineering gap.

`MockPaymentProvider` simulates `SUCCESS | PENDING | FAILED | CANCELLED |
EXPIRED` outcomes with HMAC-SHA256-signed callbacks (`MOCK_PAYMENT_WEBHOOK_SECRET`),
is only ever returned by `getPaymentProvider("MOCK")` when the caller checks
`ENABLE_MOCK_PAYMENTS` first (`isMockProviderAvailable()` in
`apps/web/lib/payment-service.ts`), and `getEnv()` refuses to boot at all with
mock payments enabled when `NODE_ENV=production`.

### 6.5 Withdrawals

Not yet built (Phase 4 scope was deposits). The `Withdrawal` model and its
`PENDING → PROCESSING → APPROVED/REJECTED → COMPLETED/FAILED` lifecycle exist in
the schema; the request/approval flow and provider payout integration are future
work, planned to mirror the deposit pipeline's idempotency/audit guarantees.

---

## 7. Bingo Game Architecture

**Card generation** (`packages/game-core`): for each ticket, generate 5 unique random
numbers per column from its range (B 1–15, I 16–30, N 31–45, G 46–60, O 61–75) using
Node's `crypto.randomInt` (CSPRNG, not `Math.random`), Fisher–Yates shuffle each
column's candidate pool, take the first 5, sort ascending for display. N-column
middle cell is a `null`/`FREE` marker, not a stored number. The resulting 5×5 grid is
persisted as `BingoTicket.cardNumbers` JSON at purchase time — **generated and
stored server-side only**; the client receives it via API/socket and never computes
or edits it.

**Number calling** (realtime engine, authoritative): at game start, build a shuffled
array of 1–75 using the CSPRNG seeded by the game's committed secret (see §8), then
pop one at a time on the configured `callIntervalSeconds` (AUTO) or on operator click
(MANUAL). Each call: insert `BingoNumber` row (unique per `(gameId, ballNumber)` and
per `(gameId, sequenceNumber)` — DB constraints make double-calls impossible even
under a bug), broadcast `game:number-called`, then run winner detection (§9) against
all active tickets for that game before accepting the next call.

**Pattern engine**: `WinningPattern.matrix` is a 5×5 array of 0/1. Detection is a
pure function `matchesPattern(card, calledSet, matrix): boolean` in `game-core`,
treating FREE as always-marked. This makes adding "X", "Plus", "Four Corners", or a
fully custom admin-drawn pattern a data change, not a code change.

---

## 8. Fairness / Provably-Fair Design

1. At game creation (or game open), the server generates a cryptographically random
   `secretSeed` (32 bytes via `crypto.randomBytes`), derives
   `seedCommitmentHash = SHA-256(secretSeed)`, stores the seed **encrypted at rest**
   (`Game.secretSeedEncrypted`, using a server-held key never exposed to any
   client/admin UI), and publishes `seedCommitmentHash` publicly on the game page
   before the game starts.
2. The call sequence for the game is derived deterministically from `secretSeed`
   (e.g. seeded Fisher–Yates over `[1..75]`), so the entire number order is fixed the
   moment the seed is generated — **no one, including an admin, can alter it once
   published**, since altering it would change the hash and be detectable.
3. After the game completes, the server reveals `secretSeed`. Anyone can independently
   recompute `SHA-256(secretSeed)` and confirm it matches the pre-published
   commitment, and recompute the seeded shuffle to confirm it matches the recorded
   `BingoNumber` sequence — full public verifiability without trusting the operator.
4. All state transitions, calls, pauses, announcements, and winner determinations are
   additionally recorded in `GameEvent` (and mirrored to `AuditLog` for admin
   actions), giving an immutable, timestamped trail independent of the commitment
   scheme.

---

## 9. Real-Time Architecture

**Status: Server-Sent Events (SSE) transport, Redis Pub/Sub fan-out —
multi-instance-capable, not Socket.IO.** `apps/realtime` as a separate
Socket.IO microservice was the original plan (§1); it was not built, and
with Redis now backing the fan-out layer, the specific gap that plan existed
to close (cross-instance delivery) is closed by a different, simpler means.

### 9.1 What's actually built

- `apps/web/lib/redis.ts`: three accessors over `ioredis` — `getRedis()`
  (general-purpose, used by rate limiting, returns `null` if `REDIS_URL` is
  unset so local dev works with zero external dependencies) and
  `getRedisPublisher()` / `getRedisSubscriber()` (dedicated connections for
  the broadcaster — a subscribed ioredis connection can't issue other
  commands, so pub and sub can never share one connection). All stored on
  `globalThis` for the same reason as the Prisma client.
- `apps/web/lib/game/broadcaster.ts`: `RedisBroadcaster` when `REDIS_URL` is
  configured — publishes to a `bingo:game:<id>` Redis channel per game, and
  every realtime instance subscribes independently, so a player connected
  to instance #2 receives an event published by instance #1. Falls back to
  `InProcessBroadcaster` (the original single-instance in-memory Map) when
  `REDIS_URL` is unset, for zero-dependency local dev. Postgres remains the
  durable source of truth in both cases — Redis only carries the live
  fan-out, so a dropped Redis message never corrupts state; a reconnecting
  client re-syncs from Postgres via `game:sync`.
- `apps/web/app/api/games/[gameId]/stream/route.ts`: a Next.js Route
  Handler returning a `text/event-stream` response, authenticated (any
  logged-in user may watch a room, the same way a spectator can watch a
  real bingo hall before buying a ticket — no event payload leaks another
  player's private data). Subscribes to **three** channels per connection:
  the game room itself, a shared `"global"` channel (platform-wide
  announcements), and a per-user `user:<id>` channel (announcements
  targeted at just that player) — all delivered through the one SSE stream.
  Also self-heals a lost AUTO-mode calling timer on every
  connect/reconnect (`ensureAutoCallerRunning()` — see §9.4).
- `apps/web/lib/game/snapshot.ts`: `getGameSnapshot()` is the **single**
  canonical state builder, used for the initial page load
  (`GET /api/games/:id`), the SSE route's `game:sync` on first connect, and
  every reconnect — one source of truth for "what does the client currently
  believe," never two independently maintained versions. Includes
  `serverTimestamp` so clients never rely on their own clock for game
  timing. Never includes the secret seed or any not-yet-called ball —
  `calledNumbers` is read straight from the `BingoNumber` table, which by
  construction only ever contains numbers that have actually been called.
- The client (`GameRoom.tsx`, `ControlPanel.tsx`) uses the browser's native
  `EventSource`. On `game:sync` it wholesale-replaces local state from the
  snapshot, which is what makes a reconnect after a dropped connection (or
  a realtime-process restart) self-correct with no page reload.

### 9.2 What changed and why

The original plan called for a separate Socket.IO process with a Redis
pub/sub bridge. Building that before the game engine it would carry events
for existed would have been premature (Phase 7's actual deliverable was
proving the engine works end-to-end with live updates). SSE was built first
as a deliberate, documented single-instance simplification; Redis was added
once the engine, ticket purchasing, and payout logic were proven correct,
closing the multi-instance gap without introducing a second process or a
new protocol. `broadcaster.ts`'s `publish`/`subscribe` interface was
designed as the seam for exactly this swap, and the swap changed only that
one file plus the stream route — the game engine that calls `publish()`
was never touched.

SSE itself (as opposed to Socket.IO) remains the right choice because the
channel only ever needs to push server → client — every player *action*
(buy ticket, operator call-next) is already a normal authenticated POST
request, not something that needs to travel over the realtime channel.

**Verified, not assumed:** a dedicated integration test
(`lib/game/broadcaster.test.ts`) proves two independent Redis connections
both receive a publish (simulating two realtime instances); a live demo
confirmed a number called via the HTTP API through one instance appeared
in a browser session within the same process pool via Redis pub/sub, not
in-memory state. Multi-*process* fan-out (two separate Next.js server
processes sharing one Redis) has not been run as a literal two-process
test in this environment — the Redis-level proof plus the fact that
`RedisBroadcaster` holds no per-instance state beyond its local listener
map is what the multi-instance claim rests on. See §20 load-testing
results in `docs/STATUS.md` for concurrent-connection numbers against a
single running instance (up to 1,000 simultaneous SSE connections).

### 9.3 Announcements

`Announcement` (schema, Phase 1) now has a working send/receive path:
`POST /api/admin/announcements` (SUPER_ADMIN/GAME_OPERATOR only via
`ANNOUNCEMENT_CREATE`, audited) creates the row and publishes to the
matching channel — `GAME` targeting publishes to that game's channel,
`ALL` to `"global"`, `USER` to `user:<id>` — using the same three-channel
subscription the stream route already sets up. `active`/`expiresAt` fields
gate which announcements `getGameSnapshot()` includes on initial load.

### 9.4 Recovery and self-healing

Everything except the AUTO-mode calling interval is read fresh from
Postgres on every request, so a realtime-process restart can't lose or
corrupt game status, `calledCount`, called numbers, or winners. The AUTO
caller's `setInterval` handle genuinely only lives in process memory
(`apps/web/lib/game/engine.ts`'s `autoCallTimers` map); `startAutoCaller()`
is idempotent (clears any existing timer before setting a new one), and
`ensureAutoCallerRunning()` — called by the stream route on every
connect/reconnect — starts one only if this process doesn't already have
one registered for that game. The practical effect: the next player (or
admin) to load or reconnect to a LIVE AUTO game after a process restart
self-heals the caller, with no separate boot script or admin action
required. Verified in `lib/game/recovery.test.ts` by directly clearing the
in-memory timer maps (simulating a restart) and confirming both that state
survived and that reconnecting resumed calling. The STARTING→LIVE countdown
timer does not yet have the same self-heal treatment — a process restart
during that ~10-second window would leave the game stuck in STARTING until
an admin manually intervenes. Documented as a known limitation, not fixed
in this pass, given the narrow window involved.

### 9.5 Events

Delivered as SSE `event:`/`data:` frames, one event type per emitted delta
(`game:sync` on connect/reconnect is the only full-snapshot payload):

| Event | Payload | Emitted by |
|---|---|---|
| `game:sync` | Full `GameSnapshot` (see `snapshot.ts`) | stream route, on every connect/reconnect |
| `game:status` | `{ status, at }` | every state transition |
| `game:countdown` | `{ seconds }` | `startGame()` |
| `game:number-called` | `{ ballNumber, letter, sequenceNumber }` | `callNextNumber()` |
| `game:player-count` | `{ count, maxPlayers }` | `purchaseTickets()`, on a new player |
| `game:ticket-purchased` | `{ userId, ticketCount }` | `purchaseTickets()` |
| `game:winner` | `{ ticketId, userId, ticketNumber, prizeAmount, winnerCount, pattern }` | `detectAndRecordWinners()` |
| `game:completed` | `{ note }` | `completeGame()` |
| `game:announcement` | `{ id, type, message, createdAt, expiresAt }` | `POST /api/admin/announcements` |

Every room-facing page (`/room/:id`, `/admin/games/:id/control`) subscribes
and updates its local state from these — verified live with 5 real,
independently-authenticated players plus an admin connected simultaneously
(see `docs/STATUS.md`'s final acceptance demo entry).

---

## 10. Admin Architecture

- Admin UI lives in the same Next.js app under `(admin)/`, gated by middleware that
  checks both authentication **and** a server-side permission check per route (e.g.
  `requirePermission("game:create")`) — never a client-side `if (user.isAdmin)` hide.
- **Game Operator screen** (`(admin)/operator/[gameId]`) is a privileged Socket.IO
  client with elevated room access (`game-operator:{gameId}`), issuing commands
  (`CALL_NEXT`, `PAUSE`, `RESUME`, `END`, `ANNOUNCE`) that go through the same RBAC +
  state-machine validation as any other write — an operator cannot force an invalid
  transition (e.g. calling a number on a `COMPLETED` game).
- Dangerous actions (cancel game, approve withdrawal, manual wallet adjustment,
  change prize rules while a game has active tickets) require an explicit confirm
  step in the UI **and** are re-validated server-side, plus (for the highest-risk
  ones) a 2FA re-authentication challenge (see §11).
- Every admin mutation writes an `AuditLog` row with before/after values, actor, IP,
  and user agent — this is enforced at the service layer (a shared
  `withAudit(action, entityType, fn)` wrapper), not left to individual route authors
  to remember.

---

## 11. Security Architecture

- **Transport**: HTTPS-only in production (HSTS), all cookies `Secure; HttpOnly;
  SameSite=Lax`.
- **CSRF**: same-site cookies + double-submit CSRF token on state-changing
  form/non-JSON requests; JSON API routes require a custom header
  (`X-Requested-With`) that simple cross-site form posts can't set.
- **XSS**: React's default escaping, strict CSP headers, no `dangerouslySetInnerHTML`
  for user-supplied content, sanitize announcement text.
- **SQL injection**: Prisma parameterizes all queries; no raw SQL string
  concatenation.
- **Input validation**: Zod schemas on every API route input, shared with the
  frontend forms so client and server never disagree about shape.
- **Rate limiting**: Redis-backed, per-IP and per-user, tighter limits on
  auth/payment/withdrawal endpoints.
- **Webhook signature verification**: every payment callback is cryptographically
  verified (provider's signature scheme) before being trusted; unverifiable
  callbacks are logged and rejected, never applied.
- **Idempotency**: enforced via unique constraints (`Payment.idempotencyKey`,
  `WalletTransaction.referenceId`, `PaymentCallbackLog` composite unique) rather than
  "best effort" application logic.
- **DB transactions + row locking**: every multi-step financial or capacity-limited
  operation (ticket purchase vs. `maxPlayers`, wallet debit/credit, winner payout)
  runs inside a serializable/`FOR UPDATE` transaction to eliminate race conditions
  under concurrent load.
- **Server-side authority**: reiterated throughout — cards, numbers, wallet balance,
  game state, and winner determination are never accepted from the client, only
  computed and served by the backend.
- **Admin 2FA** required for `SUPER_ADMIN`/`ADMIN`/`FINANCE` and step-up
  re-authentication for the specific high-risk actions listed in §10.
- **Audit logs** are append-only (no update/delete API surface) and retained
  independently of the entities they describe.

---

## 12. API Structure (representative — full list in `docs/API.md`, built in later phases)

All responses share a consistent envelope: `{ success: boolean, data?, error?: {
code, message } }`. All inputs validated with Zod before touching business logic.

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
POST   /api/auth/forgot-password
POST   /api/auth/reset-password

GET    /api/games                          # list open/scheduled games
GET    /api/games/:id
POST   /api/tickets/purchase

GET    /api/wallet
GET    /api/transactions

POST   /api/payments/telebirr/create
POST   /api/payments/telebirr/callback     # webhook, signature-verified
POST   /api/payments/cbe/create
POST   /api/payments/cbe/callback          # webhook, signature-verified
POST   /api/withdrawals

# Admin (all require RBAC permission checks)
POST   /api/admin/games
PATCH  /api/admin/games/:id
POST   /api/admin/games/:id/open
POST   /api/admin/games/:id/start
POST   /api/admin/games/:id/pause
POST   /api/admin/games/:id/resume
POST   /api/admin/games/:id/cancel
POST   /api/admin/announcements
GET    /api/admin/users
POST   /api/admin/users/:id/suspend
POST   /api/admin/withdrawals/:id/approve
POST   /api/admin/withdrawals/:id/reject
GET    /api/admin/reports/revenue
```

---

## 13. Deployment Architecture

- **Docker Compose** for local/dev/staging: `web`, `realtime`, `postgres`, `redis`
  services, plus a `migrate` one-shot service running `prisma migrate deploy`.
- Production target: containers behind a reverse proxy (Nginx/Caddy or a managed
  load balancer) terminating TLS, routing `/socket.io` to the realtime service and
  everything else to the web app; horizontal scaling of `web` is stateless and trivial,
  `realtime` scales via Socket.IO's Redis adapter (sticky sessions or Redis-backed
  adapter for cross-instance room broadcast) — sharding one authoritative engine
  instance per active game keeps winner-detection single-writer-safe even with
  multiple realtime replicas.
- Managed PostgreSQL with automated daily backups + point-in-time recovery;
  Redis can be treated as ephemeral cache/pubsub (not the system of record) so its
  loss never loses financial data.
- Structured logging (JSON) shipped to a log aggregator; error tracking via Sentry (or
  equivalent); metrics (active games, connected sockets, queue depths) exported for
  monitoring/alerting.

---

## 14. Development Roadmap (Phases 2–16)

| Phase | Deliverable |
|---|---|
| 2 | Auth: registration, login, sessions, RBAC seed, middleware guards |
| 3 | Wallet + ledger, transaction service, admin adjustment flow (audited) |
| 4 | `PaymentProvider` abstraction + `MockPaymentProvider`, deposit flow end-to-end |
| 5 | `TelebirrProvider` against documented API (adapter + test-mode until live credentials) |
| 6 | `CBEProvider` interface + test-mode implementation |
| 7 | `game-core`: card generator, pattern engine, RNG/commitment scheme + unit tests |
| 8 | Game engine: state machine, number caller, winner detection, prize calculation |
| 9 | Realtime service: Socket.IO gateway, rooms, Redis pub/sub bridge |
| 10 | Player UI: dashboard, lobby, ticket purchase, bingo room |
| 11 | Admin dashboard: user mgmt, game mgmt, reports |
| 12 | Announcements (real-time, admin-authored) |
| 13 | Winner/prize engine hardening: simultaneous winners, tie-break rules, payout idempotency |
| 14 | Security pass: rate limiting, CSRF, headers, 2FA, pen-test checklist |
| 15 | Test suites: unit, integration, security, load-test plan |
| 16 | Dockerization + deployment docs + backup/DR runbook |

Each phase ends with: tests passing, `tsc --noEmit` clean, `prisma migrate` verified
against a real Postgres instance, and a short demo/checklist before moving on.

---

## 15. Open Questions / Ambiguities Needing Your Input

These materially affect design and should be resolved before Phase 2 (or explicitly
deferred with a documented default):

1. **Legal/licensing status**: This spec explicitly requires confirming Ethiopian
   gambling/lottery law, licensing, and tax obligations before real money moves. I'm
   proceeding with full technical correctness but **will not** connect real payment
   credentials or enable real-money mode without your confirmation that this has been
   cleared.
2. **Telebirr/CBE credentials & docs**: I don't have your merchant credentials or the
   exact current Telebirr API contract/CBE merchant integration spec in hand. Phase 5/6
   will build against the adapter interface + mock/test mode; you'll need to supply
   the actual API documentation and sandbox credentials when available for real
   integration and testing.
3. **SMS/Email provider**: which provider for OTP/notifications (e.g. an Ethiopian SMS
   gateway, Twilio, etc.)? Notification abstraction will be built regardless; the
   concrete adapter needs a choice.
4. **Hosting target**: self-hosted VM, or a specific cloud (AWS/GCP/Azure/local
   Ethiopian hosting)? Affects §13 specifics (managed Postgres choice, load balancer).
5. **Default prize-rule/percentages, multi-account policy specifics, and withdrawal
   auto-approval threshold** are left admin-configurable by design — flag if you want
   different defaults than "no auto-approval above 0 ETB" (i.e. everything reviewed)
   to start.

I'll proceed with sensible defaults on anything not called out here unless you say
otherwise.
