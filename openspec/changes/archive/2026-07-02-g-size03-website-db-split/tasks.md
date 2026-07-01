---
title: "G-SIZE03: God-File website-db.ts aufteilen (4435→≤3000 Zeilen)"
ticket_id: T001293
domains: ["website","quality","size"]
status: plan_staged
---

# g-size03-website-db-split — Implementation Plan

## File Structure

| Datei | Status |
|-------|--------|
| `website/src/lib/website-db.ts` | Geändert — Appointments-Block (ca. Zeilen 2466–2970) entfernt; ggf. weitere Domänen-Blöcke entfernt bis ≤ 3000 Zeilen |
| `website/src/lib/appointments-db.ts` | Neu — Terminbuchungs- und Kalender-DB-Schicht |
| `website/src/lib/newsletter-db.ts` | Referenz — bereits eigenständiges Modul, keine inhaltlichen Änderungen |
| `website/src/lib/coaching-db.ts` | Referenz — bereits eigenständiges Modul, keine inhaltlichen Änderungen |
| `website/src/pages/admin/termine.astro` | Geändert — Import von `appointments-db` statt `website-db` |
| `website/src/pages/admin/kalender.astro` | Geändert — Import von `appointments-db` statt `website-db` |
| `website/src/pages/api/booking.ts` | Geändert — Import von `appointments-db` statt `website-db` |
| `website/src/pages/api/bookings/[uid]/project.ts` | Geändert — Import von `appointments-db` statt `website-db` |
| `website/src/pages/api/admin/slots/add.ts` | Geändert — Import von `appointments-db` statt `website-db` |
| `website/src/pages/api/admin/slots/remove.ts` | Geändert — Import von `appointments-db` statt `website-db` |
| `website/src/pages/api/admin/time-windows/add.ts` | Geändert — Import von `appointments-db` statt `website-db` |
| `website/src/pages/api/admin/time-windows/remove.ts` | Geändert — Import von `appointments-db` statt `website-db` |

---

## Task 0: Baseline messen (RED)

Vor jeder Code-Änderung den aktuellen Ist-Zustand festhalten.

- [ ] Measure-Command ausführen: `wc -l < website/src/lib/website-db.ts`
  expected: FAIL (aktueller Wert: 4435 Zeilen in `website/src/lib/website-db.ts` — over target: ≤ 3000 Zeilen (danach aus `s1.ignore` entfernen))
- [ ] Dokumentieren, welche Domänen-Blöcke noch in `website-db.ts` enthalten sind:
  - Meetings-Domäne (ca. Zeilen 251–630, ~380 Zeilen): `initMeetingsDb`, `Meeting`, `MeetingWithDetails`, `createMeeting`, `updateMeetingStatus`, `saveTranscript`, `saveArtifact`, `saveInsight`, `releaseMeeting`, `getMeetingsForClient`, `listAllMeetings`, `getMeetingDetail`, `assignMeeting`
  - Appointments/Buchungs-Domäne (ca. Zeilen 2466–2970, ~505 Zeilen): `CalendarTask`, `CalendarProject`, `CalendarMeeting`, `BookingInvoiceInfo`, `WhitelistedSlot`, `FreeTimeWindow` und alle zugehörigen CRUD-Operationen
  - Sonstige Domänen (Billing, CMS-Content, Service-Config, Site-Settings, Legal, Referenzen, Projekte)
- [ ] Lücke zur Zielerreichung berechnen: 4435 − 3000 = 1435 zu entfernende Zeilen

---

## Task 1: appointments-db.ts anlegen — Appointments-Domäne extrahieren

Alle Terminbuchungs- und Kalender-Exports aus `website-db.ts` in ein neues Modul verschieben.

**Dateien:**
- `website/src/lib/appointments-db.ts` — neu erstellen
- `website/src/lib/website-db.ts` — extrahierten Block entfernen

**Implementierung:**

`appointments-db.ts` erhält dieselbe Pool-Import-Zeile wie die anderen Split-Dateien:

```typescript
import { pool } from './db-pool';
```

Folgende Exports werden aus `website-db.ts` nach `appointments-db.ts` verschoben (vollständige Blöcke inklusive privater Hilfsfunktionen, `init*`-Funktionen und zugehöriger Interfaces):

- `CalendarTask` (Interface) und `listTasksInMonth`
- `CalendarProject` (Interface) und `listProjectsInMonth`
- `CalendarMeeting` (Interface) und `listMeetingsInRange`
- `initBookingProjectLinks` (private Hilfsfunktion)
- `initBookingInvoiceLinksTable` (private Hilfsfunktion)
- `setBookingInvoice`, `BookingInvoiceInfo`, `getBookingInvoices`
- `getBookingProjects`, `setBookingProject`, `getBookingLeistungen`
- `WhitelistedSlot` (Interface), `initSlotWhitelistTable`, `getWhitelistedSlots`, `addSlotToWhitelist`, `removeSlotFromWhitelist`, `isSlotWhitelisted`, `claimSlot`
- `FreeTimeWindow` (Interface), `initFreeTimeWindowsTable`, `getFreeTimeWindows`, `addFreeTimeWindow`, `removeFreeTimeWindow`, `isSlotInAnyWindow`

Nach der Verschiebung: in `website-db.ts` einen Barrel-Re-Export ergänzen, damit bestehende Importe (die noch nicht umgestellt wurden) nicht sofort brechen — dieser Re-Export wird in Task 2 wieder entfernt:

```typescript
// Temporärer Re-Export — wird in Task 2 entfernt
export * from './appointments-db';
```

---

## Task 2: Imports umstellen — alle Aufrufer auf appointments-db zeigen

Jede Datei, die bisher Appointments-Symbole aus `website-db` importierte, wird auf den direkten Import aus `appointments-db` umgestellt. Anschließend wird der temporäre Re-Export aus `website-db.ts` entfernt.

**Zu ändernde Dateien (vollständige Liste aus Codebase-Scan):**

- `website/src/pages/api/booking.ts` — `isSlotInAnyWindow`
- `website/src/pages/api/bookings/[uid]/project.ts` — `setBookingProject`
- `website/src/pages/api/admin/slots/add.ts` — `addSlotToWhitelist`
- `website/src/pages/api/admin/slots/remove.ts` — `removeSlotFromWhitelist`
- `website/src/pages/api/admin/time-windows/add.ts` — `addFreeTimeWindow`
- `website/src/pages/api/admin/time-windows/remove.ts` — `removeFreeTimeWindow`
- `website/src/pages/admin/termine.astro` — `getBookingProjects`, `getBookingInvoices`, `getBookingLeistungen`, `getFreeTimeWindows` sowie Typen `BookingInvoiceInfo`, `FreeTimeWindow`
- `website/src/pages/admin/kalender.astro` — Typen `CalendarTask`, `CalendarProject`, `CalendarMeeting`
- `website/src/pages/api/admin/inbox/[id]/action.ts` — `setBookingInvoice` (gemeinsam mit anderen Symbolen aus `website-db`; nur den Booking-Import umleiten)

**Vorgehen:** Jede Datei bekommt einen zusätzlichen Import-Block für `appointments-db`, der die Appointments-Symbole enthält; der entsprechende Import-Pfad in der `website-db`-Import-Zeile wird bereinigt. Nach allen Umstellungen: temporären Re-Export aus `website-db.ts` entfernen.

**Prüfung nach Task 2:**

```bash
cd website && npx tsc --noEmit
```

Muss fehlerfrei durchlaufen (keine ungelösten Imports).

---

## Task 3: Restmenge prüfen und ggf. weitere Domäne extrahieren

Nach Task 1 und 2 die aktuelle Zeilenzahl messen und entscheiden, ob das Ziel bereits erreicht ist.

- [ ] `wc -l < website/src/lib/website-db.ts` ausführen und mit 3000 vergleichen
- [ ] Falls Ergebnis > 3000: die Meetings-Domäne (ca. Zeilen 251–630 in der ursprünglichen Datei, ~380 Zeilen) analog zu Task 1 in eine neue Datei `website/src/lib/meetings-db.ts` extrahieren und alle Aufrufer umstellen
  - Meetings-Exports: `initMeetingsDb`, `Meeting`, `MeetingWithDetails`, `MeetingWithCustomer`, `getMeetingByRoomToken`, `createMeeting`, `updateMeetingStatus`, `SavedTranscript`, `saveTranscript`, `saveArtifact`, `saveInsight`, `releaseMeeting`, `getMeetingsForClient`, `AdminMeeting`, `listAllMeetings`, `getMeetingDetail`, `assignMeeting`, `listMeetingsForProject`
  - Aufrufer ermitteln: `grep -rn "from.*website-db" website/src/ | grep -i "meeting\|Meeting\|transcript\|Transcript\|artifact\|Artifact\|insight\|Insight"`
- [ ] Nach jeder weiteren Extraktion TypeScript-Check wiederholen: `cd website && npx tsc --noEmit`
- [ ] Schritt so oft wiederholen bis: `wc -l < website/src/lib/website-db.ts` liefert ≤ 3000

---

## Task 4: s1.ignore-Eintrag entfernen

Sobald `website-db.ts` dauerhaft ≤ 3000 Zeilen aufweist, den Dateinamen aus der `s1.ignore`-Liste in `gates.yaml` entfernen, damit das Size-Gate fortan greift und weiteres unkontrolliertes Wachstum verhindert wird.

- [ ] In `gates.yaml` den Eintrag `website/src/lib/website-db.ts` unter `s1.ignore` (oder dem entsprechenden Size-Ignore-Block) entfernen
- [ ] `bash scripts/health-goals-check.sh --only=G-SIZE03` ausführen — Ausgabe muss grün zeigen

---

## Task 5 (Verify): Quality Gates

- [ ] `bash scripts/health-goals-check.sh --only=G-SIZE03` → Ziel-Status grün
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
