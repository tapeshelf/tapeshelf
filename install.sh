#!/usr/bin/env bash
# Installs tapeshelf on this computer or server. It asks a few questions and does the rest.
#
#   curl -fsSL https://raw.githubusercontent.com/tapeshelf/tapeshelf/main/install.sh | bash
#
# Without questions:  install.sh --local   or   install.sh --domain video.example.com --email you@example.com
# Port 80 already used by your own nginx, Traefik or similar:  install.sh --behind-proxy video.example.com
# Other options:      --dir PATH (where it lives, ~/tapeshelf by default), --yes (accept every offer)
set -euo pipefail

BASE_URL="${TAPESHELF_BASE_URL:-https://raw.githubusercontent.com/tapeshelf/tapeshelf/main}"
DIR="${HOME}/tapeshelf"
MODE=""
DOMAIN=""
ADMIN_EMAIL=""
ASSUME_YES=""

while [ $# -gt 0 ]; do
  case "$1" in
    --local) MODE=local ;;
    --domain) MODE=domain; DOMAIN="${2:?--domain needs a name}"; shift ;;
    --behind-proxy) MODE=proxy; DOMAIN="${2:?--behind-proxy needs your domain}"; shift ;;
    --email) ADMIN_EMAIL="${2:?--email needs an address}"; shift ;;
    --dir) DIR="${2:?--dir needs a path}"; shift ;;
    --yes) ASSUME_YES=1 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

# ---- how it talks ----------------------------------------------------------------------------------
if [ -t 1 ]; then BOLD=$'\e[1m'; DIM=$'\e[2m'; GREEN=$'\e[32m'; RED=$'\e[31m'; OFF=$'\e[0m'
else BOLD=""; DIM=""; GREEN=""; RED=""; OFF=""; fi
RU=""; case "${LC_ALL:-${LANG:-}}" in ru*|uk*) RU=1 ;; esac
# t "English" "Русский"
t() { if [ -n "$RU" ]; then printf '%s' "$2"; else printf '%s' "$1"; fi; }
say() { printf '%s\n' "$*"; }
step() { printf '\n%s%s%s\n' "$BOLD" "$*" "$OFF"; }
ok() { printf '%s✓%s %s\n' "$GREEN" "$OFF" "$*"; }
die() { printf '\n%s%s%s\n' "$RED" "$*" "$OFF" >&2; exit 1; }

# Answers come from the keyboard even when this script arrives through a pipe.
INPUT=/dev/tty
[ -r /dev/tty ] && { : < /dev/tty; } 2>/dev/null || INPUT=""
ask() { # ask "question" [default]
  local answer=""
  if [ -z "$INPUT" ]; then printf '%s' "${2:-}"; return; fi
  printf '%s%s%s ' "$BOLD" "$1" "$OFF" > /dev/tty
  [ -n "${2:-}" ] && printf '%s[%s]%s ' "$DIM" "$2" "$OFF" > /dev/tty
  IFS= read -r answer < "$INPUT" || true
  printf '%s' "${answer:-${2:-}}"
}
yes_no() { # yes_no "question" y|n
  [ -n "$ASSUME_YES" ] && return 0
  [ -z "$INPUT" ] && [ "$2" = n ] && return 1
  [ -z "$INPUT" ] && return 0
  local hint="y/N"; [ "$2" = y ] && hint="Y/n"
  case "$(ask "$1 ($hint)")" in
    [yYдД]*) return 0 ;;
    "") [ "$2" = y ] ;;
    *) return 1 ;;
  esac
}
# head closes the pipe once it has enough, which pipefail would take for a failure.
# Writes one line of .env so that nothing in the value gets interpreted, whatever it holds.
env_line() { printf "%s='%s'\n" "$1" "$(printf '%s' "$2" | sed "s/'/\\\\'/g")"; }
sudo_note() {
  [ "$(id -u)" -eq 0 ] && return 0
  sudo -n true 2> /dev/null && return 0
  say "$(t "Your computer will ask for your password now. Nothing appears on the screen while you type; that's normal." "Сейчас компьютер спросит ваш пароль. При вводе на экране ничего не появляется, так и должно быть.")"
  sudo -v
}
random() { LC_ALL=C tr -dc "$2" < /dev/urandom 2> /dev/null | head -c "$1" || true; }
fetch() { curl -fsSL --retry 3 "$BASE_URL/$1" -o "$2"; }

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
free_port() { local p="$1"; while port_busy "$p"; do p=$((p + 1)); done; printf '%s' "$p"; }

# ---- start -------------------------------------------------------------------------------------------
printf '\n%s%s%s\n' "$BOLD" "$(t "Let's set up tapeshelf. It takes about five minutes." "Ставим tapeshelf. Это займёт минут пять.")" "$OFF"

RESUME=""
if [ -f "$DIR/.installed" ]; then
  say "$(t "It is already installed in $DIR." "Он уже установлен в $DIR.")"
  say "$(t "To update it: cd $DIR && ./tapeshelf.sh update" "Чтобы обновить: cd $DIR && ./tapeshelf.sh update")"
  exit 0
elif [ -f "$DIR/.env" ]; then
  # An earlier run stopped halfway. Its passwords and keys stay; carry on from there.
  RESUME=1
  say "$(t "Picking up where the last attempt stopped." "Продолжаю с места, где остановилась прошлая попытка.")"
fi

command -v curl > /dev/null || die "$(t "curl is missing. Install it (on Ubuntu: sudo apt install curl) and run this again." "Не хватает curl. Поставьте его (в Ubuntu: sudo apt install curl) и запустите снова.")"

# ---- is this machine big enough --------------------------------------------------------------------
OS="$(uname -s)"
if [ "$OS" = Linux ] && [ -r /proc/meminfo ]; then
  mem_mb=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo) / 1024 ))
  [ "$mem_mb" -lt 1800 ] && say "$(t "Note: this machine has ${mem_mb} MB of memory. 2 GB or more is recommended; videos will process slowly." "Важно: здесь ${mem_mb} МБ памяти. Лучше от 2 ГБ, иначе видео будут обрабатываться медленно.")"
fi
mkdir -p "$DIR"
disk_gb=$(( $(df -Pk "$DIR" | awk 'NR==2 {print $4}') / 1024 / 1024 ))
[ "$disk_gb" -lt 10 ] && say "$(t "Note: only ${disk_gb} GB of disk is free here, and your videos will be stored on this disk." "Важно: на диске свободно всего ${disk_gb} ГБ, а видео будут храниться здесь.")"

# ---- Docker ----------------------------------------------------------------------------------------
step "$(t "Docker (the program that runs tapeshelf)" "Docker (программа, в которой работает tapeshelf)")"
DOCKER=docker
if ! command -v docker > /dev/null; then
  if [ "$OS" = Darwin ]; then
    die "$(t "Install Docker Desktop from https://www.docker.com/products/docker-desktop/, open it once, then run this command again." "Поставьте Docker Desktop с https://www.docker.com/products/docker-desktop/, откройте его один раз и запустите эту команду снова.")"
  fi
  [ "$OS" = Linux ] || die "$(t "This script runs on Linux and macOS. On Windows, use it inside WSL." "Скрипт работает на Linux и macOS. В Windows запускайте его в WSL.")"
  yes_no "$(t "Docker isn't installed. Install it now?" "Docker не установлен. Поставить сейчас?")" y || die "$(t "tapeshelf can't run without Docker." "Без Docker tapeshelf не запустится.")"
  SUDO=""; if [ "$(id -u)" -ne 0 ]; then SUDO=sudo; sudo_note; fi
  curl -fsSL https://get.docker.com | $SUDO sh || die "$(t "Docker couldn't be installed on this system. Ubuntu or Debian are the easiest choices; see https://docs.docker.com/engine/install/" "Не удалось поставить Docker на эту систему. Проще всего с Ubuntu или Debian; см. https://docs.docker.com/engine/install/")"
  $SUDO systemctl enable --now docker 2> /dev/null || true
fi
if ! docker info > /dev/null 2>&1; then
  [ "$OS" = Darwin ] && die "$(t "Docker Desktop isn't running. Open it, wait until it says it's running, then run this command again." "Docker Desktop не запущен. Откройте его, дождитесь запуска и повторите эту команду.")"
  sudo_note
  if sudo docker info > /dev/null 2>&1; then DOCKER="sudo docker"
  else
    sudo systemctl start docker 2> /dev/null || true
    sudo docker info > /dev/null 2>&1 || die "$(t "Docker is installed but isn't running. Restart this computer and run this command again." "Docker установлен, но не запущен. Перезагрузите компьютер и повторите эту команду.")"
    DOCKER="sudo docker"
  fi
fi
if ! $DOCKER compose version > /dev/null 2>&1; then
  [ "$OS" = Linux ] || die "$(t "Docker is too old. Update Docker Desktop and run this command again." "Docker слишком старый. Обновите Docker Desktop и повторите эту команду.")"
  yes_no "$(t "Your Docker is too old for this. Update it now?" "Ваш Docker для этого слишком старый. Обновить сейчас?")" y || die "$(t "tapeshelf needs a newer Docker." "tapeshelf нужен более новый Docker.")"
  sudo_note
  curl -fsSL https://get.docker.com | sudo sh
  $DOCKER compose version > /dev/null 2>&1 || die "$(t "Docker still can't run this. See https://docs.docker.com/engine/install/" "Docker всё ещё не может это запустить. См. https://docs.docker.com/engine/install/")"
fi
ok "$(t "Docker is ready" "Docker готов")"

# ---- where people will open it ----------------------------------------------------------------------
setting() { sed -n "s/^$1=//p" "$DIR/.env" | head -1 | sed "s/^'//; s/'$//"; }
if [ -n "$RESUME" ]; then
  PUBLIC_URL="$(setting PUBLIC_URL)"; HTTP_PORT="$(setting HTTP_PORT)"; ADMIN_EMAIL="$(setting ADMIN_EMAIL)"; ADMIN_PASSWORD="$(setting ADMIN_PASSWORD)"
  case "$PUBLIC_URL:$(setting SITE_ADDRESS)" in
    https:*:80) MODE=proxy ;;
    https:*) MODE=domain; DOMAIN="${PUBLIC_URL#https://}" ;;
    *) MODE=local ;;
  esac
fi
if [ -z "$RESUME" ]; then
step "$(t "Where will people open it?" "Откуда его будут открывать?")"
if [ -z "$MODE" ]; then
  default=1
  if [ -n "${SSH_CONNECTION:-}" ]; then
    default=2
    say "$(t "You're connected to a remote server, so you probably want 2." "Вы подключены к удалённому серверу, так что вам, скорее всего, нужен вариант 2.")"
  fi
  say "  1) $(t "Just this computer, to try it out" "Только с этого компьютера, чтобы попробовать")"
  say "  2) $(t "On the internet, at my own domain (needs a server and a domain name)" "Из интернета, на моём домене (нужны сервер и доменное имя)")"
  case "$(ask "$(t "Type 1 or 2:" "Введите 1 или 2:")" "$default")" in 2*) MODE=domain ;; *) MODE=local ;; esac
fi

BIND_ADDRESS=0.0.0.0
clean_domain() { local d="${1// /}"; d="${d#http://}"; d="${d#https://}"; printf '%s' "${d%%/*}"; }
DOMAIN="$(clean_domain "$DOMAIN")"
if [ "$MODE" = domain ]; then
  while [ -z "$DOMAIN" ]; do
    DOMAIN="$(clean_domain "$(ask "$(t "Your domain, for example video.example.com:" "Ваш домен, например video.example.com:")")")"
    [ -z "$INPUT" ] && [ -z "$DOMAIN" ] && die "$(t "Pass the domain: --domain video.example.com" "Укажите домен: --domain video.example.com")"
  done
  # The certificate only works once the domain points here.
  MY_IP="$(curl -4 -fsS --max-time 8 https://api.ipify.org 2> /dev/null || true)"
  while [ -n "$MY_IP" ]; do
    command -v getent > /dev/null || break
    DNS_IP="$(getent ahostsv4 "$DOMAIN" 2> /dev/null | awk 'NR==1 {print $1}' || true)"
    [ "$DNS_IP" = "$MY_IP" ] && { ok "$(t "$DOMAIN points to this server" "$DOMAIN указывает на этот сервер")"; break; }
    say ""
    say "$(t "$DOMAIN doesn't point to this server yet. Where you bought the domain, add this record:" "$DOMAIN пока не указывает на этот сервер. Там, где вы купили домен, добавьте такую запись:")"
    say ""
    # example.com is @; video.example.com is video; a.b.example.com is a.b.
    dots="${DOMAIN//[^.]/}"
    if [ "${#dots}" -le 1 ]; then record=@; else record="${DOMAIN%.*.*}"; fi
    say "    $(t "Type" "Тип"): A    $(t "Name" "Имя"): ${record}    $(t "Value" "Значение"): ${BOLD}${MY_IP}${OFF}"
    say ""
    say "$(t "If you use Cloudflare, turn the orange cloud off for this record." "Если у вас Cloudflare, выключите оранжевое облако у этой записи.")"
    [ -z "$INPUT" ] && break
    say "$(t "It can take a few minutes to start working." "Запись может заработать не сразу, через несколько минут.")"
    case "$(ask "$(t "Press Enter to check again, or type skip to go on anyway:" "Нажмите Enter, чтобы проверить снова, или введите skip, чтобы продолжить:")")" in skip*) break ;; esac
  done
  for p in 80 443; do
    if port_busy "$p"; then
      say "$(t "Port $p is already used by another program on this server, usually a web server like nginx." "Порт $p уже занят другой программой на этом сервере, обычно веб-сервером вроде nginx.")"
      if yes_no "$(t "Keep that program and put tapeshelf behind it?" "Оставить её и поставить tapeshelf за ней?")" y; then
        MODE=proxy
      else
        die "$(t "Stop that program and run this command again." "Остановите эту программу и запустите команду снова.")"
      fi
      break
    fi
  done
fi
if [ "$MODE" = domain ]; then
  SITE_ADDRESS="$DOMAIN"; PUBLIC_URL="https://$DOMAIN"; HTTP_PORT=80; HTTPS_PORT=443
elif [ "$MODE" = proxy ]; then
  HTTP_PORT="$(free_port 8080)"; HTTPS_PORT="$(free_port 8443)"
  SITE_ADDRESS=":80"; PUBLIC_URL="https://$DOMAIN"; BIND_ADDRESS=127.0.0.1
else
  HTTP_PORT="$(free_port 8080)"; HTTPS_PORT="$(free_port 8443)"
  SITE_ADDRESS=":80"; PUBLIC_URL="http://localhost:$HTTP_PORT"; BIND_ADDRESS=127.0.0.1
fi

# ---- email -------------------------------------------------------------------------------------------
EMAIL_DISABLED=true; SMTP_HOST=""; SMTP_PORT=587; SMTP_SECURE=false; SMTP_USER=""; SMTP_PASS=""; SMTP_FROM=""
if [ "$MODE" != local ] && [ -n "$INPUT" ] && [ -z "$ASSUME_YES" ]; then
  step "$(t "Email (optional)" "Почта (необязательно)")"
  say "$(t "With an email account, tapeshelf can confirm addresses, reset forgotten passwords and send notifications." "С почтовым аккаунтом tapeshelf сможет подтверждать адреса, сбрасывать забытые пароли и присылать уведомления.")"
  say "$(t "Without one everything else works, and you can add it later." "Без него работает всё остальное, а добавить его можно позже.")"
  if yes_no "$(t "Do you have a mail account for sending (SMTP, from Brevo, Mailgun or Gmail)? If you don't know what this means, press Enter." "У вас есть почтовый аккаунт для отправки (SMTP, например Brevo, Mailgun или Gmail)? Если не знаете, что это, нажмите Enter.")" n; then
    EMAIL_DISABLED=false
    SMTP_HOST="$(ask "$(t "SMTP server, for example smtp.example.com:" "SMTP-сервер, например smtp.example.com:")")"
    SMTP_PORT="$(ask "$(t "Port:" "Порт:")" 465)"
    [ "$SMTP_PORT" = 465 ] && SMTP_SECURE=true
    SMTP_USER="$(ask "$(t "Login:" "Логин:")")"
    printf '%s%s%s ' "$BOLD" "$(t "Password (nothing appears as you type):" "Пароль (при вводе ничего не видно):")" "$OFF" > /dev/tty
    IFS= read -r -s SMTP_PASS < "$INPUT" || true
    printf '\n' > /dev/tty
    SMTP_FROM="$(ask "$(t "Send from:" "Адрес отправителя:")" "tapeshelf <no-reply@$DOMAIN>")"
  fi
fi

# ---- settings and secrets ---------------------------------------------------------------------------
step "$(t "Preparing" "Готовлю всё")"
[ -z "$ADMIN_EMAIL" ] && { if [ "$MODE" != local ]; then ADMIN_EMAIL="admin@$DOMAIN"; else ADMIN_EMAIL="admin@example.com"; fi; }
ADMIN_PASSWORD="$(random 20 'a-zA-Z0-9')"
ALNUM='a-zA-Z0-9'
(
  umask 077
  {
    echo "# tapeshelf settings. Keep a copy somewhere safe: without KEK, your videos can't be played again."
    env_line PUBLIC_URL "$PUBLIC_URL"
    env_line SITE_ADDRESS "$SITE_ADDRESS"
    env_line BIND_ADDRESS "$BIND_ADDRESS"
    env_line HTTP_PORT "$HTTP_PORT"
    env_line HTTPS_PORT "$HTTPS_PORT"
    [ "$MODE" = proxy ] && env_line TRUSTED_PROXIES private_ranges
    [ "$MODE" != local ] && env_line INITIAL_REGISTRATION closed
    env_line TAPESHELF_IMAGES "${TAPESHELF_IMAGES:-ghcr.io/tapeshelf/tapeshelf}"
    env_line TAPESHELF_VERSION "${TAPESHELF_VERSION:-latest}"
    env_line ADMIN_EMAIL "$ADMIN_EMAIL"
    env_line ADMIN_USERNAME admin
    env_line ADMIN_PASSWORD "$ADMIN_PASSWORD"
    env_line POSTGRES_PASSWORD "$(random 32 "$ALNUM")"
    env_line COOKIE_SECRET "$(random 48 "$ALNUM")"
    env_line JWT_SECRET "$(random 48 "$ALNUM")"
    env_line KEK "$(random 64 'a-f0-9')"
    env_line STORAGE_ACCESS_KEY "$(random 20 'A-Z0-9')"
    env_line STORAGE_SECRET_KEY "$(random 40 "$ALNUM")"
    env_line EMAIL_DISABLED "$EMAIL_DISABLED"
    env_line SMTP_HOST "$SMTP_HOST"
    env_line SMTP_PORT "$SMTP_PORT"
    env_line SMTP_SECURE "$SMTP_SECURE"
    env_line SMTP_USER "$SMTP_USER"
    env_line SMTP_PASS "$SMTP_PASS"
    env_line SMTP_FROM "$SMTP_FROM"
  } > "$DIR/.env"
)
ok "$(t "Passwords and keys generated" "Пароли и ключи созданы")"
fi # a new install, not picking up an earlier one

# The login is saved before anything can go wrong, so it's never lost.
(
  umask 077
  cat > "$DIR/ADMIN-LOGIN.txt" <<LOGIN
Address:  $PUBLIC_URL
Email:    $ADMIN_EMAIL
Password: $ADMIN_PASSWORD
LOGIN
)

fetch infra/docker-compose.selfhost.yml "$DIR/docker-compose.yml"
fetch tapeshelf.sh "$DIR/tapeshelf.sh"
chmod +x "$DIR/tapeshelf.sh"
cd "$DIR"

# ---- start it ------------------------------------------------------------------------------------------
step "$(t "Downloading and starting (a few minutes the first time)" "Скачиваю и запускаю (в первый раз несколько минут)")"
[ -n "${TAPESHELF_NO_PULL:-}" ] || $DOCKER compose pull --quiet
$DOCKER compose up -d --wait --wait-timeout 300 > /dev/null 2>&1 || true

say "$(t "Waiting for it to answer…" "Жду, пока он ответит…")"
ready=""
for i in $(seq 1 60); do
  # With a domain this also proves the certificate was issued, whatever this machine's DNS says.
  if [ "$MODE" = domain ]; then
    curl -fs --max-time 5 --resolve "$DOMAIN:443:127.0.0.1" "$PUBLIC_URL/api/health" > /dev/null 2>&1 && { ready=1; break; }
  else
    curl -fs --max-time 5 "http://127.0.0.1:$HTTP_PORT/api/health" > /dev/null 2>&1 && { ready=1; break; }
  fi
  # The one-shot setup failed: no point in waiting.
  if $DOCKER compose ps --all --format '{{.Service}} {{.State}} {{.ExitCode}}' 2> /dev/null | awk '$1=="migrate" && $2=="exited" && $3!="0" {found=1} END {exit !found}'; then break; fi
  [ $((i % 12)) -eq 0 ] && say "$(t "Still working; this is normal." "Ещё работаю, это нормально.")"
  sleep 5
done
if [ -z "$ready" ]; then
  say ""
  say "$(t "It isn't answering yet. Here is what it says:" "Он пока не отвечает. Вот что он сообщает:")"
  $DOCKER compose ps --all --format 'table {{.Service}}\t{{.Status}}' || true
  $DOCKER compose logs --tail 15 migrate api web 2> /dev/null || true
  say ""
  say "$(t "Your settings and login are saved in $DIR, nothing is lost. To try again, run the same command." "Настройки и логин сохранены в $DIR, ничего не потеряно. Чтобы попробовать снова, запустите ту же команду.")"
  if [ "$MODE" = domain ]; then
    say "$(t "Most often the domain doesn't point to this server yet, or a firewall blocks the way. Your server company may have its own firewall page: open ports 80 and 443 there. The certificate retries by itself, so the site may start working on its own in a few minutes." "Чаще всего домен ещё не указывает на этот сервер или мешает файрвол. У компании, где арендован сервер, может быть своя страница файрвола: откройте там порты 80 и 443. Сертификат запрашивается повторно сам, так что сайт может заработать без вас через несколько минут.")"
  fi
  exit 1
fi
touch "$DIR/.installed"

printf '\n%s%s%s\n\n' "$GREEN$BOLD" "$(t "tapeshelf is running!" "tapeshelf работает!")" "$OFF"
say "  $(t "Open" "Откройте"):     ${BOLD}$PUBLIC_URL${OFF}"
say "  $(t "Email" "Почта"):    $ADMIN_EMAIL"
say "  $(t "Password" "Пароль"):  ${BOLD}$ADMIN_PASSWORD${OFF}"
say ""
say "$(t "The login is also in $DIR/ADMIN-LOGIN.txt." "Логин сохранён и в $DIR/ADMIN-LOGIN.txt.")"
if [ "$MODE" != local ]; then
  say "$(t "New sign-ups are closed for now, so strangers can't fill your disk. To let people in, go to Admin → Settings." "Новая регистрация пока закрыта, чтобы посторонние не забили диск. Чтобы пустить людей, откройте Админка → Настройки.")"
fi
say "$(t "Important: keep a copy of $DIR/.env somewhere safe. Without it, your videos can't be recovered." "Важно: сохраните копию $DIR/.env в надёжном месте. Без неё видео не восстановить.")"
say ""
if [ "$MODE" = proxy ]; then
  say ""
  say "$(t "One last step: point your own web server at http://127.0.0.1:$HTTP_PORT for $DOMAIN. In nginx:" "Последний шаг: направьте свой веб-сервер на http://127.0.0.1:$HTTP_PORT для $DOMAIN. В nginx:")"
  say "    client_max_body_size 0;"
  say "    proxy_set_header Host \$host;"
  say "    proxy_set_header X-Forwarded-Proto \$scheme;"
  say "    proxy_set_header Upgrade \$http_upgrade;"
  say "    proxy_set_header Connection \"upgrade\";"
  say "    proxy_pass http://127.0.0.1:$HTTP_PORT;"
fi
say ""
say "$(t "To manage it: cd $DIR && ./tapeshelf.sh" "Управление: cd $DIR && ./tapeshelf.sh")"
