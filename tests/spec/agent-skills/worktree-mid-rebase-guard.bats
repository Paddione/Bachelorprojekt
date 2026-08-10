#!/usr/bin/env bats
# tests/spec/agent-skills/worktree-mid-rebase-guard.bats [T002766]
#
# PRUEFMODUS: Output-Verifikation. Die ersten drei Tests fuehren
# scripts/worktree-git-op-guard.sh gegen ein echtes Fixture-Repo aus und pruefen
# Exit-Code und Ausgabe-Semantik — kein Source-Grep auf das Skript.
# Der vierte Test ist die Reproduktion des Befunds selbst (die Allowlist-Blindheit)
# und misst ebenfalls Kommando-Ausgabe. Der fuenfte prueft die Runbook-Reihenfolge;
# dort ist Source-Grep das angemessene Mittel (Prosa hat kein Laufzeitverhalten,
# Ausnahme nach CLAUDE.md T002448-M4).
#
# HINTERGRUND (T002766): Ein Worktree blieb mitten in einem Rebase stehen — alle
# Konflikte geloest und gestaged, `git rebase --continue` nie ausgefuehrt. Der PR
# stand daraufhin auf CONFLICTING. Der allowlist-gefilterte Sauberkeits-Vorcheck aus
# repo-hygiene-ops.md kann diesen Zustand prinzipiell nicht sehen: die aufgeloesten
# Dateien sind Freshness-Generate und werden von der Allowlist weggefiltert.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  GUARD="$REPO_ROOT/scripts/worktree-git-op-guard.sh"
  FIXTURE="$BATS_TEST_TMPDIR/fixture"
}

# Legt ein Repo mit einem linked worktree an. Ohne Argument bleibt der Worktree sauber;
# mit `--mid-rebase` steht er mitten in einem Rebase mit bereits aufgeloesten Konflikten.
_make_fixture() {
  local mode="${1:-clean}"
  rm -rf "$FIXTURE"
  mkdir -p "$FIXTURE"
  git -C "$FIXTURE" init -q -b main .
  git -C "$FIXTURE" config user.email t@example.invalid
  git -C "$FIXTURE" config user.name "T"
  mkdir -p "$FIXTURE/website/src/data"
  echo base > "$FIXTURE/website/src/data/openspec-status.json"
  git -C "$FIXTURE" add -A
  git -C "$FIXTURE" commit -qm base
  git -C "$FIXTURE" branch feat
  echo mainside > "$FIXTURE/website/src/data/openspec-status.json"
  git -C "$FIXTURE" commit -qam mainside

  WT="$BATS_TEST_TMPDIR/wt"
  rm -rf "$WT"
  git -C "$FIXTURE" worktree add -q "$WT" feat

  [ "$mode" = "--mid-rebase" ] || return 0

  echo feat > "$WT/website/src/data/openspec-status.json"
  git -C "$WT" commit -qam feat
  # Plain, NICHT-interaktiver Rebase. Git meldet den Zustand dennoch als
  # "interactive rebase in progress" — das Merge-Backend ist der Standard.
  git -C "$WT" rebase main >/dev/null 2>&1 || true
  # Konflikt aufloesen und stagen, dann NICHT --continue: die Unterbrechung.
  echo resolved > "$WT/website/src/data/openspec-status.json"
  git -C "$WT" add website/src/data/openspec-status.json
}

@test "Positiv-Anker: der Guard laeuft und meldet ein Fixture ohne unterbrochene Operation mit Exit 0" {
  _make_fixture
  run bash "$GUARD" "$FIXTURE"
  [ "$status" -eq 0 ]
}

@test "Befund: ein Worktree mitten im Rebase fuehrt zu Exit ungleich 0 und wird im Output benannt" {
  _make_fixture --mid-rebase
  run bash "$GUARD" "$FIXTURE"
  [ "$status" -ne 0 ]
  # Semantik statt Darstellung (T002716): kein Zeilenanker, kein Wortlaut —
  # geprueft wird nur, dass der betroffene Worktree ueberhaupt genannt wird.
  echo "$output" | grep -qF "$WT"
}

@test "Der Guard repariert nicht: das Rebase-Zustandsverzeichnis besteht nach dem Lauf fort" {
  _make_fixture --mid-rebase
  state="$(git -C "$WT" rev-parse --git-path rebase-merge)"
  [ -d "$state" ]
  run bash "$GUARD" "$FIXTURE"
  # Positiv-Anker (T002356-M1): ohne ihn bestuende dieser Test vakuos, solange der
  # Guard gar nicht existiert — ein nicht ausgefuehrtes Skript repariert trivial nichts.
  [ "$status" -ne 127 ]
  [ -d "$state" ]
}

@test "Reproduktion des Befunds: der allowlist-gefilterte --porcelain-Vorcheck haelt den kaputten Worktree fuer sauber" {
  _make_fixture --mid-rebase
  # Genau der Ausdruck aus repo-hygiene-ops.md Abschnitt 1.
  filtered="$(git -C "$WT" status --porcelain | cut -c4- \
    | grep -Ev '^(openspec/changes/|docs/code-quality/|website/src/data/)' \
    | grep -Ev '^(\.release-please-manifest\.json|website/CHANGELOG\.md|website/package\.json)$' || true)"
  # Leer heisst nach dem Runbook "sauber" — obwohl der Worktree mitten im Rebase steht.
  # Das ist der Grund, warum der Guard dem Vorcheck vorgelagert sein muss.
  [ -z "$filtered" ]
  # Positiv-Anker: der Zustand, den der Vorcheck uebersieht, ist real vorhanden.
  [ -d "$(git -C "$WT" rev-parse --git-path rebase-merge)" ]
}

@test "repo-hygiene-ops.md ruft den Guard vor dem allowlist-gefilterten Vorcheck auf" {
  ops="$REPO_ROOT/.claude/skills/references/repo-hygiene-ops.md"
  [ -f "$ops" ]
  section="$(awk '/^## 1\. Stale Git Worktrees/,/^## 2\./' "$ops")"
  # Positiv-Anker: der Abschnitt und sein Vorcheck existieren weiterhin.
  echo "$section" | grep -qF 'git worktree remove'
  echo "$section" | grep -qF 'worktree-git-op-guard.sh'
  guard_line="$(echo "$section" | grep -nF 'worktree-git-op-guard.sh' | head -1 | cut -d: -f1)"
  porcelain_line="$(echo "$section" | grep -nF 'status --porcelain | cut -c4-' | head -1 | cut -d: -f1)"
  [ -n "$guard_line" ]
  [ -n "$porcelain_line" ]
  [ "$guard_line" -lt "$porcelain_line" ]
}
