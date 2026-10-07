---
ticket_id: T901022
plan_ref: .agents/plans/workspace-foundation/tasks.md
status: active
date: 2026-10-07
---

# T901022 — Workspace-Foundation und geschützter Owner-Zugang (Design)

Ticket: T901022 (feat) · Epic: T901016 · Abhängigkeiten: T901020 (done),
T901035 (blocked — Enforcement-Teile hängen per `depends_on` daran).
Hold: Planung ist Recherche (erlaubt); `dev-flow-execute` wartet auf
Hold-Review + Fragebogen (Ticket-Hold) — der Plan wird mit `--hold` gestagt.

## WARUM

Der Massage-Business braucht einen geschützten Inhaber-Arbeitsbereich:
Anfragen sichten, Termine/Kalender pflegen, Kunden/Rechnungen verwalten —
ohne dass Unbefugte oder fremde Businesses an Daten kommen. Heute gibt es
keinen zentralen Admin-Guard (jede Route prüft inline, `requireAdmin`
NOT-FOUND), kein Mandanten-Feld in `inbox_items` und nur einen
Usernamen-Fallback (`PORTAL_ADMIN_USERNAME`) statt Owner-Rolle.

## WAS (entschieden im Brainstorming 2026-10-07)

1. **Owner-AuthZ per Groups-Claim** (ADR-011-Option 1; skaliert auf
   Team; ersetzt den USERNAME-Fallback für den Owner-Pfad).
2. **Separater `/owner`-Bereich mit zentralem `requireOwner`-Guard**
   (Seiten + API); `/admin` (SDLC/Coaching/Brett) bleibt unangetastet.
3. **Brand-spaltiges Fundament jetzt**, harte Enforcement (RLS/Schema)
   als `depends_on` T901035.
4. **Neue Tabelle `business_memberships`** (user↔business + Rolle) als
   explizites Modell; Basis für Cross-Tenant-Tests.
5. **Secrets:** bestehenden Pocket-ID-Client-Seed + Sealed-Secrets-Flow
   um Mandant/Owner-Gruppe erweitern; Guard: keine Secrets ins
   Client-Bundle (heute: nur `process.env`, serverseitig — absichern).
6. **Backup:** `backup-restore.sh` um Business-Scope erweitern +
   Restore-Demo mit Testdaten (Ticket-Akzeptanz).

## Scope

- Neu: `requireOwner`-Guard (Groups-Claim), Owner-Seiten (minimal:
  Übersicht + Anfragen-Liste), `GET /api/owner/me`, Migration
  `business_memberships` + Brand-/Business-Ref an `inbox_items`,
  Owner-/Service-Settings, Seed-/Secrets-Erweiterung, Backup-Scope,
  Vitest-Tests + `tests/spec/workspace-foundation.bats`-Guards.
- Geändert (Auswahl, Budgets aus `intel.json`): `auth.ts` (560),
  `messaging-db.ts` (604), `middleware.ts` (867), `db-pool.ts` (828),
  `migrate.ts`-Umfeld (787) — exakte Budgets ermittelt der Plan
  pro Datei (B1a), neue Dateien mit Wachstumsreserve unter Limit.
- Nicht-Ziele: keine T901035-Enforcement (RLS/Schema), keine
  `/admin`-Umbauten, keine Microservices, keine Online-Zahlungen,
  kein `brands`-Bootstrap über das Membership-Modell hinaus
  (Herkunft der Tabelle bleibt offener Klärpunkt im Plan).

## Akzeptanz-Mapping (Ticket)

- Unauthentifiziert + Fremd-Business → denied (Guards + Tests).
- Owner-Zugang funktioniert (Login → `/owner`, `me`-Endpoint).
- Keine Secrets im Client-Bundle (Spec-Guard).
- Backup-Restore mit Testdaten demonstriert (Demo-Task + Verify).
