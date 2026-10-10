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
  local rows
  rows=$(_exec_sql "$pod" -v ext_id="$id" <<'EOF'
SELECT e.id, e.phase, e.state, COALESCE(e.detail, '')
FROM tickets.factory_phase_events e
JOIN tickets.tickets t ON t.id = e.ticket_id
WHERE t.external_id = :'ext_id'
  AND NOT (e.phase IN ('scout', 'design', 'plan') AND e.detail = 'auto: stage-plan')
ORDER BY e.at ASC, e.id ASC;
EOF
)

  # Validate sequential phase chain: plan:done -> implement:entered -> verify:done
  local has_plan=false has_impl=false has_verify=false order_error=false
  local plan_id=0 impl_id=0 verify_id=0
  local missing=()

  while IFS='|' read -r eid ephase estate edetail; do
    eid="${eid//[[:space:]]/}"
    ephase="${ephase//[[:space:]]/}"
    estate="${estate//[[:space:]]/}"
    [[ -z "$eid" ]] && continue

    if [[ "$ephase" == "plan" && "$estate" == "done" && "$has_plan" == false ]]; then
      has_plan=true; plan_id="$eid"
    elif [[ "$ephase" == "implement" && "$estate" == "entered" && "$has_impl" == false ]]; then
      has_impl=true; impl_id="$eid"
      if [[ "$has_plan" == false ]]; then order_error=true; fi
    elif [[ "$ephase" == "verify" && "$estate" == "done" && "$has_verify" == false ]]; then
      has_verify=true; verify_id="$eid"
      if [[ "$has_impl" == false ]]; then order_error=true; fi
    fi
  done <<<"$rows"

  if [[ "$has_plan" == false ]]; then missing+=("plan:done"); fi
  if [[ "$has_impl" == false ]]; then missing+=("implement:entered"); fi
  if [[ "$has_verify" == false ]]; then missing+=("verify:done"); fi

  local ok="true"
  if [[ ${#missing[@]} -gt 0 || "$order_error" == true ]]; then
    ok="false"
  fi

  if [[ "$json" == true ]]; then
    local arr="" first=1 m
    for m in "${missing[@]:-}"; do
      [[ -z "$m" ]] && continue
      [[ $first -eq 1 ]] || arr+=","
      arr+="\"$m\""; first=0
    done
    echo "{\"ok\":$ok,\"missing\":[$arr],\"order_error\":$order_error,\"run_evidence\":\"unknown\",\"commit_evidence\":\"unknown\"}"
    if [[ "$ok" == "true" ]]; then
      exit 0
    else
      exit 1
    fi
  fi

  if [[ "$ok" == "true" ]]; then
    echo "OK: phase chain complete and ordered for $id (plan:done -> implement:entered -> verify:done)"
    exit 0
  fi

  if [[ "$order_error" == true ]]; then
    echo "FAIL: phase chain order violation for $id (events out of chronological order)" >&2
  fi
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "FAIL: phase chain incomplete for $id — missing real evidence for: ${missing[*]}" >&2
    echo "Diagnose: fehlende Phase(n) in tickets.factory_phase_events ohne synthetische auto-Events." >&2
  fi
  exit 1
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
