#!/usr/bin/env bats
# tests/spec/toolset-registry/schema-gate.bats — Schema-Gate von check.mjs [T002592]
#
# Pruefmodus: command output verification. Jeder Test fuehrt `node scripts/toolset/check.mjs`
# gegen eine Fixture-Registry AUS und prueft $status und $output — es wird nicht der Quelltext
# des Generators gegreppt (Konvention T002448-M4).
#
# Die Fixtures liegen in $BATS_TEST_TMPDIR und werden ueber TOOLSET_REGISTRY / TOOLSET_OUT_DIR
# angezogen. Ohne diese beiden Overrides wuerde der Test die echte Konfiguration des Entwicklers
# ueberschreiben — sie sind deshalb Teil des Modul-Interfaces, nicht ein Testdetail.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  OUT_DIR="${BATS_TEST_TMPDIR}/out"
  mkdir -p "$OUT_DIR"
}

# Schreibt eine Fixture-Registry und gibt ihren Pfad auf stdout aus.
write_registry() {
  local path="${BATS_TEST_TMPDIR}/$1.yaml"
  cat > "$path"
  echo "$path"
}

run_check() {
  run env TOOLSET_REGISTRY="$1" TOOLSET_OUT_DIR="$OUT_DIR" \
    node "$REPO_ROOT/scripts/toolset/check.mjs"
}

@test "schema-gate: canonical ohne use_when faellt fail-closed" {
  # Positiv-Anker: dieselbe Fixture MIT use_when und roles laeuft durch. Ohne ihn bestuende
  # der Negativtest auch gegen ein check.mjs, das ueberhaupt nichts neu prueft (T002356-M1).
  local ok
  ok="$(write_registry ok <<'EOF'
capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
      roles: [bachelorprojekt-db]
EOF
)"
  run_check "$ok"
  [ "$status" -eq 0 ]

  local bad
  bad="$(write_registry no-use-when <<'EOF'
capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      roles: [bachelorprojekt-db]
EOF
)"
  run_check "$bad"
  [ "$status" -ne 0 ]
  [[ "$output" == *"demo-cap"* ]]
  [[ "$output" == *"mcp:demo-server"* ]]
  [[ "$output" == *"use_when"* ]]
}

@test "schema-gate: canonical ohne roles faellt fail-closed" {
  local ok
  ok="$(write_registry roles-ok <<'EOF'
capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
      roles: [orchestrator]
EOF
)"
  run_check "$ok"
  [ "$status" -eq 0 ]

  local bad
  bad="$(write_registry no-roles <<'EOF'
capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
EOF
)"
  run_check "$bad"
  [ "$status" -ne 0 ]
  [[ "$output" == *"roles"* ]]
  [[ "$output" == *"mcp:demo-server"* ]]
}

@test "schema-gate: leere roles-Liste zaehlt als fehlend" {
  local bad
  bad="$(write_registry empty-roles <<'EOF'
capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
      roles: []
EOF
)"
  run_check "$bad"
  [ "$status" -ne 0 ]
  [[ "$output" == *"roles"* ]]
}

@test "schema-gate: Rollen-Kurzform ausserhalb des Vokabulars faellt" {
  # Positiv-Anker zuerst: der volle Rollenname wird akzeptiert.
  local ok
  ok="$(write_registry role-full <<'EOF'
capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
      roles: [bachelorprojekt-db]
EOF
)"
  run_check "$ok"
  [ "$status" -eq 0 ]

  local bad
  bad="$(write_registry role-short <<'EOF'
capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
      roles: [db]
EOF
)"
  run_check "$bad"
  [ "$status" -ne 0 ]
  # Die Meldung muss den unbekannten Namen nennen, sonst ist sie nicht handlungsleitend.
  run bash -c "env TOOLSET_REGISTRY='$bad' TOOLSET_OUT_DIR='$OUT_DIR' node '$REPO_ROOT/scripts/toolset/check.mjs' 2>&1 | grep -c \"unknown role 'db'\""
  [ "$output" -ge 1 ]
}

@test "schema-gate: Wildcard-Rolle 'all' ist gueltig" {
  local ok
  ok="$(write_registry role-all <<'EOF'
capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
      roles: [all]
EOF
)"
  run_check "$ok"
  [ "$status" -eq 0 ]
}

@test "schema-gate: ungueltiges tier faellt und nennt den Wert" {
  local ok
  ok="$(write_registry tier-ok <<'EOF'
capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
      roles: [orchestrator]
      tier: dangerous
EOF
)"
  run_check "$ok"
  [ "$status" -eq 0 ]

  local bad
  bad="$(write_registry tier-bad <<'EOF'
capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
      roles: [orchestrator]
      tier: gefaehrlich
EOF
)"
  run_check "$bad"
  [ "$status" -ne 0 ]
  [[ "$output" == *"gefaehrlich"* ]]
}

@test "schema-gate: suppressed braucht keine Nutzungssemantik" {
  # Positiv-Anker: exakt dieselbe Instanz OHNE use_when/roles ist als canonical rot.
  # Erst damit belegt der Test, dass die Ausnahme fuer suppressed eine echte Ausnahme ist
  # und nicht bloss die Abwesenheit jeder Pruefung.
  local as_canonical
  as_canonical="$(write_registry supp-as-canonical <<'EOF'
capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
EOF
)"
  run_check "$as_canonical"
  [ "$status" -ne 0 ]

  local as_suppressed
  as_suppressed="$(write_registry supp <<'EOF'
capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
      roles: [orchestrator]
    mcp:other-server:
      state: suppressed
      reason: "Demo-Server ist der kanonische Pfad."
EOF
)"
  run_check "$as_suppressed"
  [ "$status" -eq 0 ]
}

@test "schema-gate: unreviewed-Instanzen brechen den Gate NICHT" {
  # Der SSOT-Spec verlangt Quarantaene ohne CI-Bruch ("SHALL still exit zero").
  # Ein neu installiertes Plugin darf CI nicht rot machen, sonst wird die Quarantaene
  # zur Blockade und in der Praxis umgangen.
  #
  # Die Fixture fuehrt ein Plugin als unreviewed, das im echten Repo aktiviert ist.
  # Positiv-Anker: eine gleichzeitig vorhandene canonical-Instanz belegt, dass der Gate
  # ueberhaupt gelaufen ist und nicht bloss frueh abgebrochen hat.
  local fx
  fx="$(write_registry with-unreviewed <<'EOF'
capabilities:
  demo-cap:
    mcp:demo-server:
      state: canonical
      use_when: "Demo-Zweck"
      roles: [orchestrator]
  quarantaene:
    plugin:superpowers@claude-plugins-official:
      state: unreviewed
      reason: "Noch nicht entschieden."
EOF
)"
  run_check "$fx"
  [ "$status" -eq 0 ]

  # Der Bericht muss den Kurations-Skill nennen — sonst ist die Meldung nicht handlungsleitend.
  run bash -c "env TOOLSET_REGISTRY='$fx' TOOLSET_OUT_DIR='$OUT_DIR' node '$REPO_ROOT/scripts/toolset/check.mjs' 2>&1 | grep -c 'toolset-curate'"
  [ "$output" -ge 1 ]
}

@test "schema-gate: die echte Registry ist vollstaendig kuriert" {
  run bash -c "cd '$REPO_ROOT' && node scripts/toolset/check.mjs"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Toolset registry check passed."* ]]
}
