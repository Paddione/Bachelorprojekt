---
ticket_id: T901023
plan_ref: .agents/plans/services-calendar/tasks.md
status: active
date: 2026-10-08
---

# T901023 — Leistungen, Verfügbarkeit, Inhaber-Kalender (Design)

Ticket: T901023 (feat) · Epic: T901016 · Abhängigkeiten: T901018 (done),
T901022 (done, Owner-Guard + Memberships auf main).
Vorgänger-Doks: Business-Brief (Katalog-Vorlage), T901020 (CalDAV-/
Vertrags-Befunde), T901021 (Content/Journeys).

## WARUM

Ohne buchbare Leistungen, korrekte Verfügbarkeit und Inhaber-Kalender
gibt es keine Termine: Anfragen brauchen Vorlauf-Regeln (Vortag,
Europe/Berlin), Überlappungsschutz und einen Kalender, den die
Inhaberin mobil bedient (Telefon-Buchungen nachtragen, Zeit blocken,
umbuchen/stornieren). Die Exploration fand einen echten Timezone-Bug
(UTC-Datum vs. lokale Uhrzeit vermischt, kein Europe/Berlin im
Buchungspfad) sowie fehlende Modelle für Öffnungszeiten, Puffer und
Feiertage.

## WAS (entschieden im Brainstorming 2026-10-07)

1. **Timezone shared fixen:** `caldav.ts`/`appointments-db.ts` auf
   Europe/Berlin Ende-zu-Ende vereinheitlichen, mit Regressionstests
   für bestehendes Mentolder-Verhalten.
2. **Katalog statisch:** `content/<brand>/leistungen.json` + `durationMin`
   erweitern (DB-Overrides sind ausgemustert); Preis/Dauer als Snapshot
   an jedem Termin (Katalog-Änderungen berühren Bestand nicht).
3. **Zeiten in `site_settings`-JSON:** Öffnungszeiten, Puffer, Feiertage
   pro Brand wie heute `vacation_periods` (kein neues Schema).
4. **Neue `/owner/kalender`-Seite** (Raster-Muster übernehmen, eigene
   Datei, `requireOwner`-Guard); `/admin`-Kalender bleibt unangetastet.
5. **Overlap via `claimSlot`** im Booking-POST verdrahten (atomares
   DELETE…RETURNING statt neuem Constraint).
6. **CalDAV bleibt Source of Truth** (Nextcloud wie heute).

## Scope

- Neu: Owner-Kalenderseite + Owner-Verfügbarkeits-Endpoints (Zeit
  blocken, Umbuchen/Storno, Telefon-Buchung), Settings-JSON-Modell
  (Lesen/Schreiben + Validierung), Katalog-Einträge Massage-Business,
  Vitest-Suites + `tests/spec/services-calendar.bats`-Guards.
- Geändert (Auswahl, Budgets aus `intel.json`): `caldav.ts` (432),
  `appointments-db.ts` (432), `booking.ts` (781), `caldav-cache.ts`
  (813), `slots.ts` (870) — exakte Budgets ermittelt der Plan pro
  Datei (B1a).
- Regeln serverseitig: Vortags-Vorlauf Europe/Berlin (DST-sicher),
  Gleich-Tages-Anfrage → 409/422, Puffer/Feiertage in Slot-Berechnung,
  Bei-Bestätigung Re-Check (Verfügbarkeit + abgelaufen).
- Nicht-Ziele: keine `/admin`-Umbauten, keine services-DB-Tabelle,
  keine Exclusion-Constraints, keine externe Kalender-Sync über
  CalDAV hinaus, keine Online-Zahlungen.

## Akzeptanz-Mapping (Ticket)

- Überlappungen serverseitig abgewiesen (claimSlot + Tests).
- Puffer-/Feiertags-/Vorlauf-Fälle funktionieren (Fall-Matrix grün).
- Inhaberin erledigt Tagesgeschäft mobil (Kalender-Seite responsiv,
  Aktionen als Owner-Endpoints).
- Preis/Dauer bleiben an Bestandsterminen (Snapshot-Tests).
