#!/usr/bin/env bash
# scripts/ticket.sh — unified CLI helper for ticket database operations.
#
# Commands:
#   create --type <type> --title <title> --description <description> [--brand <brand>] [--severity <severity>] [--priority <priority>]
#   update-status --id <external_id> --status <status> [--resolution <resolution>] [--notes <notes>]
#   add-comment --id <external_id> --body <body> [--author <author_label>] [--visibility <visibility>]
#   archive-plan --id <external_id> --slug <slug> --branch <branch> --plan-file <plan_file> [--pr <pr_number>]
#   get-attachments --id <external_id> --out-dir <out_dir>

set -euo pipefail

CTX="${TICKET_CTX:-fleet}"
NS="${TICKET_NS:-workspace}"
DB="website"
USER="website"

_pgpod() {
  local pod
  pod=$(kubectl get pod -n "$NS" --context "$CTX" -l app=shared-db -o name 2>/dev/null | head -1)
  if [[ -z "$pod" ]]; then
    echo "ERROR: no shared-db pod found in namespace $NS (context $CTX)" >&2
    exit 1
  fi
  echo "$pod"
}

_exec_sql() {
  local pod="$1"; shift
  # We read from stdin (which is passed down)
  kubectl exec -i "$pod" -n "$NS" --context "$CTX" -c postgres -- \
    psql -U "$USER" -d "$DB" -At -v ON_ERROR_STOP=1 "$@"
}

cmd_create() {
  local type="" title="" desc="" brand="mentolder" severity="" priority="mittel" status="triage"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --type)        type="$2"; shift 2 ;;
      --title)       title="$2"; shift 2 ;;
      --description) desc="$2"; shift 2 ;;
      --brand)       brand="$2"; shift 2 ;;
      --severity)    severity="$2"; shift 2 ;;
      --priority)    priority="$2"; shift 2 ;;
      --status)      status="$2"; shift 2 ;;
      *)             echo "Unknown create option: $1" >&2; exit 2 ;;
    esac
  done

  if [[ -z "$type" || -z "$title" || -z "$desc" ]]; then
    echo "ERROR: --type, --title, and --description are required." >&2
    exit 2
  fi

  local pod
  pod=$(_pgpod)

  _exec_sql "$pod" \
    -v type="$type" \
    -v brand="$brand" \
    -v title="$title" \
    -v desc="$desc" \
    -v status="$status" \
    -v sev="$severity" \
    -v prio="$priority" <<'EOF'
INSERT INTO tickets.tickets (type, brand, title, description, status, severity, priority)
VALUES (:'type', :'brand', :'title', :'desc', :'status', NULLIF(:'sev', ''), NULLIF(:'prio', ''))
RETURNING external_id || '|' || id;
EOF
}

cmd_update_status() {
  local id="" status="" resolution="" notes=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --id)         id="$2"; shift 2 ;;
      --status)     status="$2"; shift 2 ;;
      --resolution) resolution="$2"; shift 2 ;;
      --notes)      notes="$2"; shift 2 ;;
      *)            echo "Unknown update-status option: $1" >&2; exit 2 ;;
    esac
  done

  if [[ -z "$id" || -z "$status" ]]; then
    echo "ERROR: --id and --status are required." >&2
    exit 2
  fi

  local pod
  pod=$(_pgpod)

  _exec_sql "$pod" \
    -v ext_id="$id" \
    -v status="$status" \
    -v res="$resolution" \
    -v notes="$notes" <<'EOF' >/dev/null
UPDATE tickets.tickets SET
  status = :'status',
  resolution = NULLIF(:'res', ''),
  done_at = CASE WHEN :'status' = 'done' THEN now() ELSE done_at END,
  notes = CASE WHEN :'notes' <> '' THEN COALESCE(notes || E'\n\n', '') || :'notes' ELSE notes END
WHERE external_id = :'ext_id';
EOF

  echo "Ticket $id status updated to $status"
}

cmd_add_comment() {
  local id="" body="" author="claude-code" visibility="internal"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --id)          id="$2"; shift 2 ;;
      --body)        body="$2"; shift 2 ;;
      --author)      author="$2"; shift 2 ;;
      --visibility)  visibility="$2"; shift 2 ;;
      *)             echo "Unknown add-comment option: $1" >&2; exit 2 ;;
    esac
  done

  if [[ -z "$id" || -z "$body" ]]; then
    echo "ERROR: --id and --body are required." >&2
    exit 2
  fi

  local pod
  pod=$(_pgpod)

  _exec_sql "$pod" \
    -v ext_id="$id" \
    -v body="$body" \
    -v author="$author" \
    -v vis="$visibility" <<'EOF' >/dev/null
INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
SELECT id, :'author', :'body', :'vis'
FROM tickets.tickets WHERE external_id = :'ext_id';
EOF

  echo "Comment added to ticket $id"
}

cmd_archive_plan() {
  local id="" slug="" branch="" plan_file="" pr=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --id)        id="$2"; shift 2 ;;
      --slug)      slug="$2"; shift 2 ;;
      --branch)    branch="$2"; shift 2 ;;
      --plan-file) plan_file="$2"; shift 2 ;;
      --pr)        pr="$2"; shift 2 ;;
      *)           echo "Unknown archive-plan option: $1" >&2; exit 2 ;;
    esac
  done

  if [[ -z "$id" || -z "$slug" || -z "$branch" || -z "$plan_file" ]]; then
    echo "ERROR: --id, --slug, --branch, and --plan-file are required." >&2
    exit 2
  fi

  if [[ ! -s "$plan_file" ]]; then
    echo "ERROR: plan file does not exist or is empty: $plan_file" >&2
    exit 1
  fi

  local pod
  pod=$(_pgpod)

  local uuid
  uuid=$(_exec_sql "$pod" -v ext_id="$id" <<'EOF'
SELECT id FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
)
  if [[ -z "$uuid" ]]; then
    echo "ERROR: Ticket $id not found." >&2
    exit 1
  fi

  local pr_sql="NULL"
  if [[ -n "$pr" ]]; then
    pr_sql="'$pr'::integer"
  fi

  local tmpfile
  tmpfile=$(mktemp)
  {
    printf "INSERT INTO tickets.ticket_plans (ticket_id, slug, branch, content, pr_number)\nVALUES (\n  '%s',\n  '%s',\n  '%s',\n  \$plan\$" \
      "$uuid" "$slug" "$branch"
    cat "$plan_file"
    printf "\$plan\$,\n  %s\n);\n" "$pr_sql"
  } > "$tmpfile"

  # Run the insert via psql (stdin redirect)
  kubectl exec -i "$pod" -n "$NS" --context "$CTX" -c postgres -- \
    psql -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 < "$tmpfile" >/dev/null

  rm -f "$tmpfile"

  # Verify archiving
  local archived_count
  archived_count=$(_exec_sql "$pod" \
    -v t_uuid="$uuid" \
    -v slug="$slug" <<'EOF'
SELECT count(*) FROM tickets.ticket_plans WHERE ticket_id = :'t_uuid'::uuid AND slug = :'slug';
EOF
)

  if [[ "$archived_count" -lt 1 ]]; then
    echo "ERROR: Archive failed - plan not found in database." >&2
    exit 1
  fi

  echo "Plan successfully archived for ticket $id"
}

cmd_get_attachments() {
  local id="" out_dir=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --id)      id="$2"; shift 2 ;;
      --out-dir) out_dir="$2"; shift 2 ;;
      *)         echo "Unknown get-attachments option: $1" >&2; shift ;;
    esac
  done

  if [[ -z "$id" || -z "$out_dir" ]]; then
    echo "ERROR: --id and --out-dir are required." >&2
    exit 2
  fi

  mkdir -p "$out_dir"

  local pod
  pod=$(_pgpod)

  local uuid
  uuid=$(_exec_sql "$pod" -v ext_id="$id" <<'EOF'
SELECT id FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
)
  if [[ -z "$uuid" ]]; then
    echo "ERROR: Ticket $id not found." >&2
    exit 1
  fi

  # List filename
  local rows
  rows=$(_exec_sql "$pod" -v t_uuid="$uuid" <<'EOF'
SELECT filename FROM tickets.ticket_attachments WHERE ticket_id = :'t_uuid'::uuid;
EOF
)

  if [[ -z "$rows" ]]; then
    echo "No attachments found for ticket $id."
    return 0
  fi

  local count=0
  local local_tmp
  local_tmp=$(mktemp)

  while read -r filename; do
    [[ -z "$filename" ]] && continue
    echo "Fetching attachment: $filename ..."
    
    # Run redirection directly to a local temp file to avoid ARG_MAX
    kubectl exec -i "$pod" -n "$NS" --context "$CTX" -c postgres -- \
      psql -U "$USER" -d "$DB" -At -v t_uuid="$uuid" -v fname="$filename" <<'EOF' > "$local_tmp"
SELECT data_url FROM tickets.ticket_attachments WHERE ticket_id = :'t_uuid'::uuid AND filename = :'fname';
EOF

    if grep -q '^data:.*base64,' "$local_tmp"; then
      # Strip data URI prefix and base64 decode
      sed 's/^data:.*base64,//' "$local_tmp" | base64 -d > "$out_dir/$filename"
      echo "  ✓ Saved: $out_dir/$filename (decoded)"
    else
      cat "$local_tmp" > "$out_dir/$filename"
      echo "  ✓ Saved: $out_dir/$filename"
    fi
    count=$((count + 1))
  done <<< "$rows"

  rm -f "$local_tmp"
  echo "Successfully downloaded $count attachments for ticket $id."
}

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <command> [options]" >&2
  echo "Commands: create, update-status, add-comment, archive-plan, get-attachments" >&2
  exit 1
fi

cmd="$1"; shift
case "$cmd" in
  create)          cmd_create "$@" ;;
  update-status)   cmd_update_status "$@" ;;
  add-comment)     cmd_add_comment "$@" ;;
  archive-plan)    cmd_archive_plan "$@" ;;
  get-attachments) cmd_get_attachments "$@" ;;
  *)               echo "Unknown command: $cmd" >&2; exit 1 ;;
esac
