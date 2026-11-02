#!/usr/bin/env bash
# One command for local development: containers (Postgres, Redis, S3 (RustFS), Mailpit), pending DB
# migrations, the generated API client, then the API, the worker and the Angular dev server
# together with prefixed logs. Ctrl+C stops everything; the containers keep running.
#
#   ./dev.sh          start everything
#   ./dev.sh --init   also create/verify S3 buckets (storage:init) and seed the admin account
#   ./dev.sh --down   stop the API/worker/web processes and the containers, then exit
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

COMPOSE="docker compose -f infra/docker-compose.yml"
bold=$'\e[1m'; dim=$'\e[2m'; reset=$'\e[0m'
say() { echo "${bold}==>${reset} $*"; }

ROOT="$(pwd)"
# PIDs listening on a port (api 3000, worker health 3001, web 4200).
listeners() { ss -ltnpH "( sport = :$1 )" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u; }
# The worker listens on no port in dev, so it is found by its command line instead. Playwright's
# stack runs from backend/dist-tools and is left alone.
worker_leftovers() {
  pgrep -f "$ROOT/backend/dist/worker\$|nest start --watch --entryFile worker\$" 2>/dev/null || true
}
# A previous run that was closed without Ctrl+C (terminal closed, SIGHUP) leaves `nest start --watch`,
# the worker and `ng serve` behind: they hold the ports, and a second worker would process the same
# jobs. Stop them, but only processes that run from this project (another app on a port is left alone).
stop_leftovers() {
  local found=0 pid pgid cwd
  for pid in $(for port in 3000 3001 4200; do listeners "$port"; done) $(worker_leftovers); do
    cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
    case "$cwd" in
      "$ROOT"|"$ROOT"/*) ;;
      *)
        # Only a port owner from another project stops the start; a foreign worker match is ignored.
        if listens "$pid"; then echo "a port we need is taken by another process (pid $pid, $cwd)" >&2; exit 1; fi
        continue ;;
    esac
    found=1
    pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
    kill -TERM -- "-$pgid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  done
  if [ "$found" = 1 ]; then
    say "stopped leftover api/worker/web processes from a previous run"
    # The worker waits for running jobs on SIGTERM; give it a moment, then insist.
    sleep 5
    for pid in $(for port in 3000 3001 4200; do listeners "$port"; done) $(worker_leftovers); do
      cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
      case "$cwd" in "$ROOT"|"$ROOT"/*) kill -KILL "$pid" 2>/dev/null || true ;; esac
    done
  fi
}
listens() { ss -ltnpH 2>/dev/null | grep -q "pid=$1,"; }

INIT=0
for arg in "$@"; do
  case "$arg" in
    --init) INIT=1 ;;
    --down) stop_leftovers; exec $COMPOSE down ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# --- prerequisites ---------------------------------------------------------
for tool in docker node npm ffmpeg ffprobe; do
  command -v "$tool" >/dev/null || { echo "missing: $tool" >&2; exit 1; }
done
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  say "backend/.env created from .env.example — check the secrets and S3 settings, then run again"
  exit 1
fi
[ -d node_modules ] || { say "npm install (root hooks)"; npm install --no-audit --no-fund; }
[ -d backend/node_modules ] || { say "npm install (backend)"; (cd backend && npm install --no-audit --no-fund); }
[ -d frontend/node_modules ] || { say "npm install (frontend)"; (cd frontend && npm install --no-audit --no-fund); }

# --- infrastructure --------------------------------------------------------
say "containers"
mkdir -p infra/data/rustfs # created by docker it would belong to root, and RustFS runs as the host user
$COMPOSE up -d --remove-orphans --wait postgres redis s3 mailpit pg-backup

say "database migrations"
(cd backend && npx prisma migrate deploy)

if [ "$INIT" = 1 ]; then
  say "storage buckets (storage:init)"
  (cd backend && npm run --silent storage:init)
  say "seed admin"
  (cd backend && npm run --silent seed)
fi

# The frontend client is generated from backend/openapi.json (git-ignored output).
if [ ! -f frontend/src/app/api/api.ts ] || [ backend/openapi.json -nt frontend/src/app/api/api.ts ]; then
  say "api:gen"
  (cd frontend && npm run --silent api:gen)
fi

# --- processes -------------------------------------------------------------
stop_leftovers

pids=()
start() {
  local name="$1" color="$2" dir="$3"; shift 3
  # Own session per process so that `nest start --watch` and its children die together.
  setsid bash -c 'cd "$1" && shift && exec "$@"' _ "$dir" "$@" \
    > >(sed -u "s/^/${color}[${name}]${reset} /") 2>&1 &
  pids+=("$!")
}
cleanup() {
  trap - INT TERM EXIT
  echo
  say "stopping"
  for p in "${pids[@]}"; do kill -TERM -- "-$p" 2>/dev/null || true; done
  wait 2>/dev/null || true
  # Belt and braces: whatever still holds our ports goes too (nest's watcher survives its child).
  stop_leftovers
}
trap cleanup INT TERM EXIT

start api    $'\e[36m' backend  npm run --silent dev
start worker $'\e[35m' backend  npm run --silent dev:worker
start web    $'\e[32m' frontend npm start --silent

echo
say "frontend  http://localhost:4200"
say "api       http://localhost:3000/api   ${dim}(Swagger: /api/docs)${reset}"
say "mailpit   http://localhost:8025        S3 console http://localhost:9101 (RustFS)"
say "Ctrl+C stops the API, worker and web server; ./dev.sh --down stops them and the containers"
echo

# If any of the three exits on its own, take the rest down too.
wait -n "${pids[@]}" || true
