#!/usr/bin/env bats
# tests/spec/ci-cd/branch-reaper-unknown-ticket-merged-pr.bats — unbekannter Ticket-Status
# reicht auf die MERGED-PR-Positiv-Signale durch [T012412]
#
# Prüfmodus: COMMAND OUTPUT VERIFICATION.
# Jeder Test führt scripts/branch-reaper.sh gegen ein Wegwerf-Git-Repo aus (git init in
# BATS_TEST_TMPDIR, eigenes bare Remote) und prüft die Ergebniszeilen seiner Ausgabe
# (REAP/KEEP). Es wird NICHT der Quelltext des Skripts gegreppt (T002448-M4).
#
# NIEMALS gegen das echte Repo: Ohne --dry-run löscht das Skript Remote-Branches, und ein
# Löschlauf ist nicht umkehrbar. Alle Tests hier arbeiten ausschliesslich auf dem Fixture.
#
# Hintergrund: Nach dem Ticket-DB-Drop (2026-08-18) antwortet `ticket.sh get --id <id>` fuer
# jede external_id unterhalb T012401 mit rc=0 und LEERER stdout. Das Ticket-Gate brach in
# diesem Fall mit `continue` ab und machte die bereits vorhandenen Positiv-Signale aus T007032
# (eigener MERGED-PR mit headRefOid == Remote-Tip; MERGED-Nachfolger mit identischen Blobs)
# strukturell unerreichbar — ein Sweep meldete 10 von 15 Branches als "Ticket-Status nicht
# ermittelbar", 8 davon mit nachweislich gemergtem PR.
#
# Was hier zugesichert wird (Semantik, nicht Darstellung — T002716):
#   - Unbekannter Ticket-Status + eigener MERGED-PR (SHA == Tip) => REAP.
#   - Unbekannter Ticket-Status + MERGED-Nachfolger mit identischen Blobs => REAP.
#   - Unbekannter Ticket-Status OHNE Positiv-Signal => KEEP (die Zusage aus T006329 bleibt).
#   - Der entscheidende Negativfall: unbekannter Ticket-Status ohne Positiv-Signal darf NICHT
#     auf den Blob-Allowlist-Check durchfallen. "Ticket done" und "Blob-Diff in Allowlist" sind
#     bewusst ZWEI noetige Signale — die Allowlist allein haette die einzige Kopie eines nie
#     gemergten Deliverables geloescht (T002431).
#   - Ein GELESENER, aber nicht-terminaler Status (in_progress) bleibt ein hartes KEEP, auch
#     mit MERGED-PR. Nur die LEERE Antwort reicht durch.
#
# Positiv-Anker steht vorn (T002356-M1): ohne den funktionierenden Grundlauf waeren die
# "kommt nicht vor"-Aussagen darunter trivial erfuellt.

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
  CODEDIR="$FIXTURE/scripts"

  git init --bare --quiet "$REMOTE"
  git init --quiet "$FIXTURE"
  git -C "$FIXTURE" config user.email t@example.com
  git -C "$FIXTURE" config user.name Test
  git -C "$FIXTURE" remote add origin "$REMOTE"

  mkdir -p "$PLANDIR" "$CODEDIR"
  echo "base" > "$PLANDIR/tasks.md"
  echo "base" > "$CODEDIR/echt.sh"
  git -C "$FIXTURE" add -A
  git -C "$FIXTURE" commit --quiet -m "base"
  git -C "$FIXTURE" push --quiet origin HEAD:main

  # _code <name> <inhalt>: Branch weicht in scripts/echt.sh ab — AUSSERHALB der ALLOWLIST.
  _code() {
    git -C "$FIXTURE" checkout --quiet main
    git -C "$FIXTURE" checkout --quiet -b "$1"
    echo "$2" > "$CODEDIR/echt.sh"
    git -C "$FIXTURE" commit --quiet -am "change $1"
    git -C "$FIXTURE" push --quiet origin "$1"
  }

  # _plan <name>: Branch weicht NUR in openspec/changes/* ab — INNERHALB der ALLOWLIST.
  _plan() {
    git -C "$FIXTURE" checkout --quiet main
    git -C "$FIXTURE" checkout --quiet -b "$1"
    echo "$1" > "$PLANDIR/tasks.md"
    git -C "$FIXTURE" commit --quiet -am "plan only $1"
    git -C "$FIXTURE" push --quiet origin "$1"
  }

  # T009030 (done, Positiv-Anker fuer den Grundlauf) — Ticket auffindbar UND Abweichung in der
  # ALLOWLIST, also der klassische Reap-Fall ueber beide bisherigen Signale. Bewusst ein
  # Plan-Branch: mit einer Abweichung ausserhalb der Allowlist waere auch er ein KEEP, und der
  # Anker koennte den Grundlauf nicht mehr belegen.
  _plan fix/known-done-T009030
  # T009031 unbekannt + eigener MERGED-PR (SHA == Tip) => muss REAP werden (Kernfall).
  _code fix/unknown-merged-T009031 v1
  # T009032 unbekannt, KEIN PR => KEEP (Zusage aus T006329 bleibt).
  _code fix/unknown-nopr-T009032 v2
  # T009033 unbekannt, KEIN PR, Abweichung NUR in der ALLOWLIST => muss trotzdem KEEP sein.
  _plan fix/unknown-allowlist-T009033
  # T009034 GELESEN als in_progress + MERGED-PR => KEEP (nicht-terminaler Status bleibt hart).
  _code fix/known-open-merged-T009034 v1
  # T009035 unbekannt, kein eigener PR; Nachfolger T009036 hat MERGED-PR und identischen Blob.
  _code fix/unknown-succ-T009035 v9
  _code fix/successor-T009036 v9

  git -C "$FIXTURE" checkout --quiet main
  git -C "$FIXTURE" fetch --quiet origin

  SHA_MERGED="$(git ls-remote "$REMOTE" refs/heads/fix/unknown-merged-T009031 | cut -f1)"
  SHA_OPEN="$(git ls-remote "$REMOTE" refs/heads/fix/known-open-merged-T009034 | cut -f1)"
  SHA_SUCC="$(git ls-remote "$REMOTE" refs/heads/fix/successor-T009036 | cut -f1)"

  # gh-Stub: drei Abfrageformen —
  #   --state open               → nirgends ein offener PR
  #   --head <b> --state merged  → MERGED-PR je Branch (headRefOid)
  #   --state merged (ohne --head) → alle gemergten PR-Koepfe (Nachfolger-Liste)
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
case "$state" in
  open) echo '[]'; exit 0 ;;
  merged)
    if [ -n "$branch" ]; then
      case "$branch" in
        fix/unknown-merged-T009031)    echo "[{\"state\":\"MERGED\",\"headRefOid\":\"@SHA_MERGED@\"}]" ;;
        fix/known-open-merged-T009034) echo "[{\"state\":\"MERGED\",\"headRefOid\":\"@SHA_OPEN@\"}]" ;;
        fix/successor-T009036)         echo "[{\"state\":\"MERGED\",\"headRefOid\":\"@SHA_SUCC@\"}]" ;;
        *) echo '[]' ;;
      esac
      exit 0
    fi
    echo "[{\"headRefName\":\"fix/successor-T009036\",\"headRefOid\":\"@SHA_SUCC@\"}]"
    exit 0 ;;
  all) echo '[]'; exit 0 ;;
esac
echo '[]'
STUB
  sed -i "s/@SHA_MERGED@/$SHA_MERGED/g; s/@SHA_OPEN@/$SHA_OPEN/g; s/@SHA_SUCC@/$SHA_SUCC/g" "$STUBS/gh"
  chmod +x "$STUBS/gh"

  # ticket.sh-Stub bildet die DB nach dem Drop ab:
  #   T009030 / T009036 => done (auffindbar)
  #   T009034           => in_progress (auffindbar, aber nicht terminal)
  #   alle uebrigen     => rc=0 mit LEERER stdout (Ticket existiert nicht)
  cat > "$STUBS/ticket-stub.sh" <<'STUB'
#!/usr/bin/env bash
for a in "$@"; do
  case "$a" in
    T009030|T009036) echo "{\"external_id\":\"$a\",\"status\":\"done\"}"; exit 0 ;;
    T009034)         echo '{"external_id":"T009034","status":"in_progress"}'; exit 0 ;;
  esac
done
exit 0
STUB
  chmod +x "$STUBS/ticket-stub.sh"

  export PATH="$STUBS:$PATH"
  export TICKET_SH="$STUBS/ticket-stub.sh"
}

_reaped() { printf '%s\n' "$output" | grep '^REAP ' || true; }
_kept()   { printf '%s\n' "$output" | grep '^KEEP ' || true; }

@test "T012412 Positiv-Anker: Sweep laeuft und reapt einen Branch mit auffindbarem done-Ticket" {
  # Ohne diesen Anker waeren alle "kommt nicht vor"-Aussagen unten trivial erfuellt: liefe das
  # Skript ueberhaupt nicht (Exit 127, leere Ausgabe), bestuenden sie ebenfalls.
  run bash "$REAPER" --dry-run --sweep --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(_reaped | grep -c 'fix/known-done-T009030')" -eq 1 ]
}

@test "T012412: unbekanntes Ticket + eigener MERGED-PR (SHA == Tip) wird gereapt" {
  # Kern des Defekts: das Ticket-Gate brach bei leerer Antwort mit `continue` ab, bevor das
  # MERGED-PR-Signal ueberhaupt ausgewertet wurde. Die Abweichung liegt AUSSERHALB der
  # Allowlist (scripts/echt.sh) — der Branch kann also nur ueber das Positiv-Signal freikommen.
  run bash "$REAPER" --dry-run --sweep --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(_reaped | grep -c 'fix/unknown-merged-T009031')" -eq 1 ]
}

@test "T012412: unbekanntes Ticket + MERGED-Nachfolger mit identischem Blob wird gereapt" {
  # Positiv-Signal 2 aus T007032 sass hinter demselben `continue` und war ebenso unerreichbar.
  run bash "$REAPER" --dry-run --sweep --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(_reaped | grep -c 'fix/unknown-succ-T009035')" -eq 1 ]
}

@test "T012412: unbekanntes Ticket OHNE Positiv-Signal bleibt KEEP" {
  # Die Zusage aus T006329 bleibt bestehen: eine leere Antwort ist kein Freibrief.
  run bash "$REAPER" --dry-run --sweep --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(_reaped | grep -c 'fix/unknown-nopr-T009032')" -eq 0 ]
  [ -n "$(_kept | grep 'fix/unknown-nopr-T009032' || true)" ]
}

@test "T012412: unbekanntes Ticket ohne Positiv-Signal faellt NICHT auf den Allowlist-Check durch" {
  # Der entscheidende Negativfall. Dieser Branch weicht NUR in openspec/changes/* ab, liegt also
  # vollstaendig in der ALLOWLIST. Wuerde der unbekannte Ticket-Status einfach weiterlaufen
  # statt ein Positiv-Signal zu verlangen, gaebe der Blob-Check ihn frei — und damit waere
  # "Ticket done" als zweites noetiges Signal ausgehebelt (T002431: die Allowlist allein haette
  # die einzige Kopie eines nie gemergten Deliverables geloescht).
  run bash "$REAPER" --dry-run --sweep --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(_reaped | grep -c 'fix/unknown-allowlist-T009033')" -eq 0 ]
  [ -n "$(_kept | grep 'fix/unknown-allowlist-T009033' || true)" ]
}

@test "T012412: gelesener nicht-terminaler Status bleibt KEEP, auch mit MERGED-PR" {
  # Nur die LEERE Antwort reicht auf die Positiv-Signale durch. Ein Ticket, das auffindbar ist
  # und in_progress steht, ist eine gelesene Aussage — kein fehlender Messwert.
  run bash "$REAPER" --dry-run --sweep --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(_reaped | grep -c 'fix/known-open-merged-T009034')" -eq 0 ]
  [ -n "$(_kept | grep 'fix/known-open-merged-T009034' || true)" ]
}

@test "T012412: Einzel-Ticket-Lauf mit unbekannter ID und MERGED-PR reapt ebenfalls" {
  # Dieselbe Regel muss im --ticket-Modus gelten, nicht nur im Sweep.
  run bash "$REAPER" --dry-run --ticket T009031 --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(_reaped | grep -c 'fix/unknown-merged-T009031')" -eq 1 ]
}
