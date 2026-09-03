#!/usr/bin/env bats
# tests/spec/repo-hygiene/windows-guards.bats
# SSOT: .claude/skills/references/repo-hygiene-ops.md (§0/§1 Vorcheck)
#
# Pruefmodus: command output verification [T002448-M4]. Beide Skripte werden
# AUSGEFUEHRT und an Exit-Code und Ausgabe gemessen, nicht an ihrer Quelle.
#
# Hintergrund T900061: Beide Guards des Runbooks lieferten unter Git Bash auf
# Windows kein Messergebnis, sondern ein Artefakt.
#
#   1. repo-hygiene-precheck.sh testete den Factory-Tick mit
#      `(flock -n 9 ...) 9>lock`. Unter Git Bash bricht flock mit
#      "Bad file descriptor" ab — derselbe Zweig wie "Lock gehalten". Der
#      Vorcheck meldete darum auf jedem Windows-Host dauerhaft einen laufenden
#      Tick und blockierte die Worktree-Sektion grundlos.
#   2. git-worktree-health.sh orphans verglich `git worktree list`-Pfade
#      (C:/Users/... bzw. /mnt/c/Users/...) per `grep -qFx` gegen `pwd`
#      (/c/Users/...). Der Exact-Match scheiterte an der Formatdifferenz und
#      meldete JEDEN registrierten Worktree als Orphan (beobachtet: 6 von 6).
#
# Die Tests halten die Eigenschaft fest, nicht die Plattform: sie laufen unter
# Linux (flock funktioniert) wie unter Git Bash (flock funktioniert nicht) und
# messen in beiden Faellen dasselbe Versprechen.

PROBE_DIR="zz-t900061-orphan-probe"

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  PRECHECK="$REPO/scripts/repo-hygiene-precheck.sh"
  HEALTH="$REPO/scripts/git-worktree-health.sh"
  [ -f "$PRECHECK" ] || skip "repo-hygiene-precheck.sh fehlt"
  [ -f "$HEALTH" ] || skip "git-worktree-health.sh fehlt"
}

teardown() {
  # Die Orphan-Sonde legt ein Verzeichnis unter .worktrees/ an. Auch bei rotem
  # Test wieder abraeumen — sonst hinterlaesst der Guard genau die Unordnung,
  # die er messen soll.
  rmdir "$REPO/.worktrees/$PROBE_DIR" >/dev/null 2>&1 || true
}

# ── Vorcheck ──────────────────────────────────────────────────────────────

@test "T900061: ohne Lock-Datei meldet der Vorcheck keinen laufenden Tick" {
  run env FACTORY_TICK_LOCK="$BATS_TEST_TMPDIR/gibt-es-nicht.lock" bash "$PRECHECK"
  echo "output: $output"
  [[ "$output" == *"ok: kein laufender Factory-Tick"* ]]
  # Positiv-Anker: der Vorcheck ist wirklich durchgelaufen und nicht vorher
  # abgebrochen — der Fingerabdruck steht am Ende jedes vollstaendigen Laufs.
  [[ "$output" == *"Stabilitaets-Fingerabdruck:"* ]]
}

@test "T900061: eine freie Lock-Datei wird nie als laufender Tick gemeldet" {
  lock="$BATS_TEST_TMPDIR/frei.lock"
  : > "$lock"

  run env FACTORY_TICK_LOCK="$lock" bash "$PRECHECK"
  echo "output: $output"

  # Der Kern der Regression: die Datei existiert, wird aber von niemandem
  # gehalten. Ein laufender Tick darf hier unter KEINER Plattform behauptet
  # werden.
  [[ "$output" != *"BEFUND: Factory-Tick laeuft"* ]]

  # Positiv-Anker: es muss eine der beiden ehrlichen Aussagen fallen —
  # gemessen (flock nutzbar) oder als nicht messbar ausgewiesen (Git Bash).
  # Ein stiller Durchlauf ohne Aussage waere genauso wertlos wie die
  # Falschmeldung.
  [[ "$output" == *"ok: kein laufender Factory-Tick"* \
     || "$output" == *"NICHT PRUEFBAR"* ]]
}

@test "T900061: der Vorcheck schreibt nicht am Lock-Zustand herum" {
  lock="$BATS_TEST_TMPDIR/fremd.lock"
  printf 'gehalten-von-4711\n' > "$lock"
  before="$(cat "$lock")"

  run env FACTORY_TICK_LOCK="$lock" bash "$PRECHECK"
  echo "output: $output"

  # Der alte Redirect `9>` legte die Datei an bzw. kuerzte sie auf 0 Byte: der
  # blosse Vorcheck veraenderte damit fremden Lock-Zustand. `9<>` oeffnet
  # lesend-schreibend ohne zu kuerzen.
  [ "$(cat "$lock")" = "$before" ]
}

# ── Orphan-Check ──────────────────────────────────────────────────────────

@test "T900061: registrierte Worktrees werden nicht als Orphan gemeldet" {
  registered=0
  while IFS= read -r line; do
    case "$line" in
      worktree\ *"/.worktrees/"*) registered=$((registered + 1)) ;;
    esac
  done < <(git -C "$REPO" worktree list --porcelain)

  [ "$registered" -gt 0 ] || skip "keine registrierten Worktrees unter .worktrees/"

  run bash "$HEALTH" orphans
  echo "output: $output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"keine Orphan-Worktrees gefunden"* ]]
}

@test "T900061: ein nicht registriertes Verzeichnis wird als Orphan gemeldet" {
  mkdir -p "$REPO/.worktrees/$PROBE_DIR"

  run bash "$HEALTH" orphans
  echo "output: $output"

  # Gegenprobe zum Test darueber: die Normalisierung darf den Check nicht
  # blind machen. Ohne diesen Anker wuerde ein `exit 0`-Stub beide Tests
  # bestehen.
  [ "$status" -eq 1 ]
  [[ "$output" == *"ORPHAN-WORKTREE"* ]]
  [[ "$output" == *"$PROBE_DIR"* ]]
}
