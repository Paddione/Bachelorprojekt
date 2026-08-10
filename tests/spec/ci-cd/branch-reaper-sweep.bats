#!/usr/bin/env bats
# tests/spec/ci-cd/branch-reaper-sweep.bats — ticketloser Sweep-Modus [T003180, T003074]
#
# Prüfmodus: COMMAND OUTPUT VERIFICATION.
# Jeder Test führt scripts/branch-reaper.sh gegen ein Wegwerf-Git-Repo aus (git init in
# BATS_TEST_TMPDIR, eigenes bare Remote) und prüft die Ergebniszeilen seiner Ausgabe. Es wird
# NICHT der Quelltext des Skripts gegreppt — ein Muster im Source belegt nur, dass Text
# existiert, nicht dass das Verhalten stimmt (T002448-M4).
#
# NIEMALS gegen das echte Repo: Ohne --dry-run löscht das Skript Remote-Branches, und ein
# Löschlauf ist nicht umkehrbar. Alle Tests hier arbeiten ausschliesslich auf dem Fixture.
#
# Zugesichert wird die SEMANTIK, nicht die Darstellung (T002716): geprüft werden Exit-Code,
# die Präfixe REAP/KEEP (der bestehende Ausgabevertrag, siehe branch-reaper.bats) und die
# Menge der getroffenen Branches. Der Wortlaut einer Begründung wird nirgends festgeschrieben.
#
# Reihenfolge ist bedeutungstragend: Der Positiv-Anker (Test 1) steht vorn. Fällt er, sind die
# Aussagen darunter bedeutungslos, weil eine leere Kandidatenliste sie trivial erfüllt
# (T002356-M1).

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

  # Vier Branches, alle mit reiner Allowlist-Abweichung (openspec/changes/**). Unterschieden
  # werden sie ausschliesslich ueber die Ticket-Zuordnung — genau die Achse, auf der sich
  # Einzel-Ticket-Lauf und Sweep unterscheiden muessen.
  _branch() {
    git -C "$FIXTURE" checkout --quiet main
    git -C "$FIXTURE" checkout --quiet -b "$1"
    echo "$1" > "$PLANDIR/tasks.md"
    git -C "$FIXTURE" commit --quiet -am "plan only"
    git -C "$FIXTURE" push --quiet origin "$1"
  }
  _branch chore/plan-T009001    # Ticket done  -> Sweep-Kandidat
  _branch chore/plan-T009002    # Ticket done, ANDERES Ticket -> zweiter Sweep-Kandidat
  _branch chore/open-T009004    # Ticket offen -> muss verschont werden
  _branch chore/ohne-ticket     # keine Ticket-ID im Namen -> nicht zuordenbar

  git -C "$FIXTURE" checkout --quiet main
  git -C "$FIXTURE" fetch --quiet origin

  # gh-Stub: nirgends ein offener PR.
  cat > "$STUBS/gh" <<'STUB'
#!/usr/bin/env bash
echo '[]'
STUB
  chmod +x "$STUBS/gh"

  # ticket.sh-Stub: T009004 ist offen, jede andere angefragte ID ist done. Der Stub antwortet
  # PRO ANGEFRAGTER ID — nur so kann ein Test zeigen, ob der Sweep die ID je Branch aufloest
  # oder blind eine einzige CLI-ID durchreicht.
  cat > "$STUBS/ticket-stub.sh" <<'STUB'
#!/usr/bin/env bash
for a in "$@"; do
  if [ "$a" = "T009004" ]; then echo '{"external_id":"T009004","status":"in_progress"}'; exit 0; fi
done
echo '{"status":"done"}'
STUB
  chmod +x "$STUBS/ticket-stub.sh"

  export PATH="$STUBS:$PATH"
  export TICKET_SH="$STUBS/ticket-stub.sh"
}

# Zaehlt die verschiedenen Ticket-IDs, die in REAP-Zeilen vorkommen.
_distinct_reaped_tickets() {
  printf '%s\n' "$1" | grep '^REAP ' | grep -o 'T[0-9]\{6\}' | sort -u | grep -c .
}

@test "T003180 Positiv-Anker: Einzel-Ticket-Modus liefert weiterhin eine REAP-Zeile" {
  # Ohne diesen Anker waeren die Aussagen unten vakuos: liefe das Skript ueberhaupt nicht
  # (Exit 127, leere Ausgabe), bestuenden reine "kommt nicht vor"-Pruefungen trivial.
  run bash "$REAPER" --dry-run --ticket T009001 --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  reaped="$(printf '%s\n' "$output" | grep '^REAP ' || true)"
  [ "$(printf '%s\n' "$reaped" | grep -c 'chore/plan-T009001')" -eq 1 ]
  # Gegenprobe zur Abgrenzung: der Einzel-Lauf sieht das zweite Ticket NICHT.
  [ "$(printf '%s\n' "$reaped" | grep -c 'chore/plan-T009002')" -eq 0 ]
}

@test "T003180: --dry-run ohne --ticket ist aufrufbar und listet Kandidaten" {
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  # Semantik statt Wortlaut: der Lauf muss durchlaufen UND mindestens einen Kandidaten
  # benennen. Ein Exit 0 ohne jede REAP-Zeile waere von "Aufruf abgelehnt" nicht zu
  # unterscheiden — dasselbe Muster "leere Antwort ist kein Urteil", das T003074 beschreibt.
  [ "$(printf '%s\n' "$output" | grep -c '^REAP ')" -ge 1 ]
}

@test "T003074: der ticketlose Sweep erfasst mehr als eine Ticket-ID" {
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  # Der Kern des Defekts: die Kandidatenauswahl filtert hart auf EINE ID. Ein Sweep, der
  # nur ein Ticket sieht, erfuellt die Runbook-Zusage nicht.
  [ "$(_distinct_reaped_tickets "$output")" -ge 2 ]
  reaped="$(printf '%s\n' "$output" | grep '^REAP ')"
  [ "$(printf '%s\n' "$reaped" | grep -c 'chore/plan-T009001')" -eq 1 ]
  [ "$(printf '%s\n' "$reaped" | grep -c 'chore/plan-T009002')" -eq 1 ]
}

@test "T003074: der Sweep loest den Ticket-Status je Branch auf und verschont offene Tickets" {
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  # Belegt, dass die Status-Pruefung an der ID DES BRANCHES haengt und nicht an einer
  # einzigen durchgereichten CLI-ID: T009004 ist offen und muss verschont werden, waehrend
  # im selben Lauf andere Branches gereapt werden.
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'chore/open-T009004')" -eq 0 ]
  [ -n "$(printf '%s\n' "$output" | grep '^KEEP ' | grep 'chore/open-T009004' || true)" ]
}

@test "T003074: ein Branch ohne Ticket-ID im Namen wird im Sweep nicht geloescht" {
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  # Ohne Ticket-ID ist Kriterium 3 (Ticket-Status done/archived) nicht pruefbar. Nicht
  # pruefbar heisst verschonen, nicht durchwinken.
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'chore/ohne-ticket')" -eq 0 ]
  [ -n "$(printf '%s\n' "$output" | grep '^KEEP ' | grep 'chore/ohne-ticket' || true)" ]
}

@test "T003180: ticketloser Aufruf OHNE --dry-run loescht nicht versehentlich" {
  # Positiv-Anker: der lesende ticketlose Lauf geht durch. Ohne ihn bestuende die
  # Negativ-Aussage unten auch dann, wenn das Skript jeden ticketlosen Aufruf ablehnt.
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]

  # Ein schreibender Lauf ohne jede Eingrenzung darf nicht aus Versehen passieren: entweder
  # wird er abgelehnt (Exit != 0) oder er verlangt eine ausdrueckliche Sweep-Angabe. Geprueft
  # wird das Ergebnis am Remote, nicht der Wortlaut einer Meldung.
  run bash "$REAPER" --repo "$FIXTURE"
  remaining="$(git ls-remote --heads "$REMOTE" | grep -c 'refs/heads/chore/' || true)"
  [ "$remaining" -eq 4 ]
}
