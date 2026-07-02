# scripts/vda/ticket/assert-phase-chain.sh — fail-closed phase-chain gate (T001444).
# Sourced by ticket.sh. Verifies plan:done, implement:entered, verify:done exist
# for a ticket (any driver). Exit 0 = complete, 1 = gap, 2 = bad args.
source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

main() {
  local id="" json=false
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)   id="$2"; shift 2 ;;
      --json) json=true; shift ;;
      *)      echo "Unknown assert-phase-chain option: $1" >&2; exit 2 ;;
    esac; done
  # Validate BEFORE _pgpod so bad-arg errors are deterministic w/o a cluster (FA-SF-48).
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi

  local pod; pod=$(_pgpod)
  local present
  present=$(_exec_sql "$pod" -v ext_id="$id" <<'EOF'
SELECT DISTINCT e.phase || ':' || e.state
FROM tickets.factory_phase_events e
JOIN tickets.tickets t ON t.id = e.ticket_id
WHERE t.external_id = :'ext_id'
  AND (e.phase, e.state) IN (('plan','done'),('implement','entered'),('verify','done'));
EOF
)
  local required=(plan:done implement:entered verify:done)
  local missing=() r
  for r in "${required[@]}"; do
    grep -qxF "$r" <<<"$present" || missing+=("$r")
  done

  if [[ "$json" == true ]]; then
    local ok="true" arr="" first=1 m
    [[ ${#missing[@]} -gt 0 ]] && ok="false"
    for m in "${missing[@]:-}"; do
      [[ -z "$m" ]] && continue
      [[ $first -eq 1 ]] || arr+=","
      arr+="\"$m\""; first=0
    done
    echo "{\"ok\":$ok,\"missing\":[$arr]}"
    [[ ${#missing[@]} -eq 0 ]]; exit $?
  fi

  if [[ ${#missing[@]} -eq 0 ]]; then
    echo "OK: phase chain complete for $id (plan:done, implement:entered, verify:done)"
    exit 0
  fi

  echo "FAIL: phase chain incomplete for $id — missing: ${missing[*]}" >&2
  echo "Backfill with:" >&2
  for m in "${missing[@]}"; do
    echo "  ./scripts/ticket.sh phase $id ${m%%:*} ${m##*:} --driver devflow --detail \"backfill: assert-phase-chain\"" >&2
  done
  exit 1
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
