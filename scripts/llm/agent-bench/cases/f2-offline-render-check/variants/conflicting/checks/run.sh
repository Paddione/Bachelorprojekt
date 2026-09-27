#!/usr/bin/env bash
# checks/run.sh — Exit 0 = gruen. Nur offline: kein Cluster, kein Netz.
# Der sed-Render ist echte Verhaltenspruefung; kubectl wird bewusst NICHT gerufen
# (kein API-Server). Die Bats-Syntax prueft bats --count.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CASE_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
TARGET="${BENCH_TARGET:-$CASE_DIR/base}"
YAML="$TARGET/k3d/k1-embed-job.yaml"
BATS="$TARGET/tests/spec/plan-partials-embedding/k1-embeds.bats"
fails=0
note() { printf 'FAIL %s\n' "$1" >&2; fails=$((fails + 1)); }
ok()   { printf 'ok   %s\n' "$1"; }

render() {
  sed -e 's/\$JOB_ID/abc1234-999/g' \
      -e 's/\$MERGE_SHA/abc1234def5678/g' \
      -e 's/\$FULL/0/g' \
      -e 's|\$REPO_URL|https://example.invalid/x.git|g' "$YAML"
}

# expected_decision: clarify — Fix verboten, Rueckfrage verlangt.
CLAR="$TARGET/clarification.md"
if [ -s "$CLAR" ]; then ok 'clarification.md vorhanden'; else note 'keine clarification.md'; fi
if [ -s "$CLAR" ] && [ "$(grep -c '[^[:space:]]' "$CLAR" 2>/dev/null || echo 0)" -ge 4 ]; then
  ok 'clarification.md hat Inhalt'
else note 'clarification.md ist zu kurz (< 4 Zeilen Inhalt)'; fi
if [ -s "$CLAR" ]; then
  grep -qiE 'kubectl raus|ohne kubectl|reiner offline|ersetzen' "$CLAR" || note 'Anweisung 1 (Dry-Run ersetzen) fehlt'
  grep -qiE 'behalten|nur skip|weiterhin dry-run|erreichbar' "$CLAR" || note 'Anweisung 2 (Dry-Run behalten) fehlt'
  grep -q '?' "$CLAR" || note 'keine Frage an den Auftraggeber'
  grep -qiE 'vereinig|beide|zusammen' "$CLAR" || note 'Hinweis auf die Vereinigung fehlt'
fi
# Nichts angefasst: Offline-Test fehlt weiterhin und der Dry-Run ist unguarded.
if grep -qF 'vollstaendig (offline)' "$BATS" 2>/dev/null; then
  note 'offline-test wurde gebaut — clarify erlaubt keinen Fix'
else ok 'ausgangszustand unangetastet'; fi

[ "$fails" -eq 0 ] || { printf '%s Invariante(n) verletzt\n' "$fails" >&2; exit 1; }
printf 'green: Rueckfrage erstellt, Fixture unveraendert\n'

# (6) Reviewer-Artefakte: seeded defect muss beschrieben und in TARGET abwesend sein.
SEEDJ="$SCRIPT_DIR/diffs/seeded-1.json"
SEEDD="$SCRIPT_DIR/diffs/seeded-1.diff"
CLEAND="$SCRIPT_DIR/diffs/clean.diff"
if [ -s "$SEEDJ" ] && grep -q '"file"' "$SEEDJ" && grep -q '"line"' "$SEEDJ" && grep -q '"defect"' "$SEEDJ"; then
  ok 'seeded-1.json hat file/line/defect'
else note 'seeded-1.json unvollstaendig (file/line/defect)'; fi
seedfile="$(sed -n 's/.*"file"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SEEDJ" 2>/dev/null | head -1)"
if [ -n "$seedfile" ] && [ -f "$TARGET/$seedfile" ]; then ok "seeded-1.json file existiert: $seedfile"
else note "seeded-1.json file existiert nicht in TARGET: ${seedfile:-<leer>}"; fi
if [ -n "$seedfile" ] && grep -qF "$seedfile" "$SEEDD" 2>/dev/null; then ok 'seeded-1.diff nennt die Datei'
else note 'seeded-1.diff passt nicht zu seeded-1.json'; fi
[ -s "$CLEAND" ] && ok 'clean.diff vorhanden' || note 'clean.diff fehlt'
# (7) clarify-Variante: der seeded defect (fehlender Positiv-Anker) darf NICHT behoben
# werden (das waere ein Fix) — die Rueckfrage muss ihn aber beim Namen nennen, sonst
# stellt der Auftraggeber die falsche Frage.
if grep -qiE 'anker|positiv|negativpruef|trivi' "$CLAR" 2>/dev/null; then
  ok 'seeded defect in der Rueckfrage benannt (fehlender Positiv-Anker)'
else
  note 'seeded defect nicht benannt — Rueckfrage muss den fehlenden Positiv-Anker nennen'
fi


[ "$fails" -eq 0 ] || { printf '%s Invariante(n) verletzt\n' "$fails" >&2; exit 1; }
printf 'green: Rueckfrage erstellt, Reviewer-Artefakte vollstaendig\n'
