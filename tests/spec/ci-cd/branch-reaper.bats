#!/usr/bin/env bats
# tests/spec/ci-cd/branch-reaper.bats — Guards für scripts/branch-reaper.sh [T002520]
#
# Prüfmodus: COMMAND OUTPUT VERIFICATION.
# Jeder Test führt scripts/branch-reaper.sh gegen ein echtes Fixture-Git-Repo aus und prüft
# die Ergebniszeilen (REAP/KEEP) seiner Ausgabe. Es wird NICHT der Quelltext des Skripts
# gegreppt — ein Muster im Source belegt nur, dass Text existiert, nicht dass das Verhalten
# stimmt.
#
# Reihenfolge ist bedeutungstragend: Der Positiv-Anker (Test 1) steht vorn. Fällt er, sind die
# drei Negativ-Aussagen bedeutungslos, weil eine leere Kandidatenliste sie trivial erfüllt.

setup() {
  PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  REAPER="$PROJECT_DIR/scripts/branch-reaper.sh"

  FIXTURE="$BATS_TEST_TMPDIR/fixture"
  REMOTE="$BATS_TEST_TMPDIR/remote.git"
  STUBS="$BATS_TEST_TMPDIR/stubs"
  mkdir -p "$STUBS"

  git init --bare --quiet "$REMOTE"
  git init --quiet "$FIXTURE"
  cd "$FIXTURE" || return 1
  git config user.email t@example.com
  git config user.name Test
  git remote add origin "$REMOTE"

  # main: Basisstand, den alle Branches teilen
  mkdir -p openspec/changes/x scripts
  echo "base" > openspec/changes/x/tasks.md
  echo "base" > scripts/echt.sh
  git add -A && git commit --quiet -m "base"
  git push --quiet origin HEAD:main
  git fetch --quiet origin

  # Branch 1: weicht NUR in einem Plan-Artefakt ab -> Allowlist trifft
  git checkout --quiet -b chore/plan-T009001
  echo "abweichend" > openspec/changes/x/tasks.md
  git commit --quiet -am "plan only"
  git push --quiet origin chore/plan-T009001

  # Branch 2: weicht in einer echten Quelldatei ab -> Allowlist trifft NICHT
  git checkout --quiet main && git checkout --quiet -b chore/src-T009002
  echo "abweichend" > scripts/echt.sh
  git commit --quiet -am "source change"
  git push --quiet origin chore/src-T009002

  # Branch 3 und 4: nur Allowlist-Abweichung; ausgeschlossen werden sie über PR bzw. Ticket
  git checkout --quiet main && git checkout --quiet -b chore/openpr-T009003
  echo "abweichend3" > openspec/changes/x/tasks.md
  git commit --quiet -am "plan only"
  git push --quiet origin chore/openpr-T009003

  git checkout --quiet main && git checkout --quiet -b chore/openticket-T009004
  echo "abweichend4" > openspec/changes/x/tasks.md
  git commit --quiet -am "plan only"
  git push --quiet origin chore/openticket-T009004

  git checkout --quiet main
  git fetch --quiet origin

  # gh-Stub: offener PR existiert ausschliesslich fuer chore/openpr-T009003
  cat > "$STUBS/gh" <<'STUB'
#!/usr/bin/env bash
for a in "$@"; do
  if [ "$a" = "chore/openpr-T009003" ]; then echo '[{"number":42}]'; exit 0; fi
done
echo '[]'
STUB
  chmod +x "$STUBS/gh"

  # ticket.sh-Stub: T009004 ist offen, alle anderen sind done
  cat > "$STUBS/ticket-stub.sh" <<'STUB'
#!/usr/bin/env bash
for a in "$@"; do
  if [ "$a" = "T009004" ]; then echo '{"external_id":"T009004","status":"in_progress"}'; exit 0; fi
done
echo '{"external_id":"T009001","status":"done"}'
STUB
  chmod +x "$STUBS/ticket-stub.sh"

  export PATH="$STUBS:$PATH"
  export TICKET_SH="$STUBS/ticket-stub.sh"
}

@test "T002520: Branch mit reinen Plan-Artefakten wird zum Loeschen vorgeschlagen" {
  run bash "$REAPER" --dry-run --ticket T009001 --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  # Auf die REAP-Zeilen einschraenken: ein ungefiltertes Substring-Match auf $output
  # wuerde bereits vom Worktree-Pfad in der Usage-Ausgabe erfuellt.
  reaped="$(printf '%s\n' "$output" | grep '^REAP ' || true)"
  [ "$(printf '%s\n' "$reaped" | grep -c 'chore/plan-T009001')" -eq 1 ]
}

@test "T002520: Branch mit abweichender Quelldatei wird verschont und begruendet" {
  run bash "$REAPER" --dry-run --ticket T009002 --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  reaped="$(printf '%s\n' "$output" | grep '^REAP ' || true)"
  [ "$(printf '%s\n' "$reaped" | grep -c 'chore/src-T009002')" -eq 0 ]
  kept="$(printf '%s\n' "$output" | grep '^KEEP ' | grep 'chore/src-T009002' || true)"
  [ -n "$kept" ]
  [ "$(printf '%s\n' "$kept" | grep -c 'scripts/echt.sh')" -eq 1 ]
}

@test "T002520: Branch mit offenem PR wird verschont und begruendet" {
  run bash "$REAPER" --dry-run --ticket T009003 --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  reaped="$(printf '%s\n' "$output" | grep '^REAP ' || true)"
  [ "$(printf '%s\n' "$reaped" | grep -c 'chore/openpr-T009003')" -eq 0 ]
  kept="$(printf '%s\n' "$output" | grep '^KEEP ' | grep 'chore/openpr-T009003' || true)"
  [ -n "$kept" ]
  [ "$(printf '%s\n' "$kept" | grep -ci 'pull request\|offener PR\|open PR')" -eq 1 ]
}

@test "T002520: Branch mit offenem Ticket wird verschont und begruendet" {
  run bash "$REAPER" --dry-run --ticket T009004 --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  reaped="$(printf '%s\n' "$output" | grep '^REAP ' || true)"
  [ "$(printf '%s\n' "$reaped" | grep -c 'chore/openticket-T009004')" -eq 0 ]
  kept="$(printf '%s\n' "$output" | grep '^KEEP ' | grep 'chore/openticket-T009004' || true)"
  [ -n "$kept" ]
  [ "$(printf '%s\n' "$kept" | grep -c 'in_progress')" -eq 1 ]
}

@test "T002520: ungueltiges Ticket-ID-Format wird abgelehnt" {
  # Positiv-Anker: eine gueltige ID laeuft durch. Ohne ihn wuerde die Negativ-Aussage
  # unten auch dann bestehen, wenn das Skript gar nicht existiert (Exit 127 ist ebenfalls
  # ungleich 0) — der Test waere vakuos.
  run bash "$REAPER" --dry-run --ticket T009001 --repo "$FIXTURE"
  [ "$status" -eq 0 ]

  run bash "$REAPER" --dry-run --ticket "T00.*" --repo "$FIXTURE"
  [ "$status" -ne 0 ]
  # Die Ablehnung muss begruendet sein, nicht bloss ein Nicht-Null-Exit.
  [ "$(printf '%s\n' "$output" | grep -ci 'ticket')" -ge 1 ]
}
