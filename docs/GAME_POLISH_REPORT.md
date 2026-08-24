# Game Polish Report — 2026-08-24

Scope: the "finish the GAME itself" pass — a genuine first-time-user audit,
gameplay-engine correctness audit, mobile/accessibility/security spot
checks, and a fresh multiplayer + realtime load test, on top of the
2026-08-23 Demo Release Candidate. DEMO money only throughout; no
Telebirr/CBE/Chapa/ArifPay/M-Pesa/licensing work was touched, per this
phase's own constraint.

## 1. Game readiness score — 90%

Every core player and admin loop (register → deposit → browse → join → buy
→ play → win → verify fairness; create → schedule → open → start → call →
pause/resume → cancel → complete) works, was exercised live against the
real running app this session, and is backed by passing automated tests
(236/236). The 10% gap is: a full WCAG audit (only a meaningful subset was
checked), four mobile breakpoints not re-verified this pass, and the load
test's honest ceiling (see §4) — not any known-broken functionality.

## 2. What is fully complete

- The entire player golden path, verified with a **brand-new account**
  created this session (not a pre-seeded one): register → dashboard →
  deposit DEMO balance → browse lobby → buy a ticket → see a correct
  bingo card → watch live number calls → see prize pool update live.
- Auto-mark mode (previously untested) — verified via the actual rendered
  DOM state (`aria-pressed`, `disabled`) that cells dab themselves the
  instant a number is called, with no way to manually interact in that
  mode.
- The admin operator loop, driven live in the browser: create → schedule →
  open → start → countdown → LIVE → pause → resume → cancel-with-required-
  reason-and-confirmation.
- The DEMO deposit flow, rebuilt this session to be instant and free of
  developer-facing jargon on the default path, while keeping the full
  outcome-simulation test infrastructure available behind a disclosure.
- The real-money deployment safety gate, fixed so the DEMO platform can
  actually be built and deployed (see §9) without weakening what the gate
  protects against.
- 16-point gameplay-engine correctness audit (state machine, no double-
  start, no duplicate calls, correct number ranges, server-only number
  selection in both AUTO and CONTROLLED modes, capacity/atomicity, no
  double-payout, multi-winner handling, pattern evaluation correctness,
  STARTING/LIVE self-healing, PAUSE/RESUME, CANCEL, COMPLETED/CANCELLED
  immutability, single prize-pool implementation) — all 16 hold against
  the real code; 2 gained new regression tests where none existed before.

## 3. What was tested live (not just typechecked/linted)

- A full new-user lifecycle in a real browser, end to end.
- Auto-mark, manual-mark, PAUSE/RESUME, and the CANCEL confirmation flow,
  each driven by real clicks against the real running server.
- Security: mass-assignment, IDOR, and RBAC-bypass attempts against
  ticket-purchase, wallet, and game-control endpoints, via independent
  authenticated HTTP sessions (not the app's own client code).
- Mobile layout at 320/375/768px, via real viewport resizes and DOM
  measurement (not just visual guessing) confirming zero horizontal
  overflow at each.
- Keyboard focus visibility and form-label association, measured via
  computed styles and the accessibility tree, not assumed.
- `pnpm db:integrity-check`, run 6 separate times across this session,
  including immediately after a real deposit → purchase → cancel →
  pending-refund cycle for a brand-new account.
- A full production build (`next build`) in the platform's actual DEMO
  deployment configuration.

## 4. Multiplayer test results

A real 5-player lifecycle, driven through independent authenticated HTTP
sessions (1 admin + 5 distinct players, not simulated/scripted shortcuts
through the DB):

| Step | Time (UTC) | Result |
|---|---|---|
| Create → Schedule → Open | 08:20:11–08:20:25 | DRAFT → SCHEDULED → OPEN |
| 5 players purchase 2 tickets each | 08:20:33 | 10 tickets, 5 players, ETB 100 collected |
| Start → STARTING → LIVE | 08:20:41 → 08:20:53 | ~10s countdown, as configured |
| AUTO-calling → COMPLETED | completed 08:22:27.958 | 96s LIVE, 32 numbers called (consistent with the 3s call interval) |
| Winner | — | player3, ticket #5, ball #11 (call #32), prize ETB 90 (ETB 100 sales − 10% platform fee, matching the Winner-Takes-All rule's config) |
| Payout | — | player3's actual wallet balance moved 978 → 1068 — confirmed by querying the wallet directly, not just trusting the game's own response |
| `pnpm db:integrity-check` | — | **ALL CHECKS PASSED** |

**Realtime SSE load test** (separate LIVE game, AUTO-calling observed over
a real time window — DEMO TEST ENVIRONMENT, single local machine with real
Postgres + Redis, not a production capacity claim):

| Scale | Connections attempted | Succeeded | `game:sync` received | Live number-call events delivered | Notes |
|---|---|---|---|---|---|
| 100 | 100 | 100 (100%) | 100/100 | 100/100, uniform | connect latency p50 354ms / p99 377ms, 0 errors |
| 500 | 500 | 500 (100%) | 500/500 | 500/500, uniform | connect latency p50 367ms / p99 586ms, 0 errors |
| 1,000 | 1,000 | 1,000 (100%) | 1,000/1,000 | 1,000/1,000, uniform | connect latency p50 595ms / p99 1,488ms, 0 errors |

Zero dropped events and zero errors at every scale tested. The 1,000-scale
run was a bonus given time allowed — 100 and 500 were the committed scope.

## 5. Performance results

- Dev-server page timings (not a production build, single local machine,
  single user): TTFB ~133ms, DOMContentLoaded ~172ms, full load ~405ms for
  the game room — no red flags at this scale.
- No unnecessary duplicate network calls found; the one apparent duplicate
  (`/api/wallet` fetched twice on room-page load) is React StrictMode's
  intentional dev-only double-invoke of effects, not a real inefficiency —
  confirmed by checking `next.config.js`'s `reactStrictMode: true` and
  that this behavior does not occur in production builds.
- Realtime load test: 100% connection success and 100% live event delivery
  at 100, 500, and 1,000 concurrent SSE connections this session — see §4
  for the full table and connect-latency percentiles.

## 6. Security results

- No mass-assignment vector on ticket purchase or wallet endpoints —
  confirmed structurally (server never reads a client-supplied user
  identifier) and live (injecting a foreign `userId` into a wallet request
  returned only the caller's own balance).
- RBAC: game-control and admin-user-listing endpoints return 403 for an
  authenticated but unprivileged player — verified live via independent
  curl sessions, not just code review.
- CONTROLLED calling mode: the call-next endpoint takes no ball-number
  input at all — structurally impossible for an operator to choose a
  number, in either AUTO or CONTROLLED mode.
- No debug endpoints, stray `console.log`, `TODO`/`FIXME`, or
  `alert()`/`confirm()` found in application code.
- No IDOR: a player's own game-room snapshot never includes another
  player's ticket/card data — only already-public winner info (username,
  ticket number, prize amount).

## 7. Mobile / UX results

- Fixed: a genuinely broken CTA — a lobby/room "Buy Ticket" button that
  was enabled and clickable for a game whose registration window had
  actually already closed, failing with a raw server error on click. Root
  cause was purely client-side (the UI checked game *status* but not the
  registration deadline); fixed in both the lobby card and the room, plus
  the underlying seed-script blind spot that let this go unnoticed.
- Fixed: the deposit flow required every demo user to click through a
  developer-facing "Development Payment Simulator" panel with a raw
  Payment ID and "MOCK" provider label exposed by default. Now instant,
  with that panel moved behind an opt-in "Show testing controls" link.
- Fixed: a false "Join thousands of players across Ethiopia" claim on
  registration, and a registration/dashboard message that told every new
  user they had to verify their email before they could deposit or play —
  untrue (nothing enforces that, and this DEMO environment has no real
  email delivery configured, so it would have been permanently
  unsatisfiable).
- Mobile: 320px, 375px, and 768px all confirmed free of horizontal
  overflow, with the current-number display staying large and legible and
  the bingo card comfortably tappable at each size.

## 8. Accessibility results

- Fixed real, measured contrast failures: every "uppercase tracking-wide"
  section-label pattern site-wide (used in 14 files for things like
  WINNERS, CURRENT NUMBER, and every admin stat-card label) measured
  ~2.5:1 against its background — well under WCAG AA's 4.5:1 for normal
  text — now passing.
- Keyboard focus is visibly indicated (measured: 2px solid outline,
  brand-green, on every tabbable element checked).
- Every login/register form input has a real `<label for>` association,
  confirmed programmatically, not just placeholder text.
- Every bingo-card cell carries a correct `aria-label` (including its
  called/marked/free state) and `aria-pressed`, confirmed by reading the
  actual DOM attributes during a live auto-mark game, not just the source.
- Not done this pass: a full WCAG audit (screen-reader walkthrough,
  exhaustive color-contrast sweep, reduced-motion testing).

## 9. Known limitations

- Mobile breakpoints 390/414/1024/1440px were not re-verified this
  session (320/375/768 were).
- Accessibility coverage is a meaningful spot-check, not an exhaustive
  WCAG audit.
- The realtime load test's honest ceiling and methodology are exactly as
  labeled in §4 — a single-machine, single-Postgres, single-Redis test of
  this dev environment, not a production capacity claim.
- A structurally important fix landed this session: the real-money safety
  gate was rewired from `NODE_ENV=production` onto the dedicated
  `PAYMENTS_LIVE_MODE` flag, because the old gate would have made it
  impossible to ever deploy this DEMO platform with an optimized
  production build. This is a deployment-readiness fix, not a relaxation
  of the real-money protection — `PAYMENTS_LIVE_MODE=true` still refuses
  to boot with mock payments enabled or `GAME_MONEY_MODE` off `REAL`,
  proven by a dedicated regression test.

## 10. Remaining work before public play-test

- Verify the 4 untested mobile breakpoints.
- A full accessibility audit if that bar matters for the specific
  play-test audience.
- Decide whether to run the load test at a larger scale (1,000+) before a
  higher-visibility demo, time permitting.

## 11. Remaining work before real money

Unchanged from `docs/PRODUCTION_READINESS.md` — legal/licensing,
Telebirr/CBE integration, secrets rotation, real infrastructure, and
`PAYMENTS_LIVE_MODE=true` sign-off. None of this was touched this session,
per the explicit instruction to stay in DEMO/test-money mode.

## 12. Final recommendation

**Ready for public DEMO play-testing.** The game itself — creation,
joining, playing, winning, fairness verification, and admin operation — is
correct, secure against the tested attack surface, and now free of the
player-visible bugs found this session (the broken stale-registration buy
button chief among them). Stopping here per the phase's own instruction:
not proceeding into Telebirr/CBE/licensing/real-money work without
explicit further direction.
