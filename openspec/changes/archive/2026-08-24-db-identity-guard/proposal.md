# Proposal: db-identity-guard

**Ticket:** T015168 · **Typ:** fix · **Parent-Incident:** Zweite Split-Brain-Episode (Ghost-shared-db auf fleet-Exec-Pfad)

## Why

T015008 sichert die Loopback-Klasse ab (Context löst auf falschen Server auf). Die zweite Episode
zeigte die nächste Klasse: **Context und Server korrekt, aber der selektierte Pod war ein Ghost** —
eine shared-db-Instanz mit leerer Ticket-Tabelle hinter demselben Label-Selector im selben Namespace.
`_pgpod` wählt bei mehreren Treffern blind `head -1`; ein seq-repair-Lauf und ein pin-UPDATE liefen
in die Ghost-Instanz. Writes ohne Identitätscheck sind Vertrauenswürdigkeits-lose Writes.

## What Changes

Zwei Verteidigungsschichten im gemeinsamen Choke-Point (`scripts/vda/ticket/_ticket-core.sh`),
damit gilt: jeder Pod, den `_pgpod` zurückgibt, ist nachweislich die SSOT.

1. **Pod-Singleton-Assertion** — `_pgpod` bricht laut ab, wenn >1 Running-Pod den Selector
   `app in (shared-db, shared-db-dev)` erfüllt (Liste der Kandidaten im Fehler).
2. **DB-Marker-Probe** — Migration legt `tickets.db_identity` mit einem festen UUID-Constant an;
   nach der Pod-Auflösung probt `_pgpod` den Marker (einmal pro Prozess gecacht) und vergleicht
   gegen den erwarteten Wert. Fehlt der Marker oder weicht ab → fail-closed.

## Enforcement

- **Fail-closed** für Reads UND Writes über `_pgpod` (Refuse-Ghost-Data auch beim Lesen).
- Escape-Hatch `TICKET_ALLOW_UNVERIFIED_DB=1` → `WARN:` + weiter (Bootstrap/Restore-Fenster,
  eingefrorene fleet-Kopie ohne Marker).
- Unter BATS entfällt die Marker-Probe (T002224-Sentinel-Regime; Tests stubben den Cluster selbst).
  Die Singleton-Assertion bleibt aktiv (Stubs liefern eine Zeile → trivial grün).

## Rollout-Sequenz

Merge → **zuerst** Migration gegen die SSOT fahren (`task db:migrate ENV=mentolder`, Name siehe
tasks.md), dann ist der Write-Pfad wieder frei. Das Guard-Error nennt exakt diesen Befehl.
Bis dahin fängt fehlender Marker jeden Write laut ab — bewusst so.

## Out of Scope

- Read-Back-Verifikation nach Writes → T015668
- Factory-/Nebenpfade (`factory_pgpod`, conflict-check.sh, …) → T015669
- PR #5142 Evidence-Irrtum — bereits per PR-Kommentar korrigiert (2026-08-24)
