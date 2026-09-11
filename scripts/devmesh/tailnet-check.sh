#!/usr/bin/env bash
# scripts/devmesh/tailnet-check.sh — T900116 (SP-1, ADR-008)
# Prueft, ob jeder devmesh-Server aus devmesh/inventory.yaml ueber das Tailnet
# antwortet, und meldet je Server den Pfad: direct (LAN/NAT-Traversal) oder relay (DERP).
#
# Usage:
#   tailnet-check.sh [--inventory <pfad>] [--list] [--help]
#
# Exit 0  jeder Server antwortet (direct oder relay)
# Exit 1  mindestens ein Server antwortet nicht (Befund, namentlich genannt)
# Exit 2  Vorbedingung fehlt: python3/PyYAML, Inventar ungueltig, Tailscale-CLI fehlt
#         oder Dienst nicht im Zustand Running. Ein gestoppter Dienst ist kein
#         "alle Peers weg" (Design D5, Muster scripts/sdlc/kubelet-cert-check.sh).
#
# Gepingt werden nur Eintraege mit role: server. Clients stehen fuer Tags und ACL im
# Inventar; ein ausgeschalteter Laptop ist kein Befund.
#
# Der Exit-Code von `tailscale ping` wird bewusst NICHT ausgewertet: mit dem Default
# --until-direct endet ein Ping, der nur ueber DERP antwortet, mit "direct connection
# not established" und Exit != 0, obwohl der Peer erreichbar ist. Massgeblich sind die
# "pong from"-Zeilen ("via DERP(...)" = relay, "via <ip>:<port>" = direct).
#
# CLI-Aufloesung (Design D2): TAILSCALE_CLI > Linux-CLI im PATH > Windows-CLI unter
# /mnt/c/Program Files/Tailscale/tailscale.exe (WSL mit mirrored networking).
# Die Windows-CLI schreibt CRLF; jede CLI-Ausgabe laeuft durch tr -d '\r'.
#
# Overrides: DEVMESH_INVENTORY, TAILSCALE_CLI, TAILNET_PING_COUNT (Default 5),
#            TAILNET_PING_TIMEOUT (Default 3s).
# Aufruf ueber Taskfile: task devmesh:tailnet:check. Runbook: docs/runbooks/devmesh-tailnet.md
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INVENTORY="${DEVMESH_INVENTORY:-${PROJECT_DIR}/devmesh/inventory.yaml}"
PING_COUNT="${TAILNET_PING_COUNT:-5}"
PING_TIMEOUT="${TAILNET_PING_TIMEOUT:-3s}"
WIN_CLI="/mnt/c/Program Files/Tailscale/tailscale.exe"
LIST_ONLY=0

usage() {
  cat <<'EOF'
Usage: tailnet-check.sh [--inventory <pfad>] [--list] [--help]

  --inventory <pfad>  Peer-Inventar (Default: devmesh/inventory.yaml)
  --list              Inventar validieren und ausgeben, ohne Tailscale-CLI
  --help              Diese Hilfe
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --inventory) INVENTORY="${2:?--inventory braucht einen Pfad}"; shift 2 ;;
    --list)      LIST_ONLY=1; shift ;;
    --help)      usage; exit 0 ;;
    *)           echo "Unbekanntes Argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

# ── Vorbedingung: Inventar lesbar und gueltig ──────────────────────────────────
if ! command -v python3 >/dev/null 2>&1 || ! python3 -c 'import yaml' >/dev/null 2>&1; then
  echo "Vorbedingung fehlt: python3 mit PyYAML" >&2
  exit 2
fi
if [[ ! -f "$INVENTORY" ]]; then
  echo "Vorbedingung fehlt: Inventar nicht gefunden: $INVENTORY" >&2
  exit 2
fi

# Eine Zeile je Peer: name<TAB>role<TAB>tag<TAB>lan_ip<TAB>tailnet_name. Leere Werte
# werden als "-" ausgegeben, weil read mit IFS=<TAB> aufeinanderfolgende Tabs
# zusammenzieht und die Felder sonst verrutschen.
if ! PEERS="$(python3 - "$INVENTORY" <<'PY'
import sys, yaml

path = sys.argv[1]
with open(path) as f:
    data = yaml.safe_load(f) or {}

expected_tag = {"server": "tag:devmesh", "client": "tag:devclient"}
fields = ("name", "role", "tag", "lan_ip", "tailnet_name")
errors, seen = [], set()
peers = data.get("peers") or []
if not peers:
    errors.append("keine Eintraege unter 'peers'")
for i, p in enumerate(peers):
    if not isinstance(p, dict):
        errors.append(f"#{i}: Eintrag ist keine Abbildung")
        continue
    name = p.get("name") or f"#{i}"
    for key in fields:
        if key not in p:
            errors.append(f"{name}: Feld '{key}' fehlt")
    role = p.get("role")
    if role not in expected_tag:
        errors.append(f"{name}: role '{role}' ist weder server noch client")
    elif p.get("tag") != expected_tag[role]:
        errors.append(f"{name}: role {role} verlangt tag {expected_tag[role]}, gefunden {p.get('tag')}")
    if role == "server" and not p.get("lan_ip"):
        errors.append(f"{name}: Server braucht eine lan_ip")
    if not p.get("tailnet_name"):
        errors.append(f"{name}: tailnet_name ist leer")
    if name in seen:
        errors.append(f"{name}: doppelter Name")
    seen.add(name)

if errors:
    for e in errors:
        print(f"Inventar ungueltig ({path}): {e}", file=sys.stderr)
    sys.exit(2)

for p in peers:
    print("\t".join(str(p.get(k) or "-") for k in fields))
PY
)"; then
  exit 2
fi

if [[ "$LIST_ONLY" -eq 1 ]]; then
  printf '%s\n' "$PEERS"
  exit 0
fi

# ── Vorbedingung: Tailscale-CLI und Dienstzustand ─────────────────────────────
if [[ -n "${TAILSCALE_CLI:-}" ]]; then
  CLI="$TAILSCALE_CLI"
elif command -v tailscale >/dev/null 2>&1; then
  CLI="$(command -v tailscale)"
else
  CLI="$WIN_CLI"
fi
if [[ ! -x "$CLI" ]]; then
  echo "Vorbedingung fehlt: Tailscale-CLI nicht gefunden (geprueft: ${CLI})" >&2
  exit 2
fi

status_out="$("$CLI" status --json </dev/null 2>&1 | tr -d '\r' || true)"
state="$(printf '%s' "$status_out" | python3 -c '
import json, sys
try:
    print(json.load(sys.stdin).get("BackendState", ""))
except Exception:
    print("")
')"
if [[ "$state" != "Running" ]]; then
  echo "Vorbedingung fehlt: Tailscale-Dienst im Zustand '${state:-unbekannt}', erwartet 'Running' — kein Peer geprueft." >&2
  if [[ -z "$state" ]]; then
    echo "Ausgabe von 'tailscale status --json': ${status_out:0:300}" >&2
  fi
  exit 2
fi

# ── Pruefung ───────────────────────────────────────────────────────────────────
classify() {  # stdin: Ausgabe von tailscale ping -> direct | relay | unreachable
  awk '
    /^pong from / { if ($0 ~ / via DERP\(/) relay = 1; else direct = 1 }
    END { if (direct) print "direct"; else if (relay) print "relay"; else print "unreachable" }
  '
}

UNREACHABLE=()
CHECKED=0
# fd 3 statt stdin und </dev/null am Ping: die Windows-CLI laeuft ueber WSL-Interop und
# darf die Peer-Liste nicht als stdin verschlucken (Muster aus scripts/wg-mesh-sync.sh).
while IFS=$'\t' read -r -u 3 name role _tag lan_ip tailnet_name; do
  [[ "$role" == "server" ]] || continue
  CHECKED=$((CHECKED + 1))
  ping_out="$("$CLI" ping --c "$PING_COUNT" --timeout "$PING_TIMEOUT" "$tailnet_name" </dev/null 2>&1 | tr -d '\r' || true)"
  route="$(printf '%s\n' "$ping_out" | classify)"
  if [[ "$route" == "direct" || "$route" == "relay" ]]; then
    echo "OK   ${name} (${tailnet_name}, LAN ${lan_ip}): ${route}"
  else
    echo "FAIL ${name} (${tailnet_name}, LAN ${lan_ip}): unerreichbar — $(printf '%s\n' "$ping_out" | tail -1)"
    UNREACHABLE+=("$name")
  fi
done 3<<<"$PEERS"

if [[ "$CHECKED" -eq 0 ]]; then
  echo "Vorbedingung fehlt: Inventar enthaelt keinen Eintrag mit role: server" >&2
  exit 2
fi
if [[ ${#UNREACHABLE[@]} -gt 0 ]]; then
  echo "tailnet-check: ${#UNREACHABLE[@]} von ${CHECKED} Server(n) unerreichbar: ${UNREACHABLE[*]}" >&2
  exit 1
fi
echo "tailnet-check: alle ${CHECKED} Server erreichbar."
exit 0
