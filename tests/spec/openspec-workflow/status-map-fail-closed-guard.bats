#!/usr/bin/env bats
# tests/spec/openspec-workflow/status-map-fail-closed-guard.bats
# SSOT: openspec/specs/scripts.md (Status-Map-Verhalten) / T008015-Mishap-Rollup
#
# Pruefmodus (T002448-M4): Output-Verifikation in hermetischer Git-Sandbox.
# Die Status-Map verdrahtet REPO auf `git rev-parse --show-toplevel` vom
# cwd (T001997) — die Sandbox MUSS daher ihr eigenes git-Repo sein, sonst
# wuerde das echte Worktree-Repo als REPO aufgeloest und das Skript schriebe
# ins echte components/website/src/data/.
#
# Hintergrund (T008015-6): Beobachtet wurde, dass openspec-status.json
# waehrend eines Laufs extern als '{}' gestaged wurde (3952 -> 1 Zeilen) —
# die Regeneration lief mit falschem cwd bzw. vergiftetem OPENSPEC_ROOT und
# ueberschrieb die kommittierte 3952-Zeilen-Datei still mit leerem Objekt.
# Fix: Liefert der Scan 0 Eintraege, waehrend das Repo-default
# openspec/changes .ticket-Dateien traegt, bricht das Skript fail-closed ab
# (exit 1) und fasst die bestehende Datei NICHT an. Legitim ist '{}' nur,
# wenn das Repo wirklich keine Changes hat.

setup() {
  SANDBOX="$BATS_TEST_TMPDIR/sandbox"
  git init -q "$SANDBOX"
  git -C "$SANDBOX" config user.email "bats@test.local"
  git -C "$SANDBOX" config user.name "Bats Tester"

  mkdir -p "$SANDBOX/scripts" "$SANDBOX/components/website/src/data"

  # ECHTES Skript kopieren (kein Symlink — Test soll das reale Verhalten pruefen)
  cp "${BATS_TEST_DIRNAME}/../../../scripts/openspec-status-map.sh" "$SANDBOX/scripts/"
}

@test "T008015-6: 0 Eintraege bei .ticket-Dateien im Repo-Default -> fail-closed (kein {} -Clobber)" {
  # Mishap-Szenario: OPENSPEC_ROOT zeigt ins Leere (existiert nicht), das
  # Repo-Default openspec/changes traegt aber .ticket-Dateien. Die
  # bestehende openspec-status.json muss unangetastet bleiben.
  mkdir -p "$SANDBOX/openspec/changes/demo"
  echo "T990001" > "$SANDBOX/openspec/changes/demo/.ticket"
  git -C "$SANDBOX" add -A
  git -C "$SANDBOX" commit -q -m "seed"

  echo '{"sentinel": true}' > "$SANDBOX/components/website/src/data/openspec-status.json"

  run bash -c "cd '$SANDBOX' && OPENSPEC_ROOT='$BATS_TEST_TMPDIR/wrong-root' bash scripts/openspec-status-map.sh"
  [ "$status" -ne 0 ] || { echo "erwartet: exit != 0, war: 0 (Datei wuerde geclobbert)" >&2; return 1; }
  grep -q sentinel "$SANDBOX/components/website/src/data/openspec-status.json" \
    || { echo "openspec-status.json wurde ueberschrieben (sentinel fehlt)" >&2; return 1; }
}

@test "T008015-6: 0 Eintraege OHNE .ticket-Dateien im Repo-Default -> legitimes {} (Verhalten erhalten)" {
  # Positiv-Anker: ein Repo ohne jegliche Changes liefert weiterhin '{}' mit
  # exit 0 — der Guard darf den Regelfall nicht brechen.
  SANDBOX2="$BATS_TEST_TMPDIR/sandbox2"
  git init -q "$SANDBOX2"
  git -C "$SANDBOX2" config user.email "bats@test.local"
  git -C "$SANDBOX2" config user.name "Bats Tester"
  mkdir -p "$SANDBOX2/scripts" "$SANDBOX2/components/website/src/data"
  cp "${BATS_TEST_DIRNAME}/../../../scripts/openspec-status-map.sh" "$SANDBOX2/scripts/"

  run bash -c "cd '$SANDBOX2' && bash scripts/openspec-status-map.sh"
  [ "$status" -eq 0 ] || { echo "erwartet: exit 0 fuer leeres Repo, war: $status" >&2; return 1; }
  [ "$(cat "$SANDBOX2/components/website/src/data/openspec-status.json")" = '{}' ] \
    || { echo "erwartet: '{}', war: '$(cat "$SANDBOX2/components/website/src/data/openspec-status.json")'" >&2; return 1; }
}
