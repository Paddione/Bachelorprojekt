#!/usr/bin/env bats
# tests/spec/ci-cd/branch-reaper-freshness-regen.bats — Freshness-Reaper-Regel [T005958]
#
# Prüfmodus: COMMAND OUTPUT VERIFICATION.
# Jeder Test führt scripts/branch-reaper.sh gegen ein Wegwerf-Git-Repo aus (git init in
# BATS_TEST_TMPDIR, eigenes bare Remote) und prüft die Ergebniszeilen seiner Ausgabe. Es wird
# NICHT der Quelltext des Skripts gegreppt (T002448-M4).
#
# NIEMALS gegen das echte Repo: Ohne --dry-run löscht das Skript Remote-Branches. Alle Tests
# arbeiten ausschliesslich auf dem Fixture.
#
# Was hier zugesichert wird (Semantik, nicht Darstellung — T002716):
#   - chore/freshness-regen-*-Branches, deren PR gemergt ODER geschlossen ist und die von main
#     nur in ALLOWLIST-Pfaden abweichen, werden im ticketlosen Sweep als REAP-Kandidaten
#     gemeldet (vorher: KEEP "keine Ticket-ID im Branch-Namen erkennbar").
#   - Branches mit offenem PR, ohne auffindbaren PR oder mit Abweichung ausserhalb der
#     ALLOWLIST werden verschont.
#   - Die Regel gilt NUR fuer das freshness-regen-Muster: andere Branches ohne Ticket-ID
#     bleiben unangetastet (bestehende T003074-Zusage).
#
# Reihenfolge ist bedeutungstragend: Der Positiv-Anker (Test 1) steht vorn. Fällt er, sind die
# Negativ-Aussagen darunter bedeutungslos, weil eine leere Kandidatenliste sie trivial erfuellt
# (T002356-M1).

setup() {
  PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  REAPER="$PROJECT_DIR/scripts/branch-reaper.sh"

  FIXTURE="$BATS_TEST_TMPDIR/fixture"
  REMOTE="$BATS_TEST_TMPDIR/remote.git"
  STUBS="$BATS_TEST_TMPDIR/stubs"
  mkdir -p "$STUBS"

  # Alle Fixture-Pfade sind ABSOLUT und alle git-Aufrufe nutzen -C (bats -j 6: kein
  # relatives openspec/changes/<slug> sichtbar fuer validateTree).
  PLANDIR="$FIXTURE/openspec/changes/x"
  CODEDIR="$FIXTURE/docs/code-quality"

  git init --bare --quiet "$REMOTE"
  git init --quiet "$FIXTURE"
  git -C "$FIXTURE" config user.email t@example.com
  git -C "$FIXTURE" config user.name Test
  git -C "$FIXTURE" remote add origin "$REMOTE"

  mkdir -p "$PLANDIR" "$CODEDIR" "$FIXTURE/src"
  echo "base" > "$PLANDIR/tasks.md"
  echo "v1" > "$CODEDIR/repo-index.json"
  git -C "$FIXTURE" add -A
  git -C "$FIXTURE" commit --quiet -m "base"
  git -C "$FIXTURE" push --quiet origin HEAD:main

  # Fuenf freshness-regen-Branches + ein branchenfremder Branch ohne Ticket-ID. Unterschieden
  # werden sie ausschliesslich ueber den PR-Zustand und die Blob-Abweichung — genau die Achsen,
  # auf denen die neue Regel entscheidet.
  _branch() {
    git -C "$FIXTURE" checkout --quiet main
    git -C "$FIXTURE" checkout --quiet -b "$1"
    echo "$1" > "$CODEDIR/repo-index.json"
    if [ "$#" -gt 1 ]; then
      echo "draft" > "$FIXTURE/src/draft.txt"
      git -C "$FIXTURE" add -A
    fi
    git -C "$FIXTURE" commit --quiet -am "regen $1"
    git -C "$FIXTURE" push --quiet origin "$1"
  }
  _branch chore/freshness-regen-31781030910 # PR MERGED,  nur Allowlist-Abweichung -> REAP
  _branch chore/freshness-regen-31819894419 draft  # PR MERGED,  Abweichung ausserhalb -> KEEP
  _branch chore/freshness-regen-31832299018 # PR OPEN    -> KEEP
  _branch chore/freshness-regen-31839712179 # PR CLOSED  -> REAP
  _branch chore/freshness-regen-31842116870 # kein PR    -> KEEP
  _branch chore/ohne-ticket                # kein PR, kein freshness-Muster -> KEEP

  git -C "$FIXTURE" checkout --quiet main
  git -C "$FIXTURE" fetch --quiet origin

  # gh-Stub: beantwortet --state all PRO BRANCH (MERGED/CLOSED/OPEN/kein PR); die
  # --state open-Abfrage (nur fuer Nicht-Freshness-Branches relevant) ist immer leer.
  cat > "$STUBS/gh" <<'STUB'
#!/usr/bin/env bash
branch=""; state=""
while [ $# -gt 0 ]; do
  case "$1" in
    --head) branch="$2"; shift 2 ;;
    --state) state="$2"; shift 2 ;;
    *) shift ;;
  esac
done
if [ "$state" != "all" ]; then echo '[]'; exit 0; fi
case "$branch" in
  chore/freshness-regen-31781030910) echo '[{"state":"MERGED"}]' ;;
  chore/freshness-regen-31819894419) echo '[{"state":"MERGED"}]' ;;
  chore/freshness-regen-31832299018) echo '[{"state":"OPEN"}]' ;;
  chore/freshness-regen-31839712179) echo '[{"state":"CLOSED"}]' ;;
  *) echo '[]' ;;
esac
STUB
  chmod +x "$STUBS/gh"

  # ticket.sh-Stub: nicht angefragt (freshness-Branches tragen keine Ticket-ID), aber
  # abgesichert, falls eine Implementation faelschlich in den Ticket-Zweig laeuft.
  cat > "$STUBS/ticket-stub.sh" <<'STUB'
#!/usr/bin/env bash
echo '{"status":"done"}'
STUB
  chmod +x "$STUBS/ticket-stub.sh"

  export PATH="$STUBS:$PATH"
  export TICKET_SH="$STUBS/ticket-stub.sh"
}

@test "T005958 Positiv-Anker: gemergter freshness-regen-Branch wird REAP-Kandidat" {
  # Kern der Regel: der Branch traegt keine Ticket-ID, sein PR ist aber gemergt und die
  # Abweichung zu main liegt in der ALLOWLIST — er muss als REAP gemeldet werden. Ohne die
  # Implementierung endet er wie heute in 'KEEP ... keine Ticket-ID' (roter Lauf).
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  reaped="$(printf '%s\n' "$output" | grep '^REAP ' || true)"
  [ "$(printf '%s\n' "$reaped" | grep -c 'chore/freshness-regen-31781030910')" -eq 1 ]
}

@test "T005958: geschlossener (unmergter) freshness-regen-Branch wird REAP-Kandidat" {
  # Ein CLOSED-PR ist ein abgebrochener Lauf: der Branch ist tot. Analog zum Positiv-Anker
  # muss auch dieser Zweig reapen — nur die Abweichung muss in der ALLOWLIST bleiben.
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  reaped="$(printf '%s\n' "$output" | grep '^REAP ' || true)"
  [ "$(printf '%s\n' "$reaped" | grep -c 'chore/freshness-regen-31839712179')" -eq 1 ]
}

@test "T005958: freshness-regen-Branch mit Abweichung ausserhalb der ALLOWLIST wird verschont" {
  # Positiv-Anker aus Test 1 muss im selben Lauf durchlaufen, sonst waere die Negativ-Aussage
  # vakuos (T002356-M1): eine leere Kandidatenliste enthielte die Datei trivial nicht.
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'chore/freshness-regen-31781030910')" -eq 1 ]
  # src/draft.txt existiert nur auf dem Branch: Abweichung ausserhalb der ALLOWLIST.
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'chore/freshness-regen-31819894419')" -eq 0 ]
  [ -n "$(printf '%s\n' "$output" | grep '^KEEP ' | grep 'chore/freshness-regen-31819894419' || true)" ]
}

@test "T005958: freshness-regen-Branch mit offenem PR wird verschont" {
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'chore/freshness-regen-31781030910')" -eq 1 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'chore/freshness-regen-31832299018')" -eq 0 ]
  [ -n "$(printf '%s\n' "$output" | grep '^KEEP ' | grep 'chore/freshness-regen-31832299018' || true)" ]
}

@test "T005958: freshness-regen-Branch ohne auffindbaren PR wird verschont" {
  # Unverifizierbar heisst verschonen (T003074-Muster): ein fehlender PR koennte auch ein
  # gh-Ausfall sein, und ein Lauf ohne PR ist ohnehin nie auf main angekommen.
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'chore/freshness-regen-31781030910')" -eq 1 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'chore/freshness-regen-31842116870')" -eq 0 ]
  [ -n "$(printf '%s\n' "$output" | grep '^KEEP ' | grep 'chore/freshness-regen-31842116870' || true)" ]
}

@test "T005958: die Regel leakt nicht auf andere Branches ohne Ticket-ID" {
  # Regression zur T003074-Zusage: nur das freshness-regen-Muster wird ueber den PR-Status
  # entschieden; ein fremder Branch ohne Ticket-ID bleibt in 'KEEP ... keine Ticket-ID'.
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'chore/freshness-regen-31781030910')" -eq 1 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'chore/ohne-ticket')" -eq 0 ]
  [ -n "$(printf '%s\n' "$output" | grep '^KEEP ' | grep 'chore/ohne-ticket' || true)" ]
}

@test "T005958: ticketloser Aufruf OHNE --dry-run loescht nicht versehentlich" {
  # Die neue Regel gibt Deletionen frei; der Schutz vor versehentlichen Massenloeschungen
  # bleibt: ein schreibender Aufruf ohne jede Eingrenzung wird abgelehnt oder verlangt den
  # expliziten Sweep. Geprueft wird das Ergebnis am Remote, nicht der Wortlaut.
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]

  run bash "$REAPER" --repo "$FIXTURE"
  remaining="$(git ls-remote --heads "$REMOTE" | grep -c 'refs/heads/chore/' || true)"
  [ "$remaining" -eq 6 ]
}
