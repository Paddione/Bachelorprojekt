#!/usr/bin/env bats
# tests/spec/software-factory/scout-and-routing.bats
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

# ── FA-SF-63-scout-deterministic ────────────────────────────────#
# FA-SF-63 — deterministic Factory scout (scout.sh) contract + pipeline integrity.

@test "scout.sh with no args prints usage and exits non-zero" {
  run bash "$SCOUT"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage:"* ]]
}

@test "scout.sh --help exits 0" {
  run bash "$SCOUT" --help
  [ "$status" -eq 0 ]
}

@test "scout.sh emits valid JSON for a real feature" {
  run bash "$SCOUT" --ticket-id T000001 \
    --title "add booking confirmation email" \
    --slug "add-booking-confirmation-email" \
    --description "send email after booking" \
    --repo "$REPO_ROOT"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e . >/dev/null
}

@test "scout.sh touched_files is always an array (even with zero hits)" {
  run bash "$SCOUT" --title "zzzxqq fffvvv" --slug "" --repo "$REPO_ROOT"
  [ "$status" -eq 0 ]
  result="$(echo "$output" | jq -e '.touched_files | type == "array"')"
  [ "$result" = "true" ]
}

@test "scout.sh complexity is one of simple|medium|complex" {
  out="$(bash "$SCOUT" --title "add booking email" --slug "add-booking-email" --repo "$REPO_ROOT")"
  c="$(echo "$out" | jq -r '.complexity')"
  [[ "$c" == "simple" || "$c" == "medium" || "$c" == "complex" ]]
}

@test "scout.sh empty slug does not crash, falls back to medium when no hits" {
  run env SCOUT_LLM_ENABLED=false bash "$SCOUT" --title "zzzxqq fffvvv" --slug "" --repo "$REPO_ROOT"
  [ "$status" -eq 0 ]
  c="$(echo "$output" | jq -r '.complexity')"
  [ "$c" = "medium" ]
  slots="$(echo "$output" | jq -r '.estimated_slots')"
  [ "$slots" = "2" ]
}

@test "scout.sh risk_areas contains k8s-manifests when a k3d path is discovered" {
  # Fixture repo has k3d/booking-config.yaml; "config" triggers infra Strategy C.
  out="$(bash "$SCOUT" --title "booking config" --slug "booking-config" --repo "$FIXTURE")"
  echo "$out" | jq -e '.touched_files | any(. | test("k3d/booking-config"))' >/dev/null
  echo "$out" | jq -e '.risk_areas | index("k8s-manifests") != null' >/dev/null
}

@test "scout.sh touched_files are absolute paths" {
  out="$(bash "$SCOUT" --title "booking config" --slug "booking-config" --repo "$FIXTURE")"
  # Every entry must start with '/'.
  echo "$out" | jq -e '.touched_files | all(startswith("/"))' >/dev/null
}

@test "scout.sh similar_tickets is an array" {
  out="$(bash "$SCOUT" --title "booking" --slug "booking" --repo "$FIXTURE")"
  echo "$out" | jq -e '.similar_tickets | type == "array"' >/dev/null
}

@test "scout.sh estimated_slots is an integer >= 1" {
  out="$(bash "$SCOUT" --title "add booking email" --slug "add-booking-email" --repo "$REPO_ROOT")"
  slots="$(echo "$out" | jq -r '.estimated_slots')"
  echo "$out" | jq -e '.estimated_slots | type == "number"' >/dev/null
  [ "$slots" -ge 1 ]
}

@test "pipeline.js still passes node --check" {
  run node --check "$PIPELINE"
  [ "$status" -eq 0 ]
}

@test "pipeline.js invokes scout.sh via execFileSync (no LLM scout agent call)" {
  # The deterministic swap must reference scout.sh and must NOT keep a
  # label:'scout' agent() call for discovery.
  grep -q "scout.sh" "$PIPELINE"
  # Assert the old LLM scout prompt phrase is gone.
  ! grep -q "Scout the feature" "$PIPELINE"
}

@test "scout.sh with SCOUT_LLM_ENABLED=false runs deterministic path only (no crash, valid JSON)" {
  # [T003053] Zwei Absicherungen, beide gegen dieselbe Ursache:
  #
  # 1. SCOUT_DRIFT_CACHE_FILE auf einen frischen, NICHT existierenden Pfad in
  #    BATS_TEST_TMPDIR. Vorher las scout.sh den festen /tmp/scout-drift-cache.json;
  #    schrieb tests/spec/scout-prediction-quality.bats dort parallel einen Drift
  #    > 0.5, meldete scout.sh das auf stderr.
  # 2. --separate-stderr: $output enthaelt dann nur stdout. scout.sh DARF auf
  #    stderr diagnostizieren — der Vertrag ist "stdout ist reines JSON". Ohne
  #    das Flag buendelt `run` beide Stroeme und jq brach ab mit
  #    "Invalid numeric literal at line 1, column 9" (Spalte 9 = der Doppelpunkt
  #    nach "scout.sh"). Damit ist die Zusicherung unabhaengig davon, ob scout.sh
  #    kuenftig weitere Diagnosen ausgibt.
  run --separate-stderr env SCOUT_LLM_ENABLED=false \
    SCOUT_DRIFT_CACHE_FILE="$BATS_TEST_TMPDIR/no-drift-cache.json" \
    bash "$SCOUT" --title "zzzxqq fffvvv" --slug "" --repo "$REPO_ROOT"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e . >/dev/null
  c="$(echo "$output" | jq -r '.complexity')"
  [ "$c" = "medium" ]
}

# ── FA-SF-70-provider-router ────────────────────────────────────#
# FA-SF-70 — provider routing CLI + wrappers (offline; DB-touching paths skipped).

@test "FA-SF-70: provider-config.sh prints usage and exits non-zero with no args" {
  run bash scripts/factory/provider-config.sh
  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage"* ]]
}

@test "FA-SF-70: provider-config.sh set accepts tier=opus with warning" {
  kubectl() { if [ "$1" = "get" ]; then echo "mock-pod"; else echo "ok"; fi; }
  export -f kubectl
  run bash scripts/factory/provider-config.sh set --source x --tier opus --priority 1 --provider anthropic --model m --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"opus"* ]]
  # [T002427] Aus tests/local/FA-SF-70-provider-router.bats uebernommen, die mit diesem
  # Vorgang entfaellt: opus muss die Argumentpruefung PASSIEREN und nur warnen. Ohne diese
  # Zeile bestuende der Test auch dann, wenn opus hart abgelehnt wuerde — die Usage-Ausgabe
  # enthaelt den Tier-Namen ebenfalls.
  [[ "$output" == *"WARNING"* ]]
  [[ "$output" != *"Usage:"* ]]
}

@test "FA-SF-70: provider-config.sh set requires all mandatory flags" {
  run bash scripts/factory/provider-config.sh set --source x --tier sonnet
  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage"* ]]
}

@test "FA-SF-70: route-provider.sh emits valid JSON keys for opus without DB" {
  run bash scripts/factory/route-provider.sh factory-plan opus
  [ "$status" -eq 0 ]
  # T002277: opus liest jetzt provider_config statt eines hardcodierten Modells.
  # Ohne Cluster faellt es auf den eingebauten Default zurueck - beide Wege muessen
  # dieselbe Invariante erfuellen: gueltiges JSON, das auf den LOKALEN Proxy zeigt
  # und keinen Slot claimt (opus hat beim Aufrufer keinen Release-Pfad).
  # Auf modelId wird bewusst nicht hart geprueft: welches Modell hinter dem Proxy
  # steht, entscheidet die Registry und darf sich ohne Testaenderung verschieben.
  # Die letzte Zeile isolieren - ohne DB schreibt das Skript eine Warnung auf stderr,
  # und `run` fuehrt stdout und stderr in $output zusammen.
  echo "${lines[${#lines[@]}-1]}" | jq -e '.modelId and (.baseUrl | test("127.0.0.1:18235")) and (.slotId == null)'
}

@test "FA-SF-70: route-provider.sh requires source and tier args" {
  run bash scripts/factory/route-provider.sh
  [ "$status" -ne 0 ]
}

@test "FA-SF-70: release-slot.sh requires a provider arg" {
  run bash scripts/factory/release-slot.sh
  [ "$status" -ne 0 ]
}

@test "FA-SF-70: release-slot.sh accepts null slotId (no-op)" {
  run bash scripts/factory/release-slot.sh null true
  [ "$status" -eq 0 ]
}

# ── FA-SF-71-local-agent-budget-routing ─────────────────────────#
# FA-SF-71 — token-budget semaphore + local-qwen35 provider (T001590; offline, DB-touching
# paths skipped).

@test "FA-SF-71: route-provider.sh reserves tokens under a NULL-safe budget guard" {
  grep -Eq 'reserved_tokens = reserved_tokens \+ :.?ctx' scripts/factory/route-provider.sh
  grep -Eq "nullif\(:'budget',''\)::int IS NULL OR reserved_tokens \+ :'ctx'::int <=" scripts/factory/route-provider.sh
  grep -q '"ctx":%s' scripts/factory/route-provider.sh
}

@test "FA-SF-71: release-slot.sh decrements reserved_tokens by ctx (floored at 0)" {
  grep -Eq 'reserved_tokens = GREATEST\(0, reserved_tokens - :.?ctx' scripts/factory/release-slot.sh
}

@test "FA-SF-71: release-slot.sh still no-ops on null slot with a ctx arg" {
  run bash scripts/factory/release-slot.sh null true 60000
  [ "$status" -eq 0 ]
}

@test "FA-SF-71: pipeline.js has no per-call provider-slot routing (sandbox mode uses fixed FACTORY_MODEL)" {
  # routeProviderSync()/releaseSlotSync() (route-provider.sh + factory_model_slots
  # reservation/release) were the old per-agent-call provider-tier routing
  # mechanism. Sandbox mode (FACTORY_MODEL fixed to the local LM Studio model
  # for every agent() call) has no tiers/slots left to release — this is an
  # intentional architecture change, not a regression.
  run grep -q "releaseSlotSync" scripts/factory/pipeline.mjs
  [ "$status" -ne 0 ]
  run grep -q "routeProviderSync" scripts/factory/pipeline.mjs
  [ "$status" -ne 0 ]
  run grep -q "FACTORY_MODEL" scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
}


@test "FA-SF-71: pipeline.js stays offline-parseable after ctx threading" {
  run node --check scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
}

@test "FA-SF-71: local-qwen35 seed sets prio-1 row for ticket-triage" {
  local f=scripts/migrations/2026-07-03-local-qwen35-seed.sql
  grep -Eq "'ticket-triage', *'haiku', *1, *'local-qwen35'" "$f"
  grep -Eq '60000, *180000' "$f"
}

# ── FA-SF-74-provider-fallback-cascade ──────────────────────────#
# FA-SF-74 — T002359: Der Provider-Fallback war strukturell unerreichbar. Sechs Ursachen,
# hier als rot→grün-Beweis fixiert. Alle Assertions laufen gegen den Quelltext (offline,
# deterministisch) bzw. gegen die DB mit skip ohne Cluster.
#
# WARUM QUELLTEXT-ASSERTIONS: der Fehler war nie ein falscher Rückgabewert, sondern ein
# Kontrollfluss, der die Fallback-Kette gar nicht erst erreicht. Ein Funktionstest ohne DB
# landet immer im Emergency-Zweig und würde die Regression nicht sehen.
#
# $output-Gotcha (CLAUDE.md §CI/CD): hier bewusst KEIN unqualifiziertes $output-Matching —
# der Worktree heißt "factory-provider-fallback" und enthält die Wörter "factory",
# "provider" und "fallback"; über ein $0 in einer Usage-Zeile würde jede naive Assertion
# grün, ohne dass der Fix existiert.

@test "FA-SF-74: route-provider.sh phase branch feeds the candidate chain instead of returning" {
  # RC1: der factory_model_slots-Zweig returnte beim ersten Treffer und übersprang damit
  # Priority-Kette, provider_health, Cooldown und Claim komplett. Nach dem Fix ist der
  # Slot-Pin Kandidat #0 — kein unbedingtes exit im Phase-Block mehr.
  run bash -c "awk '/FROM tickets.factory_model_slots/,/^# Ordered candidates/' '$REPO_ROOT/scripts/factory/route-provider.sh' | grep -c 'exit 0'"
  [ "$output" = "0" ]
}

@test "FA-SF-74: route-provider.sh emergency row names no model without a live backend" {
  # RC5: qwythos-9b-v2 wird von LM Studio auf :1234 seit dem Gemma-Cutover nicht mehr
  # serviert. Der Emergency-Zweig gab die ID trotzdem zurück — lautlos.
  run grep -c 'qwythos-9b-v2' "$REPO_ROOT/scripts/factory/route-provider.sh"
  [ "$output" = "0" ]
}

@test "FA-SF-74: route-provider.sh emits apiKeyEnv so the key is data-driven, not hardcoded" {
  # RC/D3: die DB-Zeile trägt den NAMEN der Env-Variable (DEEPSEEK_API_KEY_PK für die
  # Factory, DEEPSEEK_API_KEY für Coaching) — der Key selbst bleibt in git-crypt.
  grep -q 'api_key_env' "$REPO_ROOT/scripts/factory/route-provider.sh"
  grep -q '"apiKeyEnv"' "$REPO_ROOT/scripts/factory/route-provider.sh"
}

@test "FA-SF-74: auto-triage.sh resolves the api key by indirection, not a provider case" {
  # auto-triage.sh:218 las hart DEEPSEEK_API_KEY — den Coaching-Key, nicht den
  # Factory-Key (pk-deepseek). Nach dem Fix kommt der Variablenname aus dem Router.
  grep -q 'apiKeyEnv' "$REPO_ROOT/scripts/factory/auto-triage.sh"
  run bash -c "grep -c 'deepseek)  *api_key=\"\${DEEPSEEK_API_KEY' '$REPO_ROOT/scripts/factory/auto-triage.sh' || true"
  [ "$output" = "0" ]
}

@test "FA-SF-74: reaper zeroes active_agents so one run clears every stranded slot" {
  # RC4: das alte GREATEST(0, active_agents - 1) in Kombination mit claimed_at = NULL
  # machte die Zeile nach dem ERSTEN Lauf unerreichbar — active_agents blieb auf 2 stehen.
  grep -Eq 'active_agents *= *0' "$REPO_ROOT/scripts/factory/reap-provider-slots.sh"
  run bash -c "grep -c 'active_agents - 1' '$REPO_ROOT/scripts/factory/reap-provider-slots.sh' || true"
  [ "$output" = "0" ]
}

@test "FA-SF-74: wakeup.sh runs the slot reaper each tick (it had no caller at all)" {
  # RC4: reap-provider-slots.sh hatte weder Timer noch Cron noch Taskfile-Eintrag —
  # das Netz war geschrieben, aber nie aufgehängt.
  grep -q 'reap-provider-slots.sh' "$REPO_ROOT/scripts/factory/wakeup.sh"
}

@test "FA-SF-74: each factory tier has a fallback candidate behind the primary" {
  # RC2: cheap/flash/sonnet hatten je genau EINE enabled Zeile — der Tier-Name im
  # Aufruf traf nie eine DeepSeek-Zeile (die lagen in haiku/sonnet hinter prio 0).
  command -v kubectl >/dev/null || skip "kubectl not available"
  # [T002626] Frueher prueste der Guard hier `--context fleet`, waehrend der
  # Testkoerper `factory_psql` aufruft. Seit ADR-006 E3 zeigt factory_psql auf
  # den lokalen Cluster — Guard und Koerper massen damit verschiedene Cluster,
  # und der Test scheiterte statt zu skippen. _skip_if_no_db (aus _sf_common)
  # prueft denselben Cluster, den der Koerper anspricht.
  _skip_if_no_db
  local sql="SELECT tier, count(*) FROM tickets.provider_config
             WHERE source='*' AND enabled=true AND tier IN ('cheap','flash','sonnet')
             GROUP BY tier HAVING count(*) < 2;"
  run bash -c "source '$REPO_ROOT/scripts/factory/lib.sh'; factory_resolve; factory_psql <<'EOSQL'
$sql
EOSQL"
  [ -z "$output" ]
}
