#!/usr/bin/env bats
#
# SSOT: openspec/specs/mishap-rollup.md
# Ticket: T002931 — Rollup-Branch kommt nie voran: der Generator haengt pro Tick einen
#         weiteren Voll-Regenerations-Commit an, statt seinen eigenen zu ersetzen.
#
# PRUEFMODUS: Command-Output-Verifikation (CLAUDE.md, T002448-M4). Jeder Test FUEHRT
# scripts/factory/rollup-publish.sh AUS und misst Exit-Code und Commit-Zustand eines
# Wegwerf-Repos. Es wird KEIN Quelltext gegreppt — ein grep nach "--force-with-lease"
# belegt nicht, dass der Branch vorankommt.
#
# ZUSICHERUNGEN HAENGEN AN DER SEMANTIK, NICHT AN DER DARSTELLUNG (T002716): verglichen
# werden Commit-SHAs, `git rev-list --count` und Exit-Codes. Kein Test prueft den
# Wortlaut einer Meldung und keiner eine Laufzeit in Sekunden — beides bricht, sobald
# jemand eine Formulierung aendert oder der CI-Runner langsamer ist, und meldete dann
# einen Defekt, den es nicht gibt.
#
# ISOLATION: Alles laeuft gegen $BATS_TEST_TMPDIR — ein bare-Repo als "origin" und ein
# Arbeits-Clone. Kein Factory-Tick wird ausgeloest, der lebende Branch
# chore/mishap-incident-rollup wird nicht angefasst, und kein git-Aufruf liest den
# Branch des laufenden Checkouts (Bedingung aus
# tests/spec/ci-cd/bats-no-live-branch-assertion.bats, T003045).
#
# GEMESSENE AUSGANGSLAGE (2026-08-10): origin/main..origin/chore/mishap-incident-rollup
# trug 38 Commits — 37 davon mit der identischen Generator-Nachricht ueber genau zwei
# Dateien. Jeder Lauf regeneriert tasks.md vollstaendig aus den Container-Kommentaren;
# der jeweils vorige Commit ist im Nachfolger enthalten und traegt keine Information.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  PUBLISH="$REPO_ROOT/scripts/factory/rollup-publish.sh"

  TMP="$BATS_TEST_TMPDIR/fixture"
  ORIGIN="$TMP/origin.git"
  TR="$TMP/work"
  BR="chore/mishap-incident-rollup"
  CHANGE_DIR="openspec/changes/mishap-incident-rollup"
  MSG="chore(plans): update mishap-incident-rollup from container batches [T000000]"

  mkdir -p "$TMP"
  git init -q --bare "$ORIGIN"
  git init -q -b main "$TR"
  git -C "$TR" config user.email "rollup-test@example.invalid"
  git -C "$TR" config user.name  "rollup-test"
  # Fixture-Repo gegen geerbte Hooks abschirmen: eine globale core.hooksPath wuerde
  # sonst die echten Repo-Hooks in dieses Wegwerf-Repo ziehen.
  git -C "$TR" config core.hooksPath /dev/null
  git -C "$TR" remote add origin "$ORIGIN"

  echo "readme" > "$TR/README.md"
  git -C "$TR" add README.md
  git -C "$TR" commit -q -m "base"
  git -C "$TR" push -q -u origin main
  BASE="$(git -C "$TR" rev-parse HEAD)"

  git -C "$TR" checkout -q -b "$BR"
  mkdir -p "$TR/$CHANGE_DIR"
}

# Plan-Inhalt setzen und den Generator-Publish fahren.
run_publish() {
  local content="$1"
  printf '%s\n' "$content" > "$TR/$CHANGE_DIR/tasks.md"
  run bash "$PUBLISH" --repo "$TR" --branch "$BR" --change-dir "$CHANGE_DIR" --message "$MSG"
}

remote_tip() { git -C "$TR" ls-remote "$ORIGIN" "refs/heads/$BR" | cut -f1; }

remote_count() {
  git -C "$TR" fetch -q origin "$BR"
  git -C "$TR" rev-list --count "${BASE}..FETCH_HEAD"
}

@test "T002931: Erstlauf publiziert genau einen Generator-Commit" {
  # Positiv-Anker: das Werkzeug existiert und beantwortet --help. Ohne ihn liefe jede
  # Aussage unten auf einem nie gestarteten Kommando ins Leere.
  run bash "$PUBLISH" --help
  [ "$status" -eq 0 ]
  [ -n "$output" ]

  run_publish "plan v1"
  [ "$status" -eq 0 ]

  [ -n "$(remote_tip)" ] || { echo "origin/$BR wurde nicht angelegt"; false; }
  [ "$(remote_count)" -eq 1 ]
}

@test "T002931: zweiter Lauf rueckt den Tip vor, statt anzuhaengen" {
  run_publish "plan v1"
  [ "$status" -eq 0 ]
  # Positiv-Anker: der erste Lauf hat ueberhaupt einen Remote-Tip gesetzt.
  tip1="$(remote_tip)"
  [ -n "$tip1" ]

  run_publish "plan v2 — andere Batches"
  [ "$status" -eq 0 ]
  tip2="$(remote_tip)"
  [ -n "$tip2" ]

  # Beide Haelften sind noetig. "SHA hat sich bewegt" allein waere auch beim heutigen
  # Anhaengen erfuellt; "Count == 1" allein auch bei einem No-op, der nie publiziert.
  [ "$tip1" != "$tip2" ] || { echo "Remote-Tip unveraendert — der Branch kommt nicht voran"; false; }
  [ "$(remote_count)" -eq 1 ] || {
    echo "Kette waechst: $(remote_count) Commits ueber der Basis statt 1"; false; }
}

@test "T002931: unveraenderter Inhalt ist ein No-op mit Exit 0" {
  run_publish "plan v1"
  [ "$status" -eq 0 ]
  # Positiv-Anker: es gibt einen publizierten Stand, gegen den "unveraendert" ueberhaupt
  # eine Aussage ist.
  tip1="$(remote_tip)"
  [ -n "$tip1" ]

  run_publish "plan v1"
  [ "$status" -eq 0 ]
  [ "$(remote_tip)" = "$tip1" ] || { echo "No-op-Lauf hat den Remote-Tip veraendert"; false; }
}

@test "T002931: ein fremder Commit auf dem Branch wird nicht ueberschrieben" {
  run_publish "plan v1"
  [ "$status" -eq 0 ]

  # Fremdarbeit: aendert eine Datei AUSSERHALB des Change-Verzeichnisses und traegt eine
  # fremde Nachricht. Genau diese Kombination unterscheidet sie vom Generator-Commit.
  echo "implementer work" >> "$TR/README.md"
  git -C "$TR" add README.md
  git -C "$TR" commit -q -m "fix(rollup): Implementer-Arbeit am Container-Plan"
  git -C "$TR" push -q origin "$BR"
  foreign="$(git -C "$TR" rev-parse HEAD)"

  # Positiv-Anker: der fremde Commit ist VOR dem Generator-Lauf vom Remote-Tip erreichbar.
  git -C "$TR" fetch -q origin "$BR"
  run git -C "$TR" merge-base --is-ancestor "$foreign" FETCH_HEAD
  [ "$status" -eq 0 ]

  run_publish "plan v2 — nach Fremdarbeit"
  [ "$status" -eq 0 ]

  git -C "$TR" fetch -q origin "$BR"
  run git -C "$TR" merge-base --is-ancestor "$foreign" FETCH_HEAD
  [ "$status" -eq 0 ] || { echo "Fremder Commit $foreign wurde vom Generator verworfen"; false; }
  [ "$(remote_count)" -eq 2 ] || {
    echo "erwartet: fremd + eigen = 2 Commits, gemessen: $(remote_count)"; false; }
}

@test "T002931: divergierter Remote-Stand blockiert den Push nicht dauerhaft (T002914)" {
  # Erhaelt die Aussage aus T002914 — bisher als Quelltext-grep in
  # container-resolution-and-unattended-worktree.bats:62 formuliert. Die zu schuetzende
  # Eigenschaft ist nicht, dass ein bestimmter String im Skript steht, sondern dass ein
  # Remote-Stand, den der lokale Klon nicht kennt, nicht in einen dauerhaft abgelehnten
  # Push muendet.
  run_publish "plan v1"
  [ "$status" -eq 0 ]
  # Positiv-Anker: der Ausgangs-Push ist durchgelaufen.
  [ -n "$(remote_tip)" ]

  # Zweiter Klon schiebt einen Commit auf denselben Branch — der erste Klon weiss nichts
  # davon. Das ist die Divergenz aus T002914.
  other="$TMP/other"
  git clone -q "$ORIGIN" "$other"
  git -C "$other" config user.email "other@example.invalid"
  git -C "$other" config user.name  "other"
  git -C "$other" config core.hooksPath /dev/null
  git -C "$other" checkout -q "$BR"
  echo "parallel" > "$other/parallel.txt"
  git -C "$other" add parallel.txt
  git -C "$other" commit -q -m "chore: paralleler Lauf"
  git -C "$other" push -q origin "$BR"
  diverged="$(remote_tip)"
  [ -n "$diverged" ]

  run_publish "plan v3 — trotz Divergenz"
  [ "$status" -eq 0 ] || { echo "Publish bleibt bei divergiertem Remote haengen"; false; }
  [ "$(remote_tip)" != "$diverged" ] || {
    echo "Remote-Tip unveraendert — der divergierte Stand hat den Push dauerhaft blockiert"; false; }
}
