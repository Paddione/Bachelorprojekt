#!/usr/bin/env bash
# scripts/lib/render-subst-list.sh — envsubst-Whitelist fuer den Fleet-Renderer.
#
# T901791: render_component (scripts/flux-render-artifact.sh) hat ALLE ${VAR}
# aus dem kustomize-Output substituiert — darunter fremde Platzhalter
# (Grafana ${datasource} x500 u.a.), die mangels Umgebungs-Wert zu "" wurden.
# Der Leftover-Check sieht das nicht (Substitution HAT stattgefunden).
#
# Regel (D1, User-Entscheid): substituiert wird nur
#   extrahiert ∩ (im-Environment-gesetzt ∪ schema-bekannt)
#   − $$-Runtime − RENDER_SKIP_VARS.
# Fremde Platzhalter ueberleben dadurch unveraendert; unbekannte Namen (Tipp-
# fehler) ueberleben ebenfalls und trippen den Leftover-Fail-Closed-Check.
# Schema-bekannte, aber ungesetzte Owned-Vars werden wie bisher zu "" substi-
# tuiert (T002174 legitim-leer-Faelle: DEV_DOMAIN, MAIL_FROM_* u.a. — wuerden
# sie ueberleben, bräche der Offline-Render und ggf. der CI-Render).
#
# Klassifikation (2026-10-11, alle 12 prod-fleet-Overlays, 169 Namen;
# T016533: +url aus kube-prometheus-stack 92.x Grafana-run.sh-Testskript):
# - Grafana/vendored (Quelle k3d/monitoring, nicht am Source fixbar):
#   datasource cluster namespace url
# - Shell-Runtime ohne $$-Escape (Quelle ddns-Skript im korczewski-Overlay,
#   live heute leer-substituiert; $$-Migration als Follow-up offen):
#   DOMAIN IP IP_4 IP_6 IP_8
# - brain.yaml-JS-Familie (T901780; seit #6522 $${}-escaped und damit auch
#   ueber Runtime abgedeckt — hier zusaetzlich als Skip, falls ein Overlay
#   sie ohne $$-Gegenstueck traegt):
#   code link target
# - knowledge-ingest-Inline-JS (T016563): k3d/knowledge-ingest-cronjob.yaml
#   wird auch direkt per kubectl auf devmesh appliziert (ohne Renderer) —
#   dort ueberlebt $${} literal und bricht das JS ($URL, $URIs). Deshalb
#   plain ${} plus Skip, damit beide Pfade (direkt + Fleet-Render) dieselben
#   korrekten Template-Literale erhalten:
#   bgeUrl liveCount
# - WEBSITE_CONFIG_SHA wird grundsaetzlich ausgeschlossen: der Wert entsteht
#   erst aus dem fertig substituierten Manifest (T002156-Sonderpfad im
#   Renderer, bleibt unveraendert).
#
# 89 weitere Namen sind $${}-Runtime (T002306/T901780) und fallen ueber die
# Runtime-Regel raus; der Rest ist Owned (schema.yaml/env-resolve).
#
# Rein lesend, keine Seiteneffekte (S2: pures Helper-Modul).

# Space-separierte Skip-Liste — niemals substituieren, auch nicht wenn gesetzt.
RENDER_SKIP_VARS="datasource cluster namespace url DOMAIN IP IP_4 IP_6 IP_8 code link target bgeUrl liveCount"

# Schema-Namen-Cache (ein Render-Prozess sourct einmal, rendert N Overlays).
_RENDER_SCHEMA_NAMES=""

# _render_schema_names — stdout: space-separierte Owned-Namen aus
# environments/schema.yaml (SSOT "Single source of truth for all environment
# variables"). Fail-closed bei fehlender Datei (Exit 1).
_render_schema_names() {
  if [[ -z "$_RENDER_SCHEMA_NAMES" ]]; then
    local lib_dir schema
    lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    schema="$lib_dir/../../environments/schema.yaml"
    if [[ ! -f "$schema" ]]; then
      echo "ERROR: render-subst-list: schema not found: $schema" >&2
      return 1
    fi
    _RENDER_SCHEMA_NAMES="$(grep -oE '^[[:space:]]*- name: [A-Za-z_][A-Za-z0-9_]*' "$schema" \
      | awk '{print $NF}' | sort -u | tr '\n' ' ')"
  fi
  printf '%s' "$_RENDER_SCHEMA_NAMES"
}

# render_subst_list — stdin: gerendertes Manifest, stdout: space-separierte
# Subst-Namen (ohne $). Rueckgabe 0 immer (leere Liste = leere Ausgabe).
render_subst_list() {
  local rendered vars runtime_vars v schema_names
  rendered="$(cat)"
  schema_names="$(_render_schema_names)" || return 1

  # 1) Alle ${VAR} einsammeln (wie bisher; grep-rc=1 ohne Treffer ist ok).
  vars="$(grep -oE '\$\{[A-Za-z_][A-Za-z0-9_]*\}' <<<"$rendered" \
    | tr -d '${}' | sort -u | tr '\n' ' ')" || true

  # 2) $$-Runtime entfernen (T002306 Brackets + T901780 klammerlos).
  # Literal-identisch mit scripts/flux-render-artifact.sh (Leftover-Ausnahme)
  # und dem T901780-Kopplungstest — eine Regex-Semantik ueberall.
  runtime_vars="$(grep -oE '\$\$(\{)?[A-Za-z_][A-Za-z0-9_]*\}?' <<<"$rendered" \
    | sed -E 's/^\$\$\{//; s/^\$\$//; s/\}$//' | sort -u | tr '\n' ' ')" || true
  for v in $runtime_vars; do
    vars="$(tr ' ' '\n' <<<"$vars" | sed "/^${v}\$/d;/^\$/d" | tr '\n' ' ')"
  done

  # 3) Skip-Liste entfernen (fremde Platzhalter ueberleben).
  for v in $RENDER_SKIP_VARS; do
    vars="$(tr ' ' '\n' <<<"$vars" | sed "/^${v}\$/d;/^\$/d" | tr '\n' ' ')"
  done

  # 4) WEBSITE_CONFIG_SHA entfernen (T002156-Sonderpfad substituiert separat).
  vars="$(tr ' ' '\n' <<<"$vars" | sed '/^WEBSITE_CONFIG_SHA$/d;/^$/d' | tr '\n' ' ')"

  # 5) Whitelist: gesetzte Namen UND schema-bekannte Namen behalten.
  # [[ -v $v ]] prueft dynamische Namen (bash >= 4.2). Schema-bekannte, aber
  # ungesetzte Vars rendern wie bisher zu "" (T002174 legitim-leer); alles
  # andere Unbekannte faellt raus und trippt den Leftover-Check.
  local kept=""
  for v in $vars; do
    if [[ -v $v ]] || [[ " $schema_names " == *" $v "* ]]; then
      kept="${kept}${v} "
    fi
  done
  printf '%s' "$kept"
}
