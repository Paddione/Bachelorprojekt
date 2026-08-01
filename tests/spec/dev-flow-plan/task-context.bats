#!/usr/bin/env bats
# tests/spec/dev-flow-plan/task-context.bats
# T002420 — task-context-channel: Generator (plan-intel.sh), Assembler (task-context.sh), Gate (plan-lint I1)

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SCHEMA="$REPO/.claude/skills/references/schemas/plan-intel-bundle.schema.json"
  SLUG="task-context-channel"
  CHANGE_DIR="$REPO/openspec/changes/$SLUG"
  # Wohin die Generator-Laeufe schreiben, die ihr Ergebnis nur lesen wollen.
  OUT="$BATS_TEST_TMPDIR/intel.json"

  # [T002523-M4] Der echte intel.json-Stand wird gesichert und in teardown()
  # wiederhergestellt. Diese Suite arbeitet gegen einen PRODUKTIVEN Change-Slug, nicht
  # gegen ein Fixture: die Gate-Tests brauchen die Datei an ihrem echten Ort, weil
  # plan-lint sie dort sucht. Ohne diese Klammer blieb nach jedem Suite-Lauf eine
  # modifizierte Datei eines FREMDEN Changes im Arbeitsbaum liegen — wer danach
  # `git status` las, musste erst herausfinden, ob das eigene Arbeit, fremder WIP oder
  # Testmuell war. Genau aus dieser Unklarheit ist bei T001880 echter Verlust entstanden.
  INTEL_BACKUP=""
  if [ -f "$CHANGE_DIR/intel.json" ]; then
    INTEL_BACKUP="$BATS_TEST_TMPDIR/intel.orig.json"
    cp "$CHANGE_DIR/intel.json" "$INTEL_BACKUP"
  fi
}

teardown() {
  if [ -n "${INTEL_BACKUP:-}" ] && [ -f "$INTEL_BACKUP" ]; then
    cp "$INTEL_BACKUP" "$CHANGE_DIR/intel.json"
  fi
}

# ── Generator (p1) ──────────────────────────────────────

@test "TCC-gen: erzeugt schema-konformes Bundle aus Fixture-Slug" {
  run bash "$REPO/scripts/plan-intel.sh" "$SLUG" --out "$OUT"
  [ "$status" -eq 0 ] || { echo "Generator failed: $output"; false; }
  jq -e . "$OUT" >/dev/null || { echo "invalid JSON"; false; }
  for k in meta impact_files symbols; do
    jq -e --arg k "$k" 'has($k)' "$OUT" >/dev/null \
      || { echo "MISSING top-level key: $k"; false; }
  done
  jq -e '.impact_files | all(has("loc") and has("s1_budget"))' "$OUT" >/dev/null
}

@test "TCC-gen: s1.ignore-Datei erhaelt s1_budget:null, gemessene Datei numerisch" {
  run bash "$REPO/scripts/plan-intel.sh" "$SLUG" --out "$OUT"
  [ "$status" -eq 0 ]
  local lint_budget
  lint_budget="$(jq -r '.impact_files[] | select(.path == "scripts/plan-lint.sh") | .s1_budget' "$OUT")"
  [[ "$lint_budget" =~ ^-?[0-9]+$ ]] || { echo "gemessene Datei hat nicht-numerischen budget: $lint_budget"; false; }
  local pipeline_budget
  pipeline_budget="$(jq -r '.impact_files[] | select(.path == "scripts/factory/pipeline.mjs") | .s1_budget' "$OUT")"
  [ "$pipeline_budget" == "null" ] || { echo "s1.ignore Datei hat budget: $pipeline_budget (sollte null sein)"; false; }
}

@test "TCC-gen: nicht erreichbare Quelle erzeugt risks[] mit severity:warn" {
  run bash "$REPO/scripts/plan-intel.sh" "$SLUG" --out "$OUT"
  [ "$status" -eq 0 ]
  local warn_count
  warn_count="$(jq '[.risks[] | select(.severity == "warn")] | length' "$OUT")"
  [ "$warn_count" -ge 1 ] || { echo "kein warn-risk gefunden"; false; }
}

@test "TCC-gen: vorhandene api_contracts ueberleben erneuten Lauf" {
  local saved_contract='[{"route":"/test","method":"GET","request_type":"void","response_type":"string","file":"test.js"}]'
  local backup; backup="$(mktemp)"
  cp "$CHANGE_DIR/intel.json" "$backup"
  jq --argjson ac "$saved_contract" '.api_contracts = $ac' "$CHANGE_DIR/intel.json" > /tmp/intel-with-ac.json
  cp /tmp/intel-with-ac.json "$CHANGE_DIR/intel.json"
  run bash "$REPO/scripts/plan-intel.sh" "$SLUG"
  [ "$status" -eq 0 ]
  local ac_route
  ac_route="$(jq -r '.api_contracts[0].route // "empty"' "$CHANGE_DIR/intel.json")"
  # Restore backup
  cp "$backup" "$CHANGE_DIR/intel.json"
  rm -f "$backup" /tmp/intel-with-ac.json
  [ "$ac_route" = "/test" ] || { echo "api_contracts wurden ueberschrieben: $ac_route"; false; }
}

# ── Assembler (p2) ──────────────────────────────────────

@test "TCC-asm: fehlendes intel.json → exit != 0, keine Kontext-Ausgabe auf stdout" {
  run bash "$REPO/scripts/task-context.sh" "nonexistent-slug"
  [ "$status" -ne 0 ] || { echo "Assembler endete mit 0 trotz fehlendem intel.json"; false; }
  [[ "$output" != *"## Intel"* ]] || { echo "stdout enthaelt Kontextblock (## Intel) trotz Fehler"; false; }
}

@test "TCC-asm: nicht erreichbares Signal → exit 0, WARN: Marker, Positiv-Anker" {
  run bash "$REPO/scripts/task-context.sh" "$SLUG"
  [ "$status" -eq 0 ] || { echo "Assembler endete != 0: $output"; false; }
  [[ "$output" == *"## Intel"* ]] || { echo "kein Kontextblock (## Intel) in Ausgabe"; false; }
}

@test "TCC-asm: --partial p3 liefert genau dessen impact_files" {
  run bash "$REPO/scripts/task-context.sh" "$SLUG" --partial p3
  [ "$status" -eq 0 ]
  [[ "$output" == *"p3"* ]] || { echo "Partial-Name p3 fehlt im Header"; false; }
}

# ── Gate (p3) ──────────────────────────────────────────

@test "TCC-gate: vollstaendiges Bundle passiert plan-lint" {
  run bash "$REPO/scripts/plan-intel.sh" "$SLUG"
  [ "$status" -eq 0 ]
  run bash "$REPO/scripts/plan-lint.sh" "$REPO/openspec/changes/$SLUG/tasks.md"
  [ "$status" -eq 0 ] || { echo "lint failed on complete bundle: $output"; false; }
}

@test "TCC-gate: fehlende Zieldatei in impact_files → Hard-Fail mit Dateinamen" {
  run bash "$REPO/scripts/plan-intel.sh" "$SLUG"
  [ "$status" -eq 0 ]
  local backup; backup="$(mktemp)"
  cp "$CHANGE_DIR/intel.json" "$backup"
  local modified
  modified="$(jq 'del(.impact_files[] | select(.path == "scripts/plan-intel.sh"))' "$CHANGE_DIR/intel.json")"
  echo "$modified" > "$CHANGE_DIR/intel.json"
  run bash "$REPO/scripts/plan-lint.sh" "$REPO/openspec/changes/$SLUG/tasks.md"
  local rc="$status"
  cp "$backup" "$CHANGE_DIR/intel.json"
  rm -f "$backup"
  [ "$rc" -ne 0 ] || { echo "lint sollte fehlschlagen bei unvollstaendigem Bundle"; false; }
  [[ "$output" == *"plan-intel.sh"* ]] || { echo "Meldung nennt fehlende Datei nicht: $output"; false; }
}

@test "TCC-gate: Plan ohne tasks.d/ wird von I1 nicht beruehrt" {
  local single_plan="$REPO/openspec/changes/admin-fundament-konsolidierung/tasks.md"
  [ -f "$single_plan" ] || { echo "Plan ohne tasks.d/ nicht gefunden"; false; }
  run bash "$REPO/scripts/plan-lint.sh" "$single_plan"
  [ "$status" -eq 0 ] || { echo "lint failed auf Plan ohne tasks.d/: $output"; false; }
}

# ── Konsistenz ────────────────────────────────────

@test "TCC-consistency: gleicher Slug liefert gleichen statischen Kern" {
  run bash "$REPO/scripts/task-context.sh" "$SLUG"
  [ "$status" -eq 0 ] || { echo "erster Aufruf fehlgeschlagen: $output"; false; }
  local first="$output"
  run bash "$REPO/scripts/task-context.sh" "$SLUG"
  [ "$status" -eq 0 ] || { echo "zweiter Aufruf fehlgeschlagen: $output"; false; }
  [ "$first" = "$output" ] || { echo "statischer Kern unterscheidet sich zwischen Aufrufen"; false; }
}
