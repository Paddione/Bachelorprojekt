#!/usr/bin/env bats
# T012965 — Laufverhalten der dsh-Tasks, nicht ihre Struktur.
#
# Die Guards aus T012962 pruefen, DASS Taskfile.dsh.yml und web-up.sh existieren
# und die erwarteten Zeichenketten tragen. Genau deshalb ist ein Taskfile gemergt
# worden, das mit `{{.ROOT}}` eine nicht existierende go-task-Variable benutzt und
# den Klon unter `/deepseek-harness` sucht. Diese Datei prueft stattdessen, was
# beim Ausfuehren herauskommt.

bats_require_minimum_version 1.5.0

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

@test "dsh:doctor findet den Klon und endet mit Exit 0" {
  [ -d "$REPO/deepseek-harness/node_modules" ] || skip "deepseek-harness checkout not built"

  run --separate-stderr bash -c "cd '$REPO' && task dsh:dsh:doctor 2>&1"
  [ "$status" -eq 0 ]
  # Positiv-Anker: der Lauf muss den Abschluss melden, nicht nur nicht scheitern.
  [[ "$output" == *"All checks passed"* ]]
  # Der leere-Variable-Fehler darf nicht zurueckkommen.
  [[ "$output" != *"not found at /deepseek-harness"* ]]
}

# Die folgenden drei Faelle greppen den Quelltext — bewusst nur die CODE-Zeilen.
# Ein Kommentar, der die alte fehlerhafte Form erklaert ("frueher stand hier
# --bundle"), ist Dokumentation und darf den Guard nicht ausloesen; ein Guard, der
# das nicht trennt, erzwingt kommentarlosen Code.
code_lines() { grep -vE '^[[:space:]]*#' "$1"; }

@test "Taskfile.dsh.yml benutzt keine leere Task-Variable" {
  run bash -c "code_lines() { grep -vE '^[[:space:]]*#' \"\$1\"; }; code_lines '$REPO/taskfiles/Taskfile.dsh.yml' | grep -c '{{\.ROOT}}' || true"
  [ "$output" -eq 0 ]
  # Positiv-Anker: die korrekte Variable wird tatsaechlich benutzt.
  run bash -c "grep -c '{{\.ROOT_DIR}}' '$REPO/taskfiles/Taskfile.dsh.yml'"
  [ "$output" -ge 1 ]
}

@test "web-up.sh ruft dsh mit dem existierenden --patch-Overlay auf" {
  run bash -c "grep -vE '^[[:space:]]*#' '$REPO/scripts/dsh/web-up.sh' | grep -c -- '--bundle' || true"
  [ "$output" -eq 0 ]
  run bash -c "grep -vE '^[[:space:]]*#' '$REPO/scripts/dsh/web-up.sh' | grep -c -- '--patch' || true"
  [ "$output" -ge 1 ]
}

@test "web-up.sh registriert mit den Flags, die session-hub.sh kennt" {
  run bash -c "grep -vE '^[[:space:]]*#' '$REPO/scripts/dsh/web-up.sh' | grep -c -- '--slug' || true"
  [ "$output" -eq 0 ]
  run bash -c "grep -vE '^[[:space:]]*#' '$REPO/scripts/dsh/web-up.sh' | grep -c -- '--name' || true"
  [ "$output" -ge 1 ]
}

@test "web-up.sh bricht ohne gebauten Klon mit Exit 2 und genannter Ursache ab" {
  run env DSH_DIR=/nonexistent-dsh-checkout bash "$REPO/scripts/dsh/web-up.sh" 3099
  [ "$status" -eq 2 ]
  [[ "$output" == *"not built"* ]] || [[ "$output" == *"nicht gebaut"* ]]
}

@test "resolve-clone findet den Klon aus einem Worktree heraus" {
  [ -f "$REPO/../../deepseek-harness/package.json" ] || [ -f "$REPO/deepseek-harness/package.json" ] || skip "no deepseek-harness clone on this host"
  run bash "$REPO/scripts/dsh/resolve-clone.sh" "$REPO"
  [ "$status" -eq 0 ]
  [ -f "$output/package.json" ]
}

@test "ein ungueltiges DSH_DIR wird gemeldet statt still ersetzt" {
  run env DSH_DIR=/nonexistent-dsh bash "$REPO/scripts/dsh/resolve-clone.sh" "$REPO"
  [ "$status" -eq 2 ]
  [[ "$output" != *"/deepseek-harness"* ]] || [[ "$output" == *"no deepseek-harness checkout"* ]]
}

@test "Plugins exportieren apply, nicht setup — sonst lehnt Cordis sie ab" {
  # Beleg: Cordis meldet 'invalid plugin, expect function or object with an
  # "apply" method'. Mit `setup` wurde KEIN Plugin aus T012962 je geladen.
  for f in "$REPO"/tools/dsh/plugins/*.mjs "$REPO/tools/dsh/index.js"; do
    run bash -c "grep -cE '^export (async )?function apply\\(' '$f' || true"
    [ "$output" -ge 1 ]
    run bash -c "grep -cE '^export (async )?function setup\\(' '$f' || true"
    [ "$output" -eq 0 ]
  done
}

@test "die Patch-Vorlage traegt Platzhalter, keine unaufloesbaren Paketnamen" {
  run bash -c "grep -c '@@REPO@@\\|@@DSH_CLONE@@' '$REPO/tools/dsh/cordis.patch.yml'"
  [ "$output" -ge 1 ]
  # Der frueher eingecheckte, per Node nicht aufloesbare Kurzname darf weg sein.
  run bash -c "grep -vE '^[[:space:]]*#' '$REPO/tools/dsh/cordis.patch.yml' | grep -c \"name: dsh-hooks-claude-code\" || true"
  [ "$output" -eq 0 ]
}
