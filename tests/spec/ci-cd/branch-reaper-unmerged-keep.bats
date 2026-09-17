#!/usr/bin/env bats
# tests/spec/ci-cd/branch-reaper-unmerged-keep.bats
# SSOT: openspec/specs/agent-skills.md · Ticket: T900096
# Requirement: "Reaper keeps branches with commits outside main".
#
# PRÜFMODUS: COMMAND OUTPUT VERIFICATION, keine Source-Greps — nur Exit-Code
# plus REAP-/KEEP-Zeilen der Reaper-Ausgabe (ERGEBNIS-Orientierung, T002448-M4).
#
# Sandbox-Muster aus branch-reaper.bats / branch-reaper-sweep.bats: `git init
# --bare` Remote + Clone-Fixture, ABSOLUTE Pfade, alle git-Aufrufe mit `-C`,
# `gh`-Stub ohne offene PRs (`echo '[]'`), `ticket.sh`-Stub mit `done` fuer
# alle genutzten IDs. NIEMALS gegen das echte Repo (ohne --dry-run loescht das
# Skript Remote-Branches, nicht umkehrbar) — alle Laeufe hier mit --dry-run.
#
# RED-Nachweis (Guard neutralisiert, expected: FAIL — nur der Anker (a) bleibt
# gruen, (b)/(c) reapten ohne Guard auch den ungemergten Branch):
#   cp scripts/branch-reaper.sh /tmp/reaper-guarded-T900096.sh
#   sed -i '380,387d' scripts/branch-reaper.sh   # [T900096]-Ancestor-Guard raus
#   tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-unmerged-keep.bats
#   cp /tmp/reaper-guarded-T900096.sh scripts/branch-reaper.sh
#
# Reihenfolge ist bedeutungstragend: Der Positiv-Anker (Test 1) steht vorn.
# Faellt er, sind die Aussagen darunter bedeutungslos (T002356-M1).

setup() {
  PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  REAPER="$PROJECT_DIR/scripts/branch-reaper.sh"

  FIXTURE="$BATS_TEST_TMPDIR/fixture"
  REMOTE="$BATS_TEST_TMPDIR/remote.git"
  STUBS="$BATS_TEST_TMPDIR/stubs"
  mkdir -p "$STUBS"

  # Alle Fixture-Pfade sind ABSOLUT und alle git-Aufrufe nutzen -C (T002356-Note
  # aus branch-reaper-sweep.bats: kein `cd`, keine relativen Verzeichnisse).
  PLANDIR="$FIXTURE/openspec/changes/x"

  git init --bare --quiet "$REMOTE"
  git init -b main --quiet "$FIXTURE"
  git -C "$FIXTURE" config user.email t@example.com
  git -C "$FIXTURE" config user.name Test
  git -C "$FIXTURE" remote add origin "$REMOTE"

  mkdir -p "$PLANDIR"
  echo "base" > "$PLANDIR/tasks.md"
  git -C "$FIXTURE" add -A
  git -C "$FIXTURE" commit --quiet -m "base"
  git -C "$FIXTURE" push --quiet origin HEAD:main

  # Gemergter Branch mit reiner Allowlist-Abweichung (openspec/changes/**):
  # nach main gemergt + main gepusht → Tip ist Ancestor von Remote-main.
  git -C "$FIXTURE" checkout --quiet -b chore/merged-T900101
  echo "merged" > "$PLANDIR/tasks.md"
  git -C "$FIXTURE" commit --quiet -am "plan only"
  git -C "$FIXTURE" push --quiet origin chore/merged-T900101
  git -C "$FIXTURE" checkout --quiet main
  git -C "$FIXTURE" merge --quiet --no-ff chore/merged-T900101 -m "merge merged"
  git -C "$FIXTURE" push --quiet origin main

  # Ungemergter Branch mit VOLL allowlisted Blob-Diff (dieselbe Datei): Tip ist
  # KEIN Ancestor von Remote-main — nur der Guard haelt ihn zurueck.
  git -C "$FIXTURE" checkout --quiet -b chore/unmerged-T900102
  echo "unmerged" > "$PLANDIR/tasks.md"
  git -C "$FIXTURE" commit --quiet -am "plan only"
  git -C "$FIXTURE" push --quiet origin chore/unmerged-T900102
  git -C "$FIXTURE" checkout --quiet main
  git -C "$FIXTURE" fetch --quiet origin

  # gh-Stub: nirgends ein offener oder gemergter PR (kein Positiv-Signal).
  cat > "$STUBS/gh" <<'STUB'
#!/usr/bin/env bash
echo '[]'
STUB
  chmod +x "$STUBS/gh"

  # ticket.sh-Stub: jede angefragte ID ist done.
  cat > "$STUBS/ticket-stub.sh" <<'STUB'
#!/usr/bin/env bash
echo '{"status":"done"}'
STUB
  chmod +x "$STUBS/ticket-stub.sh"

  export PATH="$STUBS:$PATH"
  export TICKET_SH="$STUBS/ticket-stub.sh"
}

@test "T900096 Positiv-Anker: voll gemergter Allowlist-Branch liefert genau eine REAP-Zeile" {
  # Ohne diesen Anker waeren die Aussagen unten vakuos: liefe das Skript
  # ueberhaupt nicht (Exit != 0, leere Ausgabe), bestuenden reine
  # "kommt nicht vor"-Pruefungen trivial.
  run bash "$REAPER" --dry-run --ticket T900101 --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  reaped="$(printf '%s\n' "$output" | grep '^REAP ' || true)"
  [ "$(printf '%s\n' "$reaped" | grep -c .)" -eq 1 ]
  [ "$(printf '%s\n' "$reaped" | grep -c 'chore/merged-T900101')" -eq 1 ]
}

@test "T900096: Branch mit Commits ausserhalb main wird behalten (KEEP mit Unmerged-Begruendung)" {
  run bash "$REAPER" --dry-run --ticket T900102 --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  # Der Allowlist-Diff allein darf NICHT freigeben: keine REAP-Zeile.
  [ -z "$(printf '%s\n' "$output" | grep '^REAP ' || true)" ]
  keep="$(printf '%s\n' "$output" | grep '^KEEP chore/unmerged-T900102' || true)"
  [ -n "$keep" ]
  # Unmerged-Begruendung im T900096-Kontext (kein Wortlaut-Pinning darueber hinaus).
  printf '%s\n' "$keep" | grep -q 'ausserhalb'
  printf '%s\n' "$keep" | grep -q 'T900096'
}

@test "T900096: ein Lauf sieht beide Faelle — gemergt REAP, ungemergt KEEP" {
  # Ticketloser Inspektionsblick (--dry-run ohne --ticket: nur lesend, kein
  # --sweep) — einzige Laufart, die beide Branches in EINEM Lauf bewertet.
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  reaped="$(printf '%s\n' "$output" | grep '^REAP ' || true)"
  [ "$(printf '%s\n' "$reaped" | grep -c 'chore/merged-T900101')" -eq 1 ]
  [ -z "$(printf '%s\n' "$reaped" | grep 'chore/unmerged-T900102' || true)" ]
  printf '%s\n' "$output" | grep -q '^KEEP chore/unmerged-T900102.*T900096'
}
