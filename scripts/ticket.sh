#!/usr/bin/env bash
# scripts/ticket.sh — unified CLI helper for ticket database operations.
#
# Commands:
#   create --type <type> --title <title> --description <description> [--brand <brand>] [--severity <severity>] [--priority <priority>] [--is-test-data]
#   update-status --id <external_id> --status <status> [--resolution <resolution>] [--notes <notes>]
#   add-comment --id <external_id> --body <body> [--author <author_label>] [--visibility <visibility>]
#   archive-plan --id <external_id> --slug <slug> --branch <branch> --plan-file <plan_file> [--pr <pr_number>]
#   get-attachments --id <external_id> --out-dir <out_dir>
#   get --id <external_id>
#   set-touched-files --id <external_id> --files <comma-separated-paths>
#   set-pipeline-slot --id <external_id> --slot <integer|null>
#   release-slot --id <external_id>
#   touch --id <external_id>

set -euo pipefail

CTX="${TICKET_CTX:-fleet}"
NS="${TICKET_NS:-workspace}"
DB="website"
USER="website"

case "${BRAND:-}" in
  mentolder)   NS="workspace" ;;
  korczewski)  NS="workspace-korczewski" ;;
  "")          : ;;  # no BRAND given — keep TICKET_NS default
  *)           echo "ERROR: unknown BRAND (use mentolder|korczewski)" >&2; exit 2 ;;
esac

# If context is a dev cluster, append -dev to namespace
if [[ "$CTX" == k3d-* || "$CTX" == *-dev ]]; then
  if [[ "$NS" == "workspace" ]]; then
    NS="workspace-dev"
  elif [[ "$NS" == "workspace-korczewski" ]]; then
    NS="workspace-korczewski-dev"
  fi
fi

_pgpod() {
  local pod
  pod=$(kubectl get pod -n "$NS" --context "$CTX" -l 'app in (shared-db, shared-db-dev)' -o name 2>/dev/null | head -1)
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
    psql -U "$USER" -d "$DB" -qtA -v ON_ERROR_STOP=1 "$@"
}

cmd_create() {
  local type="" title="" desc="" brand="mentolder" severity="" priority="mittel" status="triage" is_test="false"
  while [[ $# -gt 0 ]]; do case "$1" in
      --type)        type="$2"; shift 2 ;;
      --title)       title="$2"; shift 2 ;;
      --description) desc="$2"; shift 2 ;;
      --brand)       brand="$2"; shift 2 ;;
      --severity)    severity="$2"; shift 2 ;;
      --priority)    priority="$2"; shift 2 ;;
      --status)      status="$2"; shift 2 ;;
      --is-test-data) is_test="true"; shift ;;
      *)             echo "Unknown create option: $1" >&2; exit 2 ;;
    esac; done

  if [[ -z "$priority" ]]; then
    priority="mittel"
  fi

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
    -v prio="$priority" \
    -v is_test="$is_test" <<'EOF'
INSERT INTO tickets.tickets (type, brand, title, description, status, severity, priority, is_test_data)
VALUES (:'type', :'brand', :'title', :'desc', :'status', NULLIF(:'sev', ''), :'prio', :'is_test'::boolean)
RETURNING external_id || '|' || id;
EOF
}

cmd_update_status() {
  local id="" status="" resolution="" notes=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)         id="$2"; shift 2 ;;
      --status)     status="$2"; shift 2 ;;
      --resolution) resolution="$2"; shift 2 ;;
      --notes)      notes="$2"; shift 2 ;;
      *)            echo "Unknown update-status option: $1" >&2; exit 2 ;;
    esac; done

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
  -- Release the pipeline slot on a terminal transition so the ledger never leaks (T000525).
  pipeline_slot = CASE WHEN :'status' IN ('done','archived') THEN NULL ELSE pipeline_slot END,
  notes = CASE WHEN :'notes' <> '' THEN COALESCE(notes || E'\n\n', '') || :'notes' ELSE notes END
WHERE external_id = :'ext_id';
EOF

  echo "Ticket $id status updated to $status"
}

cmd_add_comment() {
  local id="" body="" author="claude-code" visibility="internal"
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)          id="$2"; shift 2 ;;
      --body)        body="$2"; shift 2 ;;
      --author)      author="$2"; shift 2 ;;
      --visibility)  visibility="$2"; shift 2 ;;
      *)             echo "Unknown add-comment option: $1" >&2; exit 2 ;;
    esac; done

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
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)        id="$2"; shift 2 ;;
      --slug)      slug="$2"; shift 2 ;;
      --branch)    branch="$2"; shift 2 ;;
      --plan-file) plan_file="$2"; shift 2 ;;
      --pr)        pr="$2"; shift 2 ;;
      *)           echo "Unknown archive-plan option: $1" >&2; exit 2 ;;
    esac; done

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
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)      id="$2"; shift 2 ;;
      --out-dir) out_dir="$2"; shift 2 ;;
      *)         echo "Unknown get-attachments option: $1" >&2; shift ;;
    esac; done

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
      psql -U "$USER" -d "$DB" -qtA -v t_uuid="$uuid" -v fname="$filename" <<'EOF' > "$local_tmp"
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

cmd_get() {
  local id=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id) id="$2"; shift 2 ;;
      *)    echo "Unknown get option: $1" >&2; exit 2 ;;
    esac; done
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  local pod; pod=$(_pgpod)
  # Metadata only — NEVER select ticket_plans.content.
  _exec_sql "$pod" -v ext_id="$id" <<'EOF'
SELECT json_build_object(
  'external_id', t.external_id, 'id', t.id, 'type', t.type, 'brand', t.brand,
  'title', t.title, 'status', t.status, 'priority', t.priority,
  'touched_files', t.touched_files, 'pipeline_slot', t.pipeline_slot,
  'created_at', t.created_at, 'updated_at', t.updated_at,
  'plan_ref', (
    SELECT c.body FROM tickets.ticket_comments c
    WHERE c.ticket_id = t.id AND c.body LIKE 'FACTORY-PLAN-REF %'
    ORDER BY c.created_at DESC LIMIT 1
  )
) FROM tickets.tickets t WHERE t.external_id = :'ext_id';
EOF
}

cmd_enqueue() {
  local id="" branch="" plan=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)     id="$2"; shift 2 ;;
      --branch) branch="$2"; shift 2 ;;
      --plan)   plan="$2"; shift 2 ;;
      *)        echo "Unknown enqueue option: $1" >&2; exit 2 ;;
    esac; done
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  local pod; pod=$(_pgpod)
  # Flip into the factory queue: type=feature, status=backlog (claimable by slots.sh).
  _exec_sql "$pod" -v ext_id="$id" <<'EOF' >/dev/null
UPDATE tickets.tickets SET type='feature', status='backlog' WHERE external_id = :'ext_id';
EOF
  # Record a DDL-free plan reference for the pipeline's plan-reuse entrypoint.
  if [[ -n "$branch" || -n "$plan" ]]; then
    _exec_sql "$pod" -v ext_id="$id" -v ref="FACTORY-PLAN-REF branch=${branch} plan=${plan}" <<'EOF' >/dev/null
INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
SELECT id, 'factory', :'ref', 'internal' FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
  fi
  echo "Ticket $id enqueued for the Software Factory (type=feature, status=backlog)"
}

cmd_set_touched_files() {
  local id="" files=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)    id="$2"; shift 2 ;;
      --files) files="$2"; shift 2 ;;
      *)       echo "Unknown set-touched-files option: $1" >&2; exit 2 ;;
    esac; done
  if [[ -z "$id" || -z "$files" ]]; then echo "ERROR: --id and --files are required." >&2; exit 2; fi
  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v ext_id="$id" -v files="$files" <<'EOF' >/dev/null
UPDATE tickets.tickets SET touched_files = string_to_array(:'files', ',') WHERE external_id = :'ext_id';
EOF
  echo "touched_files set for ticket $id"
}

cmd_set_pipeline_slot() {
  local id="" slot=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)   id="$2"; shift 2 ;;
      --slot) slot="$2"; shift 2 ;;
      *)      echo "Unknown set-pipeline-slot option: $1" >&2; exit 2 ;;
    esac; done
  if [[ -z "$id" || -z "$slot" ]]; then echo "ERROR: --id and --slot are required (use --slot null to clear)." >&2; exit 2; fi
  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v ext_id="$id" -v slot="$slot" <<'EOF' >/dev/null
UPDATE tickets.tickets SET pipeline_slot = NULLIF(:'slot','null')::integer WHERE external_id = :'ext_id';
EOF
  echo "pipeline_slot set to $slot for ticket $id"
}

cmd_release_slot() {
  local id=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id) id="$2"; shift 2 ;;
      *)    echo "Unknown release-slot option: $1" >&2; exit 2 ;;
    esac; done
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v ext_id="$id" <<'EOF' >/dev/null
UPDATE tickets.tickets SET pipeline_slot = NULL WHERE external_id = :'ext_id';
EOF
  echo "pipeline_slot released for ticket $id"
}

cmd_touch() {
  local id=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id) id="$2"; shift 2 ;;
      *)    echo "Unknown touch option: $1" >&2; exit 2 ;;
    esac; done
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  local pod; pod=$(_pgpod)
  # Bump updated_at (the fn_lifecycle_ts BEFORE-UPDATE trigger sets it on any UPDATE).
  _exec_sql "$pod" -v ext_id="$id" <<'EOF' >/dev/null
UPDATE tickets.tickets SET updated_at = now() WHERE external_id = :'ext_id';
EOF
  echo "touched ticket $id"
}

cmd_retry_count() {
  local action="" id=""
  if [[ $# -gt 0 && "$1" != --* ]]; then action="$1"; shift; fi
  while [[ $# -gt 0 ]]; do case "$1" in
      --id) id="$2"; shift 2 ;;
      *)    echo "Unknown retry-count option: $1" >&2; exit 2 ;;
    esac; done
  if [[ "$action" != "get" && "$action" != "incr" && "$action" != "reset" ]]; then
    echo "ERROR: retry-count requires an action (get|incr|reset)." >&2; exit 2
  fi
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  local pod; pod=$(_pgpod)
  case "$action" in
    get)
      _exec_sql "$pod" -v ext_id="$id" <<'EOF'
SELECT retry_count FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
      ;;
    incr)
      _exec_sql "$pod" -v ext_id="$id" <<'EOF'
UPDATE tickets.tickets SET retry_count = retry_count + 1 WHERE external_id = :'ext_id' RETURNING retry_count;
EOF
      ;;
    reset)
      _exec_sql "$pod" -v ext_id="$id" <<'EOF'
UPDATE tickets.tickets SET retry_count = 0 WHERE external_id = :'ext_id' RETURNING retry_count;
EOF
      ;;
  esac
}

cmd_factory_control() {
  local action="" key="" brand="" value="" set_by=""
  if [[ $# -gt 0 && "$1" != --* ]]; then action="$1"; shift; fi
  while [[ $# -gt 0 ]]; do case "$1" in
      --key)    key="$2"; shift 2 ;;
      --brand)  brand="$2"; shift 2 ;;
      --value)  value="$2"; shift 2 ;;
      --set-by) set_by="$2"; shift 2 ;;
      *)        echo "Unknown factory-control option: $1" >&2; exit 2 ;;
    esac; done
  if [[ "$action" != "get" && "$action" != "set" ]]; then
    echo "ERROR: factory-control requires an action (get|set)." >&2; exit 2
  fi
  if [[ -z "$key" ]]; then echo "ERROR: --key is required." >&2; exit 2; fi
  # Validate before _pgpod so bad-arg errors are deterministic without a cluster (CI/FA-SF-35).
  if [[ "$action" == "set" && -z "$value" ]]; then echo "ERROR: --value is required for set." >&2; exit 2; fi
  local pod; pod=$(_pgpod)
  if [[ "$action" == "get" ]]; then
    _exec_sql "$pod" -v key="$key" -v brand="$brand" <<'EOF'
SELECT value FROM tickets.factory_control
WHERE key = :'key' AND brand IS NOT DISTINCT FROM NULLIF(:'brand','');
EOF
  else
    # Delete-then-insert, NOT ON CONFLICT: the unique index treats NULL brands as DISTINCT, so ON CONFLICT never fires for the global row → duplicates → kill-switch fail-open (T000474).
    _exec_sql "$pod" -v key="$key" -v brand="$brand" -v value="$value" -v set_by="$set_by" <<'EOF' >/dev/null
DELETE FROM tickets.factory_control WHERE key = :'key' AND brand IS NOT DISTINCT FROM NULLIF(:'brand','');
INSERT INTO tickets.factory_control (key, brand, value, set_by, updated_at)
VALUES (:'key', NULLIF(:'brand',''), :'value', NULLIF(:'set_by',''), now());
EOF
    echo "factory-control set: $key=${value}${brand:+ (brand=$brand)}"
  fi
}

cmd_dryrun_mark() {
  local id=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id) id="$2"; shift 2 ;;
      *)    echo "Unknown dryrun-mark option: $1" >&2; exit 2 ;;
    esac; done
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v key="dryrun:$id" <<'EOF' >/dev/null
INSERT INTO tickets.factory_control (key, brand, value, set_by, updated_at)
VALUES (:'key', NULL, 'done', 'ticket.sh', now())
ON CONFLICT (key, brand) DO UPDATE SET value = 'done', updated_at = now();
EOF
  echo "dryrun marked for ticket $id"
}

cmd_dryrun_check() {
  local id=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id) id="$2"; shift 2 ;;
      *)    echo "Unknown dryrun-check option: $1" >&2; exit 2 ;;
    esac; done
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  local pod found
  pod=$(_pgpod)
  found=$(_exec_sql "$pod" -v key="dryrun:$id" <<'EOF'
SELECT 1 FROM tickets.factory_control WHERE key = :'key' AND brand IS NULL LIMIT 1;
EOF
)
  if [[ "$found" == "1" ]]; then exit 0; else exit 1; fi
}

cmd_feature_flag() {
  local action="" brand="" key="" enabled="" set_by=""
  if [[ $# -gt 0 && "$1" != --* ]]; then action="$1"; shift; fi
  while [[ $# -gt 0 ]]; do case "$1" in
      --brand)   brand="$2"; shift 2 ;;
      --key)     key="$2"; shift 2 ;;
      --enabled) enabled="$2"; shift 2 ;;
      --set-by)  set_by="$2"; shift 2 ;;
      *)         echo "Unknown feature-flag option: $1" >&2; exit 2 ;;
    esac; done
  if [[ "$action" != "set" && "$action" != "get" && "$action" != "list" ]]; then
    echo "ERROR: feature-flag requires an action (set|get|list)." >&2; exit 2
  fi
  if [[ -z "$brand" ]]; then echo "ERROR: --brand is required." >&2; exit 2; fi
  # Validate before _pgpod so bad-arg errors are deterministic without a cluster (CI/FA-SF-35).
  if [[ ( "$action" == "set" || "$action" == "get" ) && -z "$key" ]]; then echo "ERROR: --key is required." >&2; exit 2; fi
  if [[ "$action" == "set" && "$enabled" != "true" && "$enabled" != "false" ]]; then echo "ERROR: --enabled must be true|false." >&2; exit 2; fi
  local pod; pod=$(_pgpod)
  case "$action" in
    set)
      _exec_sql "$pod" -v brand="$brand" -v key="$key" -v enabled="$enabled" -v set_by="$set_by" <<'EOF' >/dev/null
INSERT INTO tickets.feature_flags (brand, key, enabled, set_by)
VALUES (:'brand', :'key', :'enabled'::boolean, NULLIF(:'set_by',''))
ON CONFLICT (brand, key) DO UPDATE
  SET enabled = EXCLUDED.enabled, set_by = EXCLUDED.set_by;
EOF
      echo "feature-flag set: $brand/$key=$enabled"
      ;;
    get)
      _exec_sql "$pod" -v brand="$brand" -v key="$key" <<'EOF'
SELECT enabled FROM tickets.feature_flags WHERE brand = :'brand' AND key = :'key';
EOF
      ;;
    list)
      _exec_sql "$pod" -v brand="$brand" <<'EOF'
SELECT key || '=' || enabled FROM tickets.feature_flags WHERE brand = :'brand' ORDER BY key;
EOF
      ;;
  esac
}

cmd_phase() {
  # Positional <ext_id> <phase> <state>, then optional --detail / --driver.
  local id="" phase="" state="" detail="" driver="factory"
  [[ $# -ge 1 && "$1" != --* ]] && { id="$1"; shift; }
  [[ $# -ge 1 && "$1" != --* ]] && { phase="$1"; shift; }
  [[ $# -ge 1 && "$1" != --* ]] && { state="$1"; shift; }
  while [[ $# -gt 0 ]]; do case "$1" in
      --detail) detail="$2"; shift 2 ;;
      --driver) driver="$2"; shift 2 ;;
      *) echo "Unknown phase option: $1" >&2; exit 2 ;;
    esac; done
  # Validate BEFORE _pgpod so bad-arg errors are deterministic w/o a cluster (FA-SF-48).
  [[ -z "$id" || -z "$phase" || -z "$state" ]] && { echo "Usage: $0 phase <ext_id> <phase> <state> [--detail \"...\"] [--driver factory|devflow]" >&2; exit 2; }
  case "$phase" in scout|design|plan|implement|verify|deploy) ;; *) echo "ERROR: phase must be one of scout|design|plan|implement|verify|deploy." >&2; exit 2 ;; esac
  case "$state" in entered|done|blocked) ;; *) echo "ERROR: state must be one of entered|done|blocked." >&2; exit 2 ;; esac
  case "$driver" in factory|devflow) ;; *) echo "ERROR: driver must be one of factory|devflow." >&2; exit 2 ;; esac
  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v ext_id="$id" -v phase="$phase" -v state="$state" -v detail="$detail" -v driver="$driver" <<'EOF' >/dev/null
INSERT INTO tickets.factory_phase_events (ticket_id, phase, state, detail, driver)
SELECT id, :'phase', :'state', NULLIF(:'detail',''), :'driver'
FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
  echo "phase recorded: $id $phase/$state (driver=$driver)"
}

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <command> [options]" >&2
  echo "Commands: create, update-status, add-comment, archive-plan, get-attachments, get, set-touched-files, set-pipeline-slot, release-slot, touch, enqueue, retry-count, factory-control, dryrun-mark, dryrun-check, feature-flag, phase" >&2
  exit 1
fi

cmd="$1"; shift
case "$cmd" in
  create)            cmd_create "$@" ;;
  update-status)     cmd_update_status "$@" ;;
  add-comment)       cmd_add_comment "$@" ;;
  archive-plan)      cmd_archive_plan "$@" ;;
  get-attachments)   cmd_get_attachments "$@" ;;
  get)               cmd_get "$@" ;;
  set-touched-files) cmd_set_touched_files "$@" ;;
  set-pipeline-slot) cmd_set_pipeline_slot "$@" ;;
  release-slot)      cmd_release_slot "$@" ;;
  touch)             cmd_touch "$@" ;;
  enqueue)           cmd_enqueue "$@" ;;
  retry-count)       cmd_retry_count "$@" ;;
  factory-control)   cmd_factory_control "$@" ;;
  dryrun-mark)       cmd_dryrun_mark "$@" ;;
  dryrun-check)      cmd_dryrun_check "$@" ;;
  feature-flag)      cmd_feature_flag "$@" ;;
  phase)             cmd_phase "$@" ;;
  *)                 echo "Unknown command: $cmd" >&2; exit 1 ;;
esac



