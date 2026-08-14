#!/usr/bin/env bash
# tests/lib/factory-test-fixtures.sh — seed + reap throwaway feature tickets for
# Software Factory FA-SF BATS tests. SOURCE, do not execute.
#
#   source tests/lib/factory-test-fixtures.sh
#   ext_id=$(seed_test_feature korczewski "tests/fixtures/sf-test-foo-a.txt")
#   ... assertions ...
#   purge_factory_test_data korczewski   # in teardown()
#
# Every seeded ticket carries is_test_data=true and a unique 'SF-TEST-' title and
# is reaped by tickets.fn_purge_test_data(). Pass DISJOINT touched_file paths per
# test so the conflict gate does not legitimately fire between fixtures. Do NOT
# run concurrently with the Playwright e2e suite (shared global purge).
#
# [T005029] seed_real_feature/purge_real_feature are the is_test_data=false
# counterparts (title prefix 'SF-REAL-'): queue.sh filters `is_test_data = false`
# since T002830, so only real features surface in the queue/schedule candidate
# list (FA-SF-24/25). They are reaped by purge_real_feature (hard DELETE) — NOT
# by fn_purge_test_data(), which reaps only is_test_data=true rows.
#
# [T005309] seed_real_feature registers every created external_id in
# $BATS_FILE_TMPDIR/sf-seeded-ids (eine Zeile pro ID); der gemeinsame
# _sf_teardown purgt alle registrierten IDs nach jedem Test, unabhaengig vom
# Testausgang — eine fehlgeschlagene Assertion (errexit) hinterlaesst so keinen
# Ghost-Seed. purge_real_feature loescht nur SF-REAL- betitelte Zeilen (--force
# uebergeht den Guard fuer test-eigene Fixtures ohne SF-REAL-Titel).

# Resolve the repo root from this file's location so the fixture works
# regardless of the BATS working directory.
_FIXTURE_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# seed_test_feature <brand> [touched_file ...] → echoes the new external_id
seed_test_feature() {
  local brand="$1"; shift
  # Default seit E3/T002626: SDLC-Daten liegen lokal (siehe scripts/ticket.sh).
  local ctx="${FACTORY_CTX:-k3d-mentolder-dev}"
  if [[ "$ctx" == "fleet" && -z "${FACTORY_ALLOW_PROD_SEED:-}" ]]; then
    echo "refusing to seed test data into prod context 'fleet' (set FACTORY_ALLOW_PROD_SEED=1 to override)" >&2
    return 3
  fi
  local files; files="$(IFS=,; echo "$*")"
  local title="SF-TEST-${brand}-${BATS_TEST_NAME:-manual}-$$-${RANDOM}"
  local result ext_id
  result=$(BRAND="$brand" TICKET_CTX="$ctx" bash "$_FIXTURE_REPO_ROOT/scripts/ticket.sh" create \
    --type feature --brand "$brand" --title "$title" \
    --description "factory fixture" --priority mittel --status backlog --is-test-data)
  ext_id="${result%%|*}"
  if [[ -n "$files" ]]; then
    BRAND="$brand" TICKET_CTX="$ctx" bash "$_FIXTURE_REPO_ROOT/scripts/ticket.sh" set-touched-files --id "$ext_id" --files "$files" >/dev/null
  fi
  echo "$ext_id"
}

# seed_real_feature <brand> [touched_file ...] → echoes the new external_id
# [T005029] Gegenstueck zu seed_test_feature mit is_test_data=false: queue.sh
# filtert seit T002830 `AND is_test_data = false` — nur echte Features erscheinen
# in der Queue-/Schedule-Kandidatenliste (FA-SF-24/25). Aufbau identisch zu
# seed_test_feature (Prod-Guard, touched_files-Uebergabe), ohne das
# --is-test-data-Flag beim ticket.sh create; Title-Praefix SF-REAL- macht
# unaufgeraeumte Reste von SF-TEST-Fixtures unterscheidbar. Cleanup ausschliesslich
# ueber purge_real_feature (hartes DELETE), nicht ueber fn_purge_test_data().
# [T005309] Registriert die neue external_id in $BATS_FILE_TMPDIR/sf-seeded-ids
# (sofern BATS_FILE_TMPDIR gesetzt ist) — der gemeinsame _sf_teardown purgt sie.
#
# Zusaetzlich zum is_test_data=false-Flag braucht die Queue-Lane fuer
# backlog-Features readiness.lastenheft_locked=true (AI-ready-Gate der
# Feature-Lane, siehe queue.sh). ticket.sh create setzt kein readiness-Flag —
# der kanonische Weg ist `plan-meta set --requirements` gefolgt von
# `lastenheft lock` (validiert >=1 Requirement und forward-transitioniert nach
# backlog). Ein Feature ohne Lock ist der Queue unsichtbar und der FA-SF-24/25-
# Positiv-Anker schlaegt fehl.
seed_real_feature() {
  local brand="$1"; shift
  local ctx="${FACTORY_CTX:-k3d-mentolder-dev}"
  if [[ "$ctx" == "fleet" && -z "${FACTORY_ALLOW_PROD_SEED:-}" ]]; then
    echo "refusing to seed test data into prod context 'fleet' (set FACTORY_ALLOW_PROD_SEED=1 to override)" >&2
    return 3
  fi
  local files; files="$(IFS=,; echo "$*")"
  local title="SF-REAL-${brand}-${BATS_TEST_NAME:-manual}-$$-${RANDOM}"
  local result ext_id
  result=$(BRAND="$brand" TICKET_CTX="$ctx" bash "$_FIXTURE_REPO_ROOT/scripts/ticket.sh" create \
    --type feature --brand "$brand" --title "$title" \
    --description "factory fixture" --priority mittel --status backlog)
  ext_id="${result%%|*}"
  # [T005309] Registrierung SOFORT nach dem Anlegen (vor plan-meta/lastenheft):
  # schlaegt ein spaeterer Seed-Schritt fehl und errexit bricht den Test ab,
  # purgt _sf_teardown die Zeile trotzdem (Registry-Datei, eine ID pro Zeile).
  # Fehlt BATS_FILE_TMPDIR (Nicht-BATS-Aufruf), entfaellt die Registrierung
  # stillschweigend — kein Absturz ausserhalb eines bats-Laufs.
  if [[ -n "$ext_id" && -n "${BATS_FILE_TMPDIR:-}" ]]; then
    echo "$ext_id" >> "$BATS_FILE_TMPDIR/sf-seeded-ids"
  fi
  BRAND="$brand" TICKET_CTX="$ctx" bash "$_FIXTURE_REPO_ROOT/scripts/ticket.sh" \
    plan-meta set --id "$ext_id" --requirements 'factory fixture' >/dev/null
  BRAND="$brand" TICKET_CTX="$ctx" bash "$_FIXTURE_REPO_ROOT/scripts/ticket.sh" \
    lastenheft lock --id "$ext_id" >/dev/null
  if [[ -n "$files" ]]; then
    BRAND="$brand" TICKET_CTX="$ctx" bash "$_FIXTURE_REPO_ROOT/scripts/ticket.sh" set-touched-files --id "$ext_id" --files "$files" >/dev/null
  fi
  echo "$ext_id"
}

# ensure_purge_fn_current <pod> <ns> <ctx> — self-heal the purge function against
# the repo's newest one-shot migration (T003285). Parses the RUNTIME-CHECK line
# of the newest purge-fn-v*.sql (same contract as scripts/runtime-drift-check.sh)
# and applies the file only when pg_proc.prosrc lacks the marker — so the teardown
# path works with the repo state, not with whatever manual deploy state the DB
# happens to be in. A failing apply returns 1 so the purge fails visibly instead
# of silently purging nothing.
ensure_purge_fn_current() {
  local pod="$1" ns="$2" ctx="$3"
  local latest marker_line fn_line schema fn marker out
  latest="$(ls -1 "$_FIXTURE_REPO_ROOT/scripts/one-shot/"purge-fn-v*.sql 2>/dev/null | sort -V | tail -1)"
  [[ -n "$latest" ]] || return 0   # no migration file — nothing to self-heal with
  marker_line="$(grep -m1 -- '-- RUNTIME-CHECK:' "$latest" 2>/dev/null || true)"
  [[ -n "$marker_line" ]] || return 0   # no marker contract — not a drift-checked object
  # Regex identisch zu scripts/runtime-drift-check.sh (marker/function auf
  # [a-z0-9_]+ beschraenkt — die psql-Query wird nicht aus Dateiinhalten
  # konstruiert, kein SQL-Injection-Surface).
  [[ "$marker_line" =~ function=([a-z_]+)\.([a-z_]+)[[:space:]]+marker=([a-z0-9_]+) ]] || return 0
  schema="${BASH_REMATCH[1]}"; fn="${BASH_REMATCH[2]}"; marker="${BASH_REMATCH[3]}"
  out="$(kubectl exec -i "$pod" -n "$ns" --context "$ctx" -c postgres -- \
    psql -U postgres -d website -qtAc \
    "SELECT prosrc LIKE '%${marker}%' FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = '${schema}' AND p.proname = '${fn}';" < /dev/null 2>/dev/null)"
  [[ "$out" == "t" ]] && return 0
  echo "self-heal: applying $latest to ${schema}.${fn} (Marker '$marker' fehlt in pg_proc)" >&2
  kubectl exec -i "$pod" -n "$ns" --context "$ctx" -c postgres -- \
    psql -U postgres -d website < "$latest"
}

# purge_factory_test_data <brand> — reap all is_test_data=true rows on that brand
purge_factory_test_data() {
  local brand="$1"
  local ctx="${FACTORY_CTX:-k3d-mentolder-dev}" ns
  # [T002689] Die Brand waehlt ZEILEN, nicht den Ort. seed_test_feature schreibt
  # ueber scripts/ticket.sh, das seit T002689 fuer beide Brands nach `workspace`
  # aufloest — eine Purge in `workspace-korczewski` fand die eigenen Fixtures
  # daher nicht mehr und liesse Testzeilen stehen.
  case "$brand" in
    mentolder|korczewski) ns="${FACTORY_NS:-workspace}" ;;
    *) echo "purge_factory_test_data: unknown brand $brand" >&2; return 2 ;;
  esac

  # Resolve namespace by searching in likely candidates, not by guessing from the
  # context name. The k3d dev cluster runs shared-db in 'workspace', not
  # 'workspace-dev' — the old hardcoded -dev suffix was wrong. [T002781]
  local pod candidate_ns
  for candidate_ns in "$ns" "${ns}-dev"; do
    pod=$(kubectl get pod -n "$candidate_ns" --context "$ctx" \
      -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running \
      -o name 2>/dev/null | head -1)
    [[ -n "$pod" ]] && { ns="$candidate_ns"; break; }
  done
  [[ -z "$pod" ]] && { echo "no shared-db pod in $ns" >&2; return 1; }
  # Selbstheilung vor dem Purge-Aufruf (T003285): fehlt der Marker der neuesten
  # Migration in der DB-Funktion, wird sie eingespielt — der Teardown arbeitet mit
  # dem Repo-Stand statt mit dem zufaelligen Deploy-Zustand der DB. Ein fehl-
  # schlagender Apply laesst den Purge sichtbar scheitern.
  ensure_purge_fn_current "$pod" "$ns" "$ctx" || return 1
  kubectl exec -i "$pod" -n "$ns" --context "$ctx" -c postgres -- \
    psql -U postgres -d website -qtAc "SELECT tickets.fn_purge_test_data();" >/dev/null < /dev/null
}

# purge_real_feature [--force] <brand> <ext_id> — hard DELETE of one real
# (is_test_data=false) seeded feature row. [T005029] fn_purge_test_data() raeumt
# nur is_test_data=true-Zeilen, deshalb loescht der Real-Feature-Cleanup direkt.
# Pod-/Namespace-Aufloesung wie purge_factory_test_data ([T002689] Brand waehlt
# ZEILEN, nicht den Ort; [T002781] shared-db liegt in 'workspace', nicht '-dev');
# Prod-Guard wie seed_real_feature — ein DELETE auf fleet ist nicht rueckholbar.
#
# [T005309] Titel-Guard: geloescht wird nur, wenn der Titel mit 'SF-REAL-' beginnt
# — eine falsch uebergebene ID kann so nie ein echtes Ticket hart loeschen.
# Rueckgabe ist unterscheidbar: 0 = geloescht ODER Zeile existierte schon nicht
# mehr (idempotent), 4 = Guard verweigert (Zeile existiert, Titel ohne SF-REAL-).
# --force (erstes Argument) uebergeht den Guard — ausschliesslich fuer das
# Eigenaufraeumen von Test-Fixtures ohne SF-REAL-Titel.
purge_real_feature() {
  local force=0
  if [[ "${1:-}" == "--force" ]]; then
    force=1
    shift
  fi
  local brand="$1" ext_id="$2"
  local ctx="${FACTORY_CTX:-k3d-mentolder-dev}" ns
  if [[ "$ctx" == "fleet" && -z "${FACTORY_ALLOW_PROD_SEED:-}" ]]; then
    echo "refusing to purge on prod context 'fleet' (set FACTORY_ALLOW_PROD_SEED=1 to override)" >&2
    return 3
  fi
  case "$brand" in
    mentolder|korczewski) ns="${FACTORY_NS:-workspace}" ;;
    *) echo "purge_real_feature: unknown brand $brand" >&2; return 2 ;;
  esac
  local pod candidate_ns
  for candidate_ns in "$ns" "${ns}-dev"; do
    pod=$(kubectl get pod -n "$candidate_ns" --context "$ctx" \
      -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running \
      -o name 2>/dev/null | head -1)
    [[ -n "$pod" ]] && { ns="$candidate_ns"; break; }
  done
  [[ -z "$pod" ]] && { echo "no shared-db pod in $ns" >&2; return 1; }
  # [T005309] SELECT vorab macht 0-Zeilen-Idempotenz von Guard-Verweigerung
  # unterscheidbar; der DELETE traegt den Guard zusaetzlich in der WHERE-Klausel.
  # < /dev/null an beiden exec-Aufrufen: kubectl exec -i liest den Shell-Stdin
  # und draent damit einen while-read-Loop ueber einer Datei (beobachtet im
  # _sf_teardown-Purge: nur die erste registrierte ID wurde gepurged, der Rest
  # der Registry-Datei landete als EOF-verlorenes Stdin im exec).
  local title select_rc stderr_file
  # [T005591] Execute-rc prüfen: ein fehlgeschlagener kubectl-exec (z.B. transient)
  # muss nicht idempotent 0 sein, sondern observable error — sonst entgeht ein
  # Ghost-Seed ohne Spur. stderr_temp_datei + PIPESTATUS erreichen das.
  stderr_file=$(mktemp)
  set -o pipefail
  title=$(kubectl exec -i "$pod" -n "$ns" --context "$ctx" -c postgres -- \
    psql -U postgres -d website -qtAc "SELECT title FROM tickets.tickets WHERE external_id='$ext_id';" < /dev/null 2>"$stderr_file" | tr -d '[:space:]')
  select_rc=$?
  set +o pipefail
  cat "$stderr_file" | sed 's/^/[purge-exec] /' >&2
  rm -f "$stderr_file"
  if [[ $select_rc -ne 0 ]]; then
    echo "purge_real_feature: exec failed (rc=$select_rc) for $ext_id — row state unknown" >&2
    return 1
  fi
  [[ -n "$title" ]] || return 0   # idempotent: Zeile existiert nicht mehr
  if [[ "$force" != 1 && "$title" != SF-REAL-* ]]; then
    echo "purge_real_feature: refuses non-SF-REAL title for $ext_id (title: ${title:0:60}…)" >&2
    return 4
  fi
  local guard_sql="AND title LIKE 'SF-REAL-%'"
  [[ "$force" == 1 ]] && guard_sql=""
  kubectl exec -i "$pod" -n "$ns" --context "$ctx" -c postgres -- \
    psql -U postgres -d website -qtAc "DELETE FROM tickets.tickets WHERE external_id='$ext_id' ${guard_sql};" >/dev/null < /dev/null
  return 0
}
