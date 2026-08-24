# Demo Release Checklist

Snapshot as of **2026-08-24**, the "finish the game" polish pass. `PASS` =
verified live against the real running app/database this session. `NOT
TESTED` is used honestly where something wasn't verified this pass, even if
automated tests cover it — see notes. This supersedes the 2026-08-23
snapshot below it in git history; see `docs/GAME_POLISH_REPORT.md` for the
full narrative report from this pass.

| Area | Result | Notes |
|---|---|---|
| Registration → first play (new user, no prior account) | PASS | Registered a genuinely new account end to end: register → dashboard → deposit → lobby → buy ticket → bingo card. Found & fixed 3 real bugs along the way — see report. |
| Landing page copy honesty | PASS | Removed a false "Join thousands of players" claim; fixed a registration success message that falsely implied email verification was required to play. |
| DEMO deposit flow | PASS | Rebuilt: was a 2-step flow exposing a raw Payment ID and a "Development Payment Simulator" panel to every user by default. Now instant ("Add DEMO Balance"), with manual outcome-simulation controls collapsed behind a "Show testing controls" disclosure. Real providers relabeled "Coming soon" instead of "Currently unavailable." |
| Lobby / ticket-purchase CTA correctness | PASS | Found & fixed a real bug: an OPEN game whose registration window had actually lapsed still showed an enabled "Buy Ticket" CTA in both the lobby card and the room, which failed with a server error on click. Fixed client-side gating in both places plus the seed script's own stale-data blind spot. |
| Auto-mark mode | PASS | Not tested in the prior pass. Verified live this session via a real ticket + real calls: cells auto-dab the instant a number is called, all cells are non-interactive (`disabled`) in this mode, confirmed via each cell's `aria-pressed`/`aria-label`/`disabled` state directly. |
| Manual mark | PASS | Re-confirmed (dab-on-tap, correctly excluded from auto-mark games). |
| Mobile — 320px | PASS | Game room + winner/completion screen: no horizontal overflow, current number stays huge and legible, no overlapping controls. |
| Mobile — 375px | PASS | Re-confirmed. |
| Mobile — 768px (tablet) | PASS | No overflow, layout holds. |
| Mobile — 390/414/1024/1440px | NOT TESTED (this pass) | Not re-verified this session; 320/375/768 give strong confidence the responsive breakpoints in between and above hold, but not directly measured. |
| Gameplay engine correctness (16-point invariant audit) | PASS | Dedicated audit against the real engine code: state machine exhaustiveness, no double-start, no duplicate calls, correct B/I/N/G/O ranges, AUTO/CONTROLLED number-selection is 100% server-side, ticket capacity/atomicity, no-double-payout, multi-winner handling, pattern evaluation, STARTING self-heal, PAUSE/RESUME, CANCEL, COMPLETED/CANCELLED immutability, single prize-pool implementation. 14/16 already had real regression tests; added tests for the 2 that didn't (pause/resume cycle, COMPLETED-game immutability). No production bugs found. |
| Admin control panel (PAUSE/RESUME/CANCEL) | PASS | Driven live in the browser (not just API): Pause → Resume → Cancel-confirmation dialog all verified, including the exact "this cannot be undone" + required-reason UX the spec asked for. |
| Security — mass assignment / IDOR / RBAC | PASS | Live-probed this session: ticket-purchase and wallet endpoints ignore any client-supplied user-identifying field (userId always comes from the session); game-control endpoints return 403 for a non-privileged player; the CONTROLLED calling endpoint takes no ball-number input at all — structurally impossible for an operator to pick a number. |
| Real-money deployment safety gate | FIXED | Found a real gap: the gate meant to block real money without an explicit go-live decision was keyed on `NODE_ENV=production`, which is also required for any ordinary optimized deployment of the DEMO app itself — as written, `next build` could never succeed for the demo's own real deployment shape. Rewired onto the already-defined-but-unused `PAYMENTS_LIVE_MODE` flag. Verified live: `next build` now succeeds in DEMO mode; a dedicated regression test proves the demo-mode build path and that `PAYMENTS_LIVE_MODE=true` still refuses to boot with mock payments. |
| Accessibility — contrast | PASS (meaningful subset) | Found and fixed real sub-threshold text: every "uppercase tracking-wide" section label site-wide (WINNERS, CURRENT NUMBER, stat-card labels, etc. — 14 files) was ~2.5:1 against its background, well under WCAG AA's 4.5:1; bumped to a passing shade. Not a full WCAG audit — spot-checked, not exhaustive. |
| Accessibility — keyboard focus | PASS | Tab-key navigation produces a clearly visible 2px solid outline; verified via computed styles, not just visual inspection. |
| Accessibility — form labels | PASS | Verified programmatically: every login/register input has a real `<label for>` association, not just placeholder text. |
| Accessibility — bingo card semantics | PASS | Re-confirmed: every cell carries a correct `aria-label` (`"B-3, marked"`, `"called, not yet marked"`, `"Free space"`) and `aria-pressed` state. |
| Demo debris / cleanup | PASS | Removed a stray zero-footprint "Load Test Session" game that had been left sitting in the live lobby from a previous load test. No `console.log`, `TODO`/`FIXME`, or stray `alert()`/`confirm()` found in app code this pass. |
| Database integrity | PASS | Clean before, during (after each fix), and after this session — checked 6 separate times, including after a genuine new player's full deposit → purchase → (cancelled test game) → refund-pending cycle. |
| Multiplayer (real, 5-player lifecycle) | PASS | Full create → join → purchase → start → LIVE → AUTO-call → COMPLETED → payout lifecycle with 5 independent player sessions; winner's wallet balance verified directly (978→1068, exactly the ETB 90 prize). `db:integrity-check` clean after. Full timeline in `docs/GAME_POLISH_REPORT.md`. |
| Realtime load (100 / 500 / 1,000 concurrent) | PASS | Re-run fresh this session: 100% connection success and 100% live event delivery at all three scales, zero errors. DEMO test environment, not production capacity — see `docs/GAME_POLISH_REPORT.md` for latency percentiles. |
| Full test suite | PASS | 236/236 tests passing (70 web, 146 game-core, 15 shared-types, 5 payments) — up from 226 in the prior pass (10 new tests: 2 from the engine audit, 6 from the env-gate fix/regression, 2 incidental). |
| Production build | PASS | Clean in the platform's actual DEMO deployment shape (`NODE_ENV=production`, `PAYMENTS_LIVE_MODE=false`, mock payments on) — previously this exact combination could not build at all; see the safety-gate fix above. |

## Summary

26 areas checked this session. Real bugs found and fixed: the stale
registration-window CTA (the most player-visible one — a broken "Buy
Ticket" button), the deposit-flow friction/technical-jargon exposure, the
false "verify email to play" claim, the false "thousands of players" claim,
low-contrast section labels, and — the most structurally significant — a
real-money safety gate that would have made it impossible to ever deploy
the DEMO platform with an optimized production build. None of these were
found by re-reading old reports; all were found by actually using the
running app as a new user and by reading the code the gate itself runs.
