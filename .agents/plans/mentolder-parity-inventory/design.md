---
ticket_id: T901033
plan_ref: .agents/plans/mentolder-parity-inventory/tasks.md
status: active
date: 2026-10-09
---

# Design-Spec: mentolder-parity-inventory

## Intent

Belegte Inventur des Mentolder-Bestands als Grundlage für
Paritäts-/Extraktions-Entscheidungen (T901033).

## Deliverables

| Datei | Inhalt |
|---|---|
| `docs/parity/mentolder-flows-core.md` | Kernpfade Buchung→Rechnung mit Evidenz |
| `docs/parity/mentolder-auth-isolation.md` | Auth, Tenant-Identität, Isolation, Jobs-/Datei-/Cache-Scope |
| `docs/parity/mentolder-flows-remaining.md` | Übrige Flows, Integrationen, Jobs/Cron |
| `docs/parity/mentolder-parity-matrix.md` | Migrationen, Asset-Konsumenten, Klassifikation, Mom-MVP-Vergleich, Staging-Baseline |
| `tests/spec/mentolder-parity-inventory.bats` | Guards: Existenz, Pflichtsektionen, Evidenz-Links |

## Evidenz-Konvention

Jeder Inventur-Eintrag: betroffener Pfad, Symbol/Route, Zeilenbereich,
Befund, Test-Referenz (oder `kein Test`), Klassifikation. Zitate aus
Vor-Evidenz (0ff76b4/K3) als solche markieren und am aktuellen Stand
verifizieren.

## Akzeptanz

- Alle fünf Dateien existieren; BATS-Guards grün.
- Jeder Kernpfad (Buchung→Rechnung) und jeder Auth-/Isolations-Mechanismus
  ist mit exakter Quelle belegt.
- Klassifikation retain/extract/replace/defer vollständig; Mom-MVP-Vergleich
  vorhanden; Staging-Baseline-Verfahren ohne Echtdaten beschrieben.
