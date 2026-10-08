---
page: ml-training
ticket: T901056
status: complete
actions:
  - dataset-open
  - run-status
  - run-logs
  - box-status
---

## Voraussetzungen

- ML-Zonen vorhanden (verifiziert: `ml/`, `.agents/training`,
  `scripts/finetune`, `~/unsloth-boxes`).

## Geordnete Schritte

1. **dataset-open**: Zone waehlen — Datensatz oeffnen (via files-search).
2. **run-status**: Lauf-Status anzeigen (lesend).
3. **run-logs**: Log-Datei eingeben — Log oeffnen.
4. **box-status**: Box-Status (`~/unsloth-boxes`) anzeigen.

Kein Trainingsstart ohne explizite Bestaetigung (Aktionsmodell-Dialog).

## Erwartetes Ergebnis

Zonen live erhoben; Laeufe und Boxen sichtbar; Starts bestaetigt.

## Troubleshooting

- **Zone fehlt**: Pfad pruefen — Zonen werden live entdeckt, nicht geraten.
- **Log fehlt**: Run-Namen pruefen.

## Recovery

Lauf stoppen (Befehl aus der Pipeline-Doku); keine Config-Aenderung.
