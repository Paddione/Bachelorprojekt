# g-size03-website-db-split

## Purpose

Diese Capability stellt sicher, dass `website/src/lib/website-db.ts` dauerhaft unterhalb von 3000 Zeilen bleibt, indem klar abgegrenzte Datenbankdomänen in eigenständige Module extrahiert werden. Das Ergebnis ist eine wartbare, merge-konfliktarme DB-Schicht, in der jedes Modul genau eine fachliche Domäne abbildet und das Size-Gate ohne Ausnahmeliste greifen kann.

## ADDED Requirements

### Requirement: Der Mess-Command `wc -l < website/src/lib/website-db

The system SHALL der Mess-Command `wc -l < website/src/lib/website-db.ts` ist jederzeit lokal reproduzierbar und liefert eine eindeutige Ganzzahl ohne Abhängigkeit von Netzwerk, Cluster oder CI-Umgebung.
- REQ-2: Das neue Modul `website/src/lib/appointments-db.ts` enthält alle Exports der Terminbuchungs- und Kalender-Domäne (`CalendarTask`, `CalendarProject`, `CalendarMeeting`, `BookingInvoiceInfo`, `WhitelistedSlot`, `FreeTimeWindow` und alle zugehörigen CRUD-Funktionen) und kein Code dieser Domäne verbleibt doppelt in `website-db.ts`.
- REQ-3: Alle Aufrufer in `website/src/pages/` importieren Appointments-Symbole aus `appointments-db`, nicht aus `website-db`. Der TypeScript-Compiler läuft fehlerfrei durch (`npx tsc --noEmit`).
- REQ-4: Die `initDb`-Kaskade in `website-db.ts` initialisiert die Appointments-Tabellen weiterhin korrekt — entweder durch Delegation an `initAppointmentsDb()` aus dem neuen Modul oder durch gleichwertige explizite Aufrufe an den zuständigen Stellen.
- REQ-5: Falls nach der Appointments-Extraktion `wc -l < website/src/lib/website-db.ts` noch > 3000 ergibt, werden weitere Domänenblöcke (zuerst die Meetings-Domäne) analog extrahiert, bis das Ziel erreicht ist.
- REQ-6: Sobald `website-db.ts` ≤ 3000 Zeilen aufweist, wird der `s1.ignore`-Eintrag für diese Datei in `gates.yaml` entfernt, sodass das Size-Gate fortan ohne Ausnahme greift.
- REQ-7: `newsletter-db.ts` und `coaching-db.ts` bleiben eigenständige Module ohne inhaltliche Änderungen; es verbleiben keine Newsletter- oder Coaching-spezifischen Exports in `website-db.ts`.

## Acceptance Criteria

- THEN liefert `wc -l < website/src/lib/website-db.ts` einen Wert von höchstens 3000.
- THEN existiert `website/src/lib/appointments-db.ts` mit allen Appointments/Kalender-Exports und besteht den TypeScript-Compiler-Check (`npx tsc --noEmit` in `website/`).
- THEN enthält `website-db.ts` keinen Export mehr, dessen Name `Calendar`, `Booking`, `Slot` oder `FreeTimeWindow` enthält.
- THEN gibt `bash scripts/health-goals-check.sh --only=G-SIZE03` grünen Status aus (Exit-Code 0).
- THEN ist `website/src/lib/website-db.ts` nicht mehr in der `s1.ignore`-Liste von `gates.yaml` enthalten.
- THEN laufen `task test:changed`, `task freshness:regenerate` und `task freshness:check` ohne Fehler durch.
