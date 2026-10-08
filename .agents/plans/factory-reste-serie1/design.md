---
ticket_id: null
plan_ref: null
status: active
date: 2026-10-07
---

# Design: Serie 1 — tote Factory-Prosa bereinigen (T900563)

## Intent
Die Software Factory ist stillgelegt (T900399/T900727/T900728 done); in
Skript-Kommentaren, CI-Kommentaren, Docs und Test-Kommentaren hängt noch tote
Factory-Prosa. Serie 1 entfernt ausschließlich diese toten Texte — ohne jede
Verhaltens-, Schema- oder API-Änderung. Jede Datei wird einzeln auf
aktiv/tot geprüft; aktive Verweise bleiben mit Begründung stehen.

## Regeln pro Partial (verbindlich für die Ausführung)
1. **Kein blindes Löschen**: Vor jedem Edit `git grep -n -i factory -- <datei>`
   lesen und klassifizieren: tot (Historien-Kommentar, erledigte Meldung,
   überholte Doku) vs. aktiv (DB-Schema, API-Vertrag, Guard-Selbstreferenz,
   Aggregator-/Scope-Name, Fixture-Input, Frozen Record). Aktive bleiben
   stehen; die Entscheidung steht im PR-Body je Datei (ein Satz).
2. **Guards beachten**: `tests/spec/sf-retirement-rest.bats`,
   `tests/spec/sf-retirement-web.bats`,
   `tests/spec/decommission/decommission-guard.bats`,
   `tests/spec/os-retirement-*.bats` werden weder editiert noch umgangen; sie
   müssen vor und nach jedem Partial grün sein.
3. **Tabu-Listen** (auch bei Treffern nicht anfassen): `scripts/migrations/*`,
   `docs/adr/*`, `.agents/plans/*`-Historie, `*-fixtures/*`-Golden-Sets,
   `FACTORY-PLAN-REF`, `tickets.factory_*`-SQL, `--factory-*`-CSS-Vars,
   `FactoryTicket`/`FactoryDefault`-Typen, `test-factory`-Name,
   `commitlint`-Scope-Keys.
4. **Ersatzformulierung**: „Factory" → „dev-flow"/„Pipeline"/Neutralform je
   Kontext (z. B. „Factory greift sofort zu" → „die Ausführung startet sofort
   (release-hold freigegeben)"); stilllegungs-erklärende Historie darf zu einem
   Satz mit Ticket-Ref (`per T900399 stillgelegt`) schrumpfen statt ersatzlos
   zu verschwinden, wo Kontext verloren ginge.
5. **Rot→Grün-Nachweis**: je Partial `git grep -I -i factory -- <dateien>`
   vorher (Treffer = `expected: FAIL`) und nachher (leer) protokollieren.

## Abgrenzung (Nicht-Ziele)
- Kein Rename von CSS-Vars, Typen, DB-Objekten, API-Pfaden (Serien 2–3).
- Keine Änderung an Workflow-`jobs:`/`steps:`-Semantik, nur Kommentare.
- Keine Test-Logik-Änderung in P4, nur Kommentar-Prosa; Assertions bleiben.
