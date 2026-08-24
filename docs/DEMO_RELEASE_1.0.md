# Bingo Demo Release 1.0

> **THIS RELEASE IS FOR CONTROLLED DEMONSTRATION AND PLAY-TESTING ONLY. NO REAL MONEY IS USED OR ACCEPTED.**

## Version

**BINGO DEMO RELEASE 1.0** — git tag `demo-release-1.0`

## Release date

2026-08-24

## Current status

**Frozen for controlled real-user play-testing.** Feature development on this
build has stopped. No further changes should be made to this release except
fixes for a genuine P0/P1 bug discovered during play-testing (see "Bug
policy" in [DEMO_FINAL_ACCEPTANCE_REPORT.md](DEMO_FINAL_ACCEPTANCE_REPORT.md)).

## What is included

- Full player flow: registration, login, DEMO wallet (deposit via "Add DEMO
  Balance" only — real payment providers are visibly labeled "Coming soon"),
  browsing live/upcoming/completed games, buying tickets, entering a game
  room, live number-calling, manual and automatic card marking, winner
  detection and prize payout, viewing completed-game results.
- Full operator flow: creating, scheduling, opening, starting, pausing,
  resuming, announcing in, and cancelling games; monitoring players and
  winners; reviewing results.
- Finance flow: reviewing and processing DEMO refunds for games cancelled
  while LIVE/Paused.
- Provably-fair number sequence (seed committed before the game starts,
  revealed after completion, independently verifiable per game).
- Real-time updates via Server-Sent Events (number calls, winner
  announcements, pause/resume state, in-room announcements).
- RBAC across five roles (Super Admin, Admin, Game Operator, Finance,
  Support) plus Player.
- Responsible-gaming pages (cooling-off, self-exclusion) — informational for
  this DEMO phase.

## What has been tested

- A 32-item formal acceptance checklist covering the full player and
  operator journeys, real-time reliability, multiplayer concurrency, mobile
  breakpoints (320–1440px), demo-mode cleanliness, error handling, security
  spot-checks (IDOR/RBAC/mass-assignment), and performance — see
  [DEMO_FINAL_ACCEPTANCE_REPORT.md](DEMO_FINAL_ACCEPTANCE_REPORT.md) for the
  full table and verdict.
- A final clean-slate play-test performed through the UI only (no developer
  shortcuts, no direct database access, no API calls bypassing normal UI
  steps): register → login → add DEMO balance → browse → buy a ticket →
  enter the game room → watch live number-calling → manually mark the card
  → the game completed and the tester won organically → view the result →
  return to the lobby. Confirmed a person with no prior knowledge of the app
  can complete this whole path unassisted.
- A small multiplayer simulation (5 seeded demo accounts, one shared game)
  to observe the experience from both sides of a win: the winning player's
  "You won!" banner, and a non-winning spectator's "player X won" banner.
  Both were clear and did not expose any other player's private data.
- Two real issues were found and fixed during this final pass (see "Fixes
  made in this pass" below).

## Test results

| Check | Result |
|---|---|
| Automated test suite (`pnpm test`, all packages) | **239 / 239 passed** |
| TypeScript typecheck (`pnpm --filter web typecheck`) | Clean, no errors |
| Lint (`pnpm --filter web lint`) | Clean, no warnings or errors |
| Production build in DEMO mode (`PAYMENTS_LIVE_MODE=false`) | Succeeds |
| Database integrity check (`pnpm db:integrity-check`) | **ALL CHECKS PASSED** — every wallet reconciles, platform-wide fund conservation holds, every winner paid exactly once for the correct amount, no orphaned ledger entries, no duplicate transaction references |

## Fixes made in this pass

Two issues were found during the final play-test (not in the game engine or
financial logic) and fixed, since they would have confused a real
play-tester:

1. **Wrong banner wording.** The site-wide safety banner and the withdrawal
   page read "Test Game — No Real Money" — "Test Game" is explicitly on the
   forbidden-wording list for this release. Changed both to read
   "Demo Mode — No Real Money", matching the rest of the app.
2. **Stale lobby after finishing a game.** Clicking "Back to lobby" right
   after a game completed could briefly show that same game as still "Open
   for tickets" with an outdated player count, because Next.js's client-side
   navigation cache was reusing a snapshot from before the game finished. A
   hard page reload always showed the correct state — only the fast,
   in-app navigation was affected. Fixed by disabling that cache reuse for
   dynamic pages (`experimental.staleTimes.dynamic = 0` in
   `next.config.mjs`), so every navigation now shows current server state.
   Verified fixed by reproducing the exact scenario after the change.

Neither fix touched game logic, financial logic, or payment gating.

## Known limitations

- **Real-money payments are not connected** (by design — see "Real-money
  status" below).
- Email verification is not enforced for DEMO accounts — the dashboard
  explains this is intentional for this test phase.
- "My Tickets" and "Help" are visible in the player nav but marked "Soon" —
  they are not yet built. There is no in-app Help button; see
  [DEMO_BUG_REPORTING.md](DEMO_BUG_REPORTING.md) for how testers should
  report problems in the meantime.
- This is a single-process dev/demo deployment. The live number-calling
  timer lives in server memory; if the server process restarts while a game
  is mid-countdown, that specific game's timer can stall until a player
  opens the room again (which automatically resumes it). This is a
  deployment-topology detail of this demo environment, not a bug in the
  game engine — a real deployment target should confirm process stability
  before longer play-test windows.
- No production financial infrastructure (real settlement, chargebacks,
  reconciliation with a payment processor) exists yet — out of scope for
  this phase.

## DEMO-mode explanation

Every balance, ticket price, and prize in this build is DEMO currency only.
A yellow "Demo Mode — No Real Money" banner is shown on every page. Deposits
only offer "Add DEMO Balance" (instant, no real payment step); the real
payment provider options (Telebirr, CBE, Chapa, ArifPay, M-Pesa) are visibly
labeled "Coming soon" and are not wired to any live payment network.

## Player instructions

See [docs/DEMO_PLAYER_GUIDE.md](DEMO_PLAYER_GUIDE.md) — a short, plain-language
walkthrough for someone who has never used the app.

## Operator instructions

See [docs/DEMO_OPERATOR_GUIDE.md](DEMO_OPERATOR_GUIDE.md) — covers creating,
running, and reviewing DEMO games. Does not cover enabling real-money
payments (that's a separate future phase, deliberately excluded).

## Bug-report instructions

See [docs/DEMO_BUG_REPORTING.md](DEMO_BUG_REPORTING.md) — a simple template
non-technical testers can fill in, and where to send it.

## Security status

- `PAYMENTS_LIVE_MODE=false` — the explicit, dedicated real-money safety
  gate (`apps/web/lib/env.ts`). No real payment provider can process a
  transaction in this configuration.
- No production financial credentials (Telebirr, CBE, Chapa, ArifPay,
  M-Pesa secrets/keys/tokens) are present in the environment.
- CSP, `X-Frame-Options`, `X-Content-Type-Options`, HSTS, and a strict
  `Referrer-Policy` are set on every response.
- RBAC enforced across five roles; IDOR and mass-assignment spot-checks
  passed in the acceptance pass (see the linked acceptance report).
- Rate limiting active on authentication and ticket-purchase endpoints.

## Database-integrity status

**ALL CHECKS PASSED** as of this release (see "Test results" above for the
full breakdown). Verified both before and after the final play-test and
multiplayer simulation described in this document.

## Performance results

Concurrency, real-time delivery, and mobile-breakpoint checks were carried
out during the acceptance pass — see
[DEMO_FINAL_ACCEPTANCE_REPORT.md](DEMO_FINAL_ACCEPTANCE_REPORT.md) for the
full results. No performance regressions were introduced in this
release-freeze pass; the two fixes made were a text change and a caching
configuration change, neither of which touches a hot path.

## Demo accounts

Password for every account below: `DevPass123!`

| Role | Username / email |
|---|---|
| Super Admin | `superadmin` / `superadmin@dev.local` |
| Admin | `admin` / `admin@dev.local` |
| Game Operator | `operator` / `operator@dev.local` |
| Finance | `finance` / `finance@dev.local` |
| Support | `support` / `support@dev.local` |
| Player | `player1` / `player1@dev.local` |
| Player | `player2` / `player2@dev.local` |
| Player | `player3` / `player3@dev.local` |
| Player | `player4` / `player4@dev.local` |
| Player | `player5` / `player5@dev.local` |

These credentials are documented here only — they are never shown in any
public-facing UI. Do not reuse this password outside the DEMO environment.

---

## DEMO GAME STATUS

**READY FOR CONTROLLED REAL-USER PLAY-TESTING.**

## REAL-MONEY STATUS

**NOT ENABLED.** Licensing, legal approval, payment provider integration,
and production financial infrastructure are future phases, separate from
this release.
