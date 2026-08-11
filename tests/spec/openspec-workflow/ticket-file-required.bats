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
#
# Scoping (T002934): Auf einem PR-Branch wird nur der gegen origin/main
# geaenderte Change-Bestand geprueft, nicht der Gesamtbestand. Fehlt eine
# .ticket-Datei auf main, faerbte das sonst JEDEN offenen PR rot — auch solche,
# die OpenSpec nicht beruehren (belegt 2026-08-09: zwei fehlende Dateien
# faerbten #3963, #3961 und #3957). Auf main selbst (HEAD == origin/main, kein
# Diff) wird weiterhin der Vollbestand geprueft — der Merge-Gate-Wert bleibt
# erhalten.

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

  # Scoping (T002934): auf main selbst (HEAD == origin/main, kein Diff) wird
  # der Vollbestand geprueft. Auf einem PR-Branch nur die gegen origin/main
  # geaenderten Change-Verzeichnisse — eine Luecke auf main faerbt keinen PR,
  # der OpenSpec nicht beruehrt. Ohne origin/main-Ref (z.B. reiner
  # main-Checkout) Vollbestand annehmen.
  local on_main=1
  if git rev-parse --verify -q origin/main >/dev/null 2>&1; then
    if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
      on_main=0
    fi
  fi

  local checked=0 with_ticket=0 missing=0
  local slug
  if [ "$on_main" -eq 1 ]; then
    for d in "$REPO"/openspec/changes/*/; do
      [ -d "$d" ] || continue
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
  else
    # PR-Branch: nur die im Branch geaenderten Change-Verzeichnisse.
    while IFS= read -r slug; do
      [ -n "$slug" ] || continue
      # Altbestands-/Ausnahme-Slugs gelten auch hier als befreit — sie sind
      # kein Regelverstoss, nur weil ein PR sie beruehrt.
      [ "$slug" = "archive" ] && continue
      [ "$slug" = "openspec-ticket-links-evaluation" ] && continue
      _is_backlog_slug "$slug" && continue

      checked=$(( checked + 1 ))
      if [ -f "$REPO/openspec/changes/$slug/.ticket" ] && [ -s "$REPO/openspec/changes/$slug/.ticket" ]; then
        with_ticket=$(( with_ticket + 1 ))
      else
        echo "FEHLT: Change '$slug' ohne .ticket-Datei" >&3
        missing=$(( missing + 1 ))
      fi
    done < <(git diff --name-only origin/main...HEAD -- openspec/changes \
      | sed -n 's#^openspec/changes/\([^/]*\)/.*#\1#p' | sort -u)
  fi

  # Positiv-Anker (T002356-M1): Ohne diese beiden Zusicherungen bestuende der
  # Test vakuos, sobald die Kandidatenliste leer laeuft — "0 fehlende von 0
  # geprueften" waere dann ein gruener Test ohne Aussage. Auf dem PR-Pfad darf
  # die Liste leer sein (PR ohne OpenSpec-Beruehrung) — das ist das Scoping
  # selbst (T002934).
  echo "Anker: geprueft=$checked mit_ticket=$with_ticket fehlend=$missing" >&3
  if [ "$on_main" -eq 1 ]; then
    [ "$checked" -gt 0 ]
    [ "$with_ticket" -gt 0 ]
  fi

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
