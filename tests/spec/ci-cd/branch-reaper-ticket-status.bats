#!/usr/bin/env bats
# tests/spec/ci-cd/branch-reaper-ticket-status.bats — Sweep-Robustheit gegen
# nicht ermittelbare Ticket-Status [T004892]
#
# Prüfmodus: COMMAND OUTPUT VERIFICATION.
# Jeder Test führt scripts/branch-reaper.sh gegen ein Wegwerf-Git-Repo aus (git init in
# BATS_TEST_TMPDIR, eigenes bare Remote, TICKET_SH- und gh-Stubs) und prüft Exit-Code und
# REAP-/KEEP-Zeilen seiner Ausgabe. Es wird NICHT der Quelltext des Skripts gegreppt
# (T002448-M4).
#
# NIEMALS gegen das echte Repo: Ohne --dry-run löscht das Skript Remote-Branches. Alle
# Tests arbeiten ausschliesslich auf dem Fixture.
#
# Semantik statt Darstellung (T002716): geprüft werden Exit-Code, die Präfixe REAP/KEEP
# (bestehender Ausgabevertrag) und die betroffenen Branch-Namen — nicht der Wortlaut einer
# Begründung.
#
# Reihenfolge ist bedeutungstragend: Der Positiv-Anker (Test 1) steht vorn. Der Negativ-Test
# trägt seinen Positiv-Anker im selben Test (T002356-M1): Der REAP des existierenden
# done-Tickets belegt, dass der Lauf vollständig durchlief — ein Abbruch oder eine leere
# Kandidatenliste könnte die KEEP-Aussage sonst trivial erfüllen.

setup() {
  PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  REAPER="$PROJECT_DIR/scripts/branch-reaper.sh"

  FIXTURE="$BATS_TEST_TMPDIR/fixture"
  REMOTE="$BATS_TEST_TMPDIR/remote.git"
  STUBS="$BATS_TEST_TMPDIR/stubs"
  mkdir -p "$STUBS"

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

  _branch() {
    git -C "$FIXTURE" checkout --quiet main
    git -C "$FIXTURE" checkout --quiet -b "$1"
    echo "$1" > "$PLANDIR/tasks.md"
    git -C "$FIXTURE" commit --quiet -am "plan only"
    git -C "$FIXTURE" push --quiet origin "$1"
  }
  _branch chore/plan-T009010    # Ticket EXISTIERT, Status done -> Sweep-Kandidat (REAP)
  _branch chore/plan-T004396    # Ticket-ID existiert NICHT -> muss KEEP-verschont werden

  git -C "$FIXTURE" checkout --quiet main
  git -C "$FIXTURE" fetch --quiet origin

  # gh-Stub: nirgends ein offener PR.
  cat > "$STUBS/gh" <<'STUB'
#!/usr/bin/env bash
echo '[]'
STUB
  chmod +x "$STUBS/gh"

  # ticket.sh-Stub: T009010 existiert (done), jede andere angefragte ID existiert nicht
  # (Exit 1, stderr, kein JSON auf stdout — wie ticket.sh get --id <unbekannt>).
  cat > "$STUBS/ticket-stub.sh" <<'STUB'
#!/usr/bin/env bash
for a in "$@"; do
  if [ "$a" = "T009010" ]; then echo '{"external_id":"T009010","status":"done"}'; exit 0; fi
done
echo "Ticket nicht gefunden" >&2
exit 1
STUB
  chmod +x "$STUBS/ticket-stub.sh"

  export PATH="$STUBS:$PATH"
  export TICKET_SH="$STUBS/ticket-stub.sh"
}

@test "T004892 Positiv-Anker: existierendes done-Ticket wird weiterhin gereapt" {
  # Belegt, dass der Status-Lookup für existierende IDs funktioniert und der Einzel-Ticket-
  # Lauf (dieselbe Code-Stelle wie der Sweep) durchläuft. Fällt dieser Test, sind die
  # Aussagen darunter bedeutungslos (leere Kandidatenliste erfüllt sie trivial).
  run bash "$REAPER" --dry-run --ticket T009010 --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'chore/plan-T009010')" -eq 1 ]
}

@test "T004892: nicht-existentes Ticket bricht den Sweep nicht ab und verschont den Branch" {
  # Positiv-Anker im selben Test: derselbe Lauf reapt das existierende done-Ticket — der
  # Sweep ist vollständig durchgelaufen, die KEEP-Aussage unten ist kein trivialer Leerlauf.
  run bash "$REAPER" --sweep --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'chore/plan-T009010')" -eq 1 ]
  # Der Kern des Defekts: eine nicht existierende Ticket-ID durfte den Sweep mit Exit 1
  # stumm abbrechen (beobachtet vor dem Fix). Nicht ermittelbar heisst verschonen, nicht
  # durchwinken — der Branch muss eine KEEP-Zeile bekommen.
  [ -n "$(printf '%s\n' "$output" | grep '^KEEP ' | grep 'chore/plan-T004396' || true)" ]
}
