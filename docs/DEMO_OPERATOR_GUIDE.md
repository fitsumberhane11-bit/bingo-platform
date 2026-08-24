# Operator Guide — Ethiopia Bingo (DEMO)

This guide is for whoever is running games during a DEMO play-test session.
Everything here operates on **DEMO money only**. This guide does not cover
— and you should not attempt — enabling real-money payments, Telebirr/CBE/
Chapa/ArifPay/M-Pesa, or withdrawals. Those are a separate future phase.

## 1. Log in

Go to the same site players use and log in with an Admin, Super Admin, or
Game Operator account (see `docs/DEMO_RELEASE_1.0.md` for the demo
credential list). You'll land in the admin console, distinct from the
player app — you can jump to the player view any time via **Player view**
in the top nav if you want to see what participants see.

## 2. Create a game

1. Open **Games** → **New game**.
2. Fill in:
   - **Name** — use a real, presentable name (e.g. "Friday Night Bingo"),
     not "Test Game" or similar.
   - **Ticket price**, **max players**, **max tickets per player**.
   - **Winning pattern** and **prize rule** — pick from the existing
     configured options.
   - **Calling mode** — Auto (server calls numbers on a timer) or Manual/
     Controlled (you tap "Call Next" yourself, still server-selected, you
     never choose the number).
   - **Card marking** — Manual (players tap to dab) or Auto (cards mark
     themselves).
   - **Schedule window** — when registration opens/closes and when the
     game starts.
3. Save. The game starts in **Draft**.

## 3. Configure tickets

Ticket price, capacity, and per-player limits are all set at creation time
(step 2). There's nothing further to configure before opening — the
system enforces these automatically (a player physically cannot buy past
the cap, buy for less than the price, or buy after registration closes).

## 4. Schedule a game

From the game's **Control panel**, use **Schedule** to move it out of
Draft. This locks in the registration window.

## 5. Open registration

Use **Open** to make the game visible and joinable in the player lobby
(status becomes **OPEN**). Players can now buy tickets.

## 6. Start a game

When you're ready (enough players have joined, or it's simply time), use
**Start**. The game enters a short **STARTING** countdown (visible to
everyone), then goes **LIVE** and number-calling begins automatically —
you don't need to do anything further in Auto mode.

## 7. Monitor players

The control panel shows live counts: players joined, tickets sold, prize
pool, and (in Full House/etc.) remaining balls. This updates in real time
as people buy tickets and as the game plays out.

## 8. Pause / Resume

Use **Pause** to stop number-calling mid-game (for a real disruption, a
break, or to check something) — no numbers are lost or repeated. Use
**Resume** to continue exactly where it left off.

## 9. Make announcements

From the control panel, **Send announcement** lets you broadcast a message
to everyone currently in the game room — it appears in their game room
within a second or two, no refresh needed. Use this for things like "5
minutes to full house" or "next game starting soon."

## 10. Monitor winners

Winners are detected and paid automatically by the server the moment a
card completes the winning pattern — you don't declare winners yourself.
The control panel and the player-facing results screen both show who won
and the prize amount live.

## 11. Cancel a game

Use **Cancel game** if something goes wrong (wrong configuration, needs to
be redone, etc.). You'll be asked to:

1. Confirm you understand this cannot be undone.
2. Type a reason (required).

What happens next depends on when you cancel:

- **Before the game goes LIVE** (Draft/Scheduled/Open/Starting): every
  ticket is refunded automatically and immediately.
- **While LIVE or Paused**: refunds are **not** automatic — flagged for
  Finance to review and process manually (see step 12). This is
  deliberate: an in-progress game has more at stake, so a real person
  reviews it rather than an automatic reversal.

Either way, affected players get a clear in-app notification explaining
what happened to their ticket.

## 12. Process DEMO refunds

For a game cancelled while LIVE/Paused, a Finance-role account reviews the
flagged refund and processes it manually from the admin **Finance**
section. This credits the player's DEMO balance — still no real money at
any point.

## 13. Complete a game

You don't need to do anything to complete a game — once a winning pattern
is achieved (or, depending on configuration, once all 75 numbers are
called with no winner), the server marks it **COMPLETED** automatically
and stops calling.

## 14. Review results

Open the game's **Control panel** any time after completion to see the
full call history, winner(s), and prize amounts — the same information
players see on their side, plus the admin-only audit trail.

## A note on the demo lobby

Keep the player-facing lobby looking like a real product: use real game
names, not "Test"/"QA"/"Debug"/"Load Test"/"Audit". If you create games
for your own testing that you don't want players to see, cancel them
before a play-test session starts — cancelled games never appear in the
player lobby.

## Re-seeding a clean environment

If you need to reset to a clean starting lobby (one LIVE game, one OPEN
game, one SCHEDULED game) without touching any financial history, run:

```bash
pnpm --filter web seed:demo
```

This is safe to re-run any time — it only tops up what's missing.
