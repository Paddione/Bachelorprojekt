#!/usr/bin/env bash
# scripts/lib/ticket-grill.sh
# Pure helper sourced by ticket.sh — declares cmd_grill only.
# No top-level side effects, no back-imports. Uses _pgpod/_exec_sql/$NS/$CTX/$USER/$DB from ticket.sh.
#
# Writes a grilling Q/A session into tickets.tickets.grilling_answers (JSONB), per-question
# accumulating merge, forward-compatible with the T000737 GrillingAnswersPanel
# (shape: { <questionnaire-id>: { <questionId>: <answer> } }). Optionally posts a readable
# timeline comment (author 'grilling') unless --no-comment.

# Build a compact JSON object {"qid":"text",...} from repeated --answer qid=text pairs.
# Each pair is shell-quoted into a jq arg; jq guarantees valid JSON escaping.
_grill_answers_json() {
  local json='{}' pair k v
  for pair in "$@"; do
    k="${pair%%=*}"; v="${pair#*=}"
    if [[ "$pair" != *=* || -z "$k" ]]; then
      echo "ERROR: --answer expects <qid>=<text> (got '$pair')." >&2
      return 2
    fi
    json=$(jq -c --arg k "$k" --arg v "$v" '. + {($k): $v}' <<<"$json")
  done
  printf '%s' "$json"
}

cmd_grill() {
  local id="" questionnaire="coaching-sessions-v1" json="" answers_file="" no_comment="false"
  local -a answers=()
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)            id="$2"; shift 2 ;;
      --questionnaire) questionnaire="$2"; shift 2 ;;
      --json)          json="$2"; shift 2 ;;
      --answers-file)  answers_file="$2"; shift 2 ;;
      --answer)        answers+=("$2"); shift 2 ;;
      --no-comment)    no_comment="true"; shift ;;
      --brand)         shift 2 ;;  # consumed pre-source by ticket.sh BRAND handling; ignore here
      *)               echo "Unknown grill option: $1" >&2; exit 2 ;;
    esac; done

  # --- Validate BEFORE _pgpod so bad-arg errors are deterministic w/o a cluster (FA-SF-35/50). ---
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  if [[ -z "$questionnaire" ]]; then echo "ERROR: --questionnaire must not be empty." >&2; exit 2; fi
  local sources=0
  [[ -n "$json" ]] && sources=$((sources+1))
  [[ -n "$answers_file" ]] && sources=$((sources+1))
  [[ ${#answers[@]} -gt 0 ]] && sources=$((sources+1))
  if [[ "$sources" -eq 0 ]]; then
    echo "ERROR: one answer source is required (--json | --answers-file | --answer qid=text ...)." >&2
    exit 2
  fi
  if [[ "$sources" -gt 1 ]]; then
    echo "ERROR: use exactly one of --json | --answers-file | --answer." >&2
    exit 2
  fi

  # --- Resolve the answers JSON for this questionnaire (still cluster-free). ---
  local answers_json=""
  if [[ -n "$json" ]]; then
    answers_json="$json"
  elif [[ -n "$answers_file" ]]; then
    if [[ ! -s "$answers_file" ]]; then echo "ERROR: answers file missing or empty: $answers_file" >&2; exit 2; fi
    answers_json=$(cat "$answers_file")
  else
    answers_json=$(_grill_answers_json "${answers[@]}") || exit $?
  fi
  # Fail closed on malformed JSON before touching the cluster.
  if ! jq -e . >/dev/null 2>&1 <<<"$answers_json"; then
    echo "ERROR: answers are not valid JSON: $answers_json" >&2; exit 2
  fi

  local pod; pod=$(_pgpod)

  # Idempotent self-protection: works independent of T000737 merge timing, same column/shape.
  _exec_sql "$pod" <<'EOF' >/dev/null
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS grilling_answers JSONB;
EOF

  # Per-question accumulating merge (existing answers kept; same questionId overwritten).
  local affected
  affected=$(_exec_sql "$pod" -v ext_id="$id" -v qid="$questionnaire" -v answers="$answers_json" <<'EOF'
UPDATE tickets.tickets
   SET grilling_answers =
       COALESCE(grilling_answers, '{}'::jsonb)
       || jsonb_build_object(
            :'qid',
            COALESCE(grilling_answers -> :'qid', '{}'::jsonb) || :'answers'::jsonb
          )
 WHERE external_id = :'ext_id'
RETURNING 1;
EOF
)
  if [[ -z "$affected" ]]; then
    echo "ERROR: Ticket $id not found." >&2
    exit 1
  fi

  # Universal visibility: a readable Q/A timeline comment unless suppressed.
  if [[ "$no_comment" != "true" ]]; then
    local summary
    summary=$(jq -r --arg q "$questionnaire" \
      '"Grilling-Session (\($q)):\n" + (to_entries | map("- \(.key): \(.value)") | join("\n"))' \
      <<<"$answers_json")
    _exec_sql "$pod" -v ext_id="$id" -v body="$summary" <<'EOF' >/dev/null
INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
SELECT id, 'grilling', :'body', 'internal'
FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
  fi

  echo "Grilling session ($questionnaire) saved to ticket $id"
}
