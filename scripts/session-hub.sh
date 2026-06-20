#!/usr/bin/env bash
# scripts/session-hub.sh — Active Sessions Hub registry + fleet-upload CLI. [T000975]
#
# Why: dev sessions (HTML forms, brainstorm boards, visual companions) need to be
# reachable from outside (e.g. gekko on mobile). Files are uploaded via kubectl cp
# to the sessions-server nginx pod on fleet, served at
# https://session-<slug>.sessions.mentolder.de (Wildcard-Cert via DNS-01/ipv64).
# The Mediaviewer on k3d-mentolder-dev reads the registry via /api/admin/sessions.
#
# Registry: ~/.local/share/bachelorprojekt/active-sessions.json (array). Override
# with SESSION_HUB_REGISTRY (used by tests). Set SESSION_HUB_NO_TUNNEL=1 to skip
# the kubectl cp calls (unit tests / dry runs).
#
# Domain: SESSION_HUB_DOMAIN (default: sessions.mentolder.de).
# DNS: *.sessions.mentolder.de CNAME mentolder.de (einmalig setzen).
#
# Subcommands: start-form | register | list | deregister | reap
set -uo pipefail

REGISTRY="${SESSION_HUB_REGISTRY:-$HOME/.local/share/bachelorprojekt/active-sessions.json}"
SESSION_HUB_DOMAIN="${SESSION_HUB_DOMAIN:-sessions.mentolder.de}"

_now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }
_slug() { printf '%s' "$1" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-'; }

_ensure_registry() {
  mkdir -p "$(dirname "$REGISTRY")"
  [ -f "$REGISTRY" ] || printf '[]\n' > "$REGISTRY"
}

_write() {
  local tmp="$REGISTRY.tmp.$$"
  cat > "$tmp" && mv "$tmp" "$REGISTRY"
  _sync_to_pod 2>/dev/null || true
}

# Spiegelt die Registry in den aktiven website-Pod (k3d-mentolder-dev).
# Läuft still, bricht nichts wenn kubectl fehlt oder kein Pod läuft.
_sync_to_pod() {
  [ -n "${SESSION_HUB_NO_TUNNEL:-}" ] && return 0
  command -v kubectl >/dev/null 2>&1 || return 0
  local ctx="k3d-mentolder-dev" ns="workspace-dev"
  local pod
  pod="$(kubectl --context "$ctx" get pod -n "$ns" -l app=website \
          -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)" || return 0
  [ -n "$pod" ] || return 0
  local pod_home
  pod_home="$(kubectl --context "$ctx" exec -n "$ns" "$pod" -- \
    sh -c 'echo $HOME' 2>/dev/null)" || return 0
  local dest="${pod_home}/.local/share/bachelorprojekt"
  kubectl --context "$ctx" exec -n "$ns" "$pod" -- mkdir -p "$dest" 2>/dev/null || return 0
  kubectl --context "$ctx" cp "$REGISTRY" "${ns}/${pod}:${dest}/active-sessions.json" 2>/dev/null || true
}

_pid_alive() { [ -n "${1:-}" ] && [ "$1" != "null" ] && [ "$1" -gt 0 ] 2>/dev/null && kill -0 "$1" 2>/dev/null; }

# Lädt eine HTML-Datei in den sessions-server Pod auf fleet hoch.
# Ziel: /srv/sessions/<slug>/index.html — nginx serviert dann unter
#   https://session-<slug>.sessions.mentolder.de/
# Läuft still, bricht nichts wenn kubectl fehlt oder kein Pod läuft.
_upload_to_sessions_server() {
  local slug="$1" file="$2"
  [ -n "${SESSION_HUB_NO_TUNNEL:-}" ] && return 0
  command -v kubectl >/dev/null 2>&1 || return 0
  local ctx="fleet" ns="workspace"
  local pod
  pod="$(kubectl --context "$ctx" get pod -n "$ns" -l app=sessions-server \
          -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)" || return 0
  [ -n "$pod" ] || { echo "sessions-server: kein Pod auf fleet gefunden — deploy ausstehend?" >&2; return 0; }
  kubectl --context "$ctx" exec -n "$ns" "$pod" -- mkdir -p "/srv/sessions/${slug}" 2>/dev/null || return 0
  kubectl --context "$ctx" cp "$file" "${ns}/${pod}:/srv/sessions/${slug}/index.html" 2>/dev/null \
    && echo "  → fleet: https://session-${slug}.${SESSION_HUB_DOMAIN}/" || true
}

# Räumt das Session-Verzeichnis auf dem fleet-Pod auf.
_remove_from_sessions_server() {
  local slug="$1"
  [ -n "${SESSION_HUB_NO_TUNNEL:-}" ] && return 0
  command -v kubectl >/dev/null 2>&1 || return 0
  local ctx="fleet" ns="workspace"
  local pod
  pod="$(kubectl --context "$ctx" get pod -n "$ns" -l app=sessions-server \
          -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)" || return 0
  [ -n "$pod" ] || return 0
  kubectl --context "$ctx" exec -n "$ns" "$pod" -- rm -rf "/srv/sessions/${slug}" 2>/dev/null || true
}

_upsert() {
  local slug="$1" type="$2" title="$3" port="$4" local_url="$5" server_pid="$6"
  _ensure_registry
  local public_url="https://session-${slug}.${SESSION_HUB_DOMAIN}"
  jq \
    --arg slug "$slug" --arg type "$type" --arg title "$title" \
    --argjson port "$port" --arg public "$public_url" --arg local "$local_url" \
    --argjson spid "${server_pid:-0}" \
    --arg started "$(_now_iso)" \
    '[ .[] | select(.slug != $slug) ] + [{
       slug:$slug, type:$type, title:$title, port:$port,
       public_url:$public, local_url:$local,
       tunnel_pid:0, server_pid:$spid, started_at:$started
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
  _upsert "$slug" "$type" "$title" "$port" "http://localhost:${port}/" "0"
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
  # Lokaler HTTP-Server für k3d-Website-Registry (local_url)
  if [ -z "${SESSION_HUB_NO_TUNNEL:-}" ]; then
    ( cd "$dir" && exec python3 -m http.server "$port" --bind 127.0.0.1 ) >/dev/null 2>&1 &
    spid="$!"; sleep 1
  else spid="0"; fi
  _upsert "$slug" "form" "$name" "$port" "http://localhost:${port}/${base}" "$spid"
  # Datei auf fleet hochladen → public_url wird erreichbar
  _upload_to_sessions_server "$slug" "$file" 2>/dev/null || true
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
  local spid
  spid="$(jq -r --arg s "$slug" '.[] | select(.slug==$s) | .server_pid' "$REGISTRY")"
  _pid_alive "$spid" && kill "$spid" 2>/dev/null || true
  jq --arg s "$slug" '[ .[] | select(.slug != $s) ]' "$REGISTRY" | _write
  _remove_from_sessions_server "$slug" 2>/dev/null || true
  echo "deregistered $slug"
}

cmd_reap() {
  _ensure_registry
  local kept removed total
  total="$(jq -r 'length' "$REGISTRY")"
  local survivors="[]"
  while IFS= read -r row; do
    [ -n "$row" ] || continue
    local spid; spid="$(printf '%s' "$row" | jq -r '.server_pid')"
    if _pid_alive "$spid"; then
      survivors="$(jq -c --argjson r "$row" '. + [$r]' <<<"$survivors")"
    fi
  done < <(jq -c '.[]' "$REGISTRY")
  printf '%s\n' "$survivors" | _write
  kept="$(jq -r 'length' "$REGISTRY")"; removed=$(( total - kept ))
  echo "reaped $removed stale session(s); $kept active"
}

usage() {
  cat >&2 <<'USAGE'
session-hub.sh -- Active Sessions Hub registry + fleet-upload CLI
  start-form  --file <html> --name <name> [--port <p>]   local http.server + fleet upload + register
  register    --name <n> --port <p> [--type <t>] [--title <s>]   register an already-listening port
  list                                                   print the JSON registry
  deregister  --name <n>                                 kill server pid + fleet cleanup + drop from registry
  reap                                                   drop entries with dead server pids
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
