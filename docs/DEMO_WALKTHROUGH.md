# Demo Walkthrough

A step-by-step script for demonstrating Ethiopia Bingo to someone who has
never seen it before — a partner, investor, or client. Everything below
uses **DEMO balance only**; the yellow "Test Game — No Real Money" banner
is visible on every page.

Run `pnpm dev` (or open the app already running on your dev server) before
starting, and make sure the database has demo data:

```bash
pnpm db:seed
pnpm --filter web seed:demo
```

`seed:demo` is safe to re-run at any time — it tops up the lobby with a
fresh LIVE game and a fresh OPEN game if the previous ones already
completed, without touching anything else.

## Cast of accounts

All accounts share the password `DevPass123!`.

| Username     | Role          | Use for                              |
|--------------|---------------|---------------------------------------|
| `admin`      | Admin         | Running the game, sending announcements |
| `player1`    | Player        | The "presenter's" own player account   |
| `player2`–`player5` | Player | Already have DEMO balance and some game history |

## The walkthrough

**Step 1 — Show the landing page (logged out)**
Open the site root. Point out the yellow DEMO banner and the "18+, play
responsibly" line. This is a demo product — say so before anyone asks.

**Step 2 — Log in as Player 1**
Log in with `player1` / `DevPass123!`. Land on the dashboard: DEMO wallet
balance, live/upcoming game counts, recent activity feed.

**Step 3 — Show the DEMO wallet**
Open **Wallet**. Point out the current balance and transaction history.
Open **Deposit** — show that Telebirr/CBE/Chapa/ArifPay/M-Pesa are all
visibly marked "Coming soon — after the demo phase" and only **Add DEMO
Balance** can be selected, crediting instantly with no real payment step.
This is deliberate: the product cannot be mistaken for one that's already
handling real money, while still proving out the same create → confirm →
ledger path a real provider will use later (a "Show testing controls"
link on the confirmation screen exposes the pending/failed/cancelled/
expired outcomes for anyone who wants to see that path too).

**Step 4 — Open the lobby**
Go to **Play Bingo**. Show the three sections: **Live Now** (a game
already running), **Upcoming** (open for tickets or scheduled), and
**Recently Completed** (real results with real winners, from earlier
demo rounds).

**Step 5 — Join the live game**
Click into the Live Now game. Point out, in this order, what the player
sees first: the current number (large, impossible to miss), the recent
calls strip, their own card, game status, and the prize pool — all
visible without scrolling on desktop.

**Step 6 — Open a second session as Admin**
In a second browser (or a private/incognito window — see the note on
cookie isolation below), log in as `admin` and go to **Games**. Open the
**Upcoming** game's control panel.

**Step 7 — Start the game live**
Click **Start game**. Narrate the countdown. Watch it flip to LIVE and
start calling numbers automatically — no further admin action needed.

**Step 8 — Buy a ticket as the player**
Back in the player session, buy a ticket for the now-live game if you
haven't already. Show the wallet balance and prize pool both update
immediately.

**Step 9 — Show a realtime number call**
Numbers call automatically every few seconds. Point out that both browser
sessions see the same number, at the same time, with no refresh.

**Step 10 — Send an announcement**
From the admin control panel, use **Send announcement**. Show it appear
in the player's game room within a second or two.

**Step 11 — Let the game complete naturally**
Either wait for a real winner, or open a second/third player session and
buy tickets there too to make a win more likely soon. When someone hits
the winning pattern, the server — not the browser — decides it.

**Step 12 — Show the winner experience**
For the winner: the win banner, the winning pattern, and the prize
amount. For everyone else: "Game completed," who won, and the prize —
without exposing anything private about the winner.

**Step 13 — Show the DEMO wallet update**
Back in Wallet or Dashboard, show the winner's payout landed immediately
and is reflected in their balance and transaction history.

**Step 14 — Show fairness verification**
From the completed game's results screen, open **Verify this game was
fair**. Explain the commit-then-reveal model in one sentence: the number
sequence was cryptographically committed before the game started, so it
couldn't have been picked to favor or disfavor anyone — and now that the
game is over, the seed is revealed so anyone can check it themselves.

**Step 15 — Show the admin results view**
Back in the admin control panel (now COMPLETED), show the same game from
the operator's side: full called-number history, winner, and event log.

## A note on multi-account demos

If you're demoing with **one browser**, logging into a second account in
a second tab will silently replace the session in every other tab of that
same browser (they share one cookie jar). Use a second browser, or a
private/incognito window, for a genuinely simultaneous two-account demo —
this is a browser-tooling limitation, not a product bug (players on real,
separate devices are never affected).

## If something looks empty

If the lobby ever opens with "No games are live right now," re-run:

```bash
pnpm --filter web seed:demo
```

It only creates what's missing — a completed demo history is never
touched.
