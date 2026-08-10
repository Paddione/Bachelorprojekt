#!/usr/bin/env bats
# tests/spec/ci-cd/branch-reaper-local-ref.bats — Guard: ein gereapter Branch verschwindet
# auch lokal, nicht nur auf dem Remote. [T003182]
#
# Prüfmodus: COMMAND OUTPUT VERIFICATION (Ergebnis-Zustand).
# Die Tests führen scripts/branch-reaper.sh ECHT (ohne --dry-run) gegen ein Fixture-Repo mit
# eigenem bare-Remote aus und messen danach den Ref-Zustand per `git rev-parse --verify`.
# Es wird weder der Quelltext gegreppt noch der Wortlaut der Meldung festgeschrieben:
# geprüft ist die Semantik "Branch ist weg", nicht die Darstellung "DELETED …" (T002716).
# Ein Fix, der die Meldung nur umformuliert, besteht diesen Guard NICHT.
#
# Reihenfolge innerhalb jedes Tests ist bedeutungstragend: erst der Positiv-Anker (der Reap
# hat überhaupt stattgefunden — Remote-Ref weg, Archiv-Tag da), dann die eigentliche Aussage.
# Ohne den Anker bestünde "der lokale Ref existiert nicht mehr" auch dann, wenn das Skript
# gar nicht erst angelaufen wäre (T002356-M1).

setup() {
  PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  REAPER="$PROJECT_DIR/scripts/branch-reaper.sh"

  FIXTURE="$BATS_TEST_TMPDIR/fixture"
  REMOTE="$BATS_TEST_TMPDIR/remote.git"
  STUBS="$BATS_TEST_TMPDIR/stubs"
  mkdir -p "$STUBS"

  # Alle Fixture-Pfade absolut, alle git-Aufrufe mit -C: ein relativ angelegtes
  # openspec/changes/<slug> wäre unter `bats -j 6` für den validateTree('openspec')-Test
  # sichtbar und färbte ihn sporadisch rot (gleiche Begründung wie in branch-reaper.bats).
  PLANDIR="$FIXTURE/openspec/changes/x"

  git init --bare --quiet "$REMOTE"
  git init --quiet "$FIXTURE"
  git -C "$FIXTURE" config user.email t@example.com
  git -C "$FIXTURE" config user.name Test
  git -C "$FIXTURE" remote add origin "$REMOTE"

  mkdir -p "$PLANDIR"
  echo "base" > "$PLANDIR/tasks.md"
  git -C "$FIXTURE" add -A
  git -C "$FIXTURE" commit --quiet -m "base"
  git -C "$FIXTURE" push --quiet origin HEAD:main

  # Branch A: lokal UND remote, identischer SHA, weicht nur in einem Plan-Artefakt ab.
  git -C "$FIXTURE" checkout --quiet -b chore/local-T009101
  echo "abweichend" > "$PLANDIR/tasks.md"
  git -C "$FIXTURE" commit --quiet -am "plan only"
  git -C "$FIXTURE" push --quiet origin chore/local-T009101

  # Branch B: lokal ist dem Remote-Stand VORAUS (ungepushter Commit) — der lokale Ref trägt
  # damit Arbeit, die im Archiv-Tag nicht enthalten ist.
  git -C "$FIXTURE" checkout --quiet main
  git -C "$FIXTURE" checkout --quiet -b chore/ahead-T009102
  echo "abweichend" > "$PLANDIR/tasks.md"
  git -C "$FIXTURE" commit --quiet -am "plan only"
  git -C "$FIXTURE" push --quiet origin chore/ahead-T009102
  echo "nur lokal" > "$PLANDIR/tasks.md"
  git -C "$FIXTURE" commit --quiet -am "unpushed local work"

  # Der Reaper überspringt den ausgecheckten Branch — Fixture steht deshalb auf main.
  git -C "$FIXTURE" checkout --quiet main
  git -C "$FIXTURE" fetch --quiet origin

  # gh-Stub: kein offener PR auf irgendeinem Branch.
  cat > "$STUBS/gh" <<'STUB'
#!/usr/bin/env bash
echo '[]'
STUB
  chmod +x "$STUBS/gh"

  # ticket.sh-Stub: jedes abgefragte Ticket gilt als done.
  cat > "$STUBS/ticket-stub.sh" <<'STUB'
#!/usr/bin/env bash
echo '{"external_id":"T009101","status":"done"}'
STUB
  chmod +x "$STUBS/ticket-stub.sh"

  export PATH="$STUBS:$PATH"
  export TICKET_SH="$STUBS/ticket-stub.sh"
}

@test "T003182: nach dem Reap ist der lokale Branch-Ref weg, nicht nur der Remote-Ref" {
  run bash "$REAPER" --ticket T009101 --repo "$FIXTURE"
  [ "$status" -eq 0 ]

  # Positiv-Anker 1: der Reap hat wirklich stattgefunden — der Remote-Ref ist fort.
  run git -C "$FIXTURE" ls-remote --heads origin chore/local-T009101
  [ "$status" -eq 0 ]
  [ -z "$output" ]

  # Positiv-Anker 2: das Sicherheitsnetz liegt vor — der Archiv-Tag wurde gepusht.
  run git -C "$FIXTURE" ls-remote --tags origin "refs/tags/reaped/chore/local-T009101"
  [ "$status" -eq 0 ]
  [ -n "$output" ]

  # Die eigentliche Aussage: der lokale Ref darf den Reap nicht überleben.
  run git -C "$FIXTURE" rev-parse --verify --quiet refs/heads/chore/local-T009101
  [ "$status" -ne 0 ]
}

@test "T003182: ein lokaler Branch mit ungepushter Arbeit ueberlebt den Reap" {
  local_sha_before="$(git -C "$FIXTURE" rev-parse refs/heads/chore/ahead-T009102)"

  run bash "$REAPER" --ticket T009102 --repo "$FIXTURE"
  [ "$status" -eq 0 ]

  # Positiv-Anker: der Reap lief bis zum Ende durch — der Remote-Ref ist fort.
  run git -C "$FIXTURE" ls-remote --heads origin chore/ahead-T009102
  [ "$status" -eq 0 ]
  [ -z "$output" ]

  # Der lokale Ref zeigt auf einen anderen Commit als der Archiv-Tag und traegt damit
  # unarchivierte Arbeit: er darf nicht mitgeloescht werden.
  run git -C "$FIXTURE" rev-parse --verify --quiet refs/heads/chore/ahead-T009102
  [ "$status" -eq 0 ]
  [ "$output" = "$local_sha_before" ]
}
