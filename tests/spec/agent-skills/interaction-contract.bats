#!/usr/bin/env bats
# tests/spec/agent-skills/interaction-contract.bats [T900235]
#
# PRUEFMODUS: Source-Grep (Ausnahme, wie in CLAUDE.md "Test-Resultats-Konvention"
# [T002448-M4] fuer Dokumentationskonventionen ausdruecklich vorgesehen). Der
# geprueften Sache — dem Interaktionsvertrag in AGENTS.md — fehlt jedes
# Laufzeitverhalten; sie wirkt ausschliesslich dadurch, dass Agenten den Text
# lesen. Ihr Ergebnis manifestiert sich deshalb nur im Text selbst.
#
# WAS DIESER GUARD LEISTET UND WAS NICHT: Er sichert, dass der Vertrag existiert
# und dass die abgeschafften Footer-Felder nicht zurueckkehren. Er kann NICHT
# pruefen, ob Agenten sich daran halten — das ist zum Lesezeitpunkt nicht
# entscheidbar.
#
# HINTERGRUND (T900235): AGENTS.md trug seit 7a213f4a7 (T016441) einen
# "## Status Protocol"-Abschnitt mit den Footer-Feldern NEXT und CONF sowie der
# Regel "You override with one word". Der Agent ermittelte damit den naechsten
# Schritt, schlug ihn vor und gab die Kontrolle zurueck — statt ihn auszufuehren.
# Jeder Auftrag zerfiel so in eine Kette von Bestaetigungsrunden. Die Regel war
# weder spezifiziert noch abgesichert; dieser Guard schliesst die Luecke fuer den
# Nachfolger.
#
# POSITIV-ANKER [T002356-M1]: Jeder Test prueft zuerst, dass AGENTS.md existiert,
# nicht leer ist und die Vertragsueberschrift traegt, bevor er inhaltliche
# Aussagen macht. Ohne den Anker wuerde eine geloeschte oder leere Datei jede
# Negativ-Suche (kein NEXT:, kein CONF:) trivial bestehen lassen.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  AGENTS_MD="$REPO_ROOT/AGENTS.md"
  CLAUDE_MD="$REPO_ROOT/CLAUDE.md"
  HEADING='## Interaction Contract'
}

# Gibt den Abschnitt von seiner Ueberschrift bis zur naechsten H2 aus.
_section() {
  awk '/^## Interaction Contract/{f=1} f&&/^## /&&!/^## Interaction Contract/{exit} f' "$AGENTS_MD"
}

# Positiv-Anker — von jedem Test als erstes aufgerufen.
_anchor() {
  [ -f "$AGENTS_MD" ]
  [ -s "$AGENTS_MD" ]
  grep -q "^${HEADING}" "$AGENTS_MD"
}

@test "T900235: AGENTS.md traegt den Abschnitt Interaction Contract" {
  _anchor
}

@test "T900235: das abgeloeste Status Protocol ist aus AGENTS.md verschwunden" {
  _anchor
  run grep -n '^## Status Protocol' "$AGENTS_MD"
  [ "$status" -ne 0 ]
}

@test "T900235: der Vertrag traegt kein NEXT- und kein CONF-Footer-Feld" {
  _anchor
  # Positiv-Anker: der Abschnitt ist nicht leer, sonst bestuenden die
  # Negativ-Aussagen unten vakuos.
  section="$(_section)"
  [ -n "$section" ]
  # Die Felder werden als Footer-Zeilen 'NEXT:' / 'CONF:' geschrieben. Ein
  # erklaerender Fliesstext darf die Namen nennen (er begruendet ihren Wegfall),
  # die Feld-Schreibweise mit Doppelpunkt darf nicht vorkommen.
  # Keine nackte '!'-Pipeline (tests/CLAUDE.md) — Treffer einsammeln, dann leer pruefen.
  hits="$(grep -nE '(^|[^A-Za-z`])(NEXT|CONF):' "$AGENTS_MD" || true)"
  [ -z "$hits" ] || {
    echo "Fehlerhafte NEXT:/CONF:-Felder:"; echo "$hits"
    false
  }
}

@test "T900235: der Vertrag behaelt die drei Footer-Felder STATUS, RUNNING, BLOCKED" {
  _anchor
  run _section
  [ "$status" -eq 0 ]
  echo "$output" | grep -qF 'STATUS:'
  echo "$output" | grep -qF 'RUNNING:'
  echo "$output" | grep -qF 'BLOCKED:'
}

@test "T900235: der Vertrag benennt die Autonomiegrenze in beiden Richtungen" {
  _anchor
  run _section
  [ "$status" -eq 0 ]
  # Untergrenze: der Auftrag wird zu Ende gefuehrt.
  echo "$output" | grep -qF 'logical completion'
  # Obergrenze: ohne Auftrag wird nichts Neues begonnen.
  echo "$output" | grep -qF 'without being asked'
}

@test "T900235: der Vertrag enumeriert alle vier Stop-Trigger" {
  _anchor
  run _section
  [ "$status" -eq 0 ]
  echo "$output" | grep -qF 'Destructive or irreversible'
  echo "$output" | grep -qF 'Genuine fork'
  echo "$output" | grep -qF 'Blocked'
  echo "$output" | grep -qF 'Cost above threshold'
}

@test "T900235: der Vertrag verweist auf die Eskalation, statt sie zu duplizieren" {
  _anchor
  section="$(_section)"
  # Positiv-Anker: der Verweis ist da, bevor die Duplikat-Aussage geprueft wird.
  printf '%s\n' "$section" | grep -qF '.claude/lib/behaviors/escalation-protocol.md'
  # Die Eskalations-Mechanik bleibt in der referenzierten Datei.
  hits="$(printf '%s\n' "$section" | grep -nF 'agent-escalate.sh' || true)"
  [ -z "$hits" ] || {
    echo "Fehlerhafter Verweis auf Skript:"; echo "$hits"
    false
  }
}

@test "T900235: der Vertrag verlangt eine tastaturwaehlbare Frageform" {
  _anchor
  run _section
  [ "$status" -eq 0 ]
  echo "$output" | grep -qF 'AskUserQuestion'
  echo "$output" | grep -qF 'keystroke'
  echo "$output" | grep -qiF 'numbered'
}

@test "T900235: CLAUDE.md verweist auf den Vertrag in AGENTS.md" {
  _anchor
  # Positiv-Anker fuer die zweite Datei.
  [ -f "$CLAUDE_MD" ]
  [ -s "$CLAUDE_MD" ]
  # Claude Code laedt CLAUDE.md und erreicht AGENTS.md nur ueber einen Verweis.
  run grep -n 'Interaction Contract' "$CLAUDE_MD"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qF 'AGENTS.md'
}
