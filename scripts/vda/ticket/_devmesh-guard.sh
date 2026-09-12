#!/usr/bin/env bash
# scripts/vda/ticket/_devmesh-guard.sh — Ticket-Write-Guard gegen devmesh [T900118].
#
# devmesh (ADR-008) traegt eine Entwicklungsinstanz des Stacks. Fuehrende Ticket-DB
# bleibt fleet (design.md, Messung 2026-09-11: 388 Tickets). Ein Write gegen devmesh
# erzeugte eine zweite lebende Ticket-DB — die Split-Brain-Klasse aus T015005/T015008.
#
# devmesh wird an drei Merkmalen erkannt, damit ein umbenannter Context nicht
# durchrutscht (design.md D5):
#   1. Context-Name ist `devmesh`
#   2. der Context zeigt auf denselben API-Server wie der Context `devmesh`
#   3. der Server-Host ist lan_ip, tailnet_name oder tailnet_ip eines Eintrags mit
#      role: server in devmesh/inventory.yaml (Override: DEVMESH_INVENTORY)
# Was ein Write ist, entscheiden die Aufrufer (Befehls-Positivliste, SQL-Klassifikation).
#
# Aufruf:  bash _devmesh-guard.sh <CTX>     Exit 0 frei, 3 verweigert
# Sourcen: devmesh_ctx_is_target <CTX> · devmesh_sql_is_write <SQL> · devmesh_refuse_write <CTX>
# Kein `set` auf Top-Level: ticket-core und factory/lib sourcen diese Datei.

_DEVMESH_GUARD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

_devmesh_server_of() {
  local cluster
  command -v kubectl >/dev/null 2>&1 || return 0
  cluster="$(kubectl config view -o jsonpath="{.contexts[?(@.name==\"$1\")].context.cluster}" 2>/dev/null)" || true
  [[ -n "$cluster" ]] || return 0
  kubectl config view -o jsonpath="{.clusters[?(@.name==\"$cluster\")].cluster.server}" 2>/dev/null || true
}

devmesh_ctx_is_target() {
  local ctx="${1:-}" server ref host inv h
  [[ "$ctx" == "devmesh" ]] && return 0
  server="$(_devmesh_server_of "$ctx")"
  [[ -n "$server" ]] || return 1
  ref="$(_devmesh_server_of devmesh)"
  [[ -n "$ref" && "$server" == "$ref" ]] && return 0
  host="${server#*://}"; host="${host%%/*}"; host="${host%:*}"
  inv="${DEVMESH_INVENTORY:-$_DEVMESH_GUARD_DIR/../../../devmesh/inventory.yaml}"
  [[ -f "$inv" ]] || return 1
  if ! command -v yq >/dev/null 2>&1; then
    echo "WARN [T900118] _devmesh-guard: yq fehlt — Inventar-Abgleich fuer Context '$ctx' uebersprungen." >&2
    return 1
  fi
  while IFS= read -r h; do
    [[ -n "$h" ]] || continue
    [[ "$host" == "$h" || "${host%%.*}" == "$h" ]] && return 0
  done < <(yq -r '.. | select(tag == "!!map") | select(.role == "server") | (.lan_ip, .tailnet_name, .tailnet_ip) | select(. != null)' "$inv" 2>/dev/null)
  return 1
}

devmesh_sql_is_write() {
  grep -qiE '\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|copy|merge|setval|nextval)\b' <<<"${1:-}"
}

devmesh_refuse_write() {
  local ctx="${1:-}"
  devmesh_ctx_is_target "$ctx" || return 0
  echo "ERROR [T900118] Ticket-Write gegen devmesh verweigert (Context '$ctx') — fuehrende Ticket-DB ist fleet." >&2
  echo "  devmesh traegt nur Entwicklungsdaten. Writes mit TICKET_CTX=fleet bzw. FACTORY_CTX=fleet ausfuehren." >&2
  return 3
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  devmesh_refuse_write "$@"
  exit $?
fi
