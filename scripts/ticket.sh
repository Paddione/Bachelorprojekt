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
#   set-scout-drift --id <external_id> --drift <numeric>
#   set-pipeline-slot --id <external_id> --slot <integer|null>
#   release-slot --id <external_id>
#   touch --id <external_id>
#   plan-meta set --id <external_id> [--value-prop ..] [--effort klein|mittel|gross] [--areas a,b] [--depends-on T-1,T-2] [--rank N] [--readiness k=true,..]
#   plan-meta get --id <external_id>

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

source "$(dirname "${BASH_SOURCE[0]}")/vda/ticket/_ticket-core.sh"

# TICKET_OFFLINE=1 — skip the cluster call for writes (dev-flow-execute best-effort).
# Mirrors scripts/openspec.sh so the same env var works for both CLIs.
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

cmd_create() {
  source "$(dirname "${BASH_SOURCE[0]}")/vda/ticket/create.sh"
  main "$@"
}

cmd_update_status() {
  if _ticket_offline_skip "update-status" "$@"; then exit 0; fi
  source "$(dirname "${BASH_SOURCE[0]}")/vda/ticket/update-status.sh"
  main "$@"
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

  if _ticket_offline_skip "add-comment" "--id" "$id"; then return 0; fi

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
source "$(dirname "${BASH_SOURCE[0]}")/lib/ticket-links.sh"
source "$(dirname "${BASH_SOURCE[0]}")/lib/ticket-grill.sh"
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

  # OFFLINE guard runs BEFORE the empty-plan-file check so operators get
  # the OFFLINE marker, not a 'plan file not found' error. See T001242 M3.
  if _ticket_offline_skip "archive-plan" "--id" "$id" "--slug" "$slug"; then return 0; fi

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
  source "$(dirname "${BASH_SOURCE[0]}")/vda/ticket/get.sh"
  main "$@"
}

cmd_enqueue() {
  source "$(dirname "${BASH_SOURCE[0]}")/vda/ticket/enqueue.sh"
  main "$@"
}

cmd_stage_plan() {
  source "$(dirname "${BASH_SOURCE[0]}")/vda/ticket/stage-plan.sh"
  main "$@"
}

cmd_set_touched_files() {
  local id="" files=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)    id="$2"; shift 2 ;;
      --files) files="$2"; shift 2 ;;
      *)       echo "Unknown set-touched-files option: $1" >&2; exit 2 ;;
    esac; done
  if [[ -z "$id" || -z "$files" ]]; then echo "ERROR: --id and --files are required." >&2; exit 2; fi
  if _ticket_offline_skip "set-touched-files" "--id" "$id"; then return 0; fi
  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v ext_id="$id" -v files="$files" <<'EOF' >/dev/null
UPDATE tickets.tickets SET touched_files = string_to_array(:'files', ',') WHERE external_id = :'ext_id';
EOF
  echo "touched_files set for ticket $id"
}

cmd_set_scout_drift() {
  # NOTE: This subcommand has a pre-existing schema bug — `tickets.tickets.scout_drift`
  # column does not exist. The OFFLINE guard runs FIRST, so test cases that exercise
  # the OFFLINE path (T001242 M3) pass without hitting the schema bug. Fixing the
  # schema bug is a separate ticket and out of scope here.
  local id="" drift=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)    id="$2"; shift 2 ;;
      --drift) drift="$2"; shift 2 ;;
      *)       echo "Unknown set-scout-drift option: $1" >&2; exit 2 ;;
    esac; done
  if [[ -z "$id" || -z "$drift" ]]; then echo "ERROR: --id and --drift are required." >&2; exit 2; fi
  if _ticket_offline_skip "set-scout-drift" "--id" "$id"; then return 0; fi
  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v ext_id="$id" -v drift="$drift" <<'EOF' >/dev/null
UPDATE tickets.tickets SET scout_drift = :'drift'::numeric, scout_drift_at = now() WHERE external_id = :'ext_id';
EOF
  echo "scout_drift set to $drift for ticket $id"
}

cmd_set_pipeline_slot() {
  local id="" slot=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)   id="$2"; shift 2 ;;
      --slot) slot="$2"; shift 2 ;;
      *)      echo "Unknown set-pipeline-slot option: $1" >&2; exit 2 ;;
    esac; done
  if [[ -z "$id" || -z "$slot" ]]; then echo "ERROR: --id and --slot are required (use --slot null to clear)." >&2; exit 2; fi
  if _ticket_offline_skip "set-pipeline-slot" "--id" "$id"; then return 0; fi
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
  if _ticket_offline_skip "release-slot" "--id" "$id"; then return 0; fi
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
  if _ticket_offline_skip "phase" "$id" "$phase" "$state"; then return 0; fi
  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v ext_id="$id" -v phase="$phase" -v state="$state" -v detail="$detail" -v driver="$driver" <<'EOF' >/dev/null
INSERT INTO tickets.factory_phase_events (ticket_id, phase, state, detail, driver)
SELECT id, :'phase', :'state', NULLIF(:'detail',''), :'driver'
FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
  echo "phase recorded: $id $phase/$state (driver=$driver)"
}

# Factory injection: operator notes/context/assets fed into a running/next pipeline. Validate-before-_pgpod (FA-SF-49).
cmd_inject() {
  local id="" kind="" phase="" title="" content="" tfiles="" file="" nc_path="" by="admin"
  while [[ $# -gt 0 ]]; do case "$1" in
      --id) id="$2"; shift 2 ;; --kind) kind="$2"; shift 2 ;; --phase) phase="$2"; shift 2 ;;
      --title) title="$2"; shift 2 ;; --content) content="$2"; shift 2 ;; --target-files) tfiles="$2"; shift 2 ;;
      --file) file="$2"; shift 2 ;; --nc-path) nc_path="$2"; shift 2 ;; --by) by="$2"; shift 2 ;;
      *) echo "Unknown inject option: $1" >&2; exit 2 ;;
    esac; done
  [[ -z "$id" || -z "$kind" ]] && { echo "ERROR: --id and --kind are required." >&2; exit 2; }
  case "$kind" in context|note|asset) ;; *) echo "ERROR: kind must be one of context|note|asset." >&2; exit 2 ;; esac
  [[ -n "$phase" ]] && case "$phase" in scout|design|plan|implement|verify|deploy) ;; *) echo "ERROR: phase must be one of scout|design|plan|implement|verify|deploy." >&2; exit 2 ;; esac
  local data_url="" mime="" fname=""
  if [[ "$kind" == "asset" ]]; then
    [[ -z "$file" && -z "$nc_path" ]] && { echo "ERROR: asset requires --file or --nc-path." >&2; exit 2; }
    if [[ -n "$file" ]]; then
      [[ ! -f "$file" ]] && { echo "ERROR: not a file: $file" >&2; exit 2; }
      case "${file,,}" in
        *.md) mime="text/markdown" ;; *.html|*.htm) mime="text/html" ;; *.txt|*.log) mime="text/plain" ;;
        *.jpg|*.jpeg) mime="image/jpeg" ;; *.png) mime="image/png" ;; *.gif) mime="image/gif" ;; *.webp) mime="image/webp" ;;
        *.pdf) mime="application/pdf" ;; *.mp4) mime="video/mp4" ;; *.webm) mime="video/webm" ;;
        *) echo "ERROR: unsupported file extension: $file" >&2; exit 2 ;;
      esac
      local size; size=$(stat -c %s "$file" 2>/dev/null || stat -f %z "$file")
      (( size > 10*1024*1024 )) && { echo "ERROR: $file exceeds 10 MB inline cap; use --nc-path." >&2; exit 2; }
      fname=$(basename -- "$file"); data_url="data:${mime};base64,$(base64 -w0 < "$file")"
    fi
  fi
  if _ticket_offline_skip "inject" "--id" "$id" "--kind" "$kind"; then return 0; fi
  local pod; pod=$(_pgpod)
  # Quoted heredoc (<<'EOF') → no shell expansion; every value a psql -v param, target_files via in-SQL CASE (injection-safe).
  _exec_sql "$pod" -v ext_id="$id" -v kind="$kind" -v phase="$phase" -v title="$title" \
    -v content="$content" -v tfiles="$tfiles" -v data_url="$data_url" -v nc_path="$nc_path" \
    -v fname="$fname" -v mime="$mime" -v by="$by" <<'EOF' >/dev/null
INSERT INTO tickets.ticket_injections
  (ticket_id, phase, kind, title, content, target_files, data_url, nc_path, filename, mime_type, injected_by)
SELECT id, NULLIF(:'phase',''), :'kind', NULLIF(:'title',''), NULLIF(:'content',''),
       CASE WHEN :'tfiles'='' THEN NULL ELSE string_to_array(:'tfiles',',') END, NULLIF(:'data_url',''), NULLIF(:'nc_path',''), NULLIF(:'fname',''), NULLIF(:'mime',''), :'by'
FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
  echo "injection added to ticket $id (kind=$kind${phase:+ phase=$phase})"
}

cmd_get_injections() {
  local id="" phase="" consume="false" format="text"
  while [[ $# -gt 0 ]]; do case "$1" in
      --id) id="$2"; shift 2 ;; --phase) phase="$2"; shift 2 ;; --consume) consume="true"; shift ;; --format) format="$2"; shift 2 ;;
      *) echo "Unknown get-injections option: $1" >&2; exit 2 ;;
    esac; done
  [[ -z "$id" ]] && { echo "ERROR: --id is required." >&2; exit 2; }
  [[ -n "$phase" ]] && case "$phase" in scout|design|plan|implement|verify|deploy) ;; *) echo "ERROR: phase must be one of scout|design|plan|implement|verify|deploy." >&2; exit 2 ;; esac
  local pod; pod=$(_pgpod)
  local jsonsel="json_agg(json_build_object('id',id,'kind',kind,'title',title,'content',content,'target_files',target_files,'data_url',data_url,'nc_path',nc_path,'filename',filename,'mime_type',mime_type,'phase',phase))"
  if [[ "$consume" == "true" ]]; then
    _exec_sql "$pod" -v ext_id="$id" -v phase="$phase" <<EOF
WITH consumed AS (
  UPDATE tickets.ticket_injections SET consumed_at = now()
   WHERE consumed_at IS NULL AND (phase = NULLIF(:'phase','') OR phase IS NULL)
     AND ticket_id = (SELECT id FROM tickets.tickets WHERE external_id = :'ext_id')
  RETURNING id, kind, title, content, target_files, data_url, nc_path, filename, mime_type, phase)
SELECT COALESCE(${jsonsel}, '[]'::json) FROM consumed;
EOF
  else
    _exec_sql "$pod" -v ext_id="$id" -v phase="$phase" <<EOF
SELECT COALESCE(${jsonsel}, '[]'::json) FROM tickets.ticket_injections
 WHERE ticket_id = (SELECT id FROM tickets.tickets WHERE external_id = :'ext_id')
   AND (:'phase' = '' OR phase = NULLIF(:'phase','') OR phase IS NULL);
EOF
  fi
}

cmd_plan_meta() {
  local action="${1:-}"; shift || true
  if [[ "$action" != "set" && "$action" != "get" ]]; then
    echo "ERROR: plan-meta requires a subaction: set|get" >&2; exit 2
  fi
  local id="" value_prop="" effort="" areas="" depends="" rank="" readiness="" requirements=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)          id="$2"; shift 2 ;;
      --value-prop)  value_prop="$2"; shift 2 ;;
      --effort)      effort="$2"; shift 2 ;;
      --areas)       areas="$2"; shift 2 ;;
      --depends-on)  depends="$2"; shift 2 ;;
      --rank)        rank="$2"; shift 2 ;;
      --readiness)   readiness="$2"; shift 2 ;;
      --requirements) requirements="$2"; shift 2 ;;  # Pflichtenheft list; '|'-separated (reqs may contain commas)
      *) echo "Unknown plan-meta option: $1" >&2; exit 2 ;;
    esac; done
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  if [[ -n "$effort" && "$effort" != "klein" && "$effort" != "mittel" && "$effort" != "gross" ]]; then
    echo "ERROR: --effort must be klein|mittel|gross." >&2; exit 2
  fi
  local pod; pod=$(_pgpod)

  if [[ "$action" == "get" ]]; then
    _exec_sql "$pod" -v ext_id="$id" <<'EOF'
SELECT json_build_object(
  'external_id', external_id, 'status', status, 'value_prop', value_prop,
  'effort', effort, 'areas', areas, 'depends_on', depends_on,
  'planning_rank', planning_rank, 'readiness', readiness,
  'requirements_list', requirements_list
) FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
    return
  fi

  local areas_sql="NULL" depends_sql="NULL" rank_sql="NULL" readiness_sql="NULL" requirements_sql="NULL"
  [[ -n "$areas" ]]   && areas_sql="ARRAY[$(_csv_to_quoted "$areas")]"
  [[ -n "$depends" ]] && depends_sql="ARRAY[$(_csv_to_quoted "$depends")]"
  [[ -n "$rank" ]]    && rank_sql="$rank"
  [[ -n "$readiness" ]] && readiness_sql="'$(_readiness_to_json "$readiness")'::jsonb"
  [[ -n "$requirements" ]] && requirements_sql="ARRAY[$(_pipe_to_quoted "$requirements")]"
  _exec_sql "$pod" \
    -v ext_id="$id" -v vp="$value_prop" -v eff="$effort" <<EOF >/dev/null
UPDATE tickets.tickets SET
  value_prop        = COALESCE(NULLIF(:'vp',''), value_prop),
  effort            = COALESCE(NULLIF(:'eff',''), effort),
  areas             = COALESCE($areas_sql, areas),
  depends_on        = COALESCE($depends_sql, depends_on),
  planning_rank     = COALESCE($rank_sql, planning_rank),
  readiness         = COALESCE($readiness_sql, readiness),
  requirements_list = COALESCE($requirements_sql, requirements_list),
  updated_at        = now()
WHERE external_id = :'ext_id';
EOF
  echo "plan-meta updated for $id"
}

# "a,b,c" -> "'a','b','c'" (single-quote each, escape embedded quotes)
_csv_to_quoted() {
  local IFS=','; local out=""; local item
  for item in $1; do
    item="${item//\'/\'\'}"
    out+="${out:+,}'$item'"
  done
  echo "$out"
}

# "a|b,c|d" -> "'a','b,c','d'" — pipe-separated so requirement lines may contain commas.
_pipe_to_quoted() {
  local IFS='|'; local out=""; local item
  for item in $1; do
    item="${item//\'/\'\'}"
    out+="${out:+,}'$item'"
  done
  echo "$out"
}

# lastenheft lock|unlock --id <external_id>
#   lock:   requires >=1 requirement; sets readiness.lastenheft_locked=true and
#           forward-transitions status (triage/planning/plan_staged -> backlog).
#   unlock: clears the flag (back to "Pflichtenheft"); status untouched.
cmd_lastenheft() {
  local action="${1:-}"; shift || true
  if [[ "$action" != "lock" && "$action" != "unlock" ]]; then
    echo "ERROR: lastenheft requires a subaction: lock|unlock" >&2; exit 2
  fi
  local id=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id) id="$2"; shift 2 ;;
      *) echo "Unknown lastenheft option: $1" >&2; exit 2 ;;
    esac; done
  # Validate before _pgpod so bad-arg errors are deterministic without a cluster.
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  local pod; pod=$(_pgpod)
  if [[ "$action" == "lock" ]]; then
    local n
    n=$(_exec_sql "$pod" -v ext_id="$id" <<'EOF'
SELECT COALESCE(array_length(array_remove(array_remove(requirements_list, NULL), ''), 1), 0)
FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
)
    n="${n//[[:space:]]/}"
    if [[ -z "$n" || "$n" == "0" ]]; then
      echo "ERROR: cannot lock — Lastenheft is empty (need >=1 requirement)." >&2; exit 3
    fi
    _exec_sql "$pod" -v ext_id="$id" <<'EOF' >/dev/null
UPDATE tickets.tickets SET
  readiness = COALESCE(readiness,'{}'::jsonb) || '{"lastenheft_locked":true}'::jsonb,
  status    = CASE WHEN status IN ('triage','planning','plan_staged') THEN 'backlog' ELSE status END,
  updated_at = now()
WHERE external_id = :'ext_id';
EOF
    echo "lastenheft locked for $id (Lastenheft — AI-ready, status forwarded to backlog)"
  else
    _exec_sql "$pod" -v ext_id="$id" <<'EOF' >/dev/null
UPDATE tickets.tickets SET
  readiness = COALESCE(readiness,'{}'::jsonb) || '{"lastenheft_locked":false}'::jsonb,
  updated_at = now()
WHERE external_id = :'ext_id';
EOF
    echo "lastenheft unlocked for $id (Pflichtenheft — editable)"
  fi
}

# "spec_skizziert=true,aufwand_geschaetzt=false" -> {"spec_skizziert":true,...}
_readiness_to_json() {
  local IFS=','; local out=""; local kv k v
  for kv in $1; do
    k="${kv%%=*}" v="${kv#*=}"
    [[ "$v" == "true" ]] && v="true" || v="false"
    out+="${out:+,}\"$k\":$v"
  done
  echo "{$out}"
}

cmd_list() {
  source "$(dirname "${BASH_SOURCE[0]}")/vda/ticket/list.sh"
  main "$@"
}

cmd_backfill_id() {
  source "$(dirname "${BASH_SOURCE[0]}")/vda/ticket/backfill-id.sh"
  main "$@"
}

cmd_get_timeline() {
  local id="" brand="${BRAND:-mentolder}"
  while [[ $# -gt 0 ]]; do case "$1" in
    --id)    id="$2"; shift 2 ;;
    --brand) brand="$2"; shift 2 ;;
    *)       echo "Unknown get-timeline option: $1" >&2; exit 2 ;;
  esac; done

  if [[ -z "$id" ]]; then
    echo "ERROR: --id is required." >&2
    exit 2
  fi
  if [[ "${TICKET_OFFLINE:-0}" == "1" ]]; then
    echo "OFFLINE: refused read get-timeline (cluster required)" >&2
    exit 9
  fi

  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v ext_id="$id" -v brand="$brand" <<'EOF'
WITH
comments AS (
  SELECT 'comment' AS source, tc.created_at AS ts,
    jsonb_build_object('type', tc.kind, 'author', tc.author_label, 'body', tc.body) AS detail
  FROM tickets.ticket_comments tc
  WHERE tc.ticket_id = (SELECT id FROM tickets.tickets WHERE external_id = :'ext_id')
),
phase_events AS (
  SELECT 'phase_event' AS source, pe.at AS ts,
    jsonb_build_object('phase', pe.phase, 'state', pe.state, 'driver', pe.driver, 'detail', pe.detail) AS detail
  FROM tickets.factory_phase_events pe
  WHERE pe.ticket_id = (SELECT id FROM tickets.tickets WHERE external_id = :'ext_id')
),
pr_links AS (
  SELECT 'pr_link' AS source, tl.created_at AS ts,
    jsonb_build_object('pr_number', tl.pr_number) AS detail
  FROM tickets.ticket_links tl
  WHERE tl.from_id = (SELECT id FROM tickets.tickets WHERE external_id = :'ext_id')
    AND tl.kind = 'pr'
),
plan_events AS (
  SELECT 'plan_archived' AS source, tp.archived_at AS ts,
    jsonb_build_object('slug', tp.slug, 'branch', tp.branch) AS detail
  FROM tickets.ticket_plans tp
  WHERE tp.ticket_id = (SELECT id FROM tickets.tickets WHERE external_id = :'ext_id')
    AND tp.archived_at IS NOT NULL
),
all_events AS (
  SELECT * FROM comments
  UNION ALL SELECT * FROM phase_events
  UNION ALL SELECT * FROM pr_links
  UNION ALL SELECT * FROM plan_events
)
SELECT jsonb_build_object(
  'ticket', (
    SELECT jsonb_build_object(
      'external_id', t.external_id,
      'title', t.title,
      'status', t.status,
      'type', t.type,
      'brand', :'brand',
      'created_at', t.created_at,
      'done_at', t.done_at,
      'resolution', t.resolution
    )
    FROM tickets.tickets t WHERE t.external_id = :'ext_id'
  ),
  'events', COALESCE(
    (SELECT jsonb_agg(
       jsonb_build_object('source', source, 'ts', ts, 'detail', detail)
       ORDER BY ts ASC
     ) FROM all_events),
    '[]'::jsonb
  )
) AS timeline;
EOF
}

cmd_triage() {
  export VDA_NONINTERACTIVE=1
  source "$(dirname "${BASH_SOURCE[0]}")/vda/ticket/triage.sh"
  main "$@"
}

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <command> [options]" >&2
  echo "Commands: create, update-status, add-comment, add-pr-link, grill, archive-plan, get-attachments, get, set-touched-files, set-scout-drift, set-pipeline-slot, release-slot, touch, enqueue, stage-plan, retry-count, factory-control, dryrun-mark, dryrun-check, feature-flag, phase, inject, get-injections, plan-meta, lastenheft, list, backfill-id, triage, link-tickets, get-ticket-links, get-timeline" >&2
  exit 1
fi
cmd="$1"; shift
case "$cmd" in
  create)            cmd_create "$@" ;;
  update-status)     cmd_update_status "$@" ;;
  add-comment)       cmd_add_comment "$@" ;;
  add-pr-link)       cmd_add_pr_link "$@" ;;
  grill)             cmd_grill "$@" ;;
  archive-plan)      cmd_archive_plan "$@" ;;
  get-attachments)   cmd_get_attachments "$@" ;;
  get)               cmd_get "$@" ;;
  set-touched-files) cmd_set_touched_files "$@" ;;
  set-scout-drift)   cmd_set_scout_drift "$@" ;;
  set-pipeline-slot) cmd_set_pipeline_slot "$@" ;;
  release-slot)      cmd_release_slot "$@" ;;
  touch)             cmd_touch "$@" ;;
  list)              cmd_list "$@" ;;
  backfill-id)       cmd_backfill_id "$@" ;;
  triage)            cmd_triage "$@" ;;
  enqueue)           cmd_enqueue "$@" ;;
  stage-plan)        cmd_stage_plan "$@" ;;
  retry-count)       cmd_retry_count "$@" ;;
  factory-control)   cmd_factory_control "$@" ;;
  dryrun-mark)       cmd_dryrun_mark "$@" ;;
  dryrun-check)      cmd_dryrun_check "$@" ;;
  feature-flag)      cmd_feature_flag "$@" ;;
  phase)             cmd_phase "$@" ;;
  inject)            cmd_inject "$@" ;;
  get-injections)    cmd_get_injections "$@" ;;
  plan-meta)         cmd_plan_meta "$@" ;;
  lastenheft)        cmd_lastenheft "$@" ;;
  link-tickets)      cmd_link_tickets "$@" ;;
  get-ticket-links)  cmd_get_ticket_links "$@" ;;
  get-timeline)      cmd_get_timeline "$@" ;;
  *)                 echo "Unknown command: $cmd" >&2; exit 1 ;;
esac

