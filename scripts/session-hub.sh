#!/usr/bin/env bash
# scripts/session-hub.sh — Active Sessions Hub registry + sish tunnel CLI. [T000975]
#
# Why: dev sessions (HTML forms, brainstorm boards, visual companions) are only
# reachable via localhost. This CLI publishes each one over the dev-stack sish
# tunnel as session-<slug>.${DEV_DOMAIN} (Keycloak-gated) and records it in a
# JSON registry the website Mediaviewer reads.
#
# Registry: ~/.local/share/bachelorprojekt/active-sessions.json (array). Override
# with SESSION_HUB_REGISTRY (used by tests). Set SESSION_HUB_NO_TUNNEL=1 to skip
# the ssh -R call (unit tests / dry runs).
#
# Subcommands: start-form | register | list | deregister | reap
set -uo pipefail

REGISTRY="${SESSION_HUB_REGISTRY:-$HOME/.local/share/bachelorprojekt/active-sessions.json}"
SSH_PORT="${SESSION_HUB_SSH_PORT:-2222}"
SSH_KEY="${SESSION_HUB_SSH_KEY:-$HOME/.ssh/id_ed25519}"

_now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }
_slug() { printf '%s' "$1" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-'; }

_ensure_registry() {
  mkdir -p "$(dirname "$REGISTRY")"
  [ -f "$REGISTRY" ] || printf '[]\n' > "$REGISTRY"
}

_write() { local tmp="$REGISTRY.tmp.$$"; cat > "$tmp" && mv "$tmp" "$REGISTRY"; }

_resolve_domain() {
  if [ -n "${DEV_DOMAIN:-}" ]; then return 0; fi
  source scripts/env-resolve.sh "${ENV:-mentolder}" 2>/dev/null || true
  [ -n "${DEV_DOMAIN:-}" ] || { echo "session-hub: DEV_DOMAIN unresolved" >&2; return 1; }
}

_pid_alive() { [ -n "${1:-}" ] && [ "$1" != "null" ] && [ "$1" -gt 0 ] 2>/dev/null && kill -0 "$1" 2>/dev/null; }

_open_tunnel() {
  local slug="$1" port="$2"
  if [ -n "${SESSION_HUB_NO_TUNNEL:-}" ]; then echo "0"; return 0; fi
  _resolve_domain || return 1
  ssh -p "$SSH_PORT" -N \
    -o StrictHostKeyChecking=accept-new \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
    -i "$SSH_KEY" \
    -R "session-${slug}:80:localhost:${port}" \
    "tunnel@${DEV_DOMAIN}" >/dev/null 2>&1 &
  echo "$!"
}

_upsert() {
  local slug="$1" type="$2" title="$3" port="$4" local_url="$5" tunnel_pid="$6" server_pid="$7"
  _resolve_domain || return 1
  _ensure_registry
  local public_url="https://session-${slug}.${DEV_DOMAIN}"
  jq \
    --arg slug "$slug" --arg type "$type" --arg title "$title" \
    --argjson port "$port" --arg public "$public_url" --arg local "$local_url" \
    --argjson tpid "${tunnel_pid:-0}" --argjson spid "${server_pid:-0}" \
    --arg started "$(_now_iso)" \
    '[ .[] | select(.slug != $slug) ] + [{
       slug:$slug, type:$type, title:$title, port:$port,
       public_url:$public, local_url:$local,
       tunnel_pid:$tpid, server_pid:$spid, started_at:$started
     }]' "$REGISTRY" | _write
  echo "registered $slug -> $public_url"
}

cmd_register() {
  local name="" port="" type="companion" title=""
  while [ $# -gt 0 ]; do case "$1" in
    --name) name="$2"; shift 2;;
    --port) port="$2"; shift 2;;
    --type) type="$2"; shift 2;;
    --title) title="$2"; shift 2;;
    *) echo "register: unknown arg $1" >&2; return 2;;
  esac; done
  [ -n "$name" ] && [ -n "$port" ] || { echo "register: --name and --port required" >&2; return 2; }
  local slug; slug="$(_slug "$name")"
  [ -n "$title" ] || title="$name"
  local tpid; tpid="$(_open_tunnel "$slug" "$port")" || return 1
  _upsert "$slug" "$type" "$title" "$port" "http://localhost:${port}/" "$tpid" "0"
}

cmd_start_form() {
  local file="" name="" port=""
  while [ $# -gt 0 ]; do case "$1" in
    --file) file="$2"; shift 2;;
    --name) name="$2"; shift 2;;
    --port) port="$2"; shift 2;;
    *) echo "start-form: unknown arg $1" >&2; return 2;;
  esac; done
  [ -n "$file" ] && [ -n "$name" ] || { echo "start-form: --file and --name required" >&2; return 2; }
  [ -f "$file" ] || { echo "start-form: file not found: $file" >&2; return 1; }
  local slug; slug="$(_slug "$name")"
  [ -n "$port" ] || port=$(( 18000 + (RANDOM % 1000) ))
  local dir base spid
  dir="$(cd "$(dirname "$file")" && pwd)"; base="$(basename "$file")"
  if [ -z "${SESSION_HUB_NO_TUNNEL:-}" ]; then
    ( cd "$dir" && exec python3 -m http.server "$port" --bind 127.0.0.1 ) >/dev/null 2>&1 &
    spid="$!"; sleep 1
  else spid="0"; fi
  local tpid; tpid="$(_open_tunnel "$slug" "$port")" || return 1
  _upsert "$slug" "form" "$name" "$port" "http://localhost:${port}/${base}" "$tpid" "$spid"
}

cmd_list() { _ensure_registry; cat "$REGISTRY"; }

cmd_deregister() {
  local name=""
  while [ $# -gt 0 ]; do case "$1" in
    --name) name="$2"; shift 2;;
    *) echo "deregister: unknown arg $1" >&2; return 2;;
  esac; done
  [ -n "$name" ] || { echo "deregister: --name required" >&2; return 2; }
  local slug; slug="$(_slug "$name")"
  _ensure_registry
  local tpid spid
  tpid="$(jq -r --arg s "$slug" '.[] | select(.slug==$s) | .tunnel_pid' "$REGISTRY")"
  spid="$(jq -r --arg s "$slug" '.[] | select(.slug==$s) | .server_pid' "$REGISTRY")"
  _pid_alive "$tpid" && kill "$tpid" 2>/dev/null || true
  _pid_alive "$spid" && kill "$spid" 2>/dev/null || true
  jq --arg s "$slug" '[ .[] | select(.slug != $s) ]' "$REGISTRY" | _write
  echo "deregistered $slug"
}

cmd_reap() {
  _ensure_registry
  local kept removed total
  total="$(jq -r 'length' "$REGISTRY")"
  local survivors="[]"
  while IFS= read -r row; do
    [ -n "$row" ] || continue
    local tpid; tpid="$(printf '%s' "$row" | jq -r '.tunnel_pid')"
    if _pid_alive "$tpid"; then
      survivors="$(jq -c --argjson r "$row" '. + [$r]' <<<"$survivors")"
    fi
  done < <(jq -c '.[]' "$REGISTRY")
  printf '%s\n' "$survivors" | _write
  kept="$(jq -r 'length' "$REGISTRY")"; removed=$(( total - kept ))
  echo "reaped $removed stale session(s); $kept active"
}

usage() {
  cat >&2 <<'USAGE'
session-hub.sh -- Active Sessions Hub registry + tunnel CLI
  start-form  --file <html> --name <name> [--port <p>]   start python http.server + tunnel + register
  register    --name <n> --port <p> [--type <t>] [--title <s>]   register an already-listening port
  list                                                   print the JSON registry
  deregister  --name <n>                                 kill pids + drop from registry
  reap                                                   drop entries with dead tunnel pids
USAGE
}

main() {
  local cmd="${1:-}"; shift 2>/dev/null || true
  case "$cmd" in
    start-form) cmd_start_form "$@";;
    register)   cmd_register "$@";;
    list)       cmd_list "$@";;
    deregister) cmd_deregister "$@";;
    reap)       cmd_reap "$@";;
    -h|--help|help|"") usage; [ -z "$cmd" ] && return 2 || return 0;;
    *) echo "session-hub: unknown subcommand: $cmd" >&2; usage; return 2;;
  esac
}

main "$@"
