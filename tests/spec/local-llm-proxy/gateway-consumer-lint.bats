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
  # T900191: einmalig pro Test das echte dev-local/core rendern (P1b liegt vor).
  RENDERED_LLM_SERVICES="$BATS_TEST_TMPDIR/llm-services-rendered.yaml"
  bash "$REPO/scripts/devmesh/render-stack.sh" core > "$RENDERED_LLM_SERVICES" 2>/dev/null || true
  # Ueberwachte Flaeche laut SSOT-Szenario. provider-register-local.sh ist der
  # umbenannte provider-register-bonsai.sh (T002582).
  # T003205: die bge-Konsumenten bge-mcp.service und openspec-embed-local.sh
  # kommen dazu — sie duerfen kein direktes Backend-Port-Literal mehr tragen.
  # T900191/D7: bge-mcp.service ist geloescht — an seine Stelle tritt das unten
  # gerenderte llm-services-Deployment (RENDERED_LLM_SERVICES), damit die
  # ueberwachte Flaeche nicht ersatzlos schrumpft.
  # scripts/llm/loadouts.json ist BEWUSST NICHT dabei: dort stehen die
  # Backend-Adressen bestimmungsgemaess (die Rollen-Ketten referenzieren die
  # Ports), genau wie bei den Registry-Seeds.
  # T900399: die drei Factory-Routing-Flaechen (provider-register-local.sh,
  # route-provider.sh, pipeline.mjs) sind mit dem Factory-Baum entfallen; der
  # Lint deckt jetzt die verbleibenden Gateway-Konsumenten ab.
  SURFACES=(
    ".opencode/agent-models.jsonc"
    "scripts/openspec-embed-local.sh"
  )
  # Nur die Routing-Flaechen: hier entscheidet ein Modellname, wohin ein
  # Request tatsaechlich geht. .opencode/agent-models.jsonc ist bewusst NICHT
  # dabei — das ist ein Auswahlkatalog fuer den opencode-Modellwaehler, keine
  # Route. Ein veralteter Eintrag dort erzeugt einen sichtbaren Fehler bei der
  # Auswahl, nicht die stille Fehlleitung, gegen die dieser Lint gebaut ist.
  # Der Backend-Port-Test unten deckt die Datei weiterhin ab, wie es das
  # SSOT-Szenario verlangt.
  ROUTING_SURFACES=(
    "scripts/openspec-embed-local.sh"
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
  # Das gerenderte Deployment ist kein Repo-Pfad — deshalb eigener Anker:
  # nichtleer heisst, das Rendering hat funktioniert (T002356-M1).
  [ -s "$RENDERED_LLM_SERVICES" ] || missing+=("(render) llm-services-rendered.yaml")
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
    # T003205: 8081/8095/8096 sind die bge-Backend-Ports; die Rollen-Ketten in
    # scripts/llm/loadouts.json sind von dieser Flaeche ausgenommen.
    h="$(_active_lines '127\.0\.0\.1:(8093|1234|8081|8095|8096)|localhost:(8093|1234|8081|8095|8096)' "$REPO/$f")"
    [ -n "$h" ] && hits="${hits}${f}:\n${h}\n"
  done
  # T900191: dieselbe Pruefung auf dem gerenderten llm-services-Deployment —
  # ein zurueckgezogenes Backend-Port-Literal im Deployment-Env faellt sonst
  # durch kein Raster mehr.
  if [ -s "$RENDERED_LLM_SERVICES" ]; then
    h="$(_active_lines '127\.0\.0\.1:(8093|1234|8081|8095|8096)|localhost:(8093|1234|8081|8095|8096)' "$RENDERED_LLM_SERVICES")"
    [ -n "$h" ] && hits="(render) llm-services-rendered.yaml:\n${h}\n"
  else
    skip "render-stack.sh Vorbedingung fehlt"
  fi
  if [ -n "$hits" ]; then
    printf 'Direkte Backend-Ports gefunden (erlaubt nur in Registry-Seeds/Migrationen und in scripts/llm/loadouts.json):\n' >&2
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
