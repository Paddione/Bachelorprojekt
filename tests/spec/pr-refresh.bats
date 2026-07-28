#!/usr/bin/env bats
# tests/spec/pr-refresh.bats — scripts/pr-refresh.sh [T002413]
#
# Gehoert fachlich zur SSOT-Spec ci-cd. Bewusst als eigene Datei auf oberster Ebene statt
# als Anhang an tests/spec/ci-cd.bats: jene Datei ist derzeit in drei offenen PRs (#3446,
# #3449, #3452) in Arbeit, und ein Append haette genau den Konflikt erzeugt, den dieses
# Ticket abstellt. Sobald die Verzeichniskonvention aus Teil 2 steht, wandert die Datei
# nach tests/spec/ci-cd/.
#
# ACHTUNG $0-Falle (CLAUDE.md): Der Worktree dieses Tickets heisst pr-refresh-T002413.
# Ein unqualifiziertes [[ "$output" == *"pr-refresh"* ]] waere deshalb IMMER wahr, sobald
# das Skript seinen eigenen Pfad in einer Usage-Zeile ausgibt — auch ohne jede Funktion.
# Alle Assertions unten sind auf konkrete Ausgabezeilen verengt.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/pr-refresh.sh"

  # Sandbox: ein echtes Mini-Repo, damit git-Operationen real laufen, aber nichts
  # ausserhalb beruehrt wird.
  SANDBOX="${BATS_TEST_TMPDIR}/sandbox"
  mkdir -p "$SANDBOX"

  # gh-Stub: das Skript darf im Test NIE echtes gh/gh-axi aufrufen. Die Fixture-Antwort
  # steht in $GH_FIXTURE, der Stub gibt sie unveraendert aus.
  STUB_DIR="${BATS_TEST_TMPDIR}/stub"
  mkdir -p "$STUB_DIR"
  cat > "${STUB_DIR}/gh-stub.sh" <<'STUB'
#!/usr/bin/env bash
cat "${GH_FIXTURE:?GH_FIXTURE not set}"
STUB
  chmod +x "${STUB_DIR}/gh-stub.sh"

  # Marker-Datei: jeder echte Push wuerde hier landen. Bleibt sie leer, hat kein
  # Push stattgefunden.
  PUSH_LOG="${BATS_TEST_TMPDIR}/push.log"
  : > "$PUSH_LOG"

  export PR_REFRESH_GH_CMD="${STUB_DIR}/gh-stub.sh"
  export PR_REFRESH_PUSH_LOG="$PUSH_LOG"
  export PR_REFRESH_DRY_PUSH=1
}

_fixture() {
  GH_FIXTURE="${BATS_TEST_TMPDIR}/gh.json"
  printf '%s' "$1" > "$GH_FIXTURE"
  export GH_FIXTURE
}

@test "pr-refresh: Skript existiert und ist ausfuehrbar" {
  [ -f "$SCRIPT" ]
  [ -x "$SCRIPT" ]
}

@test "pr-refresh: --help nennt die drei Guards namentlich" {
  # Positiv-Anker: --help muss ueberhaupt erfolgreich laufen ...
  run bash "$SCRIPT" --help
  [ "$status" -eq 0 ]
  # ... und die Guard-Begriffe muessen in der Guards-Sektion stehen, nicht irgendwo
  # im Pfad-Echo (siehe $0-Falle im Dateikopf).
  guards="$(printf '%s\n' "$output" | sed -n '/^Guards:/,/^$/p')"
  [ -n "$guards" ]
  printf '%s\n' "$guards" | grep -q 'force-with-lease'
  printf '%s\n' "$guards" | grep -q 'agent-lock'
  printf '%s\n' "$guards" | grep -q 'generiert'
}

@test "pr-refresh: MERGEABLE-PR wird uebersprungen, ohne zu pushen" {
  _fixture '{"number":1,"mergeable":"MERGEABLE","headRefName":"feature/x","author":{"login":"Paddione"}}'
  run bash "$SCRIPT" 1
  [ "$status" -eq 0 ]
  # Positiv-Anker: der Lauf hat den PR tatsaechlich bewertet ...
  printf '%s\n' "$output" | grep -qi 'MERGEABLE'
  # ... und trotzdem nicht gepusht.
  [ ! -s "$PUSH_LOG" ]
}

@test "pr-refresh: fremder Autor wird abgelehnt, ohne zu pushen" {
  _fixture '{"number":2,"mergeable":"CONFLICTING","headRefName":"feature/y","author":{"login":"SomeoneElse"}}'
  run bash "$SCRIPT" 2
  [ "$status" -ne 0 ]
  # Positiv-Anker gegen vakuoses Bestehen: die Ablehnung muss den fremden Login nennen.
  # Ohne implementierten Guard faellt das Skript anders (oder gar nicht) durch.
  printf '%s\n' "$output" | grep -q 'SomeoneElse'
  [ ! -s "$PUSH_LOG" ]
}

@test "pr-refresh: --dry-run mutiert nichts" {
  _fixture '{"number":3,"mergeable":"CONFLICTING","headRefName":"feature/z","author":{"login":"Paddione"}}'
  run bash "$SCRIPT" --dry-run 3
  [ "$status" -eq 0 ]
  # Positiv-Anker: der Dry-run hat den PR wirklich verarbeitet (nennt seine Nummer
  # in einer Aktionszeile) ...
  printf '%s\n' "$output" | grep -E '^(DRY|\[dry-run\])' | grep -q '3'
  # ... und nichts gepusht.
  [ ! -s "$PUSH_LOG" ]
}

@test "pr-refresh: kennt generierte Dateien aus .gitattributes statt eigener Liste" {
  # Das Skript darf KEINE zweite Pfadliste fuehren (siehe filter-generated.sh).
  # Positiv-Anker zuerst: .gitattributes fuehrt die Artefakte ueberhaupt ...
  run grep -c 'linguist-generated=true' "${REPO_ROOT}/.gitattributes"
  [ "$status" -eq 0 ]
  [ "$output" -ge 10 ]
  # ... und das Skript leitet daraus ab, statt Pfade zu wiederholen.
  grep -q 'gitattributes\|filter-generated' "$SCRIPT"
  run grep -c 'openspec-status.json' "$SCRIPT"
  [ "$output" -eq 0 ]
}

@test "pr-refresh: Taskfile-Einsprung pr:refresh existiert (S4 Orphan-Guard)" {
  # Positiv-Anker: das Taskfile ist lesbar und enthaelt ueberhaupt Tasks ...
  run grep -c '^  [a-z][a-z0-9:_-]*:$' "${REPO_ROOT}/Taskfile.yml"
  [ "$status" -eq 0 ]
  [ "$output" -gt 50 ]
  # ... und pr:refresh ist einer davon.
  grep -qE '^  pr:refresh:' "${REPO_ROOT}/Taskfile.yml"
}
