#!/bin/bash
# Keeps the local dev stack (embedded Postgres, embedded Redis, Next.js dev
# server) alive. Each piece is started detached (nohup + disown) so it
# survives this shell/session ending, and the web server specifically is
# wrapped in a restart-on-crash loop so a crash doesn't silently take the
# app down until someone notices and manually restarts it.
#
# Usage: ./.claude/dev-supervisor.sh
# Safe to re-run any time — every step first checks whether its port is
# already listening and skips if so.

set -u
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
LOG_DIR="$ROOT/.claude/logs"
mkdir -p "$LOG_DIR"

port_listening() {
  lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

if port_listening 55432; then
  echo "postgres already listening on 55432"
else
  echo "starting embedded postgres..."
  (cd "$ROOT/packages/db" && nohup node scripts/dev-postgres.mjs >"$LOG_DIR/postgres.log" 2>&1 &)
  sleep 2
fi

if port_listening 57379; then
  echo "redis already listening on 57379"
else
  echo "starting embedded redis..."
  (cd "$ROOT/apps/web" && DEV_REDIS_PORT=57379 nohup node scripts/dev-redis.mjs >"$LOG_DIR/redis.log" 2>&1 &)
  sleep 2
fi

if port_listening 3010; then
  echo "web dev server already listening on 3010"
else
  echo "starting web dev server (with auto-restart)..."
  nohup bash -c '
    cd "'"$ROOT"'/apps/web"
    while true; do
      echo "[supervisor] starting next dev on :3010 — $(date)" >> "'"$LOG_DIR"'/web.log"
      pnpm dev:preview >> "'"$LOG_DIR"'/web.log" 2>&1
      echo "[supervisor] next dev exited (code $?) — restarting in 2s — $(date)" >> "'"$LOG_DIR"'/web.log"
      sleep 2
    done
  ' >"$LOG_DIR/web-supervisor.log" 2>&1 &
  disown
  sleep 3
fi

echo "done. logs in $LOG_DIR"
