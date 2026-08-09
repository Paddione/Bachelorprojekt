#!/usr/bin/env bats
# tests/spec/openspec-workflow/ticket-file-required.bats
# SSOT: openspec/specs/openspec-workflow.md
#   Requirement "Changes außerhalb des Altbestands tragen eine .ticket-Datei"
#
# Prüfmodus: Querschnittstest gegen den Repository-Zustand (T002448-M4, Ausnahme).
#   Das Ergebnis manifestiert sich ausschliesslich als Dateizustand unter
#   openspec/changes/ — es gibt kein Kommando, dessen Ausgabe geprueft werden koennte.
#   Der Test liest daher das Dateisystem direkt, nicht den Quelltext eines Skripts.
#
# Hintergrund (T002836): /opsx:propose legte bis dahin keine .ticket-Datei an,
# obwohl das Requirement "Propose erstellt vollstaendiges Change-Skeleton" sie
# verlangt. Ohne die Datei laufen apply/archive/validate ins Leere.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  BACKLOG="$BATS_TEST_DIRNAME/t002573-backlog-slugs.txt"
}

# Slugs, die der T002573-Bewertungslauf erfasst hat. Fuer sie gilt das
# evaluation.md-Register, nicht die .ticket-Pflicht dieses Tests.
_is_backlog_slug() {
  grep -qxF "$1" "$BACKLOG"
}

@test "jeder Change ausserhalb des T002573-Altbestands hat eine .ticket-Datei" {
  [ -f "$BACKLOG" ]

  local checked=0 with_ticket=0 missing=0
  for d in "$REPO"/openspec/changes/*/; do
    local slug
    slug="$(basename "$d")"
    [ "$slug" = "archive" ] && continue
    # Der Plan-Change des Bewertungsverfahrens selbst traegt bewusst kein .ticket.
    [ "$slug" = "openspec-ticket-links-evaluation" ] && continue
    _is_backlog_slug "$slug" && continue

    checked=$(( checked + 1 ))
    if [ -f "$d/.ticket" ] && [ -s "$d/.ticket" ]; then
      with_ticket=$(( with_ticket + 1 ))
    else
      echo "FEHLT: Change '$slug' ohne .ticket-Datei" >&3
      missing=$(( missing + 1 ))
    fi
  done

  # Positiv-Anker (T002356-M1): Ohne diese beiden Zusicherungen bestuende der
  # Test vakuos, sobald die Kandidatenliste leer laeuft — "0 fehlende von 0
  # geprueften" waere dann ein gruener Test ohne Aussage.
  echo "Anker: geprueft=$checked mit_ticket=$with_ticket fehlend=$missing" >&3
  [ "$checked" -gt 0 ]
  [ "$with_ticket" -gt 0 ]

  [ "$missing" -eq 0 ]
}

@test "die Altbestands-Sluglist ist nicht leer und deckt bekannte Altlasten ab" {
  [ -f "$BACKLOG" ]
  local count
  count="$(grep -c . "$BACKLOG")"
  [ "$count" -gt 0 ]
  # Zwei Stichproben aus dem T002573-Register — faellt die Liste versehentlich
  # auf einen Teilbestand zusammen, schlaegt das hier auf.
  grep -qxF "admin-fundament-konsolidierung" "$BACKLOG"
  grep -qxF "wakeup-dispatcher-bridge-wiring" "$BACKLOG"
}
