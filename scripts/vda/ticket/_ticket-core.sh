#!/usr/bin/env bash
# scripts/vda/ticket/_ticket-core.sh
# Shared PG helpers for ticket subcommands. Sourced by ticket.sh and vda/ticket/*.sh.
# Expects: NS, CTX, DB, USER from sourcing context; defaults from TICKET_* env vars.

: "${NS:=${TICKET_NS:-workspace}}"
# Default-Kontext seit E3/T002626: die SDLC-Daten liegen lokal, die fleet-Kopie
# ist eingefroren. Derselbe Wert steht in scripts/ticket.sh (dort wird er vor
# dem Sourcen dieser Datei fuer die Namespace-Ableitung gebraucht) — beide
# Stellen zusammen aendern.
: "${CTX:=${TICKET_CTX:-k3d-mentolder-dev}}"
: "${DB:=website}"
USER="website"

# [T015168] Erwartete DB-Identitaet der SSOT. Geschrieben durch die Migration
# migrations/20260824-db-identity-marker.sql; _assert_db_identity probt sie nach
# der Pod-Aufloesung (fail-closed bei Fehlen/Abweichung). Die Paritaet dieses
# Literals mit der Migration erzwingt tests/spec/db-guard/db-identity-guard.bats.
TICKET_DB_IDENTITY_EXPECTED="${TICKET_DB_IDENTITY_EXPECTED:-9f1d3c6e-4b2a-4f8a-9c1d-7e5b3a2f1d00}"

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
# [T015168] Identity-Probe gegen Ghost-shared-db-Instanzen (zweite Split-Brain-
# Episode): nach der Pod-Aufloesung muss die DB den Marker der SSOT tragen. Einmal
# pro Prozess gecacht; unter dem BATS-Sentinel-Regime (T002224) skip — dort
# stubben Tests den Cluster selbst und die Probe wuerde jeden Offline-Test
# fail-closed schliessen. Bewusster Ausnahme-Modus: TICKET_ALLOW_UNVERIFIED_DB=1.
_TICKET_DB_IDENTITY_VERIFIED=""
_assert_db_identity() {
  local pod="$1" got
  if [[ -n "$_TICKET_DB_IDENTITY_VERIFIED" ]]; then return 0; fi
  if [[ -n "${BATS_TEST_NAME:-}${BATS_VERSION:-}" && "${TICKET_TEST_DB_OK:-0}" != "1" ]]; then
    return 0
  fi
  if [[ "${TICKET_ALLOW_UNVERIFIED_DB:-0}" == "1" ]]; then
    echo "WARN [T015168]: db identity unverified by design (TICKET_ALLOW_UNVERIFIED_DB=1, pod $pod)" >&2
    return 0
  fi
  got="$(_exec_sql "$pod" <<< "SELECT identity FROM tickets.db_identity")" || true
  if [[ -z "$got" ]]; then
    echo "ERROR [T015168]: resolved shared-db pod has NO identity marker (tickets.db_identity missing/empty) — refusing a possible ghost instance." >&2
    echo "  Remediation: apply the marker migration first: task db:migrate ENV=mentolder" >&2
    echo "  Bewusster Ausnahme-Modus: TICKET_ALLOW_UNVERIFIED_DB=1" >&2
    exit 1
  fi
  if [[ "$got" != "$TICKET_DB_IDENTITY_EXPECTED" ]]; then
    echo "ERROR [T015168]: db identity MISMATCH — expected $TICKET_DB_IDENTITY_EXPECTED, got $got. This is not the SSOT database." >&2
    echo "  Remediation: TICKET_CTX pruefen bzw. Restore-Situation klaeren; Ausnahme bewusst: TICKET_ALLOW_UNVERIFIED_DB=1" >&2
    exit 1
  fi
  _TICKET_DB_IDENTITY_VERIFIED=1
}

_pgpod() {
  local pod all
  local -a pods=()
  mapfile -t pods < <(kubectl get pod -n "$NS" --context "$CTX" -l 'app in (shared-db, shared-db-dev)' \
    --field-selector status.phase=Running -o name 2>/dev/null)
  # [T015168] Ghost-Klasse: mehrere Running-Pods auf dem Selector machen die Wahl
  # des "richtigen" Pods zum Gluecksspiel (frueher: blindes head -1). Fail-closed.
  if (( ${#pods[@]} > 1 )); then
    echo "ERROR [T015168]: ambiguous shared-db selection — ${#pods[@]} Running pods match the selector in namespace $NS (context $CTX):" >&2
    printf '  %s\n' "${pods[@]}" >&2
    echo "  Remediation: identify the ghost pod (kubectl get pod -n $NS -o wide) and delete it before any ticket command." >&2
    exit 1
  fi
  pod="${pods[0]:-}"
  if [[ -z "$pod" ]]; then
    # Only on the error path: ask again unfiltered to tell "no pod at all" apart
    # from "pods exist, none Running". The happy path keeps its single API call.
    all=$(kubectl get pod -n "$NS" --context "$CTX" -l 'app in (shared-db, shared-db-dev)' -o name 2>/dev/null | tr '\n' ' ')  # pod-phase-filter: intentional-unfiltered
    # [T002689/D5] Namespace und Kontext standen schon hier; ergaenzt ist der
    # HEBEL. Eine Meldung, die nur einen Zustand beschreibt, laesst den Aufrufer
    # raten, welche Variable er drehen muss — TICKET_CTX ist der Override.
    if [[ -n "${all// /}" ]]; then
      echo "ERROR: no Running shared-db pod in namespace $NS (context $CTX); found but not Running: ${all% } — override the context with TICKET_CTX" >&2
    else
      echo "ERROR: no shared-db pod found in namespace $NS (context $CTX) — override the context with TICKET_CTX" >&2
    fi
    exit 1
  fi
  _assert_db_identity "$pod"
  echo "$pod"
}

_exec_sql() {
  local pod="$1"; shift
  local stderr_tmp
  stderr_tmp="$(mktemp)"
  # [T002999] Capture stderr from kubectl exec, pass through unchanged, then
  # apply the kubelet-cert-hint on it. The hint enriches the output without
  # replacing it — the original error and exit code are preserved.
  kubectl exec -i "$pod" -n "$NS" --context "$CTX" -c postgres -- \
    psql -U "${USER:-website}" -d "${DB:-website}" -qtA -v ON_ERROR_STOP=1 "$@" 2>"$stderr_tmp"
  local rc=$?
  if [[ -s "$stderr_tmp" ]]; then
    local stderr_text
    stderr_text="$(cat "$stderr_tmp")"
    echo "$stderr_text" >&2
    # Source hint library relative to this script's location
    local hint_lib
    hint_lib="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/lib/kubelet-cert-hint.sh"
    if [[ -f "$hint_lib" ]]; then
      # shellcheck source=scripts/lib/kubelet-cert-hint.sh
      source "$hint_lib"
      _kubelet_cert_hint "$stderr_text"
    fi
  fi
  rm -f "$stderr_tmp"
  return $rc
}

# _verify_write_effect <pod> <ext_id> <field=expected>... [T015668]
#
# Re-reads the SSOT after a write verb and aborts loudly on mismatch.
# psql rc=0 only proves transport success, not that the row landed — the
# Ghost-shared-db episode (T015168) showed writes can silently land in
# the wrong pod.  This helper builds a per-field SELECT by external_id,
# compares each field to the expected value, and exits non-zero on drift.
#
# Supported field names:
#   <column>      — compared as t.<column> = :ext_id row's column
#   plan_ref      — subquery on tickets.ticket_comments (FACTORY-PLAN-REF %)
#   <field>=non-empty — asserts the value is present (not NULL/empty)
_verify_write_effect() {
  local pod="$1" ext_id="$2"; shift 2

  # Offline mode: skip verification entirely — the write was already skipped.
  _ticket_offline_skip "SSOT read-back verification" && return 0

  # Build the SELECT clause from field=expected pairs.
  local select_clause="" sep="" field expected
  local -a expected_vals=()
  for field in "$@"; do
    expected="${field#*=}"
    expected_vals+=("$expected")
    field="${field%%=*}"
    case "$field" in
      plan_ref)
        select_clause="${select_clause}${sep}(SELECT c.body FROM tickets.ticket_comments c WHERE c.ticket_id = t.id AND c.body LIKE 'FACTORY-PLAN-REF %' ORDER BY c.created_at DESC LIMIT 1)"
        ;;
      *)
        select_clause="${select_clause}${sep}t.${field}"
        ;;
    esac
    sep=", "
  done

  local row
  row="$(_exec_sql "$pod" -v ext_id="$ext_id" <<SQL
SELECT ${select_clause}
FROM tickets.tickets t
WHERE t.external_id = :'ext_id'
SQL
  )" || {
    echo "ERROR [T015668]: SSOT read-back query failed for ticket ${ext_id}." >&2
    echo "  Remediation: verify the ticket exists in the SSOT and the pod is reachable." >&2
    return 1
  }

  if [[ -z "$row" ]]; then
    echo "ERROR [T015668]: SSOT read-back returned no row for ticket ${ext_id}." >&2
    echo "  Remediation: verify the ticket exists in the SSOT." >&2
    return 1
  fi

  # Parse pipe-separated output from psql -qtA (default field separator is |).
  local i=0 actual expected
  local -a values=()
  IFS='|' read -ra values <<< "$row"
  for field in "$@"; do
    expected="${field#*=}"
    actual="${values[$i]:-}"
    # psql -A renders NULL as an empty string
    [[ "$actual" == "NULL" ]] && actual=""

    if [[ "$expected" == "non-empty" ]]; then
      if [[ -z "$actual" ]]; then
        echo "ERROR [T015668]: SSOT read-back MISMATCH on ticket ${ext_id} field '${field%%=*}' — expected a non-empty value, got empty." >&2
        echo "  Remediation: verify the write-side-effect (e.g. plan_ref comment) committed. Re-run the command or inspect the SSOT." >&2
        return 1
      fi
    elif [[ "$actual" != "$expected" ]]; then
      echo "ERROR [T015668]: SSOT read-back MISMATCH on ticket ${ext_id} field '${field%%=*}' — expected '${expected}', got '${actual}'." >&2
      echo "  Remediation: check pod logs (kubectl logs ${pod}) and re-run the write verb." >&2
      return 1
    fi
    i=$((i + 1))
  done

  return 0
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

# _ticket_lock_guard <external_id> [closure] — Durchsetzung der bisher rein advisory
# agent-lock.sh-Claims im Schreibpfad. Dispatch-Gates (dispatcher-prep.sh,
# babysit-prs.sh) fragen den Lock vor dem Dispatch ab,
# der Status-Write tat es nie — deshalb konnte eine zweite Session den Status
# eines fremd gelockten Tickets überschreiben (beobachtet bei T002270). [T002282]
#
# Zweites Argument "closure" = Abschluss-Übergang (update-status → done/archived):
# ein fremder ticket-scoped Lock blockt den Abschluss NICHT mehr, sondern wird
# nur noch gewarnt. [T003102] Subagent (andere SID), ticket-mcp (eigener
# Prozess) und der post-merge-Poller (auto-close-merged.sh) schliessen im
# selben Vorgang ab, halten aber nie die SID des ursprünglichen Claimers — der
# Lock schuetzt die Bearbeitung, nicht die Abschluss-Buchhaltung. Nicht-
# terminale Übergänge bleiben voll geschuetzt (Schutz gegen Doppelbearbeitung,
# T002282).
#
# TICKET_LOCK_OVERRIDE=1 = expliziter Escape-Hatch für Automationspfade, die
# bereits vor dem Dispatch gated wurden und selbst keinen Claim halten.
_ticket_lock_guard() {
  local id="$1" closure="${2:-}"
  [[ "${TICKET_LOCK_OVERRIDE:-0}" == "1" ]] && return 0
  local lock_sh out rc
  lock_sh="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/agent-lock.sh"
  [[ -x "$lock_sh" || -f "$lock_sh" ]] || return 0
  # [T002422] Explizites Durchreichen der Harness-Session-Variablen in den
  # Sub-Bash-Aufruf. Ohne diese Weitergabe kann der child bash die env-Variablen
  # nicht sehen, faellt auf den Unix-Session-ID-Fallback zurueck, und der
  # unterscheidet sich zwischen claim (Main-Shell) und check (Sub-Bash) — der
  # Lock-Guard sieht dann einen fremden Lock und verweigert den Schreibzugriff.
  #
  # [T002424] Die Entscheidung bleibt bei agent-lock.sh und wird NICHT hier
  # nachgebaut. Ein frueherer Versuch parste die Lock-Datei direkt ueber
  # "<git-common-dir>/agent-locks/ticket__<id>.json" — und verlor damit
  # AGENT_LOCK_DIR, das agent-lock.sh respektiert. Der Guard zeigte dann ins
  # Leere, owner_sid blieb leer, und er liess JEDEN Write durch (nachgewiesen
  # von T002282-M3). Wer die Pfadkonvention nachbaut, erbt sie nicht — er
  # dupliziert sie und laeuft auseinander.
  out="$(CLAUDE_CODE_SESSION_ID="${CLAUDE_CODE_SESSION_ID:-}" CLAUDE_SESSION_ID="${CLAUDE_SESSION_ID:-}" bash "$lock_sh" check ticket "$id" 2>/dev/null)"; rc=$?
  if [[ $rc -eq 3 ]]; then
    # [T002498-M10] SID-Drift pro Aufrufkontext: der Claim lief über Bash, der
    # Write über den MCP-Prozess — beide melden für DIESELBE Session verschiedene
    # SIDs (beobachtet bei T002494-Dispatch). Der Lock-Guard blockierte daraufhin
    # den eigenen Status-Write und bezeichnete die eigene Session als "ANDERE".
    # Bei Gleichheit der Halter-SID mit der eigenen Session ist es kein fremder
    # Lock → ohne Override durchlassen. Die Harness-UUID ist die einzige stabile
    # Session-Kennung (Unix-SID wechselt pro Bash-Call, T002375-p1).
    # [T003110] Fragt agent-lock.sh nach der eigenen SID statt sie hier nachzubauen.
    # Die private Namensliste (CLAUDE_CODE_SESSION_ID, CLAUDE_SESSION_ID) kannte
    # AGENT_LOCK_SID und OPENCODE_SESSION_ID nicht — dieselbe Duplikations-Falle,
    # vor der der T002424-Kommentar hier bereits warnt.
    local my_sid holder_sid
    my_sid="$(AGENT_LOCK_SID= bash "$lock_sh" mine 2>/dev/null)"
    holder_sid="$(printf '%s' "$out" | sed -n 's/.*"owner_sid": *"\([^"]*\)".*/\1/p' | head -1)"
    if [[ -n "$my_sid" && -n "$holder_sid" && "$my_sid" == "$holder_sid" ]]; then
      return 0
    fi
    # [T003102] Abschluss-Uebergang: trotz fremdem ticket-Lock durchlassen.
    # Der Halter ist nicht zwingend eine Fremdsession — Subagent, ticket-mcp
    # und post-merge-Poller schliessen im selben Vorgang ab, halten aber eine
    # andere SID. Warnen statt blocken, damit der Halter den Lock freigeben
    # kann (der Abschluss darf nicht an einem Alt-Lock haengen bleiben).
    if [[ "$closure" == "closure" ]]; then
      local holder_label holder_tool
      holder_label="$(printf '%s' "$out" | sed -n 's/.*"label": *"\([^"]*\)".*/\1/p' | head -1)"
      holder_tool="$(printf '%s' "$out" | sed -n 's/.*"tool": *"\([^"]*\)".*/\1/p' | head -1)"
      echo "WARNUNG: Ticket $id ist gesperrt (agent-lock), Abschluss wird trotzdem durchgelassen (T003102 — der Lock schuetzt die Bearbeitung, nicht den Abschluss)." >&2
      echo "       Halter: tool=${holder_tool:-?}, label=${holder_label:-?}, sid=${holder_sid:-?}" >&2
      echo "       Bitte den Claim nach getaner Arbeit freigeben: agent-lock.sh release ticket $id" >&2
      return 0
    fi
    # [T002498-M10] Meldung entschärft: der Halter ist nicht zwingend eine fremde
    # Session (SID-Drift möglich) — das sagen statt einer falschen Behauptung, und
    # Halter-Felder (tool/label/pid) zur Einordnung mitgeben. Der Halter-Block kam
    # schon vorher; es fehlte nur die Einordnung, welchen Schutz das Override kostet.
    local holder_label holder_tool
    holder_label="$(printf '%s' "$out" | sed -n 's/.*"label": *"\([^"]*\)".*/\1/p' | head -1)"
    holder_tool="$(printf '%s' "$out" | sed -n 's/.*"tool": *"\([^"]*\)".*/\1/p' | head -1)"
    echo "ERROR: Ticket $id ist gesperrt (agent-lock) — Status-Schreibvorgang verweigert." >&2
    echo "       Halter: tool=${holder_tool:-?}, label=${holder_label:-?}, sid=${holder_sid:-?} (siehe \"$(printf '%s' "$out" | tr '\n' ' ')\")" >&2
    # [T002424-M1] Diagnose: die eigene SID mit ausgeben. Ohne sie ist aus der
    # Meldung nicht ersichtlich, WARUM der Halter als fremd gilt — genau das
    # kostete bei T002424 eine Untersuchungsschleife.
    echo "       Eigene SID: ${my_sid:-<nicht gesetzt>} (Shell-PID $$)" >&2
    echo "       Regulaerer Weg: den Claim nach getaner Arbeit mit 'agent-lock.sh release' freigeben." >&2
    echo "       Falls der Halter diese Session ist, gezielt durchlassen: TICKET_LOCK_OVERRIDE=1 (deaktiviert den Schutz auch gegen echte Fremdsessions)" >&2
    return 7
  fi
  if [[ $rc -eq 4 ]]; then
    # [T005560] Halter ist nachweislich tot — warnen und durchlassen.
    local holder_label holder_tool
    holder_label="$(printf '%s' "$out" | sed -n 's/.*"label": *"\([^"]*\)".*/\1/p' | head -1)"
    holder_tool="$(printf '%s' "$out" | sed -n 's/.*"tool": *"\([^"]*\)".*/\1/p' | head -1)"
    echo "WARNUNG: Ticket $id hat einen Stale-Lock (Halter-PID tot, tool=${holder_tool:-?}, label=${holder_label:-?}) — Schreibvorgang durchgelassen." >&2
    return 0
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

# ── Filter-Validierung fuer die Lesepfade [T014386] ─────────────────────────
# Die Wertemengen spiegeln die CHECK-Constraints der Ticket-Tabelle. Sie wurden
# aus der lebenden DB erhoben, nicht aus der Doku abgeschrieben:
#
#   psql -d website -tAc "SELECT pg_get_constraintdef(oid) FROM pg_constraint
#                          WHERE conname IN ('tickets_status_check','tickets_type_check');"
#
# Hinweis: 'incident' steht im type-Constraint, wird aber im SSOT-Requirement
# "Ticket-Typ nutzt das Conventional-Commit-Vokabular" nicht aufgefuehrt. Die
# Validierung folgt dem Constraint — sonst lehnte sie Tickets ab, die die
# Datenbank akzeptiert (mishap.go legt `--type incident` an).
TICKET_VALID_STATUS="triage planning plan_staged backlog in_progress in_review qa_review blocked awaiting_deploy done archived"
TICKET_VALID_TYPE="fix feat chore project incident docs refactor perf test ci build bug feature task"
TICKET_VALID_ATTENTION="auto ai_ready needs_human"

# _ticket_validate_enum <feldname> <wert> <erlaubte-werte>
# Endet mit Exit 2 bei unbekanntem Wert. Die Meldung nennt den abgelehnten Wert
# UND die erlaubten — ohne beides muss der Aufrufer raten.
_ticket_validate_enum() {
  local field="$1" value="$2" allowed="$3" v
  for v in $allowed; do
    [[ "$value" == "$v" ]] && return 0
  done
  echo "ERROR: ungueltiger Wert fuer --${field}: '${value}'" >&2
  echo "       erlaubt: ${allowed// /, }" >&2
  return 2
}

# _ticket_validate_enum_list <feldname> <komma-liste> <erlaubte-werte>
# Zerlegt eine Komma-Liste (Leerzeichen werden entfernt, wie in der SQL) und
# lehnt die ganze Liste ab, sobald ein Glied ungueltig ist. Ein stillschweigend
# ignoriertes Glied waere schlimmer als die Ablehnung: der Aufrufer bekaeme die
# Treffer der uebrigen und hielte sie fuer die Antwort auf seine Frage.
_ticket_validate_enum_list() {
  local field="$1" list="$2" allowed="$3" item
  # Kein `local IFS=','` hier: bash scoped dynamisch, das gesetzte IFS gaelte
  # auch in _ticket_validate_enum und liesse dessen `for v in $allowed` ueber
  # Kommas statt Leerzeichen laufen — jeder Wert waere dann ungueltig. Statt
  # dessen einmal in ein Array zerlegen und mit Default-IFS weiterarbeiten.
  local -a items
  IFS=',' read -r -a items <<< "${list// /}"
  for item in "${items[@]}"; do
    [[ -n "$item" ]] || continue
    _ticket_validate_enum "$field" "$item" "$allowed" || return 2
  done
  return 0
}
