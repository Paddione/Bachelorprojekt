#!/usr/bin/env bash
# scripts/e2e-skill-selfpatch.sh — self-patch orchestrator for dev-flow-e2e skill.
#
# Modes:
#   --list-trivial          Print "EXT_ID|DESCRIPTION" for each ai_ready trivial ticket
#   --commit EXT_ID BRANCH  Stage SKILL.md, commit, push, PR, merge, mark ticket done
#   --defer-structural      Mark remaining ai_ready structural tickets as needs_human
#
# Trivial vs structural classification:
#   Trivial  — description contains: command|flag|example|typo|path|exit.?code|missing.*step
#   Structural — anything else (step reorder, routing change, new section)
set -euo pipefail

SKILL_MD=".claude/skills/dev-flow-e2e/SKILL.md"
SKILL_COMPONENT="skills/dev-flow-e2e"
CONTEXT="mentolder"
NS="workspace"

_pgpod() {
  kubectl get pod -n "$NS" --context "$CONTEXT" \
    -l app=shared-db -o name 2>/dev/null | head -1
}

_psql() {
  local pod="$1"; shift
  kubectl exec "$pod" -n "$NS" --context "$CONTEXT" -- \
    psql -U website -d website -At -c "$@" 2>/dev/null
}

_is_trivial() {
  echo "$1" | grep -qiE 'command|flag|example|typo|wrong.*path|missing.*step|exit.?code|add.*check'
}

case "${1:-}" in

  --list-trivial)
    POD=$(_pgpod)
    if [[ -z "$POD" ]]; then
      echo "[selfpatch] No postgres pod — skipping" >&2
      exit 0
    fi
    ROWS=$(_psql "$POD" \
      "SELECT external_id, description
       FROM tickets.tickets
       WHERE status NOT IN ('done','archived')
         AND component = '$SKILL_COMPONENT'
         AND attention_mode = 'ai_ready'
       ORDER BY created_at ASC;")
    while IFS='|' read -r ext_id desc; do
      [[ -z "$ext_id" ]] && continue
      if _is_trivial "$desc"; then
        printf '%s|%s\n' "$ext_id" "$desc"
      fi
    done <<< "$ROWS"
    ;;

  --commit)
    EXT_ID="${2:?--commit requires EXT_ID}"
    BRANCH="${3:?--commit requires BRANCH_NAME}"
    POD=$(_pgpod)

    git add "$SKILL_MD"
    git commit -m "chore(skills): skill-improvement from ticket $EXT_ID"
    git push -u origin "$BRANCH"
    gh pr create \
      --title "chore(skills): skill-improvement [$EXT_ID]" \
      --body "Auto-applied from skill-friction ticket $EXT_ID via e2e-skill-selfpatch." \
      --base main
    gh pr merge --squash --delete-branch --auto
    git checkout main
    git pull --rebase origin main

    if [[ -n "$POD" ]]; then
      _psql "$POD" \
        "UPDATE tickets.tickets SET
           status = 'done', resolution = 'fixed', done_at = now(),
           notes = COALESCE(notes || E'\n\n', '') ||
             '[e2e-skill-selfpatch $(date +%Y-%m-%d)] Trivial fix applied and merged.'
         WHERE external_id = '$EXT_ID';" >/dev/null
    fi
    echo "[selfpatch] ✓ $EXT_ID applied and merged"
    ;;

  --defer-structural)
    POD=$(_pgpod)
    [[ -z "$POD" ]] && exit 0
    ROWS=$(_psql "$POD" \
      "SELECT external_id, description
       FROM tickets.tickets
       WHERE status NOT IN ('done','archived')
         AND component = '$SKILL_COMPONENT'
         AND attention_mode = 'ai_ready'
       ORDER BY created_at ASC;")
    COUNT=0
    while IFS='|' read -r ext_id desc; do
      [[ -z "$ext_id" ]] && continue
      if ! _is_trivial "$desc"; then
        _psql "$POD" \
          "UPDATE tickets.tickets SET
             attention_mode = 'needs_human',
             notes = COALESCE(notes || E'\n\n', '') ||
               '[e2e-skill-selfpatch $(date +%Y-%m-%d)] Structural — requires human review.'
           WHERE external_id = '$ext_id';" >/dev/null
        echo "[selfpatch] → $ext_id deferred (structural)"
        COUNT=$((COUNT + 1))
      fi
    done <<< "$ROWS"
    echo "[selfpatch] $COUNT structural tickets deferred"
    ;;

  *)
    echo "Usage: $0 --list-trivial | --commit EXT_ID BRANCH | --defer-structural" >&2
    exit 2
    ;;
esac
