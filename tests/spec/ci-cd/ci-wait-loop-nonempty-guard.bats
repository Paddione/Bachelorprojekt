#!/usr/bin/env bats
# tests/spec/ci-cd/ci-wait-loop-nonempty-guard.bats
# SSOT: openspec/specs/ci-cd.md
#
# T003109 — Ein jq-Prädikat der Form `all(...)` ist über der LEEREN Liste per
# Definition `true`. Eine CI-Warteschleife, die daraus "keine Checks mehr
# pending" liest, hält einen nie geprüften Stand für verifiziert. Beobachtet
# 2026-08-09 an PR #4050 (mergeStateStatus=DIRTY — ein konfligierender PR
# startet die CI gar nicht erst, die Checkliste bleibt leer). Belastbar ist
# erst: NICHTLEERE Checkliste UND alle Einträge grün.
#
# Dieselbe Struktur wie die Positiv-Anker-Pflicht bei Negativtests
# (CLAUDE.md, T002356-M1): jedes Prädikat über einer womöglich leeren Menge
# braucht eine vorgeschaltete Nichtleere-Prüfung.
#
# MESSUNG (origin/main f6f7e7f1996ab6beb33501d78c0de48f417d6a9c) — drei
# jq-Prädikate über Check-Listen existieren im Repo, zwei davon tragen bereits
# einen Nichtleere-Guard (scripts/arbitration/detect.sh via `length == 0`,
# scripts/devflow-ci-watch.sh via `total_count`), eines nicht:
#   git grep -n -E '(all|any)\((\.\[\]; *)?\.(state|conclusion|bucket|status)' \
#     f6f7e7f1996ab6beb33501d78c0de48f417d6a9c -- '*.sh' '*.md' '*.mjs' \
#     ':!openspec/changes/archive' ':!openspec/specs/archive'
#
# Prüfmodus: command output verification (CLAUDE.md Test-Resultats-Konvention,
# T002448-M4). Die Helper-Tests speisen eine Fixture-JSON über stdin ein und
# messen Verdict + Exit-Code; der Schleifentest fährt
# scripts/factory/pr-babysit-ticket.sh gegen ein gh-Stub-Paar auf dem PATH und
# misst dessen Terminierung. Kein echter gh-Aufruf, kein Netz. Zugesichert wird
# die Semantik (Exit-Code, Verdict-Wort), nicht das Ausgabeformat (T002716).
#
# Die einzige Ausnahme ist der Doku-Guard am Ende: dessen Gegenstand
# manifestiert sich ausschließlich im Quelltext einer Referenzdatei.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LIB="$REPO/scripts/lib/ci-checks.sh"
  BABYSIT="$REPO/scripts/factory/pr-babysit-ticket.sh"
  WORK="$(mktemp -d)"
  mkdir -p "$WORK/bin"
}

teardown() {
  [ -n "${WORK:-}" ] && rm -rf "$WORK"
}

# Ruft die zu bauende Helper-Funktion auf: liest eine Check-Liste (JSON-Array,
# gh-Schema `[{name,state}]`) von stdin, gibt GENAU EIN Verdict-Wort aus
# (empty|red|pending|green) und terminiert nur bei `green` mit Exit 0.
_verdict() {
  printf '%s' "$1" | bash -c "source '$LIB'; ci_checks_verdict"
}

# Baut ein Stub-Verzeichnis, in dem gh/gh-axi eine feste Checkliste liefern.
# $1 = JSON-Array, das `gh pr checks` zurückgibt.
_stub_gh() {
  printf '%s' "$1" > "$WORK/checks.json"
  cat > "$WORK/bin/gh" <<'GH_EOF'
#!/usr/bin/env bash
args="$*"
case "$args" in
  *"pr checks"*)   cat "$STUB_CHECKS" ;;
  *"pr view"*"state"*) echo "OPEN" ;;
  *"pr merge"*)    exit 0 ;;
  *"run view"*)    echo "stubbed ci log: some test failed" ;;
  *)               exit 0 ;;
esac
GH_EOF
  chmod +x "$WORK/bin/gh"
  cp "$WORK/bin/gh" "$WORK/bin/gh-axi"
  # opencode abschirmen: der Rot-Pfad würde sonst einen echten Subagenten starten.
  printf '#!/usr/bin/env bash\nexit 0\n' > "$WORK/bin/opencode"
  chmod +x "$WORK/bin/opencode"
  export STUB_CHECKS="$WORK/checks.json"
}

# ── Helper: die leere Liste darf NICHT als Erfolg gelten ────────────────────

@test "T003109: ci_checks_verdict wertet die LEERE Checkliste nicht als grün" {
  run _verdict '[]'
  [ "$status" -ne 0 ]
  [[ "$output" != *"green"* ]]
  echo "$output" | grep -qiE 'empty|leer'
}

# ── Helper: Positiv-Anker — ohne ihn wäre der Test oben selbst vakuos ───────

@test "T003109: ci_checks_verdict wertet eine NICHTLEERE grüne Liste als grün (Positiv-Anker)" {
  run _verdict '[{"name":"CI","state":"SUCCESS"},{"name":"Vitest","state":"SUCCESS"}]'
  [ "$status" -eq 0 ]
  [[ "$output" == *"green"* ]]
}

@test "T003109: ci_checks_verdict trennt pending und red von grün" {
  run _verdict '[{"name":"CI","state":"SUCCESS"},{"name":"Vitest","state":"PENDING"}]'
  [ "$status" -ne 0 ]
  [[ "$output" != *"green"* ]]

  run _verdict '[{"name":"CI","state":"FAILURE"}]'
  [ "$status" -ne 0 ]
  [[ "$output" != *"green"* ]]
  [[ "$output" == *"red"* ]]
}

# ── Schleife: leere Liste terminiert mit Diagnose statt endlos zu drehen ────

@test "T003109: pr-babysit-ticket.sh terminiert bei leerer Checkliste mit Diagnose" {
  _stub_gh '[]'
  run env PATH="$WORK/bin:$PATH" REPO="$REPO" MAX_CI_ATTEMPTS=1 POLL_INTERVAL=1 \
    timeout 20 bash "$BABYSIT" T003109 999
  # 124 = timeout hat zugeschlagen: die Schleife dreht ohne Fortschritt.
  [ "$status" -ne 124 ]
  # 0 wäre die vakuose Lesart "keine Checks pending, also fertig".
  [ "$status" -ne 0 ]
  echo "$output" | grep -qiE 'leer|empty|keine checks|no checks'
}

# ── Positiv-Anker für den Schleifentest: das Stub-Gerüst treibt das Skript ──
# Ohne diesen Fall bewiese ein `status -ne 124` oben nichts — es könnte auch
# heißen, dass das Skript am Stub gescheitert ist, statt echt zu terminieren.

@test "T003109: pr-babysit-ticket.sh terminiert bei NICHTLEERER roter Liste (Positiv-Anker)" {
  _stub_gh '[{"name":"CI","state":"FAILURE"}]'
  run env PATH="$WORK/bin:$PATH" REPO="$REPO" MAX_CI_ATTEMPTS=1 POLL_INTERVAL=1 \
    timeout 20 bash "$BABYSIT" T003109 999
  [ "$status" -ne 124 ]
  [ "$status" -eq 1 ]
}

# ── Doku: die Regel steht in der Referenz, die die Warteschleifen beschreibt ─

@test "T003109: repo-hygiene-ops.md benennt das vakuose all() über der leeren Menge" {
  doc="$REPO/.claude/skills/references/repo-hygiene-ops.md"
  [ -f "$doc" ]                                  # Positiv-Anker: Datei existiert
  grep -qF 'T002822' "$doc"                      # Positiv-Anker: §3 ist vorhanden
  grep -qF 'all(' "$doc"
  grep -qiE 'nichtleer|nicht leer|vakuos' "$doc"
}
