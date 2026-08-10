#!/usr/bin/env bash
# scripts/vda/factory-prep.sh — Factory PREP (consolidated)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${SCRIPT_DIR}/../.." && pwd)"

source "${SCRIPT_DIR}/../lib/vda-core.sh"
source "${SCRIPT_DIR}/../factory/guards.sh"

log() { echo "[PREP] $*" >&2; }

# release_slot_and_restore <brand> <ext_id> [prior_status]
#
# Slot freigeben UND den Vorzustand wiederherstellen (T003269).
#
# Zwei Eigenschaften, die beide nicht verhandelbar sind:
#
# 1) STUMM auf stdout. `run_prep` erzeugt auf stdout ausschliesslich sein
#    Abschluss-JSON; wakeup.sh pipet genau dieses stdout in `jq -c .`. Bis
#    T003269 lief `ticket.sh release-slot` hier nur mit `2>/dev/null`, seine
#    Erfolgsmeldung ("pipeline_slot released for ticket …") ging also auf stdout
#    mitten in den JSON-Stream. Ergebnis: Parse-Fehler, `null` in der Prep-Datei,
#    "0 feature(s) scheduled" — fuer ALLE Tickets des Ticks, nicht nur fuer das
#    uebersprungene. Deshalb `>/dev/null 2>&1` und nicht nur `2>/dev/null`.
#
# 2) Status zuruecksetzen. `slots.sh claim` setzt pipeline_slot UND
#    status='in_progress' gemeinsam; `release-slot` nimmt nur den Slot zurueck.
#    Ein so hinterlassenes Ticket steht auf `in_progress` ohne Slot — und
#    queue.sh liest ausschliesslich backlog/plan_staged. Es ist damit dauerhaft
#    unsichtbar und nie wieder schedulebar.
#
# Der Restore sitzt bewusst HIER und nicht in `cmd_release_slot`: `release-slot`
# ist ein generisches Primitiv mit fuenf weiteren Aufrufern (watchdog.sh,
# pipeline-runner.js, dispatcher.js, ticket-reclaim.sh), bei denen der Zielstatus
# ein voellig anderer ist — der Watchdog eskaliert auf `blocked`, der
# Pipeline-Runner gibt den Slot nach `done`/`in_review` frei. Ein in das Primitiv
# eingebauter Zwangs-Restore auf plan_staged wuerde diese Pfade beschaedigen.
# Nur der PREP-SKIP kennt den Vorzustand, also gehoert die Entscheidung hierher.
#
# Der Vorzustand ist nach dem Claim nicht mehr aus der DB lesbar (er wurde
# ueberschrieben), aber ableitbar: ein Ticket mit plan_ref war `plan_staged`,
# eines ohne kam als `backlog` aus der Queue.
release_slot_and_restore() {
  local brand="$1" ext_id="$2" prior="${3:-}"

  BRAND="${brand}" bash "${REPO}/scripts/ticket.sh" release-slot --id "${ext_id}" >/dev/null 2>&1 || true

  if [[ -z "${prior}" ]]; then
    local tj
    tj=$(BRAND="${brand}" bash "${REPO}/scripts/ticket.sh" get --id "${ext_id}" 2>/dev/null || echo '{}')
    if [[ -n "$(echo "${tj}" | jq -r '.plan_ref // ""' 2>/dev/null)" ]]; then
      prior="plan_staged"
    else
      prior="backlog"
    fi
  fi

  if ! BRAND="${brand}" bash "${REPO}/scripts/ticket.sh" update-status \
       --id "${ext_id}" --status "${prior}" >/dev/null 2>&1; then
    log "WARN status restore to ${prior} failed for ${ext_id} — ticket may be stranded on in_progress"
  fi
}

run_dry_run() {
  echo "PREP STEP START"
  echo "---guard_killswitch_on mentolder---"
  GUARDS_REPO="$REPO"
  if guard_killswitch_on mentolder; then echo "KILLSWITCH=TRIPPED"; else echo "KILLSWITCH=OK"; fi
  echo "---guard_killswitch_on korczewski---"
  if guard_killswitch_on korczewski; then echo "KILLSWITCH=TRIPPED"; else echo "KILLSWITCH=OK"; fi
  echo "---guard_daily_cap_reached mentolder---"
  if FACTORY_DAILY_DEPLOY_CAP=5 guard_daily_cap_reached mentolder; then echo "CAP=REACHED"; else echo "CAP=OK"; fi
  echo "---guard_daily_cap_reached korczewski---"
  if FACTORY_DAILY_DEPLOY_CAP=5 guard_daily_cap_reached korczewski; then echo "CAP=REACHED"; else echo "CAP=OK"; fi
  echo "---watchdog mentolder---"
  BRAND=mentolder bash "${REPO}/scripts/factory/watchdog.sh"
  echo "---watchdog korczewski---"
  BRAND=korczewski bash "${REPO}/scripts/factory/watchdog.sh"
  echo "---schedule mentolder---"
  BRAND=mentolder FACTORY_GLOBAL_CAP=3 bash "${REPO}/scripts/factory/schedule.sh"
  echo "---schedule korczewski---"
  BRAND=korczewski FACTORY_GLOBAL_CAP=3 bash "${REPO}/scripts/factory/schedule.sh"
  echo "PREP STEP END"
}

run_prep() {
  local final_launch='[]'
  local final_skipped='[]'

  for brand in mentolder korczewski; do
    log "=== ${brand} ==="
    local skip=false reason=""

    # Kill-switch
    if GUARDS_REPO="${REPO}" guard_killswitch_on "${brand}"; then
      log "KILLSWITCH ON -> skip ${brand}"
      skip=true; reason="killswitch"
    fi

    # Daily cap
    if ! "${skip}"; then
      if FACTORY_DAILY_DEPLOY_CAP="${FACTORY_DAILY_DEPLOY_CAP:-5}" GUARDS_REPO="${REPO}" guard_daily_cap_reached "${brand}"; then
        log "DAILY CAP REACHED -> skip ${brand}"
        skip=true; reason="daily_cap"
      fi
    fi

    if "${skip}"; then
      final_skipped=$(echo "${final_skipped}" | jq -c --arg b "${brand}" --arg r "${reason}" '. + [{"brand":$b,"reason":$r}]')
      continue
    fi

    # Watchdog — stdout muss von einer stdin-lesenden Schleife konsumiert werden:
    # log() liest kein stdin; ein direktes `| log` beendet die rechte Seite sofort
    # und der Watchdog stirbt an SIGPIPE (rc 141 unter pipefail). Best-effort:
    # ein Watchdog-Fehler bricht den PREP nicht ab (T001806).
    log "Watchdog ${brand}..."
    BRAND="${brand}" bash "${REPO}/scripts/factory/watchdog.sh" 2>&1 \
      | while IFS= read -r _wdline; do log "${_wdline}"; done \
      || log "Watchdog ${brand} failed (non-fatal)"

    # Schedule
    log "Schedule ${brand}..."
    local schedule_out
    schedule_out=$(BRAND="${brand}" FACTORY_GLOBAL_CAP="${FACTORY_GLOBAL_CAP:-3}" bash "${REPO}/scripts/factory/schedule.sh" 2>/dev/null)
    log "Schedule result: ${schedule_out}"

    # Process candidates from schedule
    for row in $(echo "${schedule_out}" | jq -c '.[]' 2>/dev/null); do
      [[ -z "${row}" ]] && continue
      local ext_id slot dry_run
      ext_id=$(echo "${row}" | jq -r '.external_id')
      slot=$(echo "${row}" | jq -r '.slot')
      log "Processing claimed ticket ${ext_id} (slot ${slot})"

      # Dry-run-first guard
      if GUARDS_REPO="${REPO}" guard_dryrun_ok "${ext_id}"; then
        dry_run=false
      else
        dry_run=true
        log "Dry-run check FAILED for ${ext_id} -> forcing dry_run=true"
      fi

      # Session-coordination guard (T000510)
      local al=0
      bash "${REPO}/scripts/agent-lock.sh" check ticket "${ext_id}" >/dev/null 2>&1; al=$? || true
      if [[ "${al}" -eq 3 ]]; then
        log "Ticket ${ext_id} claimed by live interactive session -> releasing slot"
        release_slot_and_restore "${brand}" "${ext_id}"
        final_skipped=$(echo "${final_skipped}" | jq -c --arg b "${brand}" --arg r "claimed by live interactive session" '. + [{"brand":$b,"reason":$r}]')
        continue
      fi

      # Fetch details
      local ticket_json title plan_ref branch plan_path br pp
      ticket_json=$(BRAND="${brand}" bash "${REPO}/scripts/ticket.sh" get --id "${ext_id}" 2>/dev/null || echo '{}')
      title=$(echo "${ticket_json}" | jq -r '.title // null')
      plan_ref=$(echo "${ticket_json}" | jq -r '.plan_ref // ""')

      # ── Attempt counter für Model-Escalation (T002369) ─────────────────────
      # Lies factory_attempt:<ext_id> aus factory_control; der Watchdog
      # inkrementiert diesen Zähler bei jedem Stale-Detect ohne Fortschritt.
      # pipeline_attempt = counter + 1 (der bevorstehende Pipeline-Durchlauf).
      # Mapping: 1→flash, 2→haiku, 3+→sonnet.
      local attempt_counter pipeline_attempt model_tier
      attempt_counter=$(BRAND="${brand}" bash "${REPO}/scripts/ticket.sh" factory-control get \
        --key "factory_attempt:${ext_id}" --brand "${brand}" 2>/dev/null || echo "0")
      attempt_counter=${attempt_counter:-0}
      pipeline_attempt=$(( attempt_counter + 1 ))
      if [[ "$pipeline_attempt" -ge 3 ]]; then
        model_tier="sonnet"
      elif [[ "$pipeline_attempt" -eq 2 ]]; then
        model_tier="haiku"
      else
        model_tier="flash"
      fi

      branch=null; plan_path=null
      if [[ -n "${plan_ref}" ]]; then
        br=$(echo "${plan_ref}" | grep -oP 'branch=\K\S+' || true)
        pp=$(echo "${plan_ref}" | grep -oP 'plan=\K\S+' || true)
        [[ -n "${br}" ]] && branch="${br}"
        [[ -n "${pp}" ]] && plan_path="${pp}"
      fi

      # Pre-create the worktree at the same path pipeline.js will use, branched
      # from origin/<branch> (not origin/main) so the plan file is materialized
      # on disk before the launched `claude -p` session runs its safety-check.
      # Without this, the LLM refuses to invoke Workflow because
      # $plan_path doesn't exist in the main checkout (only on the feature branch),
      # the prompt override is correctly flagged as manipulation, and the pipeline
      # exits immediately — leaving the slot held, watchdog reset, cycle repeats.
      wt_path=null
      if [[ "${branch}" != "null" && -n "${branch}" ]]; then
        wt_slug=$(echo "${branch}" | sed -E 's#^(feature|fix|chore)/##')
        wt_path="${REPO}/.worktrees/${wt_slug}-reuse"
        if ! bash "${REPO}/scripts/worktree-create.sh" "${branch}" "${wt_path}" "origin/${branch}" >/dev/null 2>&1; then
          log "SKIP reason=worktree_failed ticket=${ext_id} (pre-create at ${wt_path} failed)"
          # branch != null ⇒ das Ticket hatte einen plan_ref, war also plan_staged.
          release_slot_and_restore "${brand}" "${ext_id}" "plan_staged"
          final_skipped=$(echo "${final_skipped}" | jq -c --arg b "${brand}" --arg r "worktree_failed" '. + [{"brand":$b,"reason":$r}]')
          continue
        fi
        log "pre-created worktree for ${ext_id} at ${wt_path}"
      fi

      final_launch=$(echo "${final_launch}" | jq -c \
        --arg b "${brand}" --arg e "${ext_id}" --argjson s "${slot}" \
        --arg t "${title:-}" --arg br "${branch:-null}" --arg p "${plan_path:-null}" --arg w "${wt_path}" --argjson dr "${dry_run}" \
        --argjson at "${pipeline_attempt}" --arg mt "${model_tier}" \
        '. + [{"brand":$b, "external_id":$e, "slot":$s, "title":$t, "branch":$br, "plan_path":$p, "worktree_path":$w, "dry_run":$dr, "attempt":$at, "model_tier":$mt}]')
    done
  done

  jq -n --argjson launch "${final_launch}" --argjson skipped "${final_skipped}" '{launch: $launch, skipped: $skipped}'
}

main() {
  local dry_run=0
  while [[ $# -gt 0 ]]; do case "$1" in
    --dry-run) dry_run=1; shift ;;
    *) vda_error "Unknown option: $1"; exit 2 ;;
  esac; done

  if [[ "$dry_run" -eq 1 ]]; then
    run_dry_run
  else
    run_prep
  fi
}

main "$@"
