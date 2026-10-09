---
ticket_id: T901038
plan_ref: .agents/plans/design-asset-inventory/tasks.md
status: active
date: 2026-10-09
---

# Design-Asset-Inventory — Brainstorming-Ergebnis (T901038)

Nicht-interaktives Brainstorming aus Ticket-Spec plus Klaerungsrunde
2026-10-09 (Timeline-Eintraege 2026-10-09T03:54 bis 04:16). Keine offenen
Rückfragen — alle Entscheidungen aus Spec und Timeline abgeleitet.

## Entscheidungen

| # | Entscheidung | Begruendung |
|---|---|---|
| D1 | Scope = beobachtete In-Repo-Pfade (`assets/`, `.design-sync/`, `packages/design-system/`, `design/leitstand-ds/`, `components/website/public/brand/`, Brett-Public-Kopien als Consumer) | Timeline 2026-10-09: beobachtete Pfade genuegen, keine zusaetzlichen Quellen |
| D2 | ComfyUI-Anteil gestrichen | `/home/patrick/ComfyUI` existiert nicht (verifiziert 2026-10-09) |
| D3 | Neues Skript statt `scripts/assets-index.sh` wiederverwenden | assets-index.sh ist ein Registry-Updater mit kubectl/DB-Schreibzugriff, kein lesendes Inventur-Werkzeug |
| D4 | `scripts/assets-sync.sh` wird nie ausgefuehrt | Ticket-Verbot: destruktives `--delete` in zwei Mappings |
| D5 | Manifest als committete PRE-Baseline, byte-reproduzierbar | Acceptance verlangt PRE-Commit plus reproduzierbares Kommando |
| D6 | Rein additive Aenderung: 5 neue Dateien, 0 geaenderte | Kein S1-Budget-Risiko, kein Split noetig, Rollback trivial |
| D7 | Guards als pytest-Spec, nicht als Shell-Test | Repo-Konvention `tests/py/spec/<bereich>/test_<slug>.py`; Guards muessen CI-fae hig sein |
| D8 | Klassifikation und Consumer-Map als Markdown, nicht als DB | Lesbar ohne Infra, diffbar im Review, spaetere Migration nimmt sie als Quelle |

## Annahmen (explizit, spaeter verifizierbar)

- A1: `components/brett/public/assets/` enthaelt die per assets-sync.sh
  gespiegelten Audio/Game-Kopien und ist als Consumer-Seite inventarisierbar,
  ohne Brett-Build auszufuehren.
- A2: Generator-Metadaten (Prompt/Seed/Modell) sind nur lueckenhaft vorhanden
  und werden als `unknown` markiert statt erfunden.
- A3: Dateivolumen (~740 Dateien, ~20 MB ueber alle Scope-Pfade) erlaubt einen
  synchronen Scan ohne Chunking.

## Prior-Art (T002829)

- `docs/adr/`: keine Entscheidung zu Design-Asset-Inventur; einziger
  `inventory`-Treffer (ADR-009) betrifft Test-/Freshness-Artefakte, sachfremd.
- `tests/spec/`: keine Guards zu assets-sync/assets-index/design-assets.
- Ergebnis: keine bestehende Entscheidung zu behalten oder zu ersetzen.

## Risiken

- R1: Rechte-/Lizenzlage einzelner Assets (z. B. `assets/art-library/`) ist
  unbekannt — Katalog markiert sie als `rights: unverified`, kein Default.
- R2: Manifest-Drift, sobald neue Assets ohne Re-Run committet werden —
  pytest-Guard prueft nur Schema und Reproduzierbarkeit, keine Vollstaendigkeit
  gegen HEAD (bewusst, sonst flaky).
- R3: Scope-Pfad `design/` enthaelt nur `leitstand-ds` (20 Dateien) — falls
  weitere Design-Ordner auftauchen, Scope-Eintrag erweitern, kein Re-Design.
