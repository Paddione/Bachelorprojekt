#!/usr/bin/env bats
# tests/spec/agent-skills/messung-mit-befehl.bats [T002717]
#
# PRUEFMODUS: Source-Grep (Ausnahme, wie in CLAUDE.md "Test-Resultats-Konvention"
# [T002448-M4] fuer Dokumentationskonventionen ausdruecklich vorgesehen). Der
# geprueften Sache — einem redaktionellen Abschnitt in CLAUDE.md — fehlt jedes
# Laufzeitverhalten; ihr Ergebnis manifestiert sich ausschliesslich im Text selbst.
#
# WAS DIESER GUARD LEISTET UND WAS NICHT: Er sichert die *Existenz* der Konvention
# gegen Drift. Er kann NICHT pruefen, ob sie befolgt wird — "ist diese Zahl
# reproduzierbar?" ist zum Lesezeitpunkt nicht entscheidbar, weil dazu der
# Repo-Stand des Messzeitpunkts noetig waere (Begruendung: proposal.md des Change
# ticket-messung-mit-befehl).
#
# HINTERGRUND (T002717): T002700 stellte einen Vorgang mit dem Kostenargument
# "rund 23 lebende Dateien" zurueck; die Nachmessung ergab 149 Vorkommen in 63
# Dateien. Das Ticket nannte Datum, Match-Modus und Ausschlussverzeichnisse, aber
# nicht das Suchmuster — und war damit nicht rekonstruierbar.
#
# POSITIV-ANKER [T002356-M1]: Jeder Test prueft zuerst, dass CLAUDE.md existiert
# und den Abschnitt traegt, bevor er inhaltliche Aussagen macht. Ohne den Anker
# wuerde ein fehlendes oder leeres CLAUDE.md die Suchen trivial bestehen lassen.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  CLAUDE_MD="$REPO_ROOT/CLAUDE.md"
  HEADING='### Mess-Konvention'
}

# Gibt den Abschnitt von seiner Ueberschrift bis zur naechsten H3/H2 aus.
_section() {
  awk '/^### Mess-Konvention/{f=1} f&&/^#{2,3} /&&!/^### Mess-Konvention/{if(n++)exit} f' "$CLAUDE_MD"
}

@test "T002717: CLAUDE.md traegt einen Abschnitt zur Mess-Konvention" {
  # Positiv-Anker: Datei da und nicht leer, bevor irgendetwas gesucht wird.
  [ -f "$CLAUDE_MD" ]
  [ -s "$CLAUDE_MD" ]
  grep -q "^${HEADING}" "$CLAUDE_MD"
}

@test "T002717: die Mess-Konvention verlangt den ausfuehrbaren Befehl" {
  [ -f "$CLAUDE_MD" ]
  grep -q "^${HEADING}" "$CLAUDE_MD"
  run _section
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  echo "$output" | grep -qiF 'Befehl'
}

@test "T002717: die Mess-Konvention benennt das Suchmuster als die entscheidende Auslassung" {
  [ -f "$CLAUDE_MD" ]
  grep -q "^${HEADING}" "$CLAUDE_MD"
  run _section
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  echo "$output" | grep -qiF 'Suchmuster'
}

@test "T002717: die Mess-Konvention deklariert sich als redaktionell, nicht als Guard" {
  [ -f "$CLAUDE_MD" ]
  grep -q "^${HEADING}" "$CLAUDE_MD"
  run _section
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  echo "$output" | grep -qiF 'Redaktioneller Hinweis'
}

@test "T002717: die Mess-Konvention traegt ihre Ticket-Referenz" {
  [ -f "$CLAUDE_MD" ]
  grep -q "^${HEADING}" "$CLAUDE_MD"
  run _section
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  echo "$output" | grep -qF 'T002717'
}
