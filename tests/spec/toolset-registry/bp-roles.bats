#!/usr/bin/env bats
# tests/spec/toolset-registry/bp-roles.bats — bp-*-Rollenvokabular der Toolset-Kette [T900980]
#
# Pruefmodus: command output verification (T002448-M4). Die Tests rufen
# toolset-context.sh und check.mjs AUS und pruefen $status/$output.
#
# Hintergrund: T900858 hat die sechs bachelorprojekt-*-Agenten durch bp-build/bp-run/bp-ship
# ersetzt. AGENTS.md verlangt `toolset-context.sh <bp-*>`; die Toolset-Kette kannte die Namen
# nicht, brach fail-closed ab, und der Dispatch-Snippet liess den <toolset>-Block still weg.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  OUT_DIR="${BATS_TEST_TMPDIR}/out"
  mkdir -p "$OUT_DIR/.claude"
  echo '{}' > "$OUT_DIR/.claude/settings.json"
  FIXTURE="${BATS_TEST_TMPDIR}/capabilities.yaml"
  cat > "$FIXTURE" <<'EOF'
capabilities:
  demo-run:
    mcp:run-server:
      state: canonical
      use_when: "Nur fuer bp-run"
      roles: [bp-run]
  demo-ship:
    mcp:ship-server:
      state: canonical
      use_when: "Nur fuer bp-ship"
      roles: [bp-ship]
  demo-shared:
    mcp:everywhere-server:
      state: canonical
      use_when: "Fuer jede Rolle"
      roles: [all]
EOF
}

run_ctx() {
  run env TOOLSET_REGISTRY="$FIXTURE" bash "$REPO_ROOT/scripts/toolset-context.sh" "$@"
}

@test "bp-roles: toolset-context akzeptiert bp-build, bp-run und bp-ship" {
  for r in bp-build bp-run bp-ship; do
    run_ctx "$r"
    [ "$status" -eq 0 ]
    # Die Wildcard muss jede bp-Rolle erreichen — sonst ist die Rolle zwar gueltig, aber leer.
    [[ "$output" == *"mcp:everywhere-server"* ]]
  done
}

@test "bp-roles: Rollenfilter trennt bp-run von bp-ship" {
  run_ctx bp-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"mcp:run-server"* ]]
  [[ "$output" != *"mcp:ship-server"* ]]
}

@test "bp-roles: Legacy-Rolle wird mit Hinweis auf die bp-Rolle aufgeloest" {
  # bachelorprojekt-db ist in bp-run aufgegangen (plan-context.sh, T900858).
  run_ctx bachelorprojekt-db
  [ "$status" -eq 0 ]
  [[ "$output" == *"mcp:run-server"* ]]
  [[ "$output" == *"bp-run"* ]]
  [[ "$output" == *"veraltet"* ]]
}

@test "bp-roles: Fehlermeldung nennt die bp-Rollen" {
  run_ctx nonsense-role
  [ "$status" -ne 0 ]
  [[ "$output" == *"bp-build"* ]]
  [[ "$output" == *"bp-ship"* ]]
}

@test "bp-roles: echte Registry liefert jeder bp-Rolle mindestens eine Instanz" {
  for r in bp-build bp-run bp-ship; do
    run bash -c "cd '$REPO_ROOT' && bash scripts/toolset-context.sh $r 2>/dev/null | grep -c '^### '"
    [ "$output" -ge 1 ]
  done
}

@test "bp-roles: check.mjs akzeptiert bp-Rollen" {
  run env TOOLSET_REGISTRY="$FIXTURE" TOOLSET_OUT_DIR="$OUT_DIR" node "$REPO_ROOT/scripts/toolset/check.mjs"
  [ "$status" -eq 0 ]
  [[ "$output" == *"check passed"* ]]
}

@test "bp-roles: check.mjs lehnt Legacy-Rolle in der Registry ab und nennt den Ersatz" {
  local legacy="${BATS_TEST_TMPDIR}/legacy.yaml"
  cat > "$legacy" <<'EOF'
capabilities:
  demo-db:
    mcp:db-server:
      state: canonical
      use_when: "Legacy"
      roles: [bachelorprojekt-db]
EOF
  run env TOOLSET_REGISTRY="$legacy" TOOLSET_OUT_DIR="$OUT_DIR" node "$REPO_ROOT/scripts/toolset/check.mjs"
  [ "$status" -ne 0 ]
  [[ "$output" == *"bachelorprojekt-db"* ]]
  [[ "$output" == *"bp-run"* ]]
}

@test "bp-roles: echte Registry besteht check.mjs" {
  run bash -c "cd '$REPO_ROOT' && node scripts/toolset/check.mjs"
  [ "$status" -eq 0 ]
}
