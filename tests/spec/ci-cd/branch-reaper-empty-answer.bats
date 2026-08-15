#!/usr/bin/env bats
# tests/spec/ci-cd/branch-reaper-empty-answer.bats — leere ticket.sh-Antwort killt den Sweep [T006329]
#
# Prüfmodus: COMMAND OUTPUT VERIFICATION (T002448-M4).
# Jeder Test führt scripts/branch-reaper.sh gegen ein Wegwerf-Git-Repo aus (git init in
# BATS_TEST_TMPDIR, eigenes bare Remote) und prüft Exit-Code und Ergebniszeilen seiner Ausgabe.
# Es wird NICHT der Quelltext des Skripts gegreppt.
#
# NIEMALS gegen das echte Repo: Ohne --dry-run löscht das Skript Remote-Branches, und ein
# Löschlauf ist nicht umkehrbar. Alle Tests hier arbeiten ausschliesslich auf dem Fixture.
#
# Zugesichert wird die SEMANTIK, nicht die Darstellung (T002716): Exit-Code, REAP/KEEP-Präfixe
# und die Menge der getroffenen Branches. Der Wortlaut einer Begründung wird nicht geprüft.
#
# Hintergrund: `ticket.sh get --id <id>` antwortet für nicht existierende Tickets mit rc=0 und
# LEERER stdout. Die Status-Extraktion in branch-reaper.sh (printf | grep | head | sed) bekam
# dadurch leere Eingabe, grep endete mit 1, pipefail liess das Skript still mit Exit 1 sterben —
# nach der Entscheidungsphase, vor der Lösch-Schleife. Der Stub unten bildet genau diese Antwort
# für die Problem-ID ab. Positiv-Anker stehen vorn (T002356-M1): ohne den funktionierenden
# Grundlauf wären alle Aussagen darunter trivial.

setup() {
  PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  REAPER="$PROJECT_DIR/scripts/branch-reaper.sh"

  FIXTURE="$BATS_TEST_TMPDIR/fixture"
  REMOTE="$BATS_TEST_TMPDIR/remote.git"
  STUBS="$BATS_TEST_TMPDIR/stubs"
  mkdir -p "$STUBS"

  # Alle Fixture-Pfade sind ABSOLUT und alle git-Aufrufe nutzen -C. Kein `cd`, keine relativen
  # Verzeichnisse: ein relativ angelegtes openspec/changes/<slug> waere unter `bats -j 6` fuer
  # den validateTree('openspec')-Test sichtbar und faerbte ihn sporadisch rot.
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

  # Drei Branches. Die Reihenfolge der Evaluierung folgt der alphabetischen Sortierung von
  # `git ls-remote --heads` (T009001 < T009010 < T009011), damit Test 2 belegen kann, dass der
  # Lauf den Problem-Branch ÜBERLEBT und den danach liegenden Branch noch erreicht.
  _branch() {
    git -C "$FIXTURE" checkout --quiet main
    git -C "$FIXTURE" checkout --quiet -b "$1"
    echo "$1" > "$PLANDIR/tasks.md"
    git -C "$FIXTURE" commit --quiet -am "plan only"
    git -C "$FIXTURE" push --quiet origin "$1"
  }
  _branch chore/plan-T009001    # Ticket done  -> Sweep-Kandidat (Positiv-Anker)
  _branch chore/plan-T009010    # Ticket existiert NICHT: Stub antwortet rc=0 + leer
  _branch chore/plan-T009011    # Ticket done  -> zweiter Sweep-Kandidat (liegt NACH T009010)

  git -C "$FIXTURE" checkout --quiet main
  git -C "$FIXTURE" fetch --quiet origin

  # gh-Stub: nirgends ein offener PR.
  cat > "$STUBS/gh" <<'STUB'
#!/usr/bin/env bash
echo '[]'
STUB
  chmod +x "$STUBS/gh"

  # ticket.sh-Stub: T009010 existiert nicht in der "DB" — rc=0 mit LEERER stdout, exakt das
  # Verhalten des echten `ticket.sh get --id` fuer unbekannte IDs. Jede andere ID ist done.
  cat > "$STUBS/ticket-stub.sh" <<'STUB'
#!/usr/bin/env bash
for a in "$@"; do
  if [ "$a" = "T009010" ]; then exit 0; fi
done
echo '{"status":"done"}'
STUB
  chmod +x "$STUBS/ticket-stub.sh"

  export PATH="$STUBS:$PATH"
  export TICKET_SH="$STUBS/ticket-stub.sh"
}

@test "T006329 Positiv-Anker: Einzel-Ticket-Lauf mit bekannter ID liefert eine REAP-Zeile" {
  # Ohne diesen Anker waeren die Aussagen der Kern-Tests vakuos: liefe das Skript ueberhaupt
  # nicht (Exit 127, leere Ausgabe), bestuenden reine "kommt vor/nicht vor"-Pruefungen trivial.
  # Der Einzel-Lauf auf eine existierende (done-)ID durchlaeuft die Status-Extraktion mit
  # gueltiger Antwort — er ist vom Leer-Antwort-Pfad unabhaengig.
  run bash "$REAPER" --dry-run --ticket T009001 --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  reaped="$(printf '%s\n' "$output" | grep '^REAP ' || true)"
  [ "$(printf '%s\n' "$reaped" | grep -c 'chore/plan-T009001')" -eq 1 ]
}

@test "T006329: Branch mit leerer ticket.sh-Antwort verschont den Sweep nicht" {
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  # Kern des Defekts: vor dem Fix stirbt der Lauf still mit Exit 1 an der Status-Extraktion des
  # Problem-Branches (grep ohne Match unter pipefail) — danach kommt keine Zeile mehr.
  [ "$status" -eq 0 ]

  # (a) Der Problem-Branch wird NICHT gereapt — eine leere Antwort ist kein Freibrief
  # (T003074: leere Antwort ist kein Urteil). Er muss als KEEP auftauchen.
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'chore/plan-T009010')" -eq 0 ]
  [ -n "$(printf '%s\n' "$output" | grep '^KEEP ' | grep 'chore/plan-T009010' || true)" ]

  # (b) Der Lauf hat den Problem-Branch ÜBERLEBT: der alphabetisch NACH T009010 liegende
  # Branch wird noch evaluiert und (Ticket done) gereapt. Ohne diesen Anker bewiese eine leere
  # REAP-Menge triviale Gültigkeit.
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'chore/plan-T009011')" -eq 1 ]
}

@test "T006329: Einzel-Ticket-Lauf mit unbekannter ID bricht nicht ab" {
  # Dasselbe Leer-Antwort-Problem trifft den --ticket-Modus: T009010 existiert nicht in der
  # "DB", der Branch traegt die ID aber remote. Vor dem Fix stirbt auch dieser Lauf still.
  run bash "$REAPER" --dry-run --ticket T009010 --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  # Keine REAP-Zeile: ein nicht ermittelbarer Status gibt keinen Branch frei.
  [ "$(printf '%s\n' "$output" | grep '^REAP ' || true | grep -c 'chore/plan-T009010')" -eq 0 ]
}
