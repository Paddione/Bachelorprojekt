---
title: "p1 — Verfügbarkeitskern"
ticket_id: T901023
domains: [website, booking]
status: active
---

# p1 — Verfügbarkeitskern

**Partial:** p1 · **Rolle:** impl · **depends_on:** keine.
**Scope:** Europe/Berlin Ende-zu-Ende in der Verfügbarkeitsberechnung, Puffer/Feiertage/Vorlauf
in der Slot-Logik, atomarer Claim im Booking-POST, Preis/Dauer-Snapshot im Booking-Payload.
CalDAV bleibt Source of Truth. Tests liegen in p4.

<!-- vitest: kein eigener Test-Task in diesem Partial, weil sämtliche Vitest-Suites und Regressionstests in p4 (Tests-Rolle) liegen -->

## File Structure

S1-Budgets gegen die wirksame Schwelle (alle fünf Dateien nicht-baselined, Extension-Limit .ts 900):

- `components/website/src/lib/caldav.ts` Ist 468 · Schwelle 900 → Budget 432
- `components/website/src/lib/appointments-db.ts` Ist 468 · Schwelle 900 → Budget 432
- `components/website/src/lib/caldav-cache.ts` Ist 87 · Schwelle 900 → Budget 813
- `components/website/src/pages/api/booking.ts` Ist 119 · Schwelle 900 → Budget 781
- `components/website/src/pages/api/calendar/slots.ts` Ist 30 · Schwelle 900 → Budget 870

## Task p1.1: Config-Oberfläche und Berlin-Helfer ergänzen

Datei: `components/website/src/lib/caldav-cache.ts` (nur additiv erweitern, bestehende Exporte
unverändert lassen).

Schritte:

1. Env-gestützte Defaults anhängen: `SLOT_BUFFER_MIN` (Default 0), `BOOKING_LEADTIME_DAYS`
   (Default 1), `BERLIN_TZ` (`Europe/Berlin`).
2. Reine Helfer ohne neue Imports anhängen: `berlinDayKey(d: Date): string` (YYYY-MM-DD via
   `Intl.DateTimeFormat` mit `BERLIN_TZ`), `berlinWallMinutes(d: Date): number` (Minuten seit
   Berliner Mitternacht via `formatToParts`), `berlinWeekdayIso(d: Date): number` (1 bis 7).
3. Voll typisiert schreiben, kein `any` (CQ02). Das Modul bleibt importfrei, daher kann kein
   Importzyklus entstehen (S2).
4. Prüfung: `grep -n 'berlinDayKey\|berlinWallMinutes\|berlinWeekdayIso\|SLOT_BUFFER_MIN\|BOOKING_LEADTIME_DAYS'`
   auf der Datei listet alle neuen Exporte.

## Task p1.2: Slot-Berechnung und CalDAV-Writes auf Europe/Berlin umstellen

Datei: `components/website/src/lib/caldav.ts`.

Schritte:

1. Die p1.1-Helfer und -Defaults in den bestehenden Import aus `caldav-cache.ts` aufnehmen.
2. `getAvailableSlots(fromDate?: Date, brand?: string, slotDurationMin?: number)` bei
   unveränderter Signatur umstellen: alle Tages-Schlüssel (Fenster-Range, Urlaubstage,
   Cursor-Tag) auf `berlinDayKey`; Cursor-Iteration auf Berliner Kalendertage mit
   `berlinWeekdayIso`; server-lokale Getters und UTC-Splits aus der Kalenderlogik entfernen.
   `start`/`end` der Slots bleiben UTC-ISO-Instants, nur die Kalenderarithmetik läuft in
   Europe/Berlin. `display` aus Berliner Wandzeit formatieren.
3. Den rollierenden `MIN_ADVANCE_HOURS`-Cutoff durch Kalender-Vorlauf ersetzen: das
   Berlin-Datum des Slots muss strikt nach dem Berlin-Datum der Anfrage liegen
   (Abstand über `BOOKING_LEADTIME_DAYS` skaliert, Default 1). Reine Datumsschlüssel, keine
   Stundenarithmetik, daher DST-sicher.
4. Puffer und Feiertage aus den Settings einrechnen: Busy-Events beidseitig um die
   Settings-Pufferminuten (Default `SLOT_BUFFER_MIN`) erweitern; Feiertags-Daten aus dem
   Settings-JSON pro Brand wie Urlaubstage überspringen (Lesen über denselben
   Settings-Pfad wie die Urlaubsperioden).
5. `createCalendarEvent` und `updateCalendarEventTime`: `DTSTART`/`DTEND` zonenbewusst als
   Europe/Berlin-Wandzeit mit TZID stempeln; UID, PRODID, ATTENDEE und STATUS unverändert.
6. CalDAV bleibt Source of Truth: der Busy-Abgleich gegen die gefetchten Events bleibt
   maßgeblich, keine DB-seitigen Verfügbarkeits-Caches einführen.
7. Prüfung: `getAvailableSlots` nutzt keine UTC-Splits und keine server-lokalen Tages-Getters
   mehr; alle geänderten Signaturen sind unverändert.

## Task p1.3: Fensterprüfung auf Berliner Tagesgrenzen fixieren

Datei: `components/website/src/lib/appointments-db.ts`.

Schritte:

1. `isSlotInAnyWindow(brand: string, slotStart: Date, slotEnd: Date)`: den UTC-Datum-Anteil
   (`toISOString`-Split) durch `berlinDayKey(slotStart)` und die server-lokalen Stunden durch
   Berliner Wandzeit (`berlinWallMinutes`) ersetzen. SQL gegen `free_time_windows`
   (brand/date/win_start/win_end) und Signatur bleiben unverändert.
2. Die reinen Helfer aus `caldav-cache.ts` per One-Way-Import beziehen; da jenes Modul
   importfrei ist, entsteht kein Zyklus (S2).
3. Tagesgrenzen sind Berliner Kalendertage ohne feste Offsets, daher DST-sicher. Alle übrigen
   Exporte der Datei (`claimSlot`, Whitelist-, Fenster- und Link-Funktionen) unverändert lassen.
4. Prüfung: `grep -n 'toISOString\|getHours\|getDay' ` auf `isSlotInAnyWindow` meldet keine
   Kalenderlogik-Treffer mehr.

## Task p1.4: Vortags-Vorlauf, atomarer Claim und Snapshot im Booking-POST

Datei: `components/website/src/pages/api/booking.ts`.

Schritte:

1. POST-Ablauf festlegen: Feldvalidierung → Berliner Vortags-Prüfung (Berlin-Datum von
   `slotStart` strikt nach Berlin-Datum von jetzt, sonst 409 im Stil der bestehenden
   Fenster-409) → `isSlotInAnyWindow` (409) → `claimSlot(BRAND, new Date(slotStart))`, bei
   `false` 409 → `createInboxItem` → Mails. Gleich-Tages-Anfragen scheitern damit immer mit
   409. Der Callback-Typ ohne Slot bleibt unverändert.
2. `claimSlot` aus demselben Modul importieren, aus dem die Datei bereits
   `isSlotInAnyWindow` bezieht (bestehende Importzeile erweitern, kein neuer Pfad). Der Claim
   steht unmittelbar vor dem Inbox-Insert, sodass Doppelbuchungen atomar per
   DELETE-RETURNING abgewehrt werden.
3. Preis/Dauer-Snapshot: Katalogeintrag zum übergebenen Schlüssel über denselben
   Katalog-Lesepfad auflösen, den der Leistungen-Endpunkt verwendet; `serviceSnapshot`
   mit Schlüssel, Name, Preis und Dauer-Minuten ins Booking-Payload einbetten. Unbekannter
   Schlüssel führt zu 400. Die Werte werden zum Anfragezeitpunkt eingefroren, spätere
   Katalogänderungen berühren Bestand nicht.
4. Rate-Limit (5/min/IP), Mail-Texte und Antwort-Shape unverändert lassen.
5. Prüfung: `grep -n 'claimSlot\|createInboxItem\|serviceSnapshot' ` zeigt Claim vor Insert
   und Snapshot im Payload; alle drei 409-Pfade (Vorlauf, Fenster, Claim) sind vorhanden.

## Task p1.5: Slots-Endpunkt konsistent durchreichen

Datei: `components/website/src/pages/api/calendar/slots.ts`.

Schritte:

1. `?from=` als Berliner Kalenderdatum parsen (YYYY-MM-DD ergibt Berliner Tagesbeginn,
   ungültig ergibt undefined). `durationMin` nur als positive Ganzzahl übernehmen, sonst
   undefined für den Server-Default.
2. `getAvailableSlots(fromDate, brand, durationMin)` unverändert aufrufen; Brand-Default,
   `Cache-Control: private, max-age=60` und Fehler-Shape unverändert lassen.
3. Konsistenz: angebotene Slots dürfen die Buchungs-Vorlaufregel nie verletzen (gleiche
   Berlin-Tagesmathematik wie p1.2 und p1.4).
4. Prüfung: `grep -n 'max-age=60\|getAvailableSlots' ` bestätigt Header und Passthrough.

## Regression: Mentolder-Pfade

Die Default-Pfade (Brand-Default der Booking-Route, Slots-Default, fensterbasierte
Kundenansicht, Admin-Übersicht ohne Brand) bleiben außerhalb der beabsichtigten
Timezone-Korrektur mengenstabil. Die Fall-Matrix (Puffer, Feiertage, Vorlauf,
Doppelbuchung, DST-Tage) und alle Regressionstests für bestehendes Verhalten liegen in p4.

Gates: keine neuen `any`-Typen (CQ02), keine Importzyklen (S2, nur reiner One-Way-Import),
keine Domain-Literale in Snippets (S3, Env-/Config-Auflösung bleibt), keine neuen Dateien,
Skripte oder Manifeste (S4), keine Baseline-Änderung.
