#!/usr/bin/env bats
# tests/spec/openspec-workflow/propose-tasks-testpath-guard.bats
# T003812 (aus T003281) — das tasks.md-Skelett von `openspec.sh propose` darf
# den Testpfad nicht mehr in der Sammeldatei-Form vorschlagen.
#
# Hintergrund: das Skelett seedete `tests/spec/<slug>.bats` — die
# Sammeldatei-Form auf oberster Ebene, die der Konvention T002416 widerspricht
# ("eigene Datei unter tests/spec/<spec-slug>/<kurz-slug>.bats"), und benannt
# nach dem Change-Slug statt nach dem Parent-SSOT-Slug. Wer dem Seed folgte,
# legte die Testdatei am falschen Ort an.
#
# Pruefmodus (T002448-M4): command output verification. Jeder Test FUEHRT
# openspec.sh propose aus und prueft das geseedete tasks.md-Artefakt; keiner
# greppt Quelltext. Eigenbezug: nur gegen ein temporaeres OPENSPEC_ROOT mit
# TICKET_OFFLINE=1 — es entsteht nie ein Change unter openspec/changes/ des
# Repos.
#
# Positiv-Anker-Pflicht (T002356-M1): jeder Test prueft zuerst die
# Verzeichnis-Form (rot, solange die Implementierung fehlt), dann die
# Negativ-Aussage gegen die Sammeldatei-Form.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  ROOT="$BATS_TEST_TMPDIR/openspec"
  mkdir -p "$ROOT/specs" "$ROOT/changes"
}

_propose() {
  run env OPENSPEC_ROOT="$ROOT" TICKET_OFFLINE=1 \
    bash "$REPO_ROOT/scripts/openspec.sh" propose "$@"
}

@test "T003812: tasks.md-Skelett schlaegt den Testpfad in Verzeichnis-Form vor (T002416)" {
  _propose my-fix --ticket T999999
  [ "$status" -eq 0 ]
  local tasks="$ROOT/changes/my-fix/tasks.md"
  [ -f "$tasks" ]

  # Positiv-Anker: die Verzeichnis-Form (Parent-SSOT-Slug ohne --target-spec =
  # Change-Slug) MUSS im Seed stehen — ohne Implementierung rot.
  grep -qF -- "bats tests/spec/my-fix/" "$tasks" || {
    echo "tasks.md enthaelt die Verzeichnis-Form nicht:"; grep -n "tests/spec" "$tasks" || true; return 1
  }
  # Negativ-Aussage: die Sammeldatei-Form (Punkt statt Slash) darf NICHT
  # vorgeschlagen werden.
  ! grep -qF -- "tests/spec/my-fix.bats" "$tasks" || {
    echo "tasks.md schlaegt weiterhin die Sammeldatei-Form vor:"; grep -n "tests/spec" "$tasks"; return 1
  }
}

@test "T003812: mit --target-spec traegt der Testpfad den Parent-SSOT-Slug" {
  _propose my-fix --ticket T999999 --target-spec openspec-workflow
  [ "$status" -eq 0 ]
  local tasks="$ROOT/changes/my-fix/tasks.md"
  [ -f "$tasks" ]

  # Positiv-Anker: der Seed benennt das Verzeichnis nach dem Parent-SSOT-Slug,
  # nicht nach dem Change-Slug.
  grep -qF -- "bats tests/spec/openspec-workflow/" "$tasks" || {
    echo "tasks.md benennt den Testpfad nicht nach dem Parent-Slug:"; grep -n "tests/spec" "$tasks" || true; return 1
  }
  ! grep -qF -- "bats tests/spec/my-fix/" "$tasks" || {
    echo "tasks.md benennt den Testpfad nach dem Change-Slug statt dem Parent:"; grep -n "tests/spec" "$tasks"; return 1
  }
}
