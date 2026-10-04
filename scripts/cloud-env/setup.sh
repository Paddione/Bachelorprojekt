#!/usr/bin/env bash
# scripts/cloud-env/setup.sh - Cloud-Umgebung (Claude Code on the web) an devmesh und die MCPs anbinden
#
# Zwei Modi, weil Prozesse nicht in den gecachten Setup-Snapshot der Umgebung uebergehen:
#   install   einmalig (Setup-Skript-Feld der Umgebung): kubectl, tailscale, npm-Abhaengigkeiten
#   connect   je Session (SessionStart-Hook): Tailscale hoch, Kubeconfig, Port-Forward, MCP-Registrierung
#   all       install, dann connect (Default)
#
# Netzpfad: tailscaled im Userspace-Modus (kein TUN in der Cloud-Umgebung noetig). kubectl geht ueber
# den SOCKS5-Proxy von tailscaled; der API-Server ist der Tailnet-Name aus der Kubeconfig
# (scripts/devmesh/kubeconfig.sh). Erlaubt laut devmesh/tailnet-policy.hujson: tag:devclient -> 6443.
# Nur devmesh. fleet (Prod) liegt nicht im Tailnet und wird bewusst nicht angebunden.
#
# Port-Forward wie devmesh-forward.service: svc/llm-services im Namespace workspace
#   18235 llm-proxy, 13001 mcp-postgres, 13005 bge-mcp
#
# Secrets ausschliesslich als Umgebungsvariablen der Cloud-Umgebung, nie im Repo:
#   TS_AUTHKEY             ephemerer, getaggter Tailscale-Auth-Key (tag:devclient)
#   DEVMESH_KUBECONFIG_B64 base64 einer Kubeconfig mit Context "devmesh" (base64 -w0 ~/.kube/devmesh.yaml)
#   MCP_POSTGRES_TOKEN     Bearer fuer mcp-postgres
#   BGE_MCP_TOKEN          Bearer fuer bge-mcp
#
# Fallback Vaultwarden: fehlt eine der vier Variablen oben, wird sie aus dem Tresor geholt, sofern
# BW_HOST, BW_CLIENTID, BW_CLIENTSECRET und BW_PASSWORD gesetzt sind. Item-Name ist
# ${VAULT_ITEM_PREFIX:-devmesh-cloud-env/}<VARIABLE>, Wert im Passwortfeld. Details:
# docs/runbooks/cloud-env-devmesh.md
#
# Exit: 0 verbunden, 1 Befund, 2 Vorbedingung fehlt (Variable, Werkzeug).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATE_DIR="${CLOUD_ENV_STATE_DIR:-$HOME/.cache/cloud-env}"
KUBECTL_VERSION="${KUBECTL_VERSION:-v1.36.1}"
SOCKS_ADDR="127.0.0.1:1055"
DEVMESH_CONTEXT="devmesh"
DEVMESH_NS="workspace"
DEVMESH_SVC="svc/llm-services"
PORTS=(18235:18235 13001:13001 13005:13005)
READY_TIMEOUT=60

say()  { printf '[cloud-env] %s\n' "$*"; }
die()  { printf '[cloud-env] FEHLER: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || { printf '[cloud-env] Vorbedingung fehlt: %s nicht im PATH\n' "$1" >&2; exit 2; }; }
need_env() {
  local v
  for v in "$@"; do
    [[ -n "${!v:-}" ]] || { printf '[cloud-env] Vorbedingung fehlt: Variable %s ist nicht gesetzt\n' "$v" >&2; exit 2; }
  done
}
SUDO=(); [[ $EUID -eq 0 ]] || SUDO=(sudo -n)
as_root() { "${SUDO[@]}" "$@"; }

wait_for() { # wait_for <beschreibung> <befehl...>
  local what="$1" i=0; shift
  until "$@" >/dev/null 2>&1; do
    (( ++i > READY_TIMEOUT )) && die "Timeout (${READY_TIMEOUT}s): $what"
    sleep 1
  done
}

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

do_install() {
  need curl
  mkdir -p "$STATE_DIR"

  if ! command -v kubectl >/dev/null 2>&1; then
    say "Installiere kubectl ${KUBECTL_VERSION}"
    local tmp; tmp="$(mktemp -d)"
    curl -fsSL -o "$tmp/kubectl" "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl"
    curl -fsSL -o "$tmp/kubectl.sha256" "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl.sha256"
    (cd "$tmp" && echo "$(cat kubectl.sha256)  kubectl" | sha256sum -c -) || die "kubectl-Pruefsumme stimmt nicht"
    as_root install -m 0755 "$tmp/kubectl" /usr/local/bin/kubectl
    rm -rf "$tmp"
  fi

  if ! command -v tailscaled >/dev/null 2>&1; then
    say "Installiere Tailscale (offizielles Installationsskript)"
    curl -fsSL https://tailscale.com/install.sh | as_root sh
  fi

  if ! command -v bw >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    # bw >= 2026.7.0 kann Eintraege von Vaultwarden 1.36.0 nicht entschluesseln (scripts/warden-mcp/launch.mjs).
    say "Installiere Bitwarden-CLI (~2026.6.0) fuer den Vaultwarden-Fallback"
    as_root npm install -g --no-audit --no-fund "@bitwarden/cli@~2026.6.0"       || say "WARN: bw nicht installiert - Vaultwarden-Fallback entfaellt"
  fi

  if [[ -f "$REPO_ROOT/package-lock.json" ]]; then
    say "npm ci (stdio-MCPs: ticket-mcp-node, task-runner)"
    (cd "$REPO_ROOT" && npm ci --no-audit --no-fund --ignore-scripts)
  fi
  say "install fertig"
}

VAULT_PREFIX="${VAULT_ITEM_PREFIX:-devmesh-cloud-env/}"
VAULT_OPEN=0

vault_open() {
  (( VAULT_OPEN )) && return 0
  need bw
  local v
  for v in BW_HOST BW_CLIENTID BW_CLIENTSECRET BW_PASSWORD; do
    [[ -n "${!v:-}" ]] || { say "Vaultwarden-Fallback nicht moeglich: $v fehlt"; return 1; }
  done
  export BITWARDENCLI_APPDATA_DIR="$STATE_DIR/bw"
  mkdir -p "$BITWARDENCLI_APPDATA_DIR" && chmod 700 "$BITWARDENCLI_APPDATA_DIR"
  bw config server "$BW_HOST" >/dev/null 2>&1 || return 1
  bw login --apikey >/dev/null 2>&1 || bw login --check >/dev/null 2>&1 || return 1
  BW_SESSION="$(bw unlock --passwordenv BW_PASSWORD --raw 2>/dev/null)" || return 1
  export BW_SESSION VAULT_OPEN=1
}

# fill_from_vault VAR...  - setzt nur Variablen, die leer sind; Werte werden nie ausgegeben.
fill_from_vault() {
  local v val
  for v in "$@"; do
    [[ -n "${!v:-}" ]] && continue
    vault_open || die "$v fehlt und der Vaultwarden-Fallback ist nicht verfuegbar"
    val="$(bw get password "${VAULT_PREFIX}${v}" 2>/dev/null)" && [[ -n "$val" ]]       || die "$v fehlt und Item '${VAULT_PREFIX}${v}' ist im Tresor nicht lesbar"
    export "$v=$val"
    # Spaetere Tool-Aufrufe der Session sehen die Variable nur ueber CLAUDE_ENV_FILE.
    [[ -z "${CLAUDE_ENV_FILE:-}" ]] || printf 'export %s=%q
' "$v" "$val" >>"$CLAUDE_ENV_FILE"
    say "$v aus Vaultwarden geholt"
  done
}

vault_close() { (( VAULT_OPEN )) && bw lock >/dev/null 2>&1 || true; }

start_tailscale() {
  need tailscale
  need tailscaled
  need_env TS_AUTHKEY
  mkdir -p "$STATE_DIR"

  if tailscale --socket="$STATE_DIR/tailscaled.sock" status >/dev/null 2>&1; then
    say "Tailscale laeuft bereits"
    return
  fi

  say "Starte tailscaled (Userspace, SOCKS5 ${SOCKS_ADDR})"
  nohup "${SUDO[@]}" tailscaled --tun=userspace-networking --socks5-server="$SOCKS_ADDR" \
    --state=mem: --socket="$STATE_DIR/tailscaled.sock" >"$STATE_DIR/tailscaled.log" 2>&1 &
  wait_for "tailscaled-Socket" test -S "$STATE_DIR/tailscaled.sock"

  # Auth-Key ueber Datei statt Argument, damit er nicht in der Prozessliste steht.
  local keyfile; keyfile="$(umask 077 && mktemp "$STATE_DIR/authkey.XXXXXX")"
  printf '%s' "$TS_AUTHKEY" >"$keyfile"
  trap 'rm -f "$keyfile"' RETURN
  as_root tailscale --socket="$STATE_DIR/tailscaled.sock" up \
    --auth-key="file:$keyfile" --hostname="cloud-env-$(hostname | cut -c1-20)" \
    --accept-dns=false --accept-routes=false --ssh=false \
    || die "tailscale up fehlgeschlagen (Key abgelaufen oder ohne tag:devclient?)"
  say "Tailscale verbunden"
}

write_kubeconfig() {
  need kubectl
  need_env DEVMESH_KUBECONFIG_B64
  local kc="$STATE_DIR/devmesh.kubeconfig"
  (umask 077 && printf '%s' "$DEVMESH_KUBECONFIG_B64" | base64 -d >"$kc") \
    || die "DEVMESH_KUBECONFIG_B64 ist kein gueltiges Base64"
  export KUBECONFIG="$kc"
  kubectl config get-contexts -o name | grep -qx "$DEVMESH_CONTEXT" \
    || die "Kubeconfig enthaelt keinen Context '$DEVMESH_CONTEXT'"
  local cluster
  cluster="$(kubectl config view -o jsonpath="{.contexts[?(@.name=='$DEVMESH_CONTEXT')].context.cluster}")"
  kubectl config set-cluster "$cluster" --proxy-url="socks5h://${SOCKS_ADDR}" >/dev/null
  kubectl config use-context "$DEVMESH_CONTEXT" >/dev/null
  wait_for "devmesh-API ueber das Tailnet" kubectl --context "$DEVMESH_CONTEXT" get ns "$DEVMESH_NS"
  say "devmesh-API erreichbar"
}

start_forward() {
  export KUBECONFIG="$STATE_DIR/devmesh.kubeconfig"
  if port_open 13001 && port_open 13005 && port_open 18235; then
    say "Port-Forward laeuft bereits"
    return
  fi
  say "Starte Port-Forward ${DEVMESH_SVC} (${PORTS[*]})"
  # Schleife wie Restart=always in der Unit: ein Pod-Neustart beendet kubectl port-forward.
  nohup bash -c '
    while true; do
      kubectl --context "$0" port-forward -n "$1" "$2" "${@:3}" || true
      sleep 5
    done' "$DEVMESH_CONTEXT" "$DEVMESH_NS" "$DEVMESH_SVC" "${PORTS[@]}" \
    >"$STATE_DIR/port-forward.log" 2>&1 &
  local p
  for p in 13001 13005 18235; do
    wait_for "Port-Forward :$p" bash -c "(exec 3<>/dev/tcp/127.0.0.1/$p)"
  done
  say "Port-Forward bereit"
}

register_mcps() {
  need_env MCP_POSTGRES_TOKEN BGE_MCP_TOKEN
  if ! command -v claude >/dev/null 2>&1; then
    say "claude-CLI nicht gefunden - MCPs nicht registriert. Manuell:"
    say "  claude mcp add --transport http --scope user mcp-postgres http://localhost:13001/mcp --header 'Authorization: Bearer \${MCP_POSTGRES_TOKEN}'"
    say "  claude mcp add --transport http --scope user bge-mcp http://localhost:13005/mcp --header 'Authorization: Bearer \${BGE_MCP_TOKEN}'"
    return
  fi
  # Header als unexpandierte ${VAR}-Referenz (Muster aus docs/agent-guide/registry/mcp.yaml):
  # Claude Code expandiert beim Laden, kein Klartext in ~/.claude.json.
  local name url var
  for spec in "mcp-postgres http://localhost:13001/mcp MCP_POSTGRES_TOKEN" \
              "bge-mcp http://localhost:13005/mcp BGE_MCP_TOKEN"; do
    read -r name url var <<<"$spec"
    claude mcp remove --scope user "$name" >/dev/null 2>&1 || true
    claude mcp add --transport http --scope user "$name" "$url" \
      --header "Authorization: Bearer \${${var}}" >/dev/null
    say "MCP registriert: $name"
  done
}

verify() {
  export KUBECONFIG="$STATE_DIR/devmesh.kubeconfig"
  kubectl --context "$DEVMESH_CONTEXT" -n "$DEVMESH_NS" get "$DEVMESH_SVC" >/dev/null \
    || die "svc/llm-services in $DEVMESH_NS nicht lesbar"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
    -H "Authorization: Bearer ${MCP_POSTGRES_TOKEN}" http://localhost:13001/mcp || true)"
  [[ "$code" != "000" ]] || die "mcp-postgres antwortet nicht auf :13001"
  [[ "$code" != "401" && "$code" != "403" ]] || die "mcp-postgres lehnt MCP_POSTGRES_TOKEN ab (HTTP $code)"
  say "verifiziert: devmesh-API, svc/llm-services, mcp-postgres (HTTP $code)"
}

do_connect() {
  need curl
  fill_from_vault TS_AUTHKEY DEVMESH_KUBECONFIG_B64 MCP_POSTGRES_TOKEN BGE_MCP_TOKEN
  vault_close
  need_env TS_AUTHKEY DEVMESH_KUBECONFIG_B64 MCP_POSTGRES_TOKEN BGE_MCP_TOKEN
  start_tailscale
  write_kubeconfig
  start_forward
  register_mcps
  verify
  say "Nicht angebunden: fleet (mcp-kubernetes :18080, github :13002) und warden; .mcp.json-Eintrag mcp-kubernetes bleibt hier ohne Backend."
}

case "${1:-all}" in
  install) do_install ;;
  connect) do_connect ;;
  all)     do_install; do_connect ;;
  *)       echo "Usage: $0 [install|connect|all]" >&2; exit 2 ;;
esac
