# T901023 — Proposal (Brainstorming-Output)

## Problem

Buchbare Leistungen, korrekte Verfügbarkeit (Europe/Berlin) und ein
mobil bedienbarer Inhaber-Kalender fehlen; der Buchungspfad mischt
UTC-Datum mit lokaler Uhrzeit und hat keinen Überlappungsschutz.

## Entscheidungen (2026-10-07, Chat-Brainstorming)

Timezone shared fixen · Katalog statisch · Zeiten in site_settings-JSON ·
neue /owner/kalender-Seite · Overlap via claimSlot · CalDAV bleibt Truth.

## Partial-Skizze (Decompose in Phase C)

1. `p1-availability-core` — Timezone-Fix + Puffer/Feiertage/Vorlauf in
   Verfügbarkeitsberechnung, claimSlot im Booking-POST (impl).
2. `p2-owner-calendar` — Owner-Kalenderseite + Owner-Endpoints
   (blocken/umbuchen/storno/Telefon-Buchung), Katalog-Einträge (impl).
3. `p3-settings-catalog` — Settings-JSON-Modell + Validierung,
   Preis/Dauer-Snapshot (impl).
4. `p4-tests` — Vitest + Spec-Guards + rot→grün-Step (tests, zuletzt).

## Risiken

Shared-Code-Fix berührt Mentolder-Pfade (Regressionstests!) · kein
Live-DB-Read in der Planung · Snapshot-Semantik muss exakt sein.
