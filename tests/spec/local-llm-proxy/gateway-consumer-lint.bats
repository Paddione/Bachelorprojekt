#!/usr/bin/env bats
# T002582 — der in openspec/specs/local-llm-proxy.md zugesagte statische Lint.
#
# Die SSOT beschreibt unter "Static config lint blocks backend-port bypasses"
# eine ueberwachte Flaeche von Gateway-Konsumenten, in der kein direktes
# Backend-Port-Literal stehen darf. Dieses Szenario war nie implementiert: der
# einzige :8093-Test in tests/spec/local-llm-proxy.bats prueft die AUSGABE von
# route-provider.sh, nicht den Inhalt der Dateien. provider-register-bonsai.sh
# trug dadurch vier :8093-Literale, die niemand abfing — und :8093 serviert seit
# T002551 den bge-Reranker, nicht mehr ein Chat-Modell. Eine Registrierung von
# dort haette Implement/Review auf einen Reranker geleitet.
#
# Zweiter Teil: zurueckgezogene Modell-IDs. 'ternary-bonsai-27b' und
# 'gemma-4-12b' werden von keinem Backend mehr serviert (belegt durch
# scripts/llm/routing-check.sh am 2026-08-02, 6x FEHLT). Sie duerfen in keiner
# Konfigurationsflaeche mehr als aktiver Wert auftauchen.
#
# Pruefmodus (T002448-M4): Quelltext-Lint. Das ist hier der dokumentierte
# Ausnahmefall — der Pruefgegenstand IST der Dateiinhalt der Konfiguration,
# nicht das Laufzeitverhalten eines Kommandos. Das Laufzeitverhalten deckt
# scripts/llm/routing-check.sh ab, das ein laufendes Backend braucht und
# deshalb nicht in CI laufen kann.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  # Ueberwachte Flaeche laut SSOT-Szenario. provider-register-local.sh ist der
  # umbenannte provider-register-bonsai.sh (T002582).
  SURFACES=(
    ".opencode/agent-models.jsonc"
    "scripts/factory/provider-register-local.sh"
    "scripts/factory/route-provider.sh"
    "scripts/factory/pipeline.mjs"
  )
  # Nur die Routing-Flaechen: hier entscheidet ein Modellname, wohin ein
  # Request tatsaechlich geht. .opencode/agent-models.jsonc ist bewusst NICHT
  # dabei — das ist ein Auswahlkatalog fuer den opencode-Modellwaehler, keine
  # Route. Ein veralteter Eintrag dort erzeugt einen sichtbaren Fehler bei der
  # Auswahl, nicht die stille Fehlleitung, gegen die dieser Lint gebaut ist.
  # Der Backend-Port-Test unten deckt die Datei weiterhin ab, wie es das
  # SSOT-Szenario verlangt.
  ROUTING_SURFACES=(
    "scripts/factory/provider-register-local.sh"
    "scripts/factory/route-provider.sh"
    "scripts/factory/pipeline.mjs"
  )
}

# Eine Zeile, deren erstes nicht-leeres Zeichen '#' oder '//' ist, dokumentiert
# Historie und darf einen zurueckgezogenen Namen oder Port weiterhin nennen —
# genau diese Kommentare sind der Grund, warum die Drift nachvollziehbar bleibt.
_active_lines() { grep -nE "$1" "$2" | grep -vE '^[0-9]+:[[:space:]]*(#|//)' || true; }

# Positiv-Anker (Pflicht nach T002356-M1): ohne ihn waeren die Negativtests
# unten auch dann gruen, wenn saemtliche Flaechen-Dateien fehlten und die
# Kandidatenmenge leer bliebe.
@test "T002582: jede ueberwachte Gateway-Konsumenten-Datei existiert (Anker)" {
  local missing=()
  for f in "${SURFACES[@]}"; do
    [ -e "$REPO/$f" ] || missing+=("$f")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    echo "Fehlende Flaechen-Dateien: ${missing[*]}" >&2
    echo "Entweder wurde eine Datei umbenannt/geloescht, ohne SURFACES hier und" >&2
    echo "das Szenario in openspec/specs/local-llm-proxy.md nachzuziehen." >&2
    return 1
  fi
}

@test "T002582: keine direkten Backend-Port-Literale in den Gateway-Konsumenten" {
  local hits=""
  for f in "${SURFACES[@]}"; do
    [ -e "$REPO/$f" ] || continue
    local h
    h="$(_active_lines '127\.0\.0\.1:(8093|1234)|localhost:(8093|1234)' "$REPO/$f")"
    [ -n "$h" ] && hits="${hits}${f}:\n${h}\n"
  done
  if [ -n "$hits" ]; then
    printf 'Direkte Backend-Ports gefunden (erlaubt nur in Registry-Seeds/Migrationen):\n' >&2
    printf "$hits" >&2
    return 1
  fi
}

@test "T002582: keine zurueckgezogenen Modell-IDs in den Routing-Flaechen" {
  local hits=""
  for f in "${ROUTING_SURFACES[@]}"; do
    [ -e "$REPO/$f" ] || continue
    local h
    h="$(_active_lines 'ternary-bonsai-27b|gemma-4-12b' "$REPO/$f")"
    [ -n "$h" ] && hits="${hits}${f}:\n${h}\n"
  done
  if [ -n "$hits" ]; then
    printf 'Zurueckgezogene Modell-IDs als aktiver Wert (kein Backend serviert sie):\n' >&2
    printf "$hits" >&2
    printf 'Aktuell ist gemma26-factory ueber das Gateway http://127.0.0.1:18235.\n' >&2
    return 1
  fi
}

@test "T002582: Taskfile.llm.yml verweist auf kein fehlendes Startskript" {
  local missing=""
  while read -r ref; do
    [ -n "$ref" ] || continue
    [ -e "$REPO/$ref" ] || missing="${missing}${ref}\n"
  done < <(grep -vE '^[[:space:]]*#' "$REPO/taskfiles/Taskfile.llm.yml" \
             | grep -oE 'scripts/llm/[A-Za-z0-9_.-]+\.ps1' | sort -u)
  if [ -n "$missing" ]; then
    printf 'Taskfile.llm.yml nennt nicht vorhandene Skripte:\n' >&2
    printf "$missing" >&2
    return 1
  fi
}
