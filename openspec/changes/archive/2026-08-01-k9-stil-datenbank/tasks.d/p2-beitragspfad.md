# Partial p2 — Beitragspfad: Index + README (D14)
**Role:** implementation | **Ticket:** T002468 | **Depends:** p1

## Goal: Verzeichnis und Beitragsregeln für die Stil-Datenbank

Neue Dateien: `.lavish/styles/index.json`, `.lavish/styles/README.md`

## index.json

Schlankes Verzeichnis aller Einträge (Antwortquelle für Adapter/Daemon in p3):

```json
{
  "entries": [
    {
      "id": "status-panel-akzent",
      "name": "...",
      "zweck": "...",
      "herkunft": { "projekt": "...", "datei": "..." },
      "tags": ["..."]
    }
  ],
  "version": 1
}
```

- Ein Eintrag pro Datei in `.lavish/styles/` (außer `schema.json`, `index.json`, `README.md`)
- Feldnamen identisch zum Schema aus p1 (D14 Regel 3: Verzeichniseintrag mit Zweck + Herkunft)

## README.md

Beitragsregeln (D14) — ein Eintrag kommt nur mit allen drei Dingen ins Kit:
1. **Beleg-Ausschnitt** (sichtbar im Referenz-Board/Cockpit-Hülle)
2. **ausschließlich Token-Bezüge** statt fester Farb-/Größenwerte (sonst bricht E11)
3. **Verzeichniseintrag mit Zweck und Herkunftsprojekt** (dieser Index)

Ohne alle drei bleibt die Komponente im Projekt und wandert nicht ins Kit.
Verweis auf `schema.json` und auf `tokens.css` als Token-Quelle.

## Acceptance

- `index.json` listet alle p1-Einträge, Feldnamen passend zum Schema
- README dokumentiert die 3 D14-Regeln explizit
- Keine Datei außerhalb von `.lavish/styles/` verändert
