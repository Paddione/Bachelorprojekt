#!/usr/bin/env bats
# API-Inventar-Drift-Guard [T007559] -- Requirement "API Connector Inventory"
# (openspec/changes/sdlc-leitstand-e1-e2/specs/sdlc-cockpit.md).
#
# Pruefmodus: Output-Verifikation (T002448-M4) -- jeder Test FUEHRT den Scanner
# aus und prueft $status/$output/erzeugtes JSON; es wird NICHT auf
# scripts/sdlc/api-inventory.mjs gegreppt. Semantik statt Darstellung
# (T002716): Assertions haengen an Exit-Code, Kernfeldern und Untergrenzen,
# nicht an Ausgabeformat oder exakten Zaehlwerten.
#
# Schnittstellen-Vertrag (von p2 implementiert):
#   - Aufruf: node scripts/sdlc/api-inventory.mjs -- Default-Output
#     components/website/src/data/api-inventory.json, Default-Overlay
#     docs/agent-guide/registry/api-overlay.yaml.
#   - Env-Overrides: API_INVENTORY_OUT (Zielpfad), API_OVERLAY_PATH (Overlay).
#   - Exit-Codes: 0 Erfolg (Datei geschrieben); != 0 bei mind. einem
#     verwaisten Overlay-Eintrag (Datei nicht geschrieben).
#   - JSON: Top-Level routes/mcpServers/factoryTools, keine Zeitstempel-Keys.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  cd "$REPO_ROOT" || return 1
}

# T1 -- Szenario "Deterministic regeneration": zwei Laeufe sind byte-identisch.
# Positiv-Anker vor der Gleichheitsaussage (zwei leere Dateien waeren trivial
# identisch).
@test "api-inventory: two runs are byte-identical" {
  command -v node >/dev/null 2>&1 || skip "node not installed"
  out1="$BATS_TEST_TMPDIR/a.json"; out2="$BATS_TEST_TMPDIR/b.json"
  API_INVENTORY_OUT="$out1" run node scripts/sdlc/api-inventory.mjs
  [ "$status" -eq 0 ]
  API_INVENTORY_OUT="$out2" run node scripts/sdlc/api-inventory.mjs
  [ "$status" -eq 0 ]
  # Positiv-Anker: es wurde tatsaechlich etwas gescannt -- sonst waere die
  # Gleichheit trivial (zwei leere Dateien sind auch "identisch").
  [ "$(jq '.routes | length' "$out1")" -gt 0 ]
  diff -q "$out1" "$out2"
}

# T2 -- Kernfelder: Routen mit path/methods/backend, MCP-Server-Liste deckt
# sich mit der Registry, 7 factory-mcp-Tools (design.md S5).
@test "api-inventory: core fields present, mcp count matches registry, 7 factory tools" {
  command -v node >/dev/null 2>&1 || skip "node not installed"
  out="$BATS_TEST_TMPDIR/inv.json"
  API_INVENTORY_OUT="$out" run node scripts/sdlc/api-inventory.mjs
  [ "$status" -eq 0 ]
  # jede Route traegt path/methods/backend, methods ist nicht leer
  [ "$(jq '[.routes[] | select((has("path") and has("methods") and has("backend"))|not)] | length' "$out")" -eq 0 ]
  [ "$(jq '[.routes[] | select((.methods|length)==0)] | length' "$out")" -eq 0 ]
  # MCP-Server-Anzahl deckt sich mit der Registry (dynamischer Abgleich statt
  # harter Zahl -- T002716: die Registry waechst ueber die Zeit).
  registry_n=$(awk '/^clients:/{f=1;next} f && /^[a-z]/{exit} f && /^  [a-zA-Z0-9_-]+:$/{n++} END{print n+0}' \
    docs/agent-guide/registry/mcp.yaml)
  [ "$(jq '.mcpServers | length' "$out")" -eq "$registry_n" ]
  # factory-mcp-Tools: 7 lt. design.md S5 (openspec_find_similar, factory_ask,
  # factory_enqueue, factory_queue, factory_recent, factory_status, factory_trigger)
  [ "$(jq '.factoryTools | length' "$out")" -eq 7 ]
}

# T3 -- Deterministisch sortiert, keine Zeitstempel.
@test "api-inventory: routes sorted, no timestamp keys" {
  command -v node >/dev/null 2>&1 || skip "node not installed"
  out="$BATS_TEST_TMPDIR/inv.json"
  API_INVENTORY_OUT="$out" run node scripts/sdlc/api-inventory.mjs
  [ "$status" -eq 0 ]
  jq -e '.' "$out" >/dev/null   # Positiv-Anker: gueltiges, nicht-leeres JSON
  sorted=$(jq -r '[.routes[].path] | sort | join(",")' "$out")
  actual=$(jq -r '[.routes[].path] | join(",")' "$out")
  [ "$sorted" = "$actual" ]
  grep -qiE '"(generatedAt|timestamp|date)"' "$out" && return 1 || true
}

# T4 -- Szenario "Drift fails the gate". Negativtest + Positiv-Anker.
# Drift-Simulation ueber eine FIXTURE-Routenquelle statt ueber Artefakt-
# Mutation: der Scanner regeneriert deterministisch aus seinen Quellen, daher
# stellt eine Korruption des Artefakts den committeten Stand nach einem
# Regenerate-Lauf exakt wieder her (diff exit 0) -- das Gate wuerde Drift nie
# sehen. Echte Drift entsteht, wenn die QUELLEN seit dem Commit weitergelaufen
# sind; genau das simuliert eine Route ausserhalb des Realbaums
# (API_INVENTORY_ROUTES_DIR auf ein Fixture-Verzeichnis). teardown stellt
# IMMER zurueck (siehe Taskfile-Kommentar zu Phase 1 der freshness:check-Task).
# Zusaetzlich Verdrahtungscheck: freshness:regenerate ruft den Generator
# (Quelltext-Ausnahme, dokumentiert -- Konfigurationsaussage, analog
# build-target-runtime-env.bats).
@test "api-inventory: drift fails the gate and generator is wired into freshness" {
  command -v node >/dev/null 2>&1 || skip "node not installed"
  REAL="$REPO_ROOT/components/website/src/data/api-inventory.json"
  [ -f "$REAL" ] && cp "$REAL" "$BATS_TEST_TMPDIR/orig.json"
  # Positiv-Anker: frisch regeneriert == committeter Stand (kein falsches
  # Drift-Signal).
  run node scripts/sdlc/api-inventory.mjs
  [ "$status" -eq 0 ]
  run git -C "$REPO_ROOT" diff --quiet -- components/website/src/data/api-inventory.json
  [ "$status" -eq 0 ]
  # Drift simulieren: eine neue Route, die der committete Stand nicht kennt.
  # Fixture-Overlay im entries-Format (p3) mit exakt diesem Endpoint -- der
  # reale Overlay referenziert /sdlc/api/factory-floor, den die Fixture-
  # Routenquelle nicht kennt (Orphan, Exit 1).
  mkdir -p "$BATS_TEST_TMPDIR/routes/__drift__"
  cat > "$BATS_TEST_TMPDIR/routes/__drift__/extra.ts" <<'EOF'
export const GET: APIRoute = () => new Response('drift fixture');
EOF
  cat > "$BATS_TEST_TMPDIR/routes-overlay.yaml" <<'EOF'
entries:
  - endpoint: /sdlc/api/__drift__/extra
    description: "Drift fixture"
    tier: internal
EOF
  API_INVENTORY_ROUTES_DIR="$BATS_TEST_TMPDIR/routes" \
    API_OVERLAY_PATH="$BATS_TEST_TMPDIR/routes-overlay.yaml" \
    run node scripts/sdlc/api-inventory.mjs
  [ "$status" -eq 0 ]
  run git -C "$REPO_ROOT" diff --quiet -- components/website/src/data/api-inventory.json
  [ "$status" -eq 1 ]   # Abweichung erkannt
  run git -C "$REPO_ROOT" diff --name-only -- website/src/data/api-inventory.json
  echo "$output" | grep -qF 'components/website/src/data/api-inventory.json'
  # Verdrahtung: freshness:regenerate fuehrt den Generator aus. Task-NAME ist
  # "api:inventory" (Doppelpunkt, nicht Bindestrich) -- die Invocation-Zeile
  # "- task: api:inventory" ist das Ankerliteral.
  awk '/^  freshness:regenerate:/{f=1;next} f && /^  [a-z][a-zA-Z0-9:_-]*:$/{exit} f' \
    "$REPO_ROOT/Taskfile.yml" | grep -qF -- '- task: api:inventory'
}

# T5 -- Szenario "Orphaned overlay entry fails". Negativtest + Positiv-Anker,
# gueltiger Fall zuerst im selben Test. /sdlc/api/qa-queue ist eine real
# existierende Route (website/src/pages/sdlc/api/qa-queue.ts) -- der
# Positiv-Fall haengt nicht an p2s Scan-Ergebnis.
@test "api-inventory: orphaned overlay entry fails and names the endpoint" {
  command -v node >/dev/null 2>&1 || skip "node not installed"
  valid="$BATS_TEST_TMPDIR/valid-overlay.yaml"
  invalid="$BATS_TEST_TMPDIR/invalid-overlay.yaml"
  cat > "$valid" <<'EOF'
entries:
  - endpoint: /sdlc/api/qa-queue
    description: "Testfixture"
    tier: internal
EOF
  cat > "$invalid" <<'EOF'
entries:
  - endpoint: /sdlc/api/qa-queue
    description: "Testfixture"
    tier: internal
  - endpoint: /sdlc/api/does-not-exist-xyz
    description: "Verwaister Eintrag"
    tier: internal
EOF
  # Positiv-Anker: gueltiges Overlay laeuft durch.
  API_OVERLAY_PATH="$valid" API_INVENTORY_OUT="$BATS_TEST_TMPDIR/ok.json" \
    run node scripts/sdlc/api-inventory.mjs
  [ "$status" -eq 0 ]
  # Negativ: verwaister Eintrag laesst die Generierung fehlschlagen und wird benannt.
  API_OVERLAY_PATH="$invalid" API_INVENTORY_OUT="$BATS_TEST_TMPDIR/bad.json" \
    run node scripts/sdlc/api-inventory.mjs
  [ "$status" -ne 0 ]
  echo "$output" | grep -qF 'does-not-exist-xyz'
}

teardown() {
  # T4 kann die committete Artefaktdatei mutiert haben -- IMMER zuruecksetzen.
  REAL="$REPO_ROOT/components/website/src/data/api-inventory.json"
  if [ -f "$BATS_TEST_TMPDIR/orig.json" ]; then
    cp "$BATS_TEST_TMPDIR/orig.json" "$REAL"
  fi
  git -C "$REPO_ROOT" checkout -- components/website/src/data/api-inventory.json 2>/dev/null || true
}
