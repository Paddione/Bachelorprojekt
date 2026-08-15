#!/usr/bin/env bats
# tests/spec/ci-cd/branch-reaper-merged-pr-signal.bats — MERGED-PR-Positiv-Signal [T007032]
#
# Prüfmodus: COMMAND OUTPUT VERIFICATION.
# Jeder Test führt scripts/branch-reaper.sh gegen ein Wegwerf-Git-Repo aus (git init in
# BATS_TEST_TMPDIR, eigenes bare Remote) und prüft die Ergebniszeilen seiner Ausgabe
# (REAP/KEEP). Es wird NICHT der Quelltext des Skripts gegreppt (T002448-M4).
#
# NIEMALS gegen das echte Repo: Ohne --dry-run löscht das Skript Remote-Branches. Alle Tests
# arbeiten ausschliesslich auf dem Fixture.
#
# Was hier zugesichert wird (Semantik, nicht Darstellung — T002716):
#   - Ein Branch mit Ticket-ID, done-Ticket und eigenem MERGED-PR (headRefOid == Remote-Tip)
#     wird als REAP-Kandidat gemeldet, auch wenn seine Abweichung zu main ausserhalb der
#     ALLOWLIST liegt (scripts/echt.sh) — vorher: KEEP "abweichende Datei ausserhalb der
#     Allowlist" (der Kernbefund aus T007032).
#   - Ein Branch ohne eigenen MERGED-PR wird gereapt, wenn ein Nachfolge-Branch mit MERGED-PR
#     fuer jede divergierende Datei identische Blobs traegt.
#   - Verschont bleiben: Post-Merge-Pushes (Tip != headRefOid), Tickets != done, gh-Ausfaelle,
#     offene PRs, Nachfolger mit abweichendem Blob und der eigene Branch als Selbstnachfolger.
#   - Die Regel gilt im Sweep- UND im --ticket-Modus.
#
# Reihenfolge ist bedeutungstragend: Die Positiv-Anker (Tests 1, 5, 10) stehen vorn bzw.
# bilden den Kern; ohne Implementierung sind sie rot, die Negativ-Aussagen sind ohne sie
# bedeutungslos (T002356-M1).

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

  # _branch <name> <echt.sh-inhalt>: Branch ab main, weicht NUR in scripts/echt.sh ab
  # (AUSSERHALB der ALLOWLIST — der Kernfall aus T007032).
  _branch() {
    git -C "$FIXTURE" checkout --quiet main
    git -C "$FIXTURE" checkout --quiet -b "$1"
    echo "$2" > "$CODEDIR/echt.sh"
    git -C "$FIXTURE" commit --quiet -am "change $1"
    git -C "$FIXTURE" push --quiet origin "$1"
  }

  # Test 1 (Anker): eigener MERGED-PR, SHA == Tip, Abweichung ausserhalb der Allowlist
  _branch fix/merged-T009010 v1
  # Test 3: MERGED-PR, aber Ticket in_progress
  _branch fix/merged-openticket-T009012 v1
  # Test 4: gh-Abfrage auf den MERGED-PR schlaegt fehl
  _branch fix/merged-ghfail-T009013 v1
  # Test 5 (Anker): kein eigener PR; Nachfolger fix/successor-T009015 traegt identische Blobs
  _branch fix/succ-T009014 v1
  _branch fix/successor-T009015 v1
  # Tests 7/8: kein eigener PR; Nachfolger traegt ABWEICHENDEN Blob (v3 != v2)
  _branch fix/succ-diff-T009016 v2
  _branch fix/successor-diff-T009017 v3
  # Test 9: offener PR
  _branch fix/openpr-T009018 v1
  # Test 10: eigener MERGED-PR, SHA == Tip — wird im --ticket-Modus geprueft
  _branch fix/merged-ticketmode-T009019 v1

  # Test 2: MERGED-PR, aber nach dem Merge wurden Commits gepusht (Tip != headRefOid).
  # Der headRefOid des Stubs ist der SHA VOR dem Post-Merge-Commit.
  git -C "$FIXTURE" checkout --quiet main
  git -C "$FIXTURE" checkout --quiet -b fix/merged-moved-T009011
  echo "v1" > "$CODEDIR/echt.sh"
  git -C "$FIXTURE" commit --quiet -am "change merged-moved"
  git -C "$FIXTURE" push --quiet origin fix/merged-moved-T009011
  SHA_MOVED_MERGED="$(git ls-remote "$REMOTE" refs/heads/fix/merged-moved-T009011 | cut -f1)"
  echo "post" > "$FIXTURE/src-post.txt"
  git -C "$FIXTURE" add -A
  git -C "$FIXTURE" commit --quiet -am "post-merge work"
  git -C "$FIXTURE" push --quiet origin fix/merged-moved-T009011

  git -C "$FIXTURE" checkout --quiet main
  git -C "$FIXTURE" fetch --quiet origin

  # SHAs der Tips, die der gh-Stub als headRefOid zurueckgeben muss (MERGED => SHA == Tip)
  SHA_1="$(git ls-remote "$REMOTE" refs/heads/fix/merged-T009010 | cut -f1)"
  SHA_3="$(git ls-remote "$REMOTE" refs/heads/fix/merged-openticket-T009012 | cut -f1)"
  SHA_8="$(git ls-remote "$REMOTE" refs/heads/fix/merged-ticketmode-T009019 | cut -f1)"
  SHA_5S="$(git ls-remote "$REMOTE" refs/heads/fix/successor-T009015 | cut -f1)"
  SHA_6S="$(git ls-remote "$REMOTE" refs/heads/fix/successor-diff-T009017 | cut -f1)"

  # gh-Stub: drei Abfrageformen —
  #   --state open                          → offener PR nur fuer fix/openpr-T009018
  #   --head <b> --state merged             → MERGED-PR je Branch (headRefOid); gh-Fehler
  #                                           nur fuer fix/merged-ghfail-T009013
  #   --state merged (ohne --head)          → alle gemergten PR-Koepfe (Nachfolger-Liste)
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
  open)
    if [ "$branch" = "fix/openpr-T009018" ]; then echo '[{"number":42}]'; exit 0; fi
    echo '[]'; exit 0 ;;
  merged)
    if [ "$branch" = "fix/merged-ghfail-T009013" ]; then echo "stub gh failure" >&2; exit 1; fi
    if [ -n "$branch" ]; then
      case "$branch" in
        fix/merged-T009010)          echo "[{\"state\":\"MERGED\",\"headRefOid\":\"@SHA1@\"}]" ;;
        fix/merged-moved-T009011)    echo "[{\"state\":\"MERGED\",\"headRefOid\":\"@SHA_MOVED_MERGED@\"}]" ;;
        fix/merged-openticket-T009012) echo "[{\"state\":\"MERGED\",\"headRefOid\":\"@SHA3@\"}]" ;;
        fix/merged-ticketmode-T009019) echo "[{\"state\":\"MERGED\",\"headRefOid\":\"@SHA8@\"}]" ;;
        *) echo '[]' ;;
      esac
      exit 0
    fi
    echo "[{\"headRefName\":\"fix/successor-T009015\",\"headRefOid\":\"@SHA5S@\"},{\"headRefName\":\"fix/successor-diff-T009017\",\"headRefOid\":\"@SHA6S@\"}]"
    exit 0 ;;
  all) echo '[]'; exit 0 ;;
esac
echo '[]'
STUB
  sed -i "s/@SHA1@/$SHA_1/g; s/@SHA_MOVED_MERGED@/$SHA_MOVED_MERGED/g; s/@SHA3@/$SHA_3/g; s/@SHA8@/$SHA_8/g; s/@SHA5S@/$SHA_5S/g; s/@SHA6S@/$SHA_6S/g" "$STUBS/gh"
  chmod +x "$STUBS/gh"

  # ticket.sh-Stub: T009012 ist offen, alle anderen sind done
  cat > "$STUBS/ticket-stub.sh" <<'STUB'
#!/usr/bin/env bash
for a in "$@"; do
  if [ "$a" = "T009012" ]; then echo '{"external_id":"T009012","status":"in_progress"}'; exit 0; fi
done
echo '{"external_id":"T009000","status":"done"}'
STUB
  chmod +x "$STUBS/ticket-stub.sh"

  export PATH="$STUBS:$PATH"
  export TICKET_SH="$STUBS/ticket-stub.sh"
}

# --- Positiv-Anker ----------------------------------------------------------

@test "T007032 Anker: Branch mit eigenem MERGED-PR und Abweichung ausserhalb der Allowlist wird REAP-Kandidat" {
  # Kern der Regel: Ticket done + MERGED-PR (headRefOid == Tip) + scripts/echt.sh-Abweichung
  # (NICHT in der ALLOWLIST) → muss als REAP gemeldet werden. Ohne die Implementierung endet
  # er wie heute in 'KEEP ... abweichende Datei ausserhalb der Allowlist' (roter Lauf).
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  reaped="$(printf '%s\n' "$output" | grep '^REAP ' || true)"
  [ "$(printf '%s\n' "$reaped" | grep -c 'fix/merged-T009010')" -eq 1 ]
}

@test "T007032 Anker: Inhalt via Nachfolge-Branch mit MERGED-PR und identischen Blobs wird REAP-Kandidat" {
  # fix/succ-T009014 hat keinen eigenen MERGED-PR; der Nachfolger fix/successor-T009015
  # (MERGED) traegt fuer die einzige divergierende Datei (scripts/echt.sh) denselben Blob.
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  reaped="$(printf '%s\n' "$output" | grep '^REAP ' || true)"
  [ "$(printf '%s\n' "$reaped" | grep -c 'fix/succ-T009014')" -eq 1 ]
}

@test "T007032 Anker: --ticket-Modus reapt Branch mit eigenem MERGED-PR und Abweichung ausserhalb der Allowlist" {
  # Die Regel gilt nicht nur im Sweep: der Post-Merge-Einzel-Lauf profitiert ebenso.
  run bash "$REAPER" --dry-run --ticket T009019 --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  reaped="$(printf '%s\n' "$output" | grep '^REAP ' || true)"
  [ "$(printf '%s\n' "$reaped" | grep -c 'fix/merged-ticketmode-T009019')" -eq 1 ]
}

# --- Negativ-Faelle (mit Positiv-Anker im selben Lauf: merged-T009010 wird immer REAP) ---

@test "T007032: Branch mit Post-Merge-Pushes (Tip != headRefOid) wird verschont" {
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'fix/merged-T009010')" -eq 1 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'fix/merged-moved-T009011')" -eq 0 ]
  [ -n "$(printf '%s\n' "$output" | grep '^KEEP ' | grep 'fix/merged-moved-T009011' || true)" ]
}

@test "T007032: Branch mit MERGED-PR aber nicht-done Ticket wird verschont" {
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'fix/merged-T009010')" -eq 1 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'fix/merged-openticket-T009012')" -eq 0 ]
  [ -n "$(printf '%s\n' "$output" | grep '^KEEP ' | grep 'fix/merged-openticket-T009012' || true)" ]
}

@test "T007032: gh-Ausfall auf dem MERGED-PR-Check verschont den Branch" {
  # Unverifizierbar heisst verschonen (T003074-Muster): ein gh-Ausfall darf keinen Branch
  # freigeben.
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'fix/merged-T009010')" -eq 1 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'fix/merged-ghfail-T009013')" -eq 0 ]
  [ -n "$(printf '%s\n' "$output" | grep '^KEEP ' | grep 'fix/merged-ghfail-T009013' || true)" ]
}

@test "T007032: ein Branch ist nicht sein eigener Nachfolger (Selbstreferenz reapt nicht)" {
  # fix/successor-T009015 steht in der MERGED-Koepfe-Liste; sein eigener MERGED-PR-Check
  # liefert [] (nur der Nachfolger-Liste entnommen). Ohne Selbst-Ausschluss wuerde er sich
  # ueber den Nachfolger-Check selbst reapen.
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'fix/merged-T009010')" -eq 1 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'fix/successor-T009015')" -eq 0 ]
  [ -n "$(printf '%s\n' "$output" | grep '^KEEP ' | grep 'fix/successor-T009015' || true)" ]
}

@test "T007032: Nachfolger mit abweichendem Blob verschont den Branch" {
  # fix/succ-diff-T009016 (v2) — weder successor-T009015 (v1) noch successor-diff-T009017 (v3)
  # traegt identische Blobs.
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'fix/merged-T009010')" -eq 1 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'fix/succ-diff-T009016')" -eq 0 ]
  [ -n "$(printf '%s\n' "$output" | grep '^KEEP ' | grep 'fix/succ-diff-T009016' || true)" ]
}

@test "T007032: offener PR verschont den Branch (bestehende Regel bleibt)" {
  run bash "$REAPER" --dry-run --repo "$FIXTURE"
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'fix/merged-T009010')" -eq 1 ]
  [ "$(printf '%s\n' "$output" | grep '^REAP ' | grep -c 'fix/openpr-T009018')" -eq 0 ]
  [ -n "$(printf '%s\n' "$output" | grep '^KEEP ' | grep 'fix/openpr-T009018' || true)" ]
}
