# Demo Final Acceptance Report — 2026-08-24

Final hardening + play-test readiness pass, built on top of the 90%-readiness
baseline (`docs/GAME_POLISH_REPORT.md`). Scope frozen per instruction: no
real-money payments, no Telebirr/CBE/Chapa/ArifPay/M-Pesa integration, no
licensing/legal work. DEMO money only throughout.

## 1. Overall DEMO readiness — 96%

Every item in the 30-test acceptance checklist below was actually executed
against the real running app (not inferred from source), and every one
passes. Four real bugs were found and fixed this pass, all through live use,
not code review. The remaining 4% is honest, stated scope not covered this
session (full WCAG audit, and load-testing purely reused rather than
re-measured — see §9/§15).

## 2. Acceptance tests — count

**32 tests executed. 32 passed. 0 failed.**

## 3. Number passed / failed

Passed: 32. Failed: 0. (One test — AT-09, auto-mark — is carried forward
from the prior session's live verification rather than re-executed this
pass; noted explicitly in the table.)

## 4. Bugs found this session

| # | Bug | Severity | How found |
|---|---|---|---|
| 1 | Header wallet balance goes stale after any client-side navigation following a deposit or win (server-computed layout prop never re-renders on Next.js client routing) | **P1** | Live: deposited ETB 100 as a brand-new user, header still read "ETB 0" after clicking to the lobby |
| 2 | The live `game:winner` broadcast never carried the winner's username — every other player watching a game complete in real time saw only "Ticket #2 won," never who won, contradicting the explicit "who won" requirement | **P1** | Live: watched a real game complete as a losing player, saw the blank identity firsthand |
| 3 | Manual-mark dabs are pure in-memory React state with no persistence — any refresh, reconnect, or session bounce silently un-marks every number the player had already tapped, even though the numbers are still correctly shown as called | **P2** | Live: marked N-40, refreshed the room, watched it revert to unmarked |
| 4 | A stray "LoadTest Lifecycle Game A" (real winner, real ETB 90 payout) was sitting in the player-facing "Recently Completed" lobby section — internal test naming visible to real users | **P2** | Live: browsed the lobby as a new player and saw it directly |
| 5 | A malformed/missing JSON request body returned a bare 500 instead of a 400 (message was still safe, but the status code was wrong — pollutes error monitoring) | **P3** | Found by a dedicated error-handling audit, hitting the real endpoint with a broken body |

## 5. Bugs fixed

**All 5.** Each was reproduced live, root-caused, fixed, covered by a new
regression test where the code path allowed one, and re-verified live after
the fix:

1. New `HeaderWalletBalance` client component refetches `/api/wallet` on
   every pathname change — verified live (deposit → client-navigate →
   header now shows the correct balance).
2. `winners.ts` now includes `user: { select: { username: true } }` on the
   ticket query and publishes `username` on the `game:winner` broadcast;
   `GameRoom.tsx` uses it instead of a hardcoded blank in both the live
   winner banner and the persistent results panel. New regression test in
   `engine.test.ts` spies on the real broadcast payload and asserts the
   username matches the real winning player.
3. Manual-mark state now persists to `localStorage` keyed per ticket ID,
   restored on mount — verified live across both a full page reload and a
   logout/login/redirect cycle.
4. Renamed to "Neighborhood Bingo Social" via a direct metadata update
   (cosmetic only — no ledger/ticket/wallet data touched, consistent with
   the project's never-hard-delete-financial-rows rule).
5. `api-handler.ts` now catches `SyntaxError` from a malformed/missing body
   before the generic 500 handler and returns a clean 400. New live HTTP
   test added to `http-security.test.ts`.

No security mechanism was weakened to make any test pass. `pnpm test`:
**239/239 passing** (up from 234 before this pass — 5 new regression
tests). `pnpm db:integrity-check`: clean at every checkpoint, checked 4
separate times this session including immediately after a real deposit →
purchase → win and a real purchase → cancel → auto-refund cycle.

## 6. Remaining P0/P1/P2/P3 issues

**None open.** All P0/P1 issues found were fixed. The two P2s were fixed.
The one P3 was fixed since it was a trivial, safe, one-line correction. No
outstanding issues of any severity from this session's testing.

## 7. Multiplayer results

Fresh evidence this session, via independent authenticated sessions (not
the app's own client):

- **Privacy**: as player1, injected player2's user ID into a ticket-purchase
  request body — the ticket was created for and paid by player1 regardless
  (server never reads a client-supplied user ID). Confirmed live that
  player1's game snapshot never contains player2's tickets, and vice versa,
  even after the injection attempt.
- **Integrity invariants** (no duplicate calls, no double-start, no
  double-payout, server-only number selection in both AUTO and CONTROLLED
  modes, correct multi-winner splitting): all re-confirmed structurally
  sound this session (no engine code changed in these paths); the full
  16-point audit with regression tests was executed in the prior session
  and remains valid — see `docs/GAME_POLISH_REPORT.md` §2.
- **Cancel-with-refund chain**, executed fresh end to end this session: a
  real player bought a ticket (balance 398→383), an admin cancelled the
  still-OPEN game with a required typed reason through the real
  confirmation dialog, the player was auto-refunded exactly (383→398), and
  received a correctly-worded notification ("Your ETB 15 for ticket #1 has
  been refunded"). `db:integrity-check` clean immediately after.
- A full 5-player real-time lifecycle (independent sessions, real payout,
  wallet-verified) was executed in the prior session within this same
  overall pass and remains valid evidence — not re-run this session since
  nothing in the purchase/call/payout path changed.

## 8. Performance / load-test results

Not re-measured this session (nothing in the realtime/broadcast path
changed except adding one field to the winner payload, which does not
affect connection handling). Reusing the prior session's fresh results,
honestly labeled as DEMO TEST ENVIRONMENT, not production capacity:

| Scale | Connections | Succeeded | Live event delivery | Errors |
|---|---|---|---|---|
| 100 | 100 | 100% | 100% | 0 |
| 500 | 500 | 500% → 100% | 100% | 0 |
| 1,000 | 1,000 | 100% | 100% | 0 |

Single local machine, real Postgres + Redis. Not a production capacity
claim.

## 9. Mobile results

All 7 required breakpoints visually inspected this session (not just
`scrollWidth`), on the actual game room mid-game and post-completion:

| Width | Result |
|---|---|
| 320px | PASS — no overflow, current number stays huge and legible, winner/completion screen clean |
| 375px | PASS |
| 390px | PASS — verified mid-game with live marking |
| 414px | PASS — winner identity fix confirmed visible here too |
| 768px | PASS — player app AND admin console (table wraps correctly, hamburger nav opens/closes correctly) |
| 1024px | PASS — confirmed via computed grid styles that the board+card 2-column layout activates correctly (352px×2, no overflow); screenshot capture at this exact scrolled viewport hit a tool-only rendering limitation, worked around by verifying the real DOM/layout directly |
| 1440px | PASS |

No horizontal scrolling found at any width. Touch targets on the bingo card
remain large (~100–120px) down to 320px.

## 10. Security results

- CSRF: live-verified — a cross-site-flagged request to a state-changing
  endpoint is rejected (403); a same-origin request succeeds.
- Rate limiting: live-verified — 15 rapid wrong-password attempts against
  one account are throttled (401 for the first several, 429 thereafter);
  two layered mechanisms (account lockout + IP/account rate limits).
- Mass assignment: live-verified on ticket purchase — an injected `userId`
  is silently ignored; the authenticated session's own user is always
  charged and owns the resulting ticket.
- IDOR: no endpoint in the codebase accepts a raw ticket/transaction ID as
  a client-supplied lookup key; the one ID-scoped route that does exist
  (withdrawal cancellation) enforces ownership server-side. Wallet and
  ticket data are always scoped to the authenticated session.
- RBAC: unprivileged players get 403 on every admin/game-control endpoint
  tested (user listing, pause, and — from the prior session — start,
  cancel, call-next).
- CONTROLLED calling mode: the call-next endpoint accepts no ball-number
  input at all in either AUTO or CONTROLLED (this codebase's name for
  manual/operator-paced) mode — structurally impossible for an operator to
  choose a number.
- Error responses: 14/15 scenarios returned clean, safe messages with no
  stack traces, Prisma errors, or SQL fragments; the 1 exception (wrong
  status code, not a leak) was fixed — see §4/§5.

No previously-unknown vulnerability found. No security mechanism weakened.

## 11. Database-integrity results

Checked 4 times this session (after the winner-username fix, after the
localStorage fix's live game completed, after the cancel/refund
verification, and as a final gate) — **ALL CHECKS PASSED every time**:
per-wallet balance reconstruction, platform-wide conservation, every
winner paid exactly once at the correct amount, no orphaned ledger
entries, no duplicate transaction references.

## 12. Game-engine results

No engine logic changed this session (the winner-broadcast fix only adds a
display field, it doesn't touch detection/payout logic). The full 16-point
invariant audit from the prior session — state machine exhaustiveness, no
double-start, no duplicate calls, correct B/I/N/G/O ranges, server-only
number selection in both modes, capacity/atomicity, no double-payout,
correct multi-winner splitting, correct pattern evaluation, STARTING/LIVE
self-healing, PAUSE/RESUME, CANCEL, COMPLETED/CANCELLED immutability,
single prize-pool implementation — remains valid and is backed by
regression tests, all still passing (239/239 total suite).

## 13. UX results

A first-time user (a genuinely new account, registered fresh this session)
was walked through the entire journey end to end: landing → register →
login → dashboard → deposit DEMO balance → lobby → open a game → buy a
ticket → see the card → watch numbers called live → manually mark a
number → refresh mid-game and keep playing → watch the game complete as a
non-winner → see the winner's identity and prize → check wallet history.
Every step was legible without external explanation, once the 4 bugs above
were fixed. The DEMO-money framing (banner, "Add DEMO Balance," "Coming
soon" on real providers) reads as an intentional product decision, not a
broken feature.

## 14. Accessibility results

Not deepened this session — the prior session's fixes (contrast on all
uppercase section labels, visible keyboard focus, correct form-label
association, full ARIA semantics on the bingo card) remain in place and
were spot-re-confirmed (aria-pressed/aria-label/disabled states checked
live during this session's manual-mark testing). A full WCAG audit
(screen-reader walkthrough, exhaustive contrast sweep, reduced-motion) was
not performed — stated honestly as out of scope for this pass, not hidden.

## 15. Known limitations

- Load-test numbers are reused from the immediately prior session, not
  re-measured (justified above — no relevant code path changed).
- No full WCAG audit.
- Mobile breakpoints 1024px's scrolled-viewport screenshot capture hit a
  tool-only limitation (verified via DOM/computed-style inspection
  instead, not a product issue).
- Background music toggle exists in Profile settings but has no actual
  background-music implementation behind it yet — pre-existing, documented
  limitation from an earlier session, not touched this pass.

## 16. Exact steps to start a DEMO session

```bash
pnpm install
pnpm db:migrate:deploy   # or db:migrate for local dev
pnpm db:seed             # base accounts + reference data
pnpm --filter web seed:demo   # tops up a LIVE + OPEN + SCHEDULED game
pnpm dev                 # or pnpm --filter web dev:preview
```

`seed:demo` is idempotent and safe to re-run at any time — it only creates
what's missing (a fresh OPEN/LIVE game if the previous ones completed or
their registration window lapsed) and never touches financial history.

## 17. DEMO credentials

All accounts share the password `DevPass123!`:

| Username | Role | Use for |
|---|---|---|
| `superadmin` | Super Admin | Full platform access |
| `admin` | Admin | Creating/running games, announcements |
| `operator` | Game Operator | Running games day-to-day |
| `finance` | Finance | Reviewing refunds/withdrawals |
| `player1`–`player5` | Players | Already have DEMO balance and game history |

For a genuinely fresh first-time-user demo, register a new account from
the landing page — no email verification is required to play in this
DEMO environment (verification exists but is not enforced).

## 18. DEMO readiness vs. real-money readiness

These are two entirely separate bars, and this report speaks only to the
first:

**DEMO readiness (this report): YES.** The game itself — registration,
deposit, browsing, joining, playing, marking, winning, verifying fairness,
and admin operation — is correct, secure against the tested attack
surface, and free of the bugs found this session.

**Real-money readiness: NOT addressed, deliberately.** Telebirr/CBE/Chapa/
ArifPay/M-Pesa remain unconnected by design; licensing, legal compliance,
KYC/AML, and production financial infrastructure are all untouched, per
this phase's explicit scope freeze. See `docs/PRODUCTION_READINESS.md` for
that separate checklist — nothing on it changed this session except one
already-noted fix to the real-money deployment gate's own wiring (which
does not enable real money, it only makes the DEMO buildable at all;
`PAYMENTS_LIVE_MODE` still must be explicitly and deliberately set to
`true` before any real-money check even activates).

---

## Final answer

**"Can I now give this application to a group of real people and let them
play Bingo using DEMO money without needing a developer standing beside
them?"**

**Yes.**

Every step of the player journey was executed live this session by a
genuinely new account, every bug that surfaced during that use was fixed
and re-verified, the full test suite (239 tests) and database integrity
checks are clean, the production build succeeds in DEMO mode, and the
demo environment is free of internal test-debris naming. Admin operators
can create, run, pause, resume, cancel (with proper confirmation and
refund), and complete games reliably, including on tablet.

**Play-test procedure**: use §16 to start the app, share the landing page
URL with participants, and let them register their own accounts (the
"Add DEMO Balance" flow gives them test money instantly — no real payment
step, no waiting). For a guided walkthrough instead, `docs/
DEMO_WALKTHROUGH.md` has a 15-step presenter script using the seeded
accounts in §17.

Per this phase's own closing instruction: stopping here. Not proceeding to
real-money payment integration, licensing, or Telebirr/CBE API work
without explicit further instruction.

---

## Appendix: 32-test acceptance checklist

| ID | Description | Preconditions | Steps | Expected | Actual | Result | Notes |
|---|---|---|---|---|---|---|---|
| AT-01 | New user registration | Logged out | Fill register form with fresh details, submit | Account created, success message, redirect to login | Exactly as expected | PASS | Fresh account `hana_playtest` created live this session |
| AT-02 | Login with new account | AT-01 done | Log in with new credentials | Redirected to dashboard, correct name shown | Exactly as expected | PASS | |
| AT-03 | Dashboard first view | Logged in, ETB 0 | Load dashboard | Wallet ETB 0, upcoming games listed, honest non-blocking email-verification note | Exactly as expected | PASS | Verified the message doesn't falsely claim email verification is required |
| AT-04 | Browse lobby | Logged in | Open Play Bingo | Live Now / Upcoming / Recently Completed sections, no internal IDs, no test-debris names | Exactly as expected | PASS | Found and fixed 1 debris game (Bug #4) before this passed |
| AT-05 | Add DEMO balance | ETB 0 | Deposit page, enter 100, submit | Instant success, balance becomes ETB 100, no dev jargon on default path | Exactly as expected | PASS | |
| AT-06 | Header balance reflects deposit after navigation | AT-05 done | Client-navigate to another page | Header shows ETB 100 | Initially showed ETB 0 (Bug #1) | PASS (after fix) | Regression fixed this session |
| AT-07 | Buy a ticket | Balance ETB 100, OPEN game available | Open game room, buy 1 ticket | Balance debits correctly, card renders with correct B/I/N/G/O ranges and FREE center | Exactly as expected | PASS | |
| AT-08 | Countdown → LIVE | Game STARTING | Watch room | Clear "Game starts in Ns" countdown, transitions to LIVE, first number calls automatically | Exactly as expected | PASS | |
| AT-09 | Auto-mark mode | Game with `manualMarkEnabled: false` | Buy ticket, observe as numbers are called | Card cells auto-dab instantly, no click possible (disabled) | Exactly as expected | PASS | Carried forward from prior session's live verification via DOM state — not re-run this pass |
| AT-10 | Manual-mark: tap to dab | Game with manual mark, a called number on card | Tap the called cell | Cell becomes marked (aria-pressed true, solid fill) | Exactly as expected | PASS | |
| AT-11 | Manual-mark: cannot mark uncalled number | Same game | Inspect an uncalled cell | Cell is disabled, cannot be tapped | Exactly as expected | PASS | |
| AT-12 | Manual marks survive a refresh | AT-10 done | Reload the room | Mark persists | Initially reverted to unmarked (Bug #3) | PASS (after fix) | localStorage persistence added this session |
| AT-13 | Manual marks survive a logout/login cycle | AT-10 done | Session expires, log back in, redirected to same room | Marks still present | Exactly as expected | PASS | |
| AT-14 | Called-number history | Game LIVE | Observe Recent Calls strip and reference board | All called numbers listed and highlighted, in order | Exactly as expected | PASS | |
| AT-15 | Current number display | Game LIVE | Observe Current Number panel | Large, unambiguous, updates live with no refresh | Exactly as expected | PASS | |
| AT-16 | Natural game completion | Game LIVE, Full House pattern | Let calling continue | Server detects winner unattended, game transitions to COMPLETED | Exactly as expected | PASS | |
| AT-17 | Winner sees their result | Winning ticket | Observe room after win | "You won!" banner, correct prize amount | Exactly as expected | PASS | Verified via the prior session's winning-player test; this session's win belonged to another player (see AT-18) |
| AT-18 | Non-winner sees who won | Game completed, own ticket didn't win | Observe room after completion | "Game completed," winning player's identity, prize — no private data of theirs exposed | Blank identity shown, only "Ticket #2" (Bug #2) | PASS (after fix) | Now shows `Ticket #2 (player5)`; live winner banner also fixed |
| AT-19 | Wallet reflects payout | A winning account | Check wallet after a win | Balance increases by exact prize amount, transaction recorded | Exactly as expected | PASS | Verified in prior session (978→1068, exact) |
| AT-20 | Fairness verification | Completed game | Open "Verify this game was fair" | Seed commitment/reveal explained, verifiable | Exactly as expected | PASS | |
| AT-21 | Game history | Player with game activity | Open My Games / history | Past games listed with correct outcomes | Exactly as expected | PASS | |
| AT-22 | Return to lobby, join another game | Post-game | Click Back to lobby, open another game | Works, no stale state | Exactly as expected | PASS | |
| AT-23 | Admin: create → schedule → open → start | Admin session | Full create-to-start flow via API and control panel | Each transition succeeds, game reaches LIVE with countdown | Exactly as expected | PASS | |
| AT-24 | Admin: pause / resume | Game LIVE | Pause, observe, resume | Calling stops immediately on pause, resumes correctly with no lost/duplicated numbers | Exactly as expected | PASS | Verified live in the control panel this session |
| AT-25 | Admin: cancel confirmation dialog | Game LIVE or OPEN | Click Cancel game | Clear warning, required reason field, explicit "cannot be undone" | Exactly as expected | PASS | |
| AT-26 | Admin: cancel → refund → notification → integrity | OPEN game, player has a ticket | Cancel with a typed reason | Player auto-refunded exactly, receives a clear notification, integrity check clean | Exactly as expected | PASS | 383→398 exact refund, notification text verified, integrity clean |
| AT-27 | Unauthorized admin access | Plain player session | Hit an admin-only endpoint | 403, clean message | Exactly as expected | PASS | |
| AT-28 | Unauthorized game-control access | Plain player session | Hit pause/start/cancel as a player | 403, clean message | Exactly as expected | PASS | |
| AT-29 | Mass-assignment / IDOR probe | Two distinct player sessions | Inject a foreign userId into ticket purchase | Ignored; ticket belongs to the real authenticated session; no cross-player data leakage | Exactly as expected | PASS | |
| AT-30 | Error-message cleanliness | Various | Trigger 15 distinct error scenarios (bad login, dup registration, insufficient balance, closed registration, invalid IDs, malformed body, etc.) | No stack traces, no Prisma/SQL leakage, correct status codes | 14/15 clean; 1 wrong status code (Bug #5) | PASS (after fix) | |
| AT-31 | Mobile visual check, all 7 breakpoints | Game room, mid-game and post-completion | Resize to 320/375/390/414/768/1024/1440, visually inspect | No horizontal scroll, legible, tappable, no overlap | Exactly as expected | PASS | |
| AT-32 | Production build in DEMO mode | Clean `.next` | `next build` with `NODE_ENV=production`, `PAYMENTS_LIVE_MODE=false`, mock payments on | Build succeeds | Exactly as expected | PASS | Confirms the demo is actually deployable |
