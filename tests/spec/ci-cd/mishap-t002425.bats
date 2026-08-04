#!/usr/bin/env bats
# tests/spec/ci-cd/mishap-t002425.bats — Mishap-Bundle T002425 [M3, M4, M5]
#
# M1 (veraltete agent-lock-claim-Syntax) war bei der Umsetzung bereits behoben; M2 ist eine
# reine Dokumentationsergaenzung im Skill-Referenztext. Getestet werden die drei Eintraege
# mit pruefbarem Verhalten.
#
# ACHTUNG $0-Falle (CLAUDE.md): der Worktree heisst mishap-T002425. Assertions auf blosse
# Begriffe waeren durch Pfad-Echos wahr; alles unten ist auf konkrete Zeilen verengt.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

# ── M3: preflight-pr-scope.sh ohne Argument ─────────────────────────────────────

@test "T002425-M3: preflight-pr-scope ohne Argument nennt den fehlenden PR-Titel" {
  run bash "${REPO_ROOT}/scripts/preflight-pr-scope.sh"

  # Positiv-Anker: das Skript laeuft ueberhaupt und lehnt ab.
  [ "$status" -ne 0 ]

  # Die erste Fehlerzeile muss die Ursache benennen — nicht die Bash-Parameter-Expansion
  # "line NN: 1: Usage: …", in der die Usage als Fehlertext des Parameters "1" erscheint.
  erste="$(printf '%s\n' "$output" | head -1)"
  printf '%s\n' "$erste" | grep -q 'PR-Titel fehlt'

  # Negativ-Aussage NACH dem Positiv-Anker: die Bash-Meldungsform darf nicht mehr auftreten.
  run bash "${REPO_ROOT}/scripts/preflight-pr-scope.sh"
  printf '%s\n' "$output" | grep -qE '^[^:]+\.sh: line [0-9]+: 1: ' && return 1
  return 0
}

@test "T002425-M3: preflight-pr-scope mit gueltigem Titel laeuft weiterhin durch" {
  # Gegenprobe zum Guard oben: der normale Aufruf darf nicht beschaedigt sein.
  #
  # Die Ticket-ID im Titel muss zum Branchnamen passen — der Branch-Guard (T001917) laeuft
  # VOR der Scope-Pruefung. Die ID wird deshalb aus dem aktuellen Branch abgeleitet statt
  # hart notiert; auf einem Branch ohne Ticket-ID ist die Vorbedingung nicht herstellbar.
  tid="$(git -C "$REPO_ROOT" symbolic-ref --short HEAD 2>/dev/null \
    | grep -oiE 'T[0-9]{6}' | head -1)"
  [ -n "$tid" ] || skip "aktueller Branch traegt keine Ticket-ID (z.B. detached HEAD in CI)"

  run bash "${REPO_ROOT}/scripts/preflight-pr-scope.sh" "fix(scripts): irgendwas [${tid}]"
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -q "scope 'scripts'"
}

# ── M4: irrefuehrende Handlungsempfehlung der Baseline-Assertion ────────────────

@test "T002425-M4: Baseline-Assertion nennt den veralteten Branch als haeufigere Ursache" {
  ASSERT="${REPO_ROOT}/scripts/code-quality/baseline-key-count-assertion.mjs"

  # Positiv-Anker: die Datei existiert und traegt den baseline-allow-Pfad ueberhaupt ...
  [ -f "$ASSERT" ]
  grep -q 'baseline-allow' "$ASSERT"

  # ... und weist zusaetzlich auf die andere Ursache samt konkreter Abhilfe hin.
  # Gemessener Vorgang: der Key S1:website/src/components/sdlc/FactoryFloor.svelte tauchte auf
  # fix/conflict-gate-T002418 auf, weil der Branch aelter war als #3461, das ihn entfernte.
  grep -q 'veralteter Branch' "$ASSERT"
  grep -q 'git checkout origin/main -- docs/code-quality/baseline.json' "$ASSERT"
}

# ── M5: ci.yml hat keinen Rettungsanker fuer nicht getriggerte SHAs ─────────────

@test "T002425-M5: ci.yml erlaubt workflow_dispatch als Rettungsanker" {
  CI="${REPO_ROOT}/.github/workflows/ci.yml"

  # Positiv-Anker: die Datei ist die richtige und traegt ihre bestehenden Trigger ...
  [ -f "$CI" ]
  grep -qE '^  pull_request:' "$CI"
  grep -qE '^  push:' "$CI"

  # ... und zusaetzlich workflow_dispatch auf derselben Ebene (2 Leerzeichen unter `on:`).
  # Ohne ihn antwortet `gh workflow run ci.yml` mit HTTP 422, und der einzige Ausweg aus
  # einem SHA ohne Check-Runs bleibt ein leerer Commit.
  grep -qE '^  workflow_dispatch:' "$CI"
}
