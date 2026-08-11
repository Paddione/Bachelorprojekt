#!/usr/bin/env bats
# tests/spec/repo-hygiene/signal-gaps.bats
# SSOT: openspec/specs/agent-skills.md — repo-hygiene-Runbook
#
# Tickets T002821, T002822, T002823, T002844, T002847. Alle fünf sind Instanzen EINER
# Fehlerklasse: ein Signal meldet Gesundheit, ohne das Attestierte geprüft zu haben.
# Der Guard sichert, dass das Runbook diese Klasse als Regel führt — nicht als fünf
# unverbundene Sonderfälle.
#
# Prüfmodus: **Quelltext-Prüfung (grep)** — ausdrückliche Ausnahme der Konvention
# T002448-M4 für Querschnittstests, deren Ergebnis sich ausschliesslich im Quelltext
# manifestiert. Der Gegenstand IST hier der Text: eine Doku-Regel hat kein Laufzeit-
# verhalten, das sich ausführen liesse. Geprüft werden Vorkommen und Reihenfolge im
# Runbook, nicht das Ausgabeformat irgendeines Werkzeugs (T002716).
#
# Jeder Block belegt ZUERST, dass sein Bezugspunkt existiert (Positiv-Anker, T002356-M1),
# und prüft DANN die eigentliche Aussage.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  OPS="${REPO_ROOT}/.claude/skills/references/repo-hygiene-ops.md"
}

# Schneidet einen `## `-Abschnitt aus dem Runbook heraus, damit Aussagen im richtigen
# Abschnitt landen statt irgendwo in der Datei.
_section() {
  awk -v pat="$1" '
    $0 ~ pat { inside = 1; next }
    inside && /^## / { inside = 0 }
    inside { print }
  ' "$OPS"
}

@test "T002821: §3 führt die Signallücken als Regel, nicht als Einzelfälle" {
  [ -f "$OPS" ]

  # Positiv-Anker: §3 existiert überhaupt und hat Inhalt. Ohne ihn wären alle
  # Aussagen unten über einem leeren Ausschnitt vakuos wahr.
  local sec
  sec="$(_section '^## 3[.]')"
  [ -n "$sec" ]

  # Die Regel selbst ist benannt.
  printf '%s' "$sec" | grep -qF 'kein Urteil'

  # Und sie ist mit allen fünf Fundstellen belegt — nicht nur mit der ältesten.
  local t
  for t in T002821 T002822 T002823 T002847 T002844; do
    printf '%s' "$sec" | grep -qF "$t" || {
      echo "Fundstelle $t fehlt in §3" >&2
      return 1
    }
  done
}

@test "T002821: leeres statusCheckRollup verlangt die Gegenprobe über gh run list" {
  local sec
  sec="$(_section '^## 3[.]')"
  [ -n "$sec" ]

  # Positiv-Anker: §3 spricht überhaupt über die Checkliste.
  printf '%s' "$sec" | grep -qF 'statusCheckRollup'

  # Aussage: die Gegenprobe gegen die tatsächlich gelaufenen Runs ist dokumentiert.
  printf '%s' "$sec" | grep -qF 'gh run list'
}

@test "T002822: leere Checkliste wird gegen den Konfliktfall abgegrenzt" {
  local sec
  sec="$(_section '^## 3[.]')"
  [ -n "$sec" ]

  # Positiv-Anker: der Befund ist verortet.
  printf '%s' "$sec" | grep -qF 'T002822'

  # Aussage: beide Trennschritte stehen da — Zustand lesen UND lokal probe-mergen.
  printf '%s' "$sec" | grep -qF 'mergeStateStatus'
  printf '%s' "$sec" | grep -qF -e '--diff-filter=U'
}

@test "T002823: der Phantomkonflikt-Hinweis steht VOR dem update-branch-Rezept" {
  # [T003796] `update-branch` kommt im Dokument 6x vor — ein unverwandter Treffer
  # oberhalb des T002823-Abschnitts würde das dokumentweite head -1 auf die falsche
  # Zeile lenken (T003104). Das Rezept wird deshalb erst NACH dem Hinweis gesucht.
  local warn_ln update_ln
  warn_ln="$(grep -n 'T002823' "$OPS" | head -1 | cut -d: -f1)"
  [ -n "$warn_ln" ]

  # Aussage: die Einschränkung kommt vor dem Rezept. Stünde sie danach, läse sich
  # update-branch weiter als der Weg — genau die Fehldiagnose aus T002823.
  update_ln="$(awk -v w="$warn_ln" 'NR > w && /update-branch/ { print NR; exit }' "$OPS")"
  [ -n "$update_ln" ]
  [ "$warn_ln" -lt "$update_ln" ]
}

@test "T002847: Probe-Schleifen dürfen stderr nicht unterdrücken" {
  local sec
  sec="$(_section '^## 3[.]')"
  [ -n "$sec" ]

  # Positiv-Anker: der Befund ist verortet.
  printf '%s' "$sec" | grep -qF 'T002847'

  # Aussage: beide Teilregeln sind benannt — stderr sichtbar UND Exit-Code getrennt
  # von der Pipeline. Nur eine von beiden liesse die Fehlmessung bestehen.
  printf '%s' "$sec" | grep -qF 'stderr'
  printf '%s' "$sec" | grep -qiE 'exit-code|PIPESTATUS|pipefail'
}

@test "T002844: der Dedupe-Guard in §4 nennt den Mishap-Buffer als zweite Quelle" {
  local sec
  sec="$(_section '^## 4[.]')"
  [ -n "$sec" ]

  # Positiv-Anker: der Guard aus T001210 steht weiterhin in §4.
  printf '%s' "$sec" | grep -qF 'T001210'

  # Aussage: die zweite Quelle ist benannt, samt Fundstelle.
  printf '%s' "$sec" | grep -qF 'mishap-buffer'
  printf '%s' "$sec" | grep -qF 'T002844'
}
