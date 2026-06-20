---
slug: openspec-ticket-status-display
ticket_id: T000959
plan_ref: null
status: design
---

# Spec: OpenSpec-Status in Ticket-Cockpit und ticket-ops Triage

## Kontext & Warum

Das Cockpit-Admin-Panel zeigt Tickets an, aber hat keine Sichtbarkeit auf OpenSpec-Proposals. Ein Entwickler muss derzeit manuell `grep -r "T000xxx" openspec/` laufen lassen, um zu sehen, ob ein Ticket bereits in Planung ist. Dieselbe Blindheit besteht im `ticket-ops`-Skill beim Triage-Lauf.

**Ziel:** Pro Ticket sofort sichtbar machen, ob ein OpenSpec-Proposal existiert und in welchem Stadium es sich befindet.

## Architektur-Entscheidung: Generate-und-Commit-Pattern

Die Website läuft als Docker-Container ohne Zugriff auf `openspec/` zur Laufzeit. Deshalb:

- **Neues Skript `scripts/openspec-status-map.sh`** liest alle `openspec/changes/*/.ticket`-Dateien und generiert `website/src/data/openspec-status.json`
- Das JSON wird **ins Repo committed** und bei Build-Zeit eingebunden (wie `test-inventory.json`)
- Regenerierung via `task freshness:regenerate` (Hook in `Taskfile.yml` eintragen)
- Das Skript wird auch von `openspec.sh propose/apply/archive` nach jeder Statusänderung aufgerufen → immer aktuell

## Status-Matrix

| Bedingung (Filesystem) | Status | Badge-Farbe |
|---|---|---|
| Kein `.ticket`-Eintrag gefunden | `null` | keiner |
| In `changes/<slug>/`, nur `proposal.md`, kein `tasks.md` | `planning` | gelb |
| In `changes/<slug>/`, `proposal.md` + `tasks.md` | `plan_staged` | grün |
| In `changes/archive/<slug>/` | `archived` | grau |

## Datenstruktur `openspec-status.json`

```json
{
  "T000737": [{ "slug": "grilling-ui-multichoice", "status": "plan_staged" }],
  "T000953": [
    { "slug": "cockpit-fullscreen-overview", "status": "plan_staged" },
    { "slug": "cockpit-sidekick-global", "status": "plan_staged" }
  ],
  "T000959": [{ "slug": "openspec-ticket-status-display", "status": "planning" }]
}
```

Ein Ticket kann mehrere Proposals haben → Array.

## Teil 1: Website Admin Cockpit

### Betroffene Dateien
- `scripts/openspec-status-map.sh` (NEU)
- `website/src/data/openspec-status.json` (NEU, generiert)
- `website/src/lib/tickets/cockpit-types.ts` — `openspecProposals` Feld hinzufügen
- `website/src/lib/tickets/cockpit-db.ts` — JSON importieren + an TicketRow anhängen
- `website/src/components/admin/CockpitTable.svelte` — Spalte hinzufügen
- `website/src/components/admin/TicketRow.svelte` — Badge rendern
- `Taskfile.yml` — `freshness:regenerate` um openspec-map erweitern

### Badge-Design
- `planning` → gelbes Label `SPEC`
- `plan_staged` → grünes Label `READY`
- `archived` → graues Label `DONE`
- Mehrere Proposals → mehrere Badges nebeneinander

## Teil 2: ticket-ops Skill

### Änderung in Step 1.1
Nach dem SQL-Query-Block: Shell-Snippet das `openspec-status-map.sh` (oder die JSON-Datei) auswertet und pro Ticket den Proposal-Status in die Ausgabe-Tabelle einbaut.

```bash
# OpenSpec Status Map laden
OMAP_FILE="$REPO/website/src/data/openspec-status.json"
get_openspec_status() {
  local ext_id="$1"
  jq -r --arg id "$ext_id" '.[$id] // [] | map(.status) | join(",")' "$OMAP_FILE" 2>/dev/null || echo ""
}
```

Output-Format Triage:
```
T000953 | Cockpit Fullscreen     | plan_staged | hoch   | [READY]
T000943 | Awaiting-Deploy Gaps   | planning    | mittel | [SPEC]
T000738 | Unbekanntes Feature    | backlog     | niedrig| —
```

## Nicht-Ziele

- Kein Löschen/Ändern von OpenSpec-Proposals über die UI
- Keine Echtzeit-Sync zwischen DB und Filesystem (reicht Commit-Zeit)
- Kein neues DB-Schema

## Abhängigkeiten

- `jq` muss im Website-Build-Image verfügbar sein (für `openspec-status-map.sh`)
- `task freshness:regenerate` muss als Hook laufen bevor CI-Check
