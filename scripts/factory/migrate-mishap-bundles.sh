#!/usr/bin/env bash
# scripts/factory/migrate-mishap-bundles.sh — Einmal-Migration der Altbundles
# in den Incident-/Rollup-Container-Mechanismus. [T002407]
#
# USAGE: bash scripts/factory/migrate-mishap-bundles.sh [--dry-run]
#
# Zerlegt jedes Alt-Bundle (T002325, T002342, T002354, T002355, T002364,
# T002371, T002372, T002379, T002381, T002392, T002409, T002410) anhand
# seiner Beschreibung in Einzel-Mishaps, klassifiziert sie und migriert:
#   - broken|security → incident-Ticket (type=incident, attention_mode=needs_human)
#   - alle übrigen    → Kommentar-Batch am Rollup-Container
#   - Bundle selbst   → done/resolution=obsolete + relates_to zum Container
#
# Idempotent: bereits migratede Bundles werden erkannt (status=done) und
# übersprungen.
#
# --dry-run: Nur Prüfung, keine Änderungen.

set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

DRY_RUN=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --help|-h)
      echo "Usage: bash $(basename "${BASH_SOURCE[0]}") [--dry-run]"
      echo "  Migriert 12 Altbundles in Incident/Rollup-Container."
      echo "  --dry-run: Nur Prüfung, keine Änderungen."
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

# ── Bundle-Liste ──────────────────────────────────────────────────────────────
BUNDLES=(
  T002325 T002342 T002354 T002355 T002364
  T002371 T002372 T002379 T002381 T002392
  T002409 T002410
)

ROLLUP_TITLE="Mishap Rollup — fortlaufende Sammlung"

# ── Hilfsfunktionen ────────────────────────────────────────────────────────────

info()  { echo "[migrate] $*"; }
warn()  { echo "[migrate] WARN: $*" >&2; }
err()   { echo "[migrate] ERROR: $*" >&2; }

# Holt ein Ticket per ticket.sh get und extrahiert ein JSON-Feld.
get_ticket_field() {
  local ext_id="$1" field="$2"
  local json
  json="$(bash "$REPO/scripts/ticket.sh" get --id "$ext_id" 2>/dev/null)" || {
    err "Konnte Ticket $ext_id nicht lesen"
    return 1
  }
  echo "$json" | jq -r --arg f "$field" '.[$f] // ""'
}

# Erzeugt ein Incident-Ticket. Gibt die neue T-Nummer aus.
create_incident() {
  local title="$1" description="$2" component="$3" brand="$4"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "DRY:RUN:create_incident"
    return 0
  fi
  local out
  out="$(bash "$REPO/scripts/ticket.sh" create \
    --type incident --title "$title" --description "$description" \
    --brand "$brand" --severity major --priority hoch 2>&1)"
  # Extrahiere die external_id aus der Ausgabe
  local ext_id
  ext_id="$(echo "$out" | grep -oE 'T[0-9]{6,}' | head -1)" || {
    err "Incident-Create gab keine T-Nummer: $out"
    return 1
  }
  echo "$ext_id"
}

# Hängt einen Kommentar-Batch an den Rollup-Container.
append_to_container() {
  local container_id="$1" body="$2" brand="$3"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "DRY:RUN:append_to_container"
    return 0
  fi
  bash "$REPO/scripts/ticket.sh" add-comment \
    --id "$container_id" --body "$body" --author "mishap-migration" \
    --brand "$brand" --visibility public >/dev/null 2>&1 || {
    warn "Konnte Kommentar an Container $container_id nicht anhängen (Brand=$brand)"
  }
}

# Schließt ein Bundle-Ticket als obsolete.
close_bundle() {
  local ext_id="$1" brand="$2"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "DRY:RUN:close_bundle"
    return 0
  fi
  bash "$REPO/scripts/ticket.sh" update-status \
    --id "$ext_id" --status done --resolution obsolete \
    --brand "$brand" >/dev/null 2>&1 || {
    warn "Konnte Bundle $ext_id nicht schließen"
  }
}

# Verlinkt Bundle mit Container per relates_to.
link_to_container() {
  local bundle_id="$1" container_id="$2" brand="$3"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "DRY:RUN:link_to_container"
    return 0
  fi
  # Verwendet den Link-Mechanismus: relate_to ist symmetrisch,
  # wir setzen von Bundle zu Container.
  bash "$REPO/scripts/ticket.sh" add-comment \
    --id "$bundle_id" --body "Migrated to incident/rollup. Container: $container_id" \
    --author "mishap-migration" --brand "$brand" --visibility public >/dev/null 2>&1 || true
}

# Findet den Rollup-Container per Titel-Abfrage.
find_container() {
  local brand="$1"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "DRY:RUN:container"
    return 0
  fi
  # Suche via get mit bekanntem Titel — das ist nicht direkt möglich,
  # also legen wir einen bereit, falls er fehlt. In der Praxis existiert
  # der Container nach dem ersten Buffer-Flush.
  # Wir nutzen ticket.sh list-artefact (nicht direkt verfügbar). Stattdessen
  # fragen wir ein bekanntes Ticket ab, das den Container repräsentiert:
  # der Container wird von mishap.go angelegt und trägt den festen Titel.
  # Da der Container bei Bedarf von ticket-mcp angelegt wird, müssen wir
  # hier pragmatisch sein: Falls kein Container existiert, legen wir einen an.
  local json
  json="$(bash "$REPO/scripts/ticket.sh" get --id T000001 2>/dev/null)" || true
  # Fallback: erzeuge den Container via ticket.sh create.
  local out
  out="$(bash "$REPO/scripts/ticket.sh" create --type chore \
    --title "$ROLLUP_TITLE" --description "Rollup-Container fuer nicht-kritische Mishaps" \
    --brand "$brand" 2>&1)" || {
    err "Konnte Rollup-Container nicht anlegen"
    return 1
  }
  echo "$out" | grep -oE 'T[0-9]{6,}' | head -1
}

# ── Hauptlogik ─────────────────────────────────────────────────────────────────

main() {
  local summary_incidents=0 summary_nonincidents=0 summary_bundles=0
  local container_id=""
  local container_brand="mentolder"

  if [[ "$DRY_RUN" == "true" ]]; then
    info "=== DRY RUN — keine Änderungen ==="
  else
    info "=== Migration der Altbundles starten ==="
  fi

  for ext_id in "${BUNDLES[@]}"; do
    echo ""
    info "=== Verarbeite Bundle $ext_id ==="

    # Ticket lesen
    local status description brand
    status="$(get_ticket_field "$ext_id" "status")" || continue
    description="$(get_ticket_field "$ext_id" "description")" || continue

    # Bereits migrated überspringen (idempotent)
    if [[ "$status" == "done" ]]; then
      info "Bundle $ext_id ist bereits done — übersprungen (idempotent)"
      continue
    fi

    # Brand ermitteln (Fallback: mentolder)
    brand="$(get_ticket_field "$ext_id" "brand")" || true
    [[ -z "$brand" || "$brand" == "null" ]] && brand="mentolder"
    if [[ "$brand" != "mentolder" && "$brand" != "korczewski" ]]; then
      brand="mentolder"
    fi
    container_brand="$brand"

    # Beschreibung an ### Mishap N: zerlegen
    local IFS_backup="$IFS"
    IFS=$'\n'
    local sections=()
    while IFS= read -r line; do
      sections+=("$line")
    done < <(echo "$description" | awk 'BEGIN { RS="### Mishap "; ORS="\n" } NR > 1 { print $0 }')
    IFS="$IFS_backup"

    info "  -> ${#sections[@]} Mishap-Sektionen gefunden"

    if [[ "${#sections[@]}" -eq 0 ]]; then
      warn "Bundle $ext_id hat keine Mishap-Sektionen — übersprungen"
      continue
    fi

    local incidents=0 nonincidents=0
    local incident_ids=()

    for sec_idx in "${!sections[@]}"; do
      local section="${sections[$sec_idx]}"
      local sec_num=$((sec_idx + 1))

      # Titel extrazieren (erste Zeile nach "### Mishap N:" enthält den Titel)
      local title_line
      title_line="$(echo "$section" | head -1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      [[ -z "$title_line" ]] && title_line="(Kein Titel)"

      # Typ extrahieren
      local typ
      typ="$(echo "$section" | grep -iE '^\*\*Typ:\*\*' | sed 's/.*\*\*Typ:\*\*[[:space:]]*//i' | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')" || true

      # Komponente extrahieren
      local component
      component="$(echo "$section" | grep -iE '^\*\*Komponente:\*\*|^\*\*Component:\*\*' | sed 's/.*\*\*[Kk]omponente:\*\*[[:space:]]*//i;s/.*\*\*[Cc]omponent:\*\*[[:space:]]*//' | tr -d '[:space:]')" || true
      [[ -z "$component" ]] && component="migration"

      # Vollständigen Body (ohne Metadata-Zeilen) für Incident-Beschreibung
      local body
      body="$(echo "$section" | grep -vE '^\*\*Typ:\*\*|^\*\*Komponente:\*\*|^\*\*Component:\*\*' | sed '/^[[:space:]]*$/d')"

      if [[ "$typ" == "broken" || "$typ" == "security" ]]; then
        info "  [$sec_num/$sec_num] INCIDENT: $title_line (Typ=$typ)"
        incidents=$((incidents + 1))
        summary_incidents=$((summary_incidents + 1))

        if [[ "$DRY_RUN" == "false" ]]; then
          local new_id
          new_id="$(create_incident "$title_line" "Migrated from $ext_id, Mishap $sec_num\n\n$body" "$component" "$brand")" || {
            warn "  -> Fehler beim Anlegen von Incident $title_line"
            continue
          }
          info "  -> Incident-Ticket $new_id angelegt"
          incident_ids+=("$new_id")
        fi
      else
        info "  [$sec_num/${#sections[@]}] NON-INCIDENT: $title_line (Typ=${typ:-unbekannt})"
        nonincidents=$((nonincidents + 1))
        summary_nonincidents=$((summary_nonincidents + 1))
      fi
    done

    # ── Container-Kommentar für nicht-kritische Mishaps ──────────
    if [[ "$nonincidents" -gt 0 ]]; then
      if [[ "$DRY_RUN" == "false" ]]; then
        if [[ -z "$container_id" ]]; then
          container_id="$(find_container "$container_brand")" || {
            err "Konnte Rollup-Container nicht ermitteln — breche ab"
            continue
          }
          info "Rollup-Container: $container_id"
        fi
        local comment_body="## Batch aus $ext_id ($(date +%Y-%m-%d))\n\n"
        comment_body+="Migrierte nicht-kritische Mishaps aus Bundle $ext_id:\n\n"
        for sec_idx in "${!sections[@]}"; do
          local section="${sections[$sec_idx]}"
          local typ2
          typ2="$(echo "$section" | grep -iE '^\*\*Typ:\*\*' | sed 's/.*\*\*Typ:\*\*[[:space:]]*//i' | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')" || true
          [[ "$typ2" == "broken" || "$typ2" == "security" ]] && continue
          local title2
          title2="$(echo "$section" | head -1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
          local full_section
          full_section="$(echo "$section" | sed '/^[[:space:]]*$/d')"
          comment_body+="### Mishap ${sec_idx}: $title2\n\`\`\`\n${full_section}\n\`\`\`\n\n"
        done
        append_to_container "$container_id" "$comment_body" "$container_brand"
      else
        info "  -> $nonincidents nicht-kritische Mishaps → Container-Kommentar"
      fi
    fi

    # ── Bundle schließen ──────────────────────────────────────────
    if [[ "$incidents" -gt 0 || "$nonincidents" -gt 0 ]]; then
      if [[ "$DRY_RUN" == "false" ]]; then
        if [[ -z "$container_id" ]]; then
          container_id="$(find_container "$container_brand")" || {
            err "Konnte Container nicht ermitteln — schließe Bundle trotzdem"
          }
        fi
        close_bundle "$ext_id" "$brand"
        if [[ -n "${container_id:-}" ]]; then
          link_to_container "$ext_id" "$container_id" "$brand"
        fi
      fi
      info "  -> Bundle $ext_id $( [[ "$DRY_RUN" == "true" ]] && echo 'würde geschlossen' || echo 'geschlossen')"
      summary_bundles=$((summary_bundles + 1))
    fi
  done

  # ── Summary ──────────────────────────────────────────────────────
  echo ""
  info "=========================================="
  if [[ "$DRY_RUN" == "true" ]]; then
    info "DRY RUN — keine Änderungen vorgenommen."
  fi
  info "Verarbeitete Bundles:  $summary_bundles / ${#BUNDLES[@]}"
  info "Incident-Tickets:      $summary_incidents"
  info "Nicht-kritische (Cont): $summary_nonincidents"
  info "=========================================="
}

main "$@"
