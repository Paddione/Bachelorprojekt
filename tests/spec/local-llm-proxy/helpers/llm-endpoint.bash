#!/usr/bin/env bash
# =============================================================================
# Endpunkt-Verfuegbarkeit fuer LLM-Proben (T002574, T002579).
#
# WARUM DIESE DATEI EXISTIERT: der bisherige Skip-Guard lautete
#
#     if ! curl -s --max-time 3 "$URL" -d '…' >/dev/null 2>&1; then skip; fi
#
# und ist in zwei Richtungen falsch. `curl -s` liefert Exit 0, sobald eine
# HTTP-Antwort ankommt — auch bei 500. Ein kaputter Server gilt damit als
# gesund, der Guard feuert NICHT, und die Probe laeuft gegen ihn weiter und
# bewertet Muell als Messergebnis (T002574). Umgekehrt verschluckt
# `2>&1 >/dev/null` jede Diagnose, wenn gar nichts antwortet.
#
# Hier wird deshalb der HTTP-STATUS ausgewertet, nicht der Exit-Code allein.
# =============================================================================

# llm_endpoint_healthy <url> [max_time_seconds]
#
# Rueckgabe 0 nur bei HTTP 2xx. Alles andere — 4xx, 5xx, Verbindungsfehler,
# Timeout — ergibt != 0. Der ermittelte Status geht nach stdout, damit
# Aufrufer ihn in eine Fehlermeldung uebernehmen koennen.
llm_endpoint_healthy() {
  local url="${1:?llm_endpoint_healthy: URL fehlt}"
  local max_time="${2:-5}"
  local code

  # -o /dev/null   : Body verwerfen, nur der Status interessiert
  # -w '%{http_code}': Status auf stdout
  # --max-time     : ein haengender Server darf den Testlauf nicht blockieren
  # Kein --fail: das wuerde zwar bei 4xx/5xx den Exit-Code setzen, aber auch
  # den Statuscode unterdruecken, den wir fuer die Diagnose ausgeben wollen.
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time "$max_time" "$url" 2>/dev/null)

  # Bei Verbindungsfehlern schreibt curl "000".
  case "$code" in
    2??) echo "$code"; return 0 ;;
    *)   echo "${code:-000}"; return 1 ;;
  esac
}
