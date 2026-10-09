---
title: Design-Asset-Inventory — Implementation Plan
ticket_id: T901038
domains: [docs, scripts, test]
status: staged
---

# design-asset-inventory — Implementation Plan

Ticket T901038 verlangt eine reproduzierbare, begrenzte Inventur der
WSL-Design-Assets mit Klassifikation und Verbraucher-Karte. Der Change ist
rein additiv: ein lesendes Inventur-Kommando, ein committetes Baseline-Manifest,
zwei Klassifikations-Dokumente und eine pytest-Spec als Guard. Es werden keine
bestehenden Dateien geaendert, nichts verschoben oder geloescht, und
`scripts/assets-sync.sh` wird zu keinem Zeitpunkt ausgefuehrt. Details zu
Scope und Entscheidungen stehen in `proposal.md` und `design.md` dieses
Ordners.

## File Structure

Neue Dateien (Budget: n/a — alle neu, klein, weit unter jedem S1-Limit):

- `scripts/design-assets-inventory.sh` — lesendes Inventur-Kommando
- `docs/design-assets/manifest.json` — committete PRE-Baseline des Inventars
- `docs/design-assets/catalog.md` — Quelle/Derivat-Klassifikation mit Herkunft und Rechten
- `docs/design-assets/consumer-map.md` — Abhaengigkeits- und Verbraucher-Karte
- `tests/py/spec/design_assets/test_inventory.py` — pytest-Guards fuer Manifest und Karten

Lesender Kontext (unveraendert, nur Referenz): das Sync-Skript mit seinen
rsync-Mappings, der Registry-Updater mit DB-Schreibzugriff, das
Design-System-Build-Skript mit seiner Token-Extraktion sowie die beiden
Scope-Notizen unter assets und design-sync. Alle liegen im Repo und werden
ausschliesslich gelesen.

## Partials

| id | plan file | role | target_files | depends_on |
|----|-----------|------|--------------|------------|
| p1 | tasks.d/p1-inventory-command.md | impl | `scripts/design-assets-inventory.sh`, `docs/design-assets/manifest.json` |  |
| p2 | tasks.d/p2-catalog-consumer-map.md | impl | `docs/design-assets/catalog.md`, `docs/design-assets/consumer-map.md` | p1 |
| p3 | tasks.d/p3-inventory-guards.md | tests | `tests/py/spec/design_assets/test_inventory.py` | p1, p2 |

Ausfuehrungs-Commits tragen die Form `docs(T901038):` plus kurze
Beschreibung, ein Commit pro Partial, danach Push auf den Plan-Branch.

## Task 1: Final verification and release readiness

Nach allen Partials den Gesamtstand verifizieren:

1. Inventur reproduzieren: das neue Kommando zweimal laufen lassen und die
   SHA-256-Pruefsummen der Ausgabe vergleichen — identisch ist Pflicht.
2. Spec-Guards laufen lassen: `bash scripts/pytest-run.sh`
   `tests/py/spec/design_assets/test_inventory.py` muss gruen sein.
3. Gezielte Tests und Freshness-Gates in dieser Reihenfolge:
   - `task test:changed`
   - `task freshness:regenerate`
   - `task freshness:check`
4. Negativ-Checks: Manifest enthaelt keine absoluten WSL-Pfade und keine
   Secret-nahen Dateinamen; kein Commit enthaelt Moves oder Loeschungen von
   Assets; das destruktive Sync-Skript wurde nie ausgefuehrt.
