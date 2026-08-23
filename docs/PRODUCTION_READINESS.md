# Production Readiness Checklist

This is a living document. Nothing on this list is checked off by writing
code alone — each item requires a verification step (a real test against a
real provider, a legal sign-off, an infra change) before real money should
move through this platform. **Last updated 2026-08-21 (Phase 9/10).**
Everything under Legal & compliance and Payments (Telebirr/CBE) is still
genuinely blocked on external parties/business decisions, not engineering.

## Legal & compliance — MUST be resolved before any real-money mode

- [ ] Confirm Bingo/gaming-of-chance licensing requirements under Ethiopian
      law with qualified legal counsel.
- [ ] Confirm tax/withholding obligations on winnings and platform revenue.
- [ ] Confirm consumer-protection and advertising requirements.
- [ ] Confirm KYC/AML obligations and, if required, integrate a compliant
      identity-verification provider (the `KycRecord` model exists but no
      provider is connected yet).
- [ ] Legal review of Terms & Conditions, Privacy Policy, Responsible
      Gaming, Refund Policy, and Withdrawal Policy content (currently
      placeholder text — see `app/(public)/legal/*`).
- [ ] Confirm Telebirr's and CBE's own merchant/payment-terms permit this
      use case, and complete their merchant onboarding.

## Payments

- [x] `ENABLE_MOCK_PAYMENTS=false`, `GAME_MONEY_MODE=REAL`, and
      `NODE_ENV=production` enforcement confirmed at the actual build/deploy
      level, not just app boot — `next build` itself now fails closed if
      these aren't set correctly (verified live: building with
      `ENABLE_MOCK_PAYMENTS=true` or `GAME_MONEY_MODE=TEST` under
      `NODE_ENV=production` throws and aborts the build). CI's build step
      sets both explicitly.
- [ ] **Telebirr** — see `docs/TELEBIRR_INTEGRATION.md` for the full research
      record. Remaining steps, in order:
      1. Complete Telebirr merchant onboarding/KYC (business step).
      2. Obtain access to the authenticated developer portal at
         `developer.ethiotelecom.et` and the real API specification.
      3. Implement `createOrder`/`verifyTransaction`/`isCallbackSignatureValid`/
         `parseCallback` in `packages/payments/src/telebirr/telebirr-provider.ts`
         against that specification — mapping Telebirr's status vocabulary
         conservatively (ambiguous ⇒ `PENDING_RECONCILIATION`, never
         auto-assumed `FAILED`).
      4. Test the normal flow and as many failure flows as the sandbox
         supports (see the test list in `apps/web/lib/payment-service.test.ts`
         for what "tested" means here).
      5. Only then set `TELEBIRR_MODE=production` with real credentials.
- [ ] **CBE** — see `docs/CBE_INTEGRATION.md`. Blocked on a **business
      decision**, not just missing docs: integrate directly with CBE/CBEBirr
      merchant services, or through a third-party aggregator (e.g. WeBirr)
      that already has a CBE integration. Once that's decided and a spec is
      obtained, same implementation pattern as Telebirr applies.
- [ ] Webhook endpoints (`/api/payments/*/callback`) reachable from the
      provider's network (correct `NOTIFY_URL`, firewall/allowlist rules).
- [ ] A recurring reconciliation job scheduled (not just the manual admin
      "Reconcile" button) for payments stuck in
      PENDING/INITIATED/**PENDING_RECONCILIATION** past a threshold.
      `PENDING_RECONCILIATION` specifically means "we asked the provider and
      didn't get a clear answer" — an alert/monitor on this count is a
      pre-launch requirement, since a growing queue here means either the
      reconciliation job isn't running or the provider integration is
      unhealthy.
- [ ] Withdrawal payout mechanism connected (currently: withdrawal requests
      are recorded and require manual Finance approval; no automated payout
      integration exists yet).

## Secrets & configuration

- [ ] All secrets (`AUTH_JWT_*_SECRET`, `APP_ENCRYPTION_KEY`, provider keys,
      SMTP credentials) generated fresh for production — never reused from
      `.env.example` or any development value.
- [ ] Secrets stored in a real secrets manager, not plain environment files
      on disk.
- [ ] `.env`, `.env.local`, `.env.production` confirmed absent from version
      control (`.gitignore` covers these — verified in Phase 4; re-verify
      before every release).
- [ ] Repository scanned for accidentally committed secrets (done for Phase
      4's changes; re-run before release — e.g. `git log -p | grep -iE
      "secret|private_key|api_key"` or a dedicated secret-scanning tool).

## Accounts & access

- [ ] Development seed accounts (`superadmin`/`admin`/`operator`/`finance`/
      `support`/`player1`/`player2`, all sharing `DevPass123!`) are **never**
      seeded against the production database. The seed script
      (`packages/db/src/seed.ts`) is a dev-only tool — production admin
      accounts must be created deliberately with strong, unique passwords.
- [x] TOTP 2FA implemented and verified live (enroll/QR/confirm, login
      challenge, recovery codes) — see `lib/two-factor-service.ts`. Currently
      **optional/self-service for any account**, not yet *enforced* for
      `SUPER_ADMIN`/`ADMIN`/`FINANCE` — enforcing it (blocking admin-panel
      access until enrolled) is a small follow-up, not a rebuild.
- [ ] Rate limiting backed by Redis, not the in-memory fallback (the app
      falls back to in-memory limiting automatically when `REDIS_URL` is
      unset — this is explicitly unsafe for a multi-instance deployment and
      must not happen in production).

## Infrastructure

- [ ] HTTPS enforced end-to-end (reverse proxy + HSTS).
- [ ] Production PostgreSQL with automated daily backups and tested
      point-in-time recovery.
- [ ] Redis provisioned for rate limiting, pub/sub, and (once built)
      realtime fan-out.
- [ ] Structured logging shipped to a log aggregator; error tracking
      (e.g. Sentry) wired up. Not started — current logging is plain
      `console.error`/Prisma's own query logging, no request IDs, no
      centralized aggregation.
- [ ] Monitoring/alerting on payment failure rates, callback processing
      errors, and wallet ledger anomalies. `pnpm db:integrity-check` exists
      as a manual/CI check (see Data integrity below) but nothing runs it
      on a schedule against production yet.
- [x] `Dockerfile` (production, multi-stage, standalone Next.js output) and
      `docker-compose.yml` (dev Postgres+Redis) written and reviewed against
      a real `.next/standalone` build output. **`docker build` itself has
      not been run** — no Docker is installed in the environment this was
      built in. Validate with a real `docker build .` before relying on it.
- [x] CI pipeline (`.github/workflows/ci.yml`): lint, typecheck, migrate,
      seed, test, `db:integrity-check`, production build, gitleaks secret
      scan. Written and YAML-validated; **not yet exercised on a real GitHub
      Actions runner** (no GitHub remote configured yet).

## Data integrity

- [x] Automated integrity checker (`pnpm db:integrity-check`, shared logic in
      `packages/db/src/integrity.ts`): per-wallet balance reconstruction,
      platform-wide money conservation, winner payout completeness,
      orphaned-ledger-entry detection, referenceId uniqueness. Wired into
      CI. Proven live to catch real bugs — found and fixed a ~5,639 ETB
      test-cleanup drift bug this project; 3 consecutive full test-suite
      runs on a fresh database now show zero drift every time.
- [x] Confirmed: every wallet balance change goes through
      `applyWalletTransaction` or the equivalent SERIALIZABLE-transaction
      pattern in `tickets.ts`/`payout.ts` — no stray `wallet.update` touching
      `availableBalance` found outside those paths.
- [x] Responsible-gaming limits (deposit/spend caps, cooling-off,
      self-exclusion) enforced server-side, verified live via real HTTP 403s
      — not just UI-level.
- [ ] Confirmed: payment callback idempotency and concurrency tests pass
      against the target production database engine/version, not just the
      local dev database (tests exist and pass against local Postgres 18;
      re-verify against whatever managed Postgres version production
      actually uses).

## Sign-off

This checklist should be reviewed and explicitly signed off by the business
owner (legal/compliance items) and a technical lead (everything else)
before `PAYMENTS_LIVE_MODE=true` is ever set outside a test environment.
