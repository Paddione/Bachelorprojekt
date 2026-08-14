#!/usr/bin/env bats
#
# SSOT: openspec/specs/mishap-rollup.md
# Ticket: T004898 — Rollup-Zyklus: der Publisher pusht pro Zyklus normal auf den
#         Zyklus-Branch; Amend-/Force-/Rebase-Maschinerie ist entfallen.
#
# PRUEFMODUS: Command-Output-Verifikation (CLAUDE.md, T002448-M4). Jeder Test FUEHRT
# scripts/factory/rollup-publish.sh AUS und misst Exit-Code, Remote-Tip, Commit-Zahl
# und Reflog-Markierungen eines Wegwerf-Repos. Es wird KEIN Quelltext gegreppt — ein
# grep nach "--force-with-lease" belegt nicht, dass der Push normal laeuft.
#
# ZUSICHERUNGEN HAENGEN AN DER SEMANTIK, NICHT AN DER DARSTELLUNG (T002716):
# verglichen werden Commit-SHAs, `git rev-list --count`, die Reflog-Markierung
# "(forced update)" und Exit-Codes. Kein Test prueft den Wortlaut einer Meldung
# und keiner eine Laufzeit in Sekunden.
#
# ISOLATION: Alles laeuft gegen $BATS_TEST_TMPDIR — ein bare-Repo als "origin" und
# ein Arbeits-Clone. Kein Factory-Tick wird ausgeloest, kein lebender Branch wird
# angefasst, und kein git-Aufruf liest den Branch des laufenden Checkouts (Bedingung
# aus tests/spec/ci-cd/bats-no-live-branch-assertion.bats, T003045).
#
# ABLOESUNG: rollup-branch-progress.bats (T002931) pinnte den Amend-Modus
# ("Kette bleibt bei Laenge 1"). Mit dem ephemeren Zyklus-Lebenszyklus [T004898]
# entfaellt das Amend ersatzlos: der Publisher haengt pro Zyklus einen normalen
# Commit an und pusht ohne Force. Geprueft wird der normale Push: der Remote-Tip
# bewegt sich durch einen Append, kein Reflog-Eintrag der Remote-Tracking-Ref ist
# als forced update markiert, und Fremd-Commits bleiben unangetastet.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  PUBLISH="$REPO_ROOT/scripts/factory/rollup-publish.sh"

  TMP="$BATS_TEST_TMPDIR/fixture"
  ORIGIN="$TMP/origin.git"
  TR="$TMP/work"
  BR="chore/mishap-incident-rollup-2026-08-14-T009999"
  CHANGE_DIR="openspec/changes/mishap-incident-rollup-2026-08-14-T009999"
  MSG="chore(plans): update mishap-incident-rollup-2026-08-14-T009999 from container batches [T009999]"

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

# Plan-Inhalt setzen und den Rollup-Publish fahren.
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

@test "T004898: Erstlauf publiziert genau einen Generator-Commit" {
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

@test "T004898: zweiter Lauf haengt normal an — kein Force, kein Amend" {
  run_publish "plan v1"
  [ "$status" -eq 0 ]
  # Positiv-Anker: der erste Lauf hat ueberhaupt einen Remote-Tip gesetzt.
  tip1="$(remote_tip)"
  [ -n "$tip1" ]

  run_publish "plan v2 — andere Batches"
  [ "$status" -eq 0 ]
  tip2="$(remote_tip)"
  [ -n "$tip2" ]

  # Beide Haelfte sind noetig. "SHA hat sich bewegt" allein waere auch beim
  # amendierenden Publisher erfuellt; "Count == 2" allein auch, wenn der Tip
  # auf einer divergierenden Basis stuecke. Der normale Append-Push erzeugt
  # genau zwei Commits ueber der Basis — der Amend-Modus (T002931) haette eins
  # gelassen.
  [ "$tip1" != "$tip2" ] || { echo "Remote-Tip unveraendert — der Branch kommt nicht voran"; false; }
  [ "$(remote_count)" -eq 2 ] || {
    echo "erwartet 2 Commits (normaler Append), gemessen: $(remote_count)"; false; }

  # Positiv-Anker vor der Negativ-Aussage (T002356-M1): die Remote-Tracking-Ref
  # hat ueberhaupt Reflog-Eintraege — sonst waere "kein forced update" vakuos.
  reflog_lines="$(git -C "$TR" reflog show "origin/$BR" 2>/dev/null | wc -l)"
  [ "$reflog_lines" -ge 1 ] || { echo "keine Reflog-Eintraege fuer origin/$BR"; false; }

  # Negativ-Aussage: KEIN Reflog-Eintrag ist als forced update markiert — der
  # Push lief ohne --force/--force-with-lease. Genau diese Markierung haette der
  # alte Amend-Push (T002931) hinterlassen.
  forced="$(git -C "$TR" reflog show "origin/$BR" 2>/dev/null | grep -c "(forced update)" || true)"
  [ "$forced" -eq 0 ] || { echo "Reflog zeigt einen forced update: $forced Eintraege"; false; }
}

@test "T004898: ein fremder Commit auf dem Branch wird nicht angetastet" {
  # Aufbau (fremd + eigen = 2 Commits): der fremde Commit ist der ERSTE Commit auf
  # dem Branch — direkt auf der Basis.
  echo "implementer work" >> "$TR/README.md"
  git -C "$TR" add README.md
  git -C "$TR" commit -q -m "fix(rollup): Implementer-Arbeit am Container-Plan"
  git -C "$TR" push -q origin "$BR"
  foreign="$(git -C "$TR" rev-parse HEAD)"

  # Positiv-Anker: der fremde Commit ist VOR dem Generator-Lauf vom Remote-Tip
  # erreichbar.
  git -C "$TR" fetch -q origin "$BR"
  run git -C "$TR" merge-base --is-ancestor "$foreign" FETCH_HEAD
  [ "$status" -eq 0 ]

  run_publish "plan v2 — nach Fremdarbeit"
  [ "$status" -eq 0 ]

  git -C "$TR" fetch -q origin "$BR"
  run git -C "$TR" merge-base --is-ancestor "$foreign" FETCH_HEAD
  [ "$status" -eq 0 ] || { echo "Fremder Commit $foreign wurde vom Generator verworfen"; false; }
  # Die fremde Datei steht weiterhin im Remote-Tree (kein Rebuild, der sie als
  # Deletion mitgenommen haette).
  run git -C "$TR" show "FETCH_HEAD:README.md"
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep -c "implementer work")" -eq 1 ]
  [ "$(remote_count)" -eq 2 ] || {
    echo "erwartet: fremd + eigen = 2 Commits, gemessen: $(remote_count)"; false; }
}

@test "T004898: unveraenderter Inhalt ist ein No-op mit Exit 0" {
  run_publish "plan v1"
  [ "$status" -eq 0 ]
  # Positiv-Anker: es gibt einen publizierten Stand, gegen den "unveraendert"
  # ueberhaupt eine Aussage ist.
  tip1="$(remote_tip)"
  [ -n "$tip1" ]

  run_publish "plan v1"
  [ "$status" -eq 0 ]
  [ "$(remote_tip)" = "$tip1" ] || { echo "No-op-Lauf hat den Remote-Tip veraendert"; false; }
}
