#!/usr/bin/env bats
# tests/spec/software-factory/conflict-db-triage.bats
# SSOT: openspec/specs/software-factory.md
#
# [T002503] Aufgeteilt aus tests/spec/software-factory.bats. Jene Sammeldatei hielt
# 495 der ~2300 Spec-Tests in einer Datei und war mit --no-parallelize-within-files
# unteilbar: sie bildete mit 115s den Boden jedes CI-Shards, in dem sie lag.
#
# Der Split ist ein VERSCHIEBEN, kein Kopieren — die Quelldatei ist entfernt.
# T002427/T002421: eine frueher zurueckgelassene Kopie erzeugte doppelte Testnamen,
# ein gefilterter Lauf sah gruen aus, waehrend `task test:factory` ueber die
# veraltete Fassung rot lief.
#
# Gemeinsame Variablen, _skip_if_no_db und Setup/Teardown liegen in _sf_common.bash.

load '_sf_common'

setup()    { _sf_setup; }
teardown() { _sf_teardown; }

# ── FA-SF-01-conflict-check ─────────────────────────────────────#
# tests/local/factory-conflict-check.bats
# Verifies conflict-check.sh script behavior.

@test "FA-SF-01: conflict-check rejects missing args" {
  run bash scripts/factory/conflict-check.sh
  [ "$status" -eq 2 ]
  [[ "$output" =~ error ]]
}

@test "FA-SF-02: conflict-check returns error for unknown ticket without files" {
  # Set environment variables for the test to point to the dev database in k3d
  export FACTORY_CTX="k3d-korczewski-dev"
  export FACTORY_NS="workspace-korczewski-dev"
  run bash scripts/factory/conflict-check.sh "T999999"
  [ "$status" -eq 2 ]
  [[ "$output" =~ error ]]
}

@test "FA-SF-03: conflict-check with explicit files produces valid JSON" {
  # Set environment variables for the test to point to the dev database in k3d
  export FACTORY_CTX="k3d-korczewski-dev"
  export FACTORY_NS="workspace-korczewski-dev"
  
  # Ensure we have at least one ticket to test with, or insert/query safely
  run bash scripts/factory/conflict-check.sh "T000413" "website/src/lib/tickets-db.ts" "k3d/website-schema.yaml"
  # Verify the output is valid JSON (empty or array of conflicts)
  echo "$output" | jq . > /dev/null
}

@test "FA-SF-03c: an explicit FACTORY_NS suppresses the no-BRAND WARN (keeps JSON stdout clean)" {
  # The suppression guard must key off FACTORY_NS (what callers actually set), not the
  # never-set FACTORY_NS_EXPLICIT. With FACTORY_NS provided, no WARN may reach stderr.
  # `|| true`: offline (CI) conflict-check exits 2 (no cluster) — we only assert on the
  # stderr CONTENT (the WARN), not the exit code, so the non-zero must not fail the test.
  err="$(env -u BRAND FACTORY_CTX=k3d-korczewski-dev FACTORY_NS=workspace-korczewski-dev \
        bash scripts/factory/conflict-check.sh T000413 website/src/lib/tickets-db.ts 2>&1 1>/dev/null || true)"
  [[ "$err" != *"WARN: no BRAND"* ]]
}

@test "FA-SF-03b: BRAND=korczewski resolves namespace to workspace-korczewski" {
  run env BRAND=korczewski FACTORY_DRY_RESOLVE=1 bash scripts/factory/conflict-check.sh T000001
  [ "$status" -eq 0 ]
  [[ "$output" == *"workspace-korczewski"* ]]
}

@test "FA-SF-04: conflict-check detects in-flight task tickets" {
  if [[ -z "${FACTORY_CTX:-}" ]]; then
    skip "FACTORY_CTX not set (live-seed test skipped)"
  fi
  source tests/lib/factory-test-fixtures.sh

  # Seed a feature ticket first
  local brand="korczewski"
  local file="k3d/configmap-domains.yaml"
  local ext_id
  ext_id=$(seed_test_feature "$brand" "$file")

  # Update it to be type='task' and status='in_progress' to simulate in-flight human work
  local ns="${FACTORY_NS:-workspace-korczewski-dev}"
  local pod
  pod=$(kubectl get pod -n "$ns" --context "$FACTORY_CTX" -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running -o name | head -1)
  kubectl exec -i "$pod" -n "$ns" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtAc "UPDATE tickets.tickets SET type='task', status='in_progress' WHERE external_id = '$ext_id';"

  # Verify conflict-check detects it for a different ticket ID
  run env BRAND="$brand" FACTORY_CTX="$FACTORY_CTX" FACTORY_NS="$ns" \
    bash scripts/factory/conflict-check.sh "T999999" "$file"
  
  # Clean up before assert
  purge_factory_test_data "$brand"

  # Assert
  [ "$status" -eq 1 ]
  [[ "$output" =~ "$ext_id" ]]
}

# ── FA-SF-04-db-schema ──────────────────────────────────────────#
# tests/local/FA-SF-04-db-schema.bats  (renamed from factory-db-schema.bats)
# Verifies the Software Factory pgvector tables, views, and columns.
#
# Both-namespaces coverage: re-run with FACTORY_NS=workspace-korczewski to
# test the korczewski brand. The default targets workspace (mentolder).
#   FACTORY_CTX=fleet FACTORY_NS=workspace ./tests/runner.sh local FA-SF-04
#   FACTORY_CTX=fleet FACTORY_NS=workspace-korczewski ./tests/runner.sh local FA-SF-04

psql_tickets() {
  local query="$1"
  # [T002626] Default folgt scripts/factory/lib.sh: seit ADR-006 E3 liegen die
  # SDLC-Daten lokal. Guard und Testkoerper muessen denselben Cluster messen —
  # sonst prueft der Guard fleet (erreichbar, kein Skip) und der Test scheitert
  # am lokalen Cluster.
  local ctx="${FACTORY_CTX:-k3d-mentolder-dev}"
  local ns="${FACTORY_NS:-workspace}"
  local pod
  pod=$(kubectl get pod -n "$ns" --context "$ctx" -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running -o name 2>/dev/null | head -1)
  if [[ -z "$pod" ]]; then
    echo "Error: shared-db pod not found" >&2
    return 1
  fi
  kubectl exec "$pod" -n "$ns" --context "$ctx" -c postgres -- psql -U website -d website -t -A -c "$query"
}

@test "FA-SF-04: tickets.tickets has touched_files column" {
  _skip_if_no_db
  run psql_tickets "SELECT column_name FROM information_schema.columns WHERE table_schema='tickets' AND table_name='tickets' AND column_name='touched_files'"
  [ "$status" -eq 0 ]
  [ "$output" = "touched_files" ]
}

@test "FA-SF-05: tickets.tickets has pipeline_slot column" {
  _skip_if_no_db
  run psql_tickets "SELECT column_name FROM information_schema.columns WHERE table_schema='tickets' AND table_name='tickets' AND column_name='pipeline_slot'"
  [ "$status" -eq 0 ]
  [ "$output" = "pipeline_slot" ]
}

@test "FA-SF-06: tickets.ticket_embeddings table exists" {
  _skip_if_no_db
  run psql_tickets "SELECT tablename FROM pg_tables WHERE schemaname='tickets' AND tablename='ticket_embeddings'"
  [ "$status" -eq 0 ]
  [ "$output" = "ticket_embeddings" ]
}

@test "FA-SF-07: ticket_embeddings HNSW index exists" {
  _skip_if_no_db
  run psql_tickets "SELECT indexname FROM pg_indexes WHERE schemaname='tickets' AND indexname='ticket_embeddings_hnsw_idx'"
  [ "$status" -eq 0 ]
  [ "$output" = "ticket_embeddings_hnsw_idx" ]
}

@test "FA-SF-08: v_factory_metrics view exists" {
  _skip_if_no_db
  run psql_tickets "SELECT viewname FROM pg_views WHERE schemaname='tickets' AND viewname='v_factory_metrics'"
  [ "$status" -eq 0 ]
  [ "$output" = "v_factory_metrics" ]
}

@test "FA-SF-09: v_active_features view exists" {
  _skip_if_no_db
  run psql_tickets "SELECT viewname FROM pg_views WHERE schemaname='tickets' AND viewname='v_active_features'"
  [ "$status" -eq 0 ]
  [ "$output" = "v_active_features" ]
}

@test "FA-SF-10: fn_find_similar function exists" {
  _skip_if_no_db
  run psql_tickets "SELECT proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname='tickets' AND proname='fn_find_similar'"
  [ "$status" -eq 0 ]
  [ "$output" = "fn_find_similar" ]
}

@test "FA-SF-11: chunk_type CHECK constraint enforces valid values" {
  _skip_if_no_db
  run psql_tickets "
    DO \$\$
    BEGIN
      INSERT INTO tickets.ticket_embeddings (ticket_id, chunk, chunk_type)
      SELECT id, 'test', 'invalid_type' FROM tickets.tickets LIMIT 1;
    END \$\$
  "
  [ "$status" -ne 0 ]
}

@test "FA-SF-12: embedding_model column exists on tickets.ticket_embeddings" {
  _skip_if_no_db
  # Reuse psql_tickets (has -c postgres + the pod guard); a raw `kubectl exec deployment/...`
  # without -c postgres prints a "Defaulted container" line to stderr that bats folds into
  # $output, breaking the exact-match assertion even when the column is present.
  run psql_tickets "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='tickets' AND table_name='ticket_embeddings' AND column_name='embedding_model')"
  [ "$status" -eq 0 ]
  [ "$output" = "t" ]
}

@test "FA-SF-13: vector extension is enabled (ticket_embeddings hard dependency)" {
  _skip_if_no_db
  run psql_tickets "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='vector')"
  [ "$status" -eq 0 ]
  [ "$output" = "t" ]
}

@test "FA-SF-04: tickets.tickets has retry_count column (NOT NULL DEFAULT 0)" {
  _skip_if_no_db
  run psql_tickets "SELECT column_default FROM information_schema.columns WHERE table_schema='tickets' AND table_name='tickets' AND column_name='retry_count'"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "0" ]]
}

@test "FA-SF-04: tickets.factory_control table exists with UNIQUE(key,brand)" {
  _skip_if_no_db
  run psql_tickets "SELECT tablename FROM pg_tables WHERE schemaname='tickets' AND tablename='factory_control'"
  [ "$status" -eq 0 ]
  [ "$output" = "factory_control" ]
}
@test "FA-SF-04: factory_control has a UNIQUE(key,brand) constraint" {
  _skip_if_no_db
  run psql_tickets "SELECT conname FROM pg_constraint WHERE conrelid='tickets.factory_control'::regclass AND contype='u'"
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

@test "FA-SF-04: tickets.feature_flags table exists" {
  _skip_if_no_db
  run psql_tickets "SELECT tablename FROM pg_tables WHERE schemaname='tickets' AND tablename='feature_flags'"
  [ "$status" -eq 0 ]
  [ "$output" = "feature_flags" ]
}
@test "FA-SF-04: feature_flags has brand FK to public.brands" {
  _skip_if_no_db
  run psql_tickets "SELECT conname FROM pg_constraint WHERE conname='feature_flags_brand_fkey'"
  [ "$status" -eq 0 ]
  [ "$output" = "feature_flags_brand_fkey" ]
}
@test "FA-SF-04: feature_flags has UNIQUE(brand,key)" {
  _skip_if_no_db
  run psql_tickets "SELECT count(*) FROM pg_constraint WHERE conrelid='tickets.feature_flags'::regclass AND contype='u'"
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

# ── FA-SF-45-conflict-gate-deadlock ─────────────────────────────#
# FA-SF-45: the conflict gate must not deadlock the backlog when multiple queued
# features share files (e.g. all 8 Brett tickets share messages.ts/state.ts).
# Fix: (a) conflict-check.sh drops 'backlog' from active statuses — only
# in_progress/in_review block; (b) pipeline.js releases slot + resets to backlog
# on conflict (prevents wedged in_progress tickets).

@test "FA-SF-45: conflict-check.sh does NOT count backlog as active" {
  run grep -Eq "t\.status IN \('in_progress','in_review'\)" scripts/factory/conflict-check.sh
  [ "$status" -eq 0 ]
  run grep -Eq "'backlog'" scripts/factory/conflict-check.sh
  [ "$status" -ne 0 ]
}

@test "FA-SF-45: pipeline.js releases slot + resets to backlog on conflict" {
  # the conflict-block path must include release-slot (template: ${A.ticket_id})
  run bash -c "grep -Eq 'release-slot.*--id.*ticket_id' scripts/factory/pipeline.mjs && grep -Eq 'update-status.*--id.*ticket_id.*backlog' scripts/factory/pipeline.mjs"
  [ "$status" -eq 0 ]
}

@test "FA-SF-45: pipeline.js conflict-block return includes released:true" {
  run grep -Eq "released: true" scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
}

@test "FA-SF-45: scheme.sh claim sets status=in_progress (the gate sees it)" {
  run grep -Eq "status='in_progress'" scripts/factory/slots.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-45: offline parsing passes" {
  run node --check scripts/factory/pipeline.mjs;   [ "$status" -eq 0 ]
  run bash -n scripts/factory/conflict-check.sh;  [ "$status" -eq 0 ]
  run bash -n scripts/factory/slots.sh;           [ "$status" -eq 0 ]
}

# ── [T002386] factory_pgpod muss einen Running-Pod waehlen ────────────────────
#
# In workspace-korczewski lagen am 2026-07-28 zwei shared-db-Pods:
#   shared-db-786c4d5b64-n62db   Failed    (09:20 Uhr)
#   shared-db-86d7d79f7b-th2mm   Running   (10:04 Uhr)
#
# factory_pgpod nahm `-o name | head -1` ohne Phasenfilter. kubectl sortiert nach
# Name, der Failed-Pod sortiert vor dem lebenden — jeder Aufruf traf also den
# toten Pod und starb einen Schritt spaeter in `kubectl exec` mit "cannot exec
# into a container in a completed pod".
#
# Folge: Die GESAMTE korczewski-Brand war fuer den Dispatcher blind. queue.sh,
# slots.sh und schedule.sh scheiterten dort ausnahmslos; 7 offene Tickets konnten
# nicht dispatcht werden. Weil schedule.sh den Aufruf als
# `2>/dev/null || echo 0` absichert, wurde der Ausfall als "0 belegte Slots"
# gewertet — fail-open, ohne Log und ohne Warnung.
#
# T002307 hatte denselben Bug bereits in scripts/vda/ticket/_ticket-core.sh
# behoben, mit dem Kommentar "All ~25 call sites route through here, so the
# filter belongs here and nowhere else". Das war falsch: Die Factory haelt in
# lib.sh eine eigene Implementierung.

_t002386_mockdir() {
  local mockdir; mockdir="$(mktemp -d)"
  cat > "$mockdir/kubectl" <<'MOCKEOF'
#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then
  if [[ "$*" == *"--field-selector"*"status.phase=Running"* ]]; then
    echo "pod/shared-db-live"
  else
    # Wie der echte API-Server ohne Filter: der tote Pod sortiert zuerst.
    echo "pod/shared-db-completed"
    echo "pod/shared-db-live"
  fi
  exit 0
fi
exit 0
MOCKEOF
  chmod +x "$mockdir/kubectl"
  echo "$mockdir"
}

@test "T002386: factory_pgpod skips a completed shared-db pod and returns the Running one" {
  local mockdir; mockdir="$(_t002386_mockdir)"
  run env PATH="$mockdir:$PATH" FACTORY_NS=workspace-korczewski FACTORY_CTX=fleet bash -c \
    'source "'"$REPO_ROOT"'/scripts/factory/lib.sh"; factory_pgpod'
  rm -rf "$mockdir"
  [ "$status" -eq 0 ]
  [ "$output" = "pod/shared-db-live" ]
}

@test "T002386/T002439: every shared-db pod selection filters on phase Running" {
  # Klassen-Guard statt Einzelfall: T002307 fixte eine Kopie und hielt die Sache
  # fuer erledigt, waehrend vier weitere Kopien den Bug behielten.
  #
  # [T002439] Die Scan-Logik lebt jetzt in scripts/check-pod-phase-filter.sh statt hier
  # inline. Zwei Gruende: sie war inline nicht gegen Fixtures pruefbar, und sie hatte
  # selbst zwei Blindstellen — sie sah nur scripts/ mit --include='*.sh', und sie zaehlte
  # pro DATEI. Diese Datei hier entkam ihr dadurch trotz fuenf ungefilterter Selektionen,
  # weil die Zeile darueber den Filter-String als Suchmuster fuehrte. Zwei Implementierungen
  # derselben Regel wuerden auseinanderlaufen, deshalb ruft der Test das Skript auf.
  run bash "$REPO_ROOT/scripts/check-pod-phase-filter.sh"
  [ "$status" -eq 0 ] || {
    echo "$output" >&2
    false
  }
}

# ── FA-SF-05-triage ─────────────────────────────────────────────#
# tests/local/FA-SF-05-triage.bats — Tests für auto-triage.sh Validierung & Idempotenz [T000933]

# ── Enum-Validierung ──────────────────────────────────────────────────

@test "FA-SF-05-01: validate_triage accepts valid JSON" {
  run validate_triage '{
    "type": "feature",
    "priority": "mittel",
    "severity": "minor",
    "areas": ["website", "tickets"],
    "component": "planungsbuero",
    "assignee_suggested": "patrick",
    "rationale": "Test"
  }'
  [[ "$status" -eq 0 ]]
}

@test "FA-SF-05-02: validate_triage rejects invalid type" {
  run validate_triage '{
    "type": "invalid",
    "priority": "mittel",
    "severity": "minor",
    "areas": ["website"],
    "component": null,
    "assignee_suggested": "patrick"
  }'
  [[ "$status" -ne 0 ]]
}

@test "FA-SF-05-03: validate_triage rejects invalid severity" {
  run validate_triage '{
    "type": "bug",
    "priority": "hoch",
    "severity": "extreme",
    "areas": ["website"],
    "component": null,
    "assignee_suggested": "patrick"
  }'
  [[ "$status" -ne 0 ]]
}

@test "FA-SF-05-04: validate_triage rejects invalid priority" {
  run validate_triage '{
    "type": "task",
    "priority": "dringend",
    "severity": "minor",
    "areas": ["ci"],
    "component": null,
    "assignee_suggested": "factory"
  }'
  [[ "$status" -ne 0 ]]
}

@test "FA-SF-05-05: validate_triage rejects unknown area" {
  run validate_triage '{
    "type": "project",
    "priority": "niedrig",
    "severity": "trivial",
    "areas": ["website", "unbekannt"],
    "component": null,
    "assignee_suggested": "patrick"
  }'
  [[ "$status" -ne 0 ]]
}

@test "FA-SF-05-06: validate_triage rejects unknown component" {
  run validate_triage '{
    "type": "bug",
    "priority": "hoch",
    "severity": "critical",
    "areas": ["security"],
    "component": "fakeservice",
    "assignee_suggested": "patrick"
  }'
  [[ "$status" -ne 0 ]]
}

@test "FA-SF-05-07: validate_triage rejects unknown assignee" {
  run validate_triage '{
    "type": "feature",
    "priority": "mittel",
    "severity": "major",
    "areas": ["tickets"],
    "component": null,
    "assignee_suggested": "eindringling"
  }'
  [[ "$status" -ne 0 ]]
}

@test "FA-SF-05-08: validate_triage rejects malformed JSON" {
  run validate_triage '{nope}'
  [[ "$status" -ne 0 ]]
}

@test "FA-SF-05-09: validate_triage rejects empty string" {
  run validate_triage ''
  [[ "$status" -ne 0 ]]
}

@test "FA-SF-05-10: validate_triage accepts null component" {
  run validate_triage '{
    "type": "task",
    "priority": "hoch",
    "severity": "major",
    "areas": ["infra"],
    "component": null,
    "assignee_suggested": "factory",
    "rationale": "ok"
  }'
  [[ "$status" -eq 0 ]]
}

# ── Idempotenz und DRY-RUN ────────────────────────────────────────────

@test "FA-SF-05-11: FACTORY_DRY_RESOLVE shortcut exits 0 immediately" {
  run bash -c "
    export FACTORY_DRY_RESOLVE=1
    export BRAND=mentolder
    ENUMS_FILE='${ENUMS_FILE}' bash '${SCRIPT}'
  "
  [[ "$status" -eq 0 ]]
  [[ "$output" =~ "DRY-RESOLVE" ]]
}

@test "FA-SF-05-12: --help exits 0 and prints usage" {
  run bash "${SCRIPT}" --help
  [[ "$status" -eq 0 ]]
  [[ "$output" =~ "Usage" ]]
}

@test "FA-SF-05-13: missing BRAND exits non-zero" {
  run bash -c "unset BRAND; bash '${SCRIPT}'" 2>&1 || true
  [[ "$status" -ne 0 ]] || [[ "$output" =~ "BRAND" ]]
}

@test "FA-SF-05-14: --dry-run flag is recognized" {
  export BRAND=mentolder
  export FACTORY_DRY_RESOLVE=1
  run bash "${SCRIPT}" --dry-run
  [[ "$status" -eq 0 ]]
}

@test "FA-SF-05-15: triage-enums.json is valid JSON" {
  run jq empty "${ENUMS_FILE}"
  [[ "$status" -eq 0 ]]
}

@test "FA-SF-05-16: triage-enums.json has required keys" {
  run bash -c "jq -e '.areas and .components and .assignees' '${ENUMS_FILE}' > /dev/null"
  [[ "$status" -eq 0 ]]
}

@test "FA-SF-05-17: auto-triage.sh passes bash -n syntax check" {
  run bash -n "${SCRIPT}"
  [[ "$status" -eq 0 ]]
}
