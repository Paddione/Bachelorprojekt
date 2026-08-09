#!/usr/bin/env bash
# scripts/lib/branch-allowlist.sh — SSOT fuer Branches ohne Ticket-ID-Pflicht [T002817]
#
# Diese Datei wird ausschliesslich GESOURCT, nie ausgefuehrt. Konsumenten:
#   .githooks/pre-commit        — blockierender Branch-Naming-Guard
#   .githooks/pre-push          — advisory Branch-Naming-Warnung
#   scripts/worktree-create.sh  — --unattended-Modus
#
# WARUM EINE QUELLE: bis T002817 fuehrte jeder der drei Guards seine eigene Liste.
# scripts/worktree-create.sh erlaubte chore/mishap-incident-rollup, .githooks/pre-commit
# blockierte ihn — der Branch war anlegbar, aber nicht committebar, und die gesamte
# Mishap-Auswertung lief ins Leere. Der Drift-Guard aus T002470 fand das nicht: er
# verglich Ticket-ID-Regex, Exemption-Liste und Typ-Praefixe, aber nicht die erst mit
# T002783 hinzugekommene --unattended-Allowlist. Eine duplizierte Regel ist nur so
# vollstaendig abgesichert wie die Aufzaehlung ihrer Drift-Tests gepflegt wird.
#
# WARUM EXAKTER VERGLEICH: ein Glob wie chore/mishap-* wuerde bei einem Tippfehler eine
# ganze Praefix-Klasse von der Ticket-Pflicht befreien, ohne dass es auffaellt. Die Liste
# ist kurz und aendert sich selten; exakte Namen koennen nicht ueberschiessen.
#
# DEGRADATION: die Konsumenten sourcen bedingt und pruefen die Funktion per `command -v`.
# Fehlt diese Datei, ist die Ausnahmeliste leer und jeder Guard verhaelt sich wie vor
# ihrer Einfuehrung — ein fehlendes SSOT kann damit hoechstens einen erlaubten Branch
# blockieren, nie einen unerlaubten durchlassen.

# Space-separierte Liste EXAKTER Branch-Namen. Eintraege sind persistente Branches, die
# per Konstruktion kein Ticket tragen koennen.
#
#   chore/mishap-incident-rollup — Sammel-Branch des Mishap-Rollups. Wird nie geloescht,
#     das Container-Ticket bleibt dauerhaft offen; festgeschrieben in
#     .claude/skills/mishap-tracker/SKILL.md.
TICKETLESS_BRANCHES="chore/mishap-incident-rollup"

# branch_is_ticketless <branch-name>
#   0 = Branch ist von der Ticket-ID-Pflicht befreit
#   1 = Branch ist es nicht (auch bei leerem Argument)
branch_is_ticketless() {
  [ -n "${1:-}" ] || return 1
  local _candidate
  for _candidate in ${TICKETLESS_BRANCHES:-}; do
    [ "$1" = "$_candidate" ] && return 0
  done
  return 1
}

# Beim Sourcen unter `set -e` darf die letzte Anweisung nicht falsch sein.
return 0 2>/dev/null || true
