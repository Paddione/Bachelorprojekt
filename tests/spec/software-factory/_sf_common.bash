#!/usr/bin/env bash
# tests/spec/software-factory/_sf_common.bash
#
# [T002503] Gemeinsame Praeambel der aus tests/spec/software-factory.bats
# aufgeteilten Dateien: Datei-Variablen, _skip_if_no_db, Setup/Teardown.
#
# Die Pfade tragen gegenueber dem Original eine Ebene mehr (../../.. statt ../..),
# weil die Tests jetzt ein Verzeichnis tiefer liegen.

# ── File-level variables ──────────────────────────────────────────────────────
PIPELINE_SCRIPT="scripts/factory/pipeline.mjs"
DISPATCHER_SCRIPT="scripts/factory/dispatcher.js"
GUARDS_SCRIPT="scripts/factory/guards.sh"
CANARY_SCRIPT="$BATS_TEST_DIRNAME/../../../scripts/feature-promote.sh"
PHASES_SCRIPT="$BATS_TEST_DIRNAME/../../../scripts/lib/promote-phases.sh"
WAKEUP_SCRIPT="scripts/factory/wakeup.sh"
PROVISION_MOD="scripts/factory/provision.js"
PROVISION_SUITE="scripts/factory/provision.test.mjs"
DECOMPOSE_MOD="scripts/factory/pipeline-decompose.cjs"
DECOMPOSE_SUITE="scripts/factory/pipeline-decompose.test.cjs"
PJS="$BATS_TEST_DIRNAME/../../../scripts/factory/pipeline.mjs"
# T002074: the Deploy-phase prompt moved into pipeline-partials.cjs (buildDeployPrompt)
# and the CI retry loop into pr-babysit-ticket.sh — deploy-contract greps span these.
PARTIALS_MOD="$BATS_TEST_DIRNAME/../../../scripts/factory/pipeline-partials.cjs"
PRBABYSIT="$BATS_TEST_DIRNAME/../../../scripts/factory/pr-babysit-ticket.sh"
BLS="$BATS_TEST_DIRNAME/../../../scripts/factory/build-loop.sh"
WAKEUP="${BATS_TEST_DIRNAME}/../../../scripts/factory/wakeup.sh"
BABYSIT="${BATS_TEST_DIRNAME}/../../../scripts/factory/babysit-prs.sh"
SERVICE="${BATS_TEST_DIRNAME}/../../../scripts/factory/factory.service"
TIMER="${BATS_TEST_DIRNAME}/../../../scripts/factory/factory.timer"
TASKFILE="${BATS_TEST_DIRNAME}/../../../taskfiles/Taskfile.factory.yml"
ROUTE="${BATS_TEST_DIRNAME}/../../../website/src/pages/sdlc/api/factory-metrics.ts"
REG="scripts/factory/service-registry.sh"

# ── Helpers ───────────────────────────────────────────────────────────────────
# Skip if no shared-db pod is reachable (offline / CI without cluster).
# Used by FA-SF-04 db-schema tests which require a live DB.
# [T002439] Der Phasenfilter ist Teil der BEDINGUNG, nicht Kosmetik: ohne ihn liefert die
# Selektion auch einen Completed-Pod, der Skip bleibt aus, und das folgende `kubectl exec`
# endet mit rc=1 statt in einem sauberen Skip. Genau so entstand der "DB-Nachweis rc=1"
# im Verify von T002418.
_skip_if_no_db() {
  local _pod
  # [T002626] Default folgt scripts/factory/lib.sh: seit ADR-006 E3 liegen die
  # SDLC-Daten lokal. Guard und Testkoerper muessen denselben Cluster messen —
  # sonst prueft der Guard fleet (erreichbar, kein Skip) und der Test scheitert
  # am lokalen Cluster.
  _pod=$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-k3d-mentolder-dev}" \
    -l 'app in (shared-db,shared-db-dev)' --field-selector status.phase=Running \
    -o name 2>/dev/null | head -1) || true
  if [[ -z "$_pod" ]]; then
    skip "no Running shared-db pod reachable (offline/CI)"
  fi
}

# ── Setup / Teardown ──────────────────────────────────────────────────────────
_sf_setup() {
  load '../test_helper.bash'

  # Runtime paths (BATS_TEST_DIRNAME not available at file-level)
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  REPO="$REPO_ROOT"
  source "${REPO_ROOT}/scripts/factory/lib.sh" 2>/dev/null || true

  # FA-SF-05: auto-triage.sh path + inline validator (mirrors auto-triage.sh)
  SCRIPT="${REPO}/scripts/factory/auto-triage.sh"
  ENUMS_FILE="${REPO}/scripts/factory/triage-enums.json"
  validate_triage() {
    local json="$1"
    if ! echo "$json" | jq empty 2>/dev/null; then return 1; fi
    local t; t=$(echo "$json" | jq -r '.type // ""')
    if [[ ! "$t" =~ ^(bug|feature|task|project)$ ]]; then return 1; fi
    local s; s=$(echo "$json" | jq -r '.severity // ""')
    if [[ ! "$s" =~ ^(critical|major|minor|trivial)$ ]]; then return 1; fi
    local p; p=$(echo "$json" | jq -r '.priority // ""')
    if [[ ! "$p" =~ ^(hoch|mittel|niedrig)$ ]]; then return 1; fi
    local areas; areas=$(echo "$json" | jq -r '.areas // [] | join("\n")')
    local enums; enums=$(cat "$ENUMS_FILE")
    local allowed_areas; allowed_areas=$(echo "$enums" | jq -r '.areas[]')
    while IFS= read -r area; do
      [[ -z "$area" ]] && continue
      if ! echo "$allowed_areas" | grep -qxF "$area"; then return 1; fi
    done <<< "$areas"
    local comp; comp=$(echo "$json" | jq -r '.component // ""')
    if [[ -n "$comp" && "$comp" != "null" ]]; then
      local allowed_comp; allowed_comp=$(echo "$enums" | jq -r '.components[]')
      if ! echo "$allowed_comp" | grep -qxF "$comp"; then return 1; fi
    fi
    local assignee; assignee=$(echo "$json" | jq -r '.assignee_suggested // ""')
    if [[ -z "$assignee" || "$assignee" == "null" ]]; then return 1; fi
    local allowed_assignees; allowed_assignees=$(echo "$enums" | jq -r '.assignees[]')
    if ! echo "$allowed_assignees" | grep -qxF "$assignee"; then return 1; fi
    return 0
  }

  # FA-SF-33: per-test temp log file
  TMPLOG="$(mktemp)"

  # FA-SF-57/58/59: temp directory with all needed subdirs
  TEST_TMP_DIR="$BATS_TEST_TMPDIR/sf-tests-$$"
  mkdir -p "$TEST_TMP_DIR/fixtures/T000725" "$TEST_TMP_DIR/out"

  # FA-SF-63: scout.sh deterministic tests
  SCOUT="${REPO_ROOT}/scripts/factory/scout.sh"
  FIXTURE="${REPO_ROOT}/tests/local/fixtures/scout-repo"
  PIPELINE="${REPO_ROOT}/scripts/factory/pipeline.mjs"

  _CLEANUP_PATHS=("$TMPLOG" "$TEST_TMP_DIR")
}

_sf_teardown() {
  # [T005309] Registrierte Real-Feature-Seeds purgen, bevor BATS das File-Tmpdir
  # aufraeumt: der Purge steht hier statt am Testende, damit eine fehlgeschlagene
  # Assertion (errexit) keinen Ghost-Seed (status=in_progress) hinterlaesst.
  # Fixture-Datei defensiv laden — Dateien ohne Fixture-Bezug sourcen sie selbst
  # nicht und bleiben unveraendert. Der Teardown darf den Exit-Code nie
  # verfaelschen (|| true auf jedem Schritt).
  if [[ -f "${BATS_FILE_TMPDIR:-/nonexistent}/sf-seeded-ids" ]]; then
    local _fx="${REPO_ROOT:-.}/tests/lib/factory-test-fixtures.sh"
    source "$_fx" 2>/dev/null || true
    local _seed_brand="${TEST_BRAND:-korczewski}"
    # [T005309] Registry VOR der Schleife in ein Array lesen (mapfile): der
    # Loop-Body (kubectl exec -i in purge_real_feature) draent sonst den
    # Datei-Stdin des while-read — nur die erste registrierte ID wuerde je
    # gepurged, der Rest bliebe als Ghost-Seed stehen.
    local -a _seed_ids
    mapfile -t _seed_ids < "$BATS_FILE_TMPDIR/sf-seeded-ids"
    local _seed_id
    for _seed_id in "${_seed_ids[@]}"; do
      [[ -n "$_seed_id" ]] || continue
      purge_real_feature "$_seed_brand" "$_seed_id" >/dev/null 2>&1 || true
    done
    rm -f "$BATS_FILE_TMPDIR/sf-seeded-ids" 2>/dev/null || true
  fi
  rm -rf "${_CLEANUP_PATHS[@]}" 2>/dev/null || true
}
