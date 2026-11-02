#!/usr/bin/env bash
# Everyday commands for your tapeshelf. Run ./tapeshelf.sh without anything to see them.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
[ -f .env ] || { echo "Run this from the folder install.sh created (the one with .env)." >&2; exit 1; }

BASE_URL="${TAPESHELF_BASE_URL:-https://raw.githubusercontent.com/tapeshelf/tapeshelf/main}"
DOCKER=docker
if ! docker info > /dev/null 2>&1; then
  [ "$(uname -s)" = Darwin ] && { echo "Docker Desktop isn't running. Open it and try again." >&2; exit 1; }
  DOCKER="sudo docker"
fi
compose() { $DOCKER compose "$@"; }
setting() { sed -n "s/^$1=//p" .env | head -1 | sed "s/^'//; s/'$//"; }

help() {
  cat <<TEXT
tapeshelf

  ./tapeshelf.sh status           is everything running?
  ./tapeshelf.sh start            start it
  ./tapeshelf.sh stop             stop it (nothing is deleted)
  ./tapeshelf.sh restart          stop and start again
  ./tapeshelf.sh logs             what it is doing (Ctrl+C to leave)
  ./tapeshelf.sh update           back up the database, then install the newest version
  ./tapeshelf.sh backup           save everything, videos included, into backups/
  ./tapeshelf.sh restore FILE     put a backup back (replaces what is there now)
  ./tapeshelf.sh admin-password   set a new admin password
  ./tapeshelf.sh uninstall        delete tapeshelf and every video
TEXT
}

database_up() { compose up -d --wait --wait-timeout 120 postgres > /dev/null 2>&1; }
db_dump() { compose exec -T postgres pg_dump -U tapeshelf -d tapeshelf --clean --if-exists; }

case "${1:-help}" in
  status) compose ps ;;
  start) compose up -d --wait --wait-timeout 300 && echo "Running at $(setting PUBLIC_URL)" ;;
  stop) compose stop ;;
  restart) compose up -d --force-recreate --wait --wait-timeout 300 && echo "Running at $(setting PUBLIC_URL)" ;;
  logs) compose logs -f --tail 100 "${@:2}" ;;
  update)
    mkdir -p backups
    database_up
    file="backups/database-before-update-$(date +%Y%m%d-%H%M%S).sql.gz"
    (umask 077; db_dump | gzip > "$file")
    echo "Database saved to $file"
    # The newest compose file and this script; a failed download changes nothing.
    if curl -fsSL "$BASE_URL/infra/docker-compose.selfhost.yml" -o docker-compose.yml.new && curl -fsSL "$BASE_URL/tapeshelf.sh" -o tapeshelf.sh.new; then
      mv docker-compose.yml.new docker-compose.yml
      chmod +x tapeshelf.sh.new; mv tapeshelf.sh.new tapeshelf.sh
    else
      rm -f docker-compose.yml.new tapeshelf.sh.new
      echo "Couldn't check for a newer setup file; going on with the current one."
    fi
    compose pull --quiet
    compose up -d --wait --wait-timeout 300
    $DOCKER image prune -f > /dev/null
    echo "Updated. Running at $(setting PUBLIC_URL)"
    ;;
  backup)
    mkdir -p backups
    stamp="$(date +%Y%m%d-%H%M%S)"
    work="backups/.work-$stamp"
    (umask 077; mkdir -p "$work")
    # Whatever happens, the storage comes back and no copy of the keys stays lying around.
    trap 'compose start storage > /dev/null 2>&1 || true; rm -rf "$work"' EXIT
    database_up
    echo "Saving the database…"
    db_dump | gzip > "$work/database.sql.gz"
    cp .env "$work/env"
    echo "Saving the videos (this can take a while; meanwhile nobody can upload or watch)…"
    compose stop storage > /dev/null
    $DOCKER run --rm -v tapeshelf_storage-data:/data:ro -v "$PWD/$work:/out" alpine tar -C /data -czf /out/storage.tar.gz .
    compose start storage > /dev/null
    (umask 077; tar -C "$work" -cf "backups/tapeshelf-$stamp.tar" .)
    echo "Saved: backups/tapeshelf-$stamp.tar"
    echo "It holds your secret keys, so keep it somewhere safe, and off this machine."
    ;;
  restore)
    file="${2:-}"
    [ -f "$file" ] || { echo "Which backup? ./tapeshelf.sh restore backups/tapeshelf-….tar" >&2; exit 1; }
    read -r -p "This replaces everything here with the backup. Type yes to go on: " answer < /dev/tty
    [ "$answer" = yes ] || exit 0
    mkdir -p backups
    work="$(mktemp -d "$PWD/backups/.restore-XXXXXX")"
    trap 'rm -rf "$work"' EXIT
    tar -C "$work" -xf "$file"
    compose down
    # The database's own files hold its password, which comes back with the backup's settings.
    $DOCKER volume rm tapeshelf_pg-data tapeshelf_redis-data > /dev/null 2>&1 || true
    (umask 077; cp "$work/env" .env)
    $DOCKER run --rm -v tapeshelf_storage-data:/data -v "$work:/in:ro" alpine sh -c 'rm -rf /data/* /data/.[!.]* 2>/dev/null; tar -C /data -xzf /in/storage.tar.gz'
    compose up -d --wait --wait-timeout 120 postgres
    gunzip -c "$work/database.sql.gz" | compose exec -T postgres psql -q -U tapeshelf -d tapeshelf > /dev/null
    compose up -d --wait --wait-timeout 300
    echo "Restored. Running at $(setting PUBLIC_URL)"
    ;;
  admin-password)
    read -r -s -p "New admin password (at least 8 characters): " password < /dev/tty; echo
    [ "${#password}" -ge 8 ] || { echo "Too short." >&2; exit 1; }
    # One run with the new password; on ordinary starts the admin's password is left alone.
    export ADMIN_PASSWORD="$password"
    compose run --rm -T -e ADMIN_PASSWORD -e ADMIN_KEEP_PASSWORD=false migrate > /dev/null
    rm -f ADMIN-LOGIN.txt
    echo "Done."
    ;;
  uninstall)
    read -r -p "This deletes tapeshelf and EVERY VIDEO on it. Type delete to go on: " answer < /dev/tty
    [ "$answer" = delete ] || exit 0
    compose down -v
    echo "Deleted. To remove what is left: rm -rf \"$PWD\""
    ;;
  *) help ;;
esac
