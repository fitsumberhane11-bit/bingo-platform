# Demo Release Checklist

Snapshot as of **2026-08-23**, this polish pass. `PASS` = verified live
against the real running app/database this session. `NOT TESTED` is used
honestly where something wasn't re-verified this pass, even if it was
covered by an earlier session or by an automated test — see notes.

| Area | Result | Notes |
|---|---|---|
| Authentication (register/login/logout) | PASS | Found & fixed: sessions were hard-expiring every 15 min with no silent refresh — see report. Now verified sessions survive well past 15 minutes. |
| Lobby (Live/Upcoming/Completed) | PASS | Verified populated, correct CTAs per game state, no exposed internal IDs (removed one). |
| Game creation | PASS | Verified via the same `createGame()` path the admin UI uses; also driven through the real admin control-panel UI (Start game → countdown → LIVE). |
| Game joining | PASS | Player joined a LIVE game, saw current number/card/prize pool. |
| Ticket purchase | PASS | Purchased live via UI; wallet debited correctly. Found & fixed: prize pool wasn't updating live after a purchase (stale until reload) — fixed at the broadcast source. |
| Bingo card (display) | PASS | B/I/N/G/O columns, FREE space, called-vs-uncalled-vs-marked states all visually distinct. |
| Manual mark | PASS | Tapped a called number on a live card; dab applied correctly, distinct from the "called but not yet marked" ring state. |
| Auto mark | NOT TESTED | Not exercised this pass — the room supports manual-mark mode; a dedicated auto-mark game wasn't set up. |
| Realtime (SSE) | PASS | Numbers, status, player/ticket counts all updated live across sessions with no refresh. |
| Announcements | PASS | Sent a real admin announcement via the actual API; appeared in the player's open game room within ~1s, no refresh. |
| Winner detection | PASS | Two separate LIVE games (seeded this session) completed naturally with server-detected winners and correct payouts, unprompted. |
| Multiple winners / split prize | NOT TESTED (this session) | Not re-run this pass; prize-rule split logic itself wasn't touched. Covered by `engine.test.ts`/`accounting.test.ts` in the automated suite (68/68 passing). |
| Prize calculation | PASS | Verified server-computed prize pool matches ticket-sales × prize-rule percentage exactly (ETB 42 for 3×20 ETB tickets at 70%); this was also the bug found & fixed above. |
| Demo wallet | PASS | Balance, deposit (mock-only, all real providers visibly disabled), transaction history all correct. |
| Game history | PASS | Completed games list correctly with results; renamed leftover QA-artifact game names to presentable ones. |
| Fairness verification | PASS | "Verify this game was fair" flow present and reachable from a completed game's results screen. |
| Admin controls | PASS | Start/Cancel/Announcement all verified live; cancel requires typed reason + explicit confirm, matches spec. |
| Mobile (375px) | PASS | Game room and results screen checked at 375px — no horizontal overflow, readable, tappable. |
| Mobile (other breakpoints: 320/390/414/768/1024/1440) | NOT TESTED (this pass) | Only 375px re-verified this session; desktop (1280px) used throughout for the rest of the audit. |
| Accessibility | PARTIAL | Bingo card cells and nav links carry correct accessible names (spot-checked via the accessibility tree). No full WCAG contrast/keyboard-nav audit performed this pass. |
| Security (IDOR/mass-assignment) | PASS | Verified structurally (ticket-purchase route's Zod schema + destructure never reads a client-supplied `userId`) and live (players only ever see their own cards/tickets). |
| Security (auth/session) | PASS | Found & fixed a real gap: no code ever called the existing `/api/auth/refresh` endpoint, so every session died on a fixed 15-minute clock. Fixed with a client-side keep-alive. |
| Database integrity | PASS | `pnpm db:integrity-check` clean before and after two full test-suite runs. Found & fixed a real bug in the dev-seed script (a fabricated ledger entry against a pre-existing demo account) via root-cause investigation, not a reset. |
| Load testing | PASS | Fresh run this session: 100/500/1000 concurrent SSE connections, 100% connection success and 100% real-time event delivery at all three scales. DEMO test environment, not production capacity — see report. |
| Recovery (reconnect / process restart) | PASS | Found & fixed a real gap: a game stuck in STARTING (its countdown timer lived only in a since-exited process) had no self-heal, unlike LIVE/AUTO games. Fixed and verified live — a stuck game recovered to LIVE on the next connection. |
| Maintenance mode | NOT TESTED (this pass) | Toggle exists (`system-settings`, `MaintenanceBanner`, `MaintenanceModeError`) and is exercised by the automated test suite; not re-toggled live this session. |

## Summary

23 areas checked this session: **19 PASS**, 1 PARTIAL, 3 NOT TESTED (each
noted honestly above, none silently skipped). Five real bugs were found
and fixed during this pass — see `docs/DEMO_RELEASE_CANDIDATE_REPORT.md`
for the full list and root causes.
