#!/usr/bin/env bats
# tests/spec/toolset-registry/context-injection.bats — scripts/toolset-context.sh [T002592]
#
# Pruefmodus: command output verification. Die Tests rufen das Skript AUS und pruefen
# $status und $output; der Quelltext wird nicht gegreppt (T002448-M4).
#
# Der zentrale Regressionsschutz hier ist das Fail-Closed-Verhalten bei unbekannter Rolle.
# scripts/plan-context.sh faellt in diesem Fall still auf __ALL__ zurueck (T002322) und der
# Rollenfilter wirkt dann gar nicht. Fuer einen Werkzeug-Block waere das schaedlich: eine
# vertippte Rolle injizierte das vollstaendige Arsenal in jeden Prompt.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  FIXTURE="${BATS_TEST_TMPDIR}/capabilities.yaml"
  cat > "$FIXTURE" <<'EOF'
capabilities:
  demo-db:
    mcp:db-only-server:
      state: canonical
      use_when: "Nur fuer die DB-Rolle"
      avoid_when: "Schreibende SQL"
      fallback: "kubectl exec … psql"
      roles: [bachelorprojekt-db]
      tier: caution
      deep_ref: ".claude/skills/references/mcp-tool-guide.md#demo"
  demo-web:
    mcp:web-only-server:
      state: canonical
      use_when: "Nur fuer die Website-Rolle"
      roles: [bachelorprojekt-website]
  demo-shared:
    mcp:everywhere-server:
      state: canonical
      use_when: "Fuer jede Rolle"
      roles: [all]
  demo-blocked:
    mcp:blocked-server:
      state: suppressed
      reason: "Nicht projektrelevant."
      use_when: "Darf nie erscheinen"
      roles: [all]
EOF
}

run_ctx() {
  run env TOOLSET_REGISTRY="$FIXTURE" bash "$REPO_ROOT/scripts/toolset-context.sh" "$@"
}

@test "context: Rollenfilter grenzt die Ausgabe ein" {
  run_ctx bachelorprojekt-db
  [ "$status" -eq 0 ]
  # Positiv-Anker zuerst: die passende Instanz ist da.
  [[ "$output" == *"mcp:db-only-server"* ]]
  # Erst dann die Negativ-Aussage.
  [[ "$output" != *"mcp:web-only-server"* ]]
}

@test "context: Wildcard-Rolle 'all' erreicht jede Rolle" {
  run_ctx bachelorprojekt-db
  [ "$status" -eq 0 ]
  [[ "$output" == *"mcp:everywhere-server"* ]]

  run_ctx bachelorprojekt-website
  [ "$status" -eq 0 ]
  [[ "$output" == *"mcp:everywhere-server"* ]]
}

@test "context: suppressed erscheint niemals im Block" {
  run_ctx orchestrator
  [ "$status" -eq 0 ]
  # Positiv-Anker: der Lauf hat ueberhaupt eine Instanz ausgegeben.
  [[ "$output" == *"mcp:everywhere-server"* ]]
  [[ "$output" != *"mcp:blocked-server"* ]]
}

@test "context: unbekannte Rolle faellt closed und gibt keine Instanz aus" {
  # Positiv-Anker: die volle Rolle liefert Instanzen.
  run_ctx bachelorprojekt-db
  [ "$status" -eq 0 ]
  [[ "$output" == *"mcp:db-only-server"* ]]

  # Kurzform 'db' ist bewusst ungueltig.
  run_ctx db
  [ "$status" -ne 0 ]
  # Entscheidend ist nicht nur der Exit-Code: ein Skript, das vor dem Abbruch noch alles
  # ausgibt, waere genau der T002322-Rueckfall. Die Ergebniszeilen muessen leer sein.
  #
  # Die Pruefung wird auf die Ergebniszeilen verengt ('### '-Praefix). Ein unqualifizierter
  # Vergleich gegen den gesamten stdout+stderr koennte durch den Worktree-Pfad in einer
  # Usage-Zeile erfuellt werden — der Pfad enthaelt den Slug 'toolset-usage-injection'.
  run bash -c "env TOOLSET_REGISTRY='$FIXTURE' bash '$REPO_ROOT/scripts/toolset-context.sh' db 2>&1 | grep -c '^### ' || true"
  [ "$output" -eq 0 ]
}

@test "context: Fehlermeldung nennt die gueltigen Rollen" {
  run_ctx nonsense-role
  [ "$status" -ne 0 ]
  [[ "$output" == *"bachelorprojekt-db"* ]]
  [[ "$output" == *"orchestrator"* ]]
}

@test "context: gesetzte Felder werden gerendert, fehlende erzeugen keine Leerzeile" {
  run_ctx bachelorprojekt-db
  [ "$status" -eq 0 ]
  [[ "$output" == *"Nur fuer die DB-Rolle"* ]]
  [[ "$output" == *"Schreibende SQL"* ]]
  [[ "$output" == *"mcp-tool-guide.md#demo"* ]]

  # everywhere-server hat kein avoid_when und keinen fallback — es darf keine leere
  # Rubrik entstehen. Positiv-Anker: der Server ist ueberhaupt im Block.
  [[ "$output" == *"mcp:everywhere-server"* ]]
  run bash -c "env TOOLSET_REGISTRY='$FIXTURE' bash '$REPO_ROOT/scripts/toolset-context.sh' bachelorprojekt-db 2>/dev/null | grep -cE '\\*\\*(Nicht|Fallback|Tiefe):\\*\\*[[:space:]]*$' || true"
  [ "$output" -eq 0 ]
}

@test "context: leere Ergebnismenge ist kein Fehler" {
  local empty="${BATS_TEST_TMPDIR}/empty.yaml"
  cat > "$empty" <<'EOF'
capabilities:
  demo-db:
    mcp:db-only-server:
      state: canonical
      use_when: "Nur fuer die DB-Rolle"
      roles: [bachelorprojekt-db]
EOF
  run env TOOLSET_REGISTRY="$empty" bash "$REPO_ROOT/scripts/toolset-context.sh" bachelorprojekt-security
  [ "$status" -eq 0 ]
  run bash -c "env TOOLSET_REGISTRY='$empty' bash '$REPO_ROOT/scripts/toolset-context.sh' bachelorprojekt-security 2>/dev/null | grep -c '^### ' || true"
  [ "$output" -eq 0 ]
}

@test "context: --json liefert parsebares JSON" {
  run bash -c "env TOOLSET_REGISTRY='$FIXTURE' bash '$REPO_ROOT/scripts/toolset-context.sh' bachelorprojekt-db --json | node -e '
    const d = JSON.parse(require(\"fs\").readFileSync(0, \"utf8\"));
    console.log(\"n=\" + d.length + \" first=\" + d[0].instance);
  '"
  [ "$status" -eq 0 ]
  [[ "$output" == *"n=2"* ]]
}

@test "context: greift per Default auf die echte Registry zu" {
  # Ohne TOOLSET_REGISTRY muss das Skript die Repo-Registry lesen und durchlaufen.
  run bash -c "cd '$REPO_ROOT' && bash scripts/toolset-context.sh orchestrator"
  [ "$status" -eq 0 ]
  run bash -c "cd '$REPO_ROOT' && bash scripts/toolset-context.sh orchestrator | grep -c '^### '"
  [ "$output" -ge 1 ]
}
