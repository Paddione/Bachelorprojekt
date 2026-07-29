#!/usr/bin/env bash
# scripts/vda/ticket/_ticket-core.sh
# Shared PG helpers for ticket subcommands. Sourced by ticket.sh and vda/ticket/*.sh.
# Expects: NS, CTX, DB, USER from sourcing context; defaults from TICKET_* env vars.

: "${NS:=${TICKET_NS:-workspace}}"
: "${CTX:=${TICKET_CTX:-fleet}}"
: "${DB:=website}"
USER="website"

# [T002224] Fail-closed test guard. A BATS test that reaches this file must have
# stubbed the cluster itself (the repo idiom: prepend a mock `kubectl` to PATH,
# see tests/spec/feature-product-linking.bats). When it has not, the real
# kubectl is still on PATH and every write lands in the LIVE ticket database.
#
# That is not hypothetical: tests/spec/t001582-mishap-bundle.bats tried to block
# the cluster with PATH="/nonexistent-dir:$PATH" — which only *prepends* an empty
# directory and leaves the real kubectl resolvable. The test wrote a real
# `title=x, description=y` bug ticket on every suite run and produced ~130 rows
# between 2026-07-03 and 2026-07-26 before anyone traced them back here.
#
# So under BATS we repoint CTX at a sentinel context that cannot resolve. A
# stubbed kubectl ignores the value (mocks answer regardless of --context) and
# keeps passing; the real kubectl finds no pod and _pgpod exits 1 with its normal
# error. Set TICKET_TEST_DB_OK=1 to opt a test back into real cluster access.
if [[ -n "${BATS_TEST_NAME:-}${BATS_VERSION:-}" && "${TICKET_TEST_DB_OK:-0}" != "1" ]]; then
  CTX="bats-no-cluster-t002224"
fi

# [T002307] The pod list is filtered server-side to phase Running. kubectl orders
# by name, so a leftover Succeeded/Failed `shared-db-<old>` (rollout, node drain,
# eviction) can sort ahead of the live pod; every caller then died one step later
# in `kubectl exec` with "cannot exec into a container in a completed pod".
#
# [T002386] Korrektur der urspruenglichen Annahme: Hier stand "All ~25 call sites
# route through here, so the filter belongs here and nowhere else." Das stimmt
# nicht. Die Factory haelt in scripts/factory/lib.sh (factory_pgpod) eine eigene
# Implementierung, ebenso conflict-check.sh, mishap-categorize.sh und
# batch-gap-analysis.sh. Alle vier behielten den Bug und legten am 2026-07-28 die
# gesamte korczewski-Brand fuer den Dispatcher still.
#
# Wer eine weitere Pod-Selektion anlegt, braucht den Filter erneut. Der Guard
# dagegen ist scripts/check-pod-phase-filter.sh (seit T002439 ein eigenes Skript
# statt inline im Test; er prueft pro Treffer, nicht pro Datei, und deckt
# scripts/ UND tests/ ab). Aufrufbar als `task quality:pod-phase-filter`.
_pgpod() {
  local pod all
  pod=$(kubectl get pod -n "$NS" --context "$CTX" -l 'app in (shared-db, shared-db-dev)' \
    --field-selector status.phase=Running -o name 2>/dev/null | head -1)
  if [[ -z "$pod" ]]; then
    # Only on the error path: ask again unfiltered to tell "no pod at all" apart
    # from "pods exist, none Running". The happy path keeps its single API call.
    all=$(kubectl get pod -n "$NS" --context "$CTX" -l 'app in (shared-db, shared-db-dev)' -o name 2>/dev/null | tr '\n' ' ')  # pod-phase-filter: intentional-unfiltered
    if [[ -n "${all// /}" ]]; then
      echo "ERROR: no Running shared-db pod in namespace $NS (context $CTX); found but not Running: ${all% }" >&2
    else
      echo "ERROR: no shared-db pod found in namespace $NS (context $CTX)" >&2
    fi
    exit 1
  fi
  echo "$pod"
}

_exec_sql() {
  local pod="$1"; shift
  kubectl exec -i "$pod" -n "$NS" --context "$CTX" -c postgres -- \
    psql -U "${USER:-website}" -d "${DB:-website}" -qtA -v ON_ERROR_STOP=1 "$@"
}

# TICKET_OFFLINE=1 — skip the cluster call for writes (dev-flow-execute best-effort).
# Mirrors scripts/openspec.sh so the same env var works for both CLIs.
# [T001582-M3] Moved here from scripts/ticket.sh so both scripts/ticket.sh and
# scripts/vda/ticket/get.sh (which only sources this shared core, not
# ticket.sh) can reach it. Previously get.sh called _ticket_offline_refuse_read
# without it being defined anywhere it sourced, causing a "command not found"
# stderr on every call.
_ticket_offline_skip() {
  if [[ "${TICKET_OFFLINE:-0}" == "1" ]]; then
    echo "OFFLINE: skipped $*"
    return 0
  fi
  return 1
}

# TICKET_OFFLINE=1 — refuse reads loudly. Reads must reach the cluster to
# validate ticket state; silently returning empty would mask missing-cluster bugs.
_ticket_offline_refuse_read() {
  if [[ "${TICKET_OFFLINE:-0}" == "1" ]]; then
    echo "OFFLINE: refused read $* (cluster required for reads)" >&2
    return 9
  fi
  return 1
}

# _ticket_lock_guard <external_id> — Durchsetzung der bisher rein advisory
# agent-lock.sh-Claims im Schreibpfad. Dispatch-Gates (dispatcher-prep.sh,
# babysit-prs.sh) fragen den Lock vor dem Dispatch ab,
# der Status-Write tat es nie — deshalb konnte eine zweite Session den Status
# eines fremd gelockten Tickets überschreiben (beobachtet bei T002270). [T002282]
#
# TICKET_LOCK_OVERRIDE=1 = expliziter Escape-Hatch für Automationspfade, die
# bereits vor dem Dispatch gated wurden und selbst keinen Claim halten.
_ticket_lock_guard() {
  local id="$1"
  [[ "${TICKET_LOCK_OVERRIDE:-0}" == "1" ]] && return 0
  local lock_sh out rc
  lock_sh="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/agent-lock.sh"
  [[ -x "$lock_sh" || -f "$lock_sh" ]] || return 0
  # [T002422] Explizites Durchreichen der Harness-Session-Variablen in den
  # Sub-Bash-Aufruf. Ohne diese Weitergabe kann der child bash die env-Variablen
  # nicht sehen, faellt auf den Unix-Session-ID-Fallback zurueck, und der
  # unterscheidet sich zwischen claim (Main-Shell) und check (Sub-Bash) — der
  # Lock-Guard sieht dann einen fremden Lock und verweigert den Schreibzugriff.
  out="$(CLAUDE_CODE_SESSION_ID="${CLAUDE_CODE_SESSION_ID:-}" CLAUDE_SESSION_ID="${CLAUDE_SESSION_ID:-}" bash "$lock_sh" check ticket "$id" 2>/dev/null)"; rc=$?
  if [[ $rc -eq 3 ]]; then
    echo "ERROR: Ticket $id ist durch eine andere Session gesperrt (agent-lock) — Status-Schreibvorgang verweigert." >&2
    echo "       Halter: $(printf '%s' "$out" | tr '\n' ' ')" >&2
    echo "       Override nur bewusst: TICKET_LOCK_OVERRIDE=1" >&2
    return 7
  fi
  return 0
}

# _resolve_product_id <pod> <product_id-or-external_id> <brand>
# Resolves --product-id (create.sh, set-parent.sh) to a parent_id UUID.
# Fails (exit 2) when: not found, type <> 'project', or brand mismatch.
# Prints the resolved UUID to stdout on success.
_resolve_product_id() {
  local pod="$1" ref="$2" brand="$3"
  local row type_val row_brand uuid
  row=$(_exec_sql "$pod" -v ref="$ref" <<'EOF'
SELECT type, brand, id FROM tickets.tickets WHERE id::text = :'ref' OR external_id = :'ref';
EOF
)
  if [[ -z "$row" ]]; then
    echo "ERROR: --product-id '$ref' not found" >&2
    return 2
  fi
  IFS='|' read -r type_val row_brand uuid <<<"$row"
  if [[ "$type_val" != "project" ]]; then
    echo "ERROR: --product-id '$ref' must reference a project ticket (got type=$type_val)" >&2
    return 2
  fi
  if [[ "$row_brand" != "$brand" ]]; then
    echo "ERROR: --product-id '$ref' belongs to brand '$row_brand', not '$brand'" >&2
    return 2
  fi
  echo "$uuid"
}
