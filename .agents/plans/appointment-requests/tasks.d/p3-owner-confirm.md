## Task 1: Offene Anfragen in owner/anfragen.astro auflisten

Kontext. Dieses Partial setzt die Owner-Bestaetigung fuer T901024 (Slug appointment-requests) um: echte Liste offener Anfragen plus Annehmen/Ablehnen-Endpunkte. Es besitzt exakt drei Zieldateien (unten), erstellt oder aendert keine weitere Datei und setzt voraus, dass das Lib/Migrations-Partial gemergt ist: `components/website/src/lib/appointment-requests.ts` und `components/website/src/db/migrations/20261008_appointment_requests.sql` muessen existieren. Der Executor verifiziert das in Schritt 1 vor jeder Code-Aenderung.

Angenommener p1-Vertrag (kanonische Namen; weicht die Lib-Datei ab, folgen alle Schritte den echten Exporten, und die Abweichung landet in der Commit-Message): Typ `AppointmentRequest` mit `id`, `brand`, `status`, `name`, `email`, `phone`, `serviceName`, `slotStart`, `slotEnd`, `slotDisplay`, `message`; Funktionen `listOpenAppointmentRequests(brand)`, `getAppointmentRequest(id)`, `confirmAppointmentRequest(id, { caldavUid })`, `declineAppointmentRequest(id, { note })`. Die beiden Statusfunktionen wenden den Uebergang nur aus `offen` an und melden `false` bei bereits bearbeiteten Anfragen.

S1-Budgets (verifiziert 2026-10-08 im Worktree, gates.yaml: `.astro` 1000, `.ts` 900): `components/website/src/pages/owner/anfragen.astro` Ist 26, nicht baselined, wirksame Schwelle 1000, Budget 974. Die beiden Endpunkte sind neue Dateien unter dem `.ts`-Limit 900 mit Zielstaenden um 170 bzw. 120 Zeilen. Alle drei Dateien bleiben deutlich unter 80 Prozent ihrer wirksamen Schwelle, daher ist kein Split noetig.

Zieldateien (eine Aenderung, zwei neue Dateien, exklusiv):

- `components/website/src/pages/owner/anfragen.astro` (anfragen.astro): Liste offener Anfragen mit Service, Slot, Kontakt, Annehmen/Ablehnen-Formularen; `requireOwner` bleibt.
- `components/website/src/pages/api/owner/anfragen/[id]/annehmen.ts` (annehmen.ts): Owner-Annahme mit atomarem Availability-Recheck, CalDAV-Block und Bestaetigungsmail.
- `components/website/src/pages/api/owner/anfragen/[id]/ablehnen.ts` (ablehnen.ts): Ablehnung mit Notiz an den Gast.

### Steps

1. Verifiziere die Voraussetzungen vom Worktree-Root aus und halte Drift im Commit fest:
   ```bash
   ls components/website/src/lib/appointment-requests.ts components/website/src/db/migrations/20261008_appointment_requests.sql
   grep -n 'export .*listOpenAppointmentRequests\|export .*getAppointmentRequest\|export .*confirmAppointmentRequest\|export .*declineAppointmentRequest' components/website/src/lib/appointment-requests.ts
   grep -n 'requireOwner' components/website/src/pages/owner/anfragen.astro
   grep -n 'addSlotToWhitelist' components/website/src/lib/website-db.ts components/website/src/lib/appointments-db.ts | head -5
   ```
   Fehlt ein p1-Export unter anderem Namen, gelten die echten Namen fuer alle folgenden Schritte. `addSlotToWhitelist` wird fuer die Slot-Rueckgabe in Task 2 gebraucht (Re-Export aus `website-db` oder Direktimport aus `appointments-db`).
2. Erweitere `components/website/src/pages/owner/anfragen.astro` (anfragen.astro): Die `requireOwner`-Zeilen und der Login-Redirect bleiben unverändert erhalten. Lade serverseitig die Marke via `ownerBusiness(session).brand` mit Env-Fallback wie in `api/owner/calendar/block.ts` und die offenen Anfragen via `listOpenAppointmentRequests(brand)`. Rendere pro Anfrage Service-Name, Slot (Datum plus `slotDisplay`), Gastkontakt (Name, E-Mail, Telefon) und Nachricht sowie zwei POST-Formulare ohne clientseitiges JavaScript: eines an `./anfragen/<id>/annehmen`, eines an `./anfragen/<id>/ablehnen` mit `textarea name="note"`. Der Leerzustand behalte den Satz `Noch keine Anfragen vorhanden.` und den Rueck-Link. Kein `set:html`, keine neuen Abhaengigkeiten ausser der p1-Lib.
3. Pruefe die Datei gegen die Guards:
   ```bash
   grep -c 'requireOwner' components/website/src/pages/owner/anfragen.astro
   if grep -rnE ': any|<any>|as any' components/website/src/pages/owner/anfragen.astro; then exit 1; fi
   if grep -rniE 'mentolder\.de|korczewski\.de' components/website/src/pages/owner/anfragen.astro | grep -v '^\s*//'; then exit 1; fi
   wc -l components/website/src/pages/owner/anfragen.astro
   ```
   Der erste Guard muss mindestens 1 melden, die beiden Muster-Guards nichts, und die Zeilenzahl muss unter 1000 bleiben.

### Acceptance criteria

- `anfragen.astro` laedt nur fuer Owner-Sessions (Redirect fuer Gaeste unveraendert) und listet offene Anfragen der eigenen Marke mit Service, Slot, Kontakt und Nachricht.
- Jede Anfrage hat ein Annehmen-Formular und ein Ablehnen-Formular mit Notizfeld; ohne Anfragen erscheint der bisherige Leerzustand.
- Die Datei enthaelt keine `any`-Typen und keine hartcodierten Brand-Domains und bleibt unter dem `.astro`-Limit.

## Task 2: Annahme-Endpunkt annehmen.ts mit atomarem Recheck

Kontext. Dieser Task erstellt den POST-Endpunkt, der eine offene Anfrage annimmt. Ablauf strikt in dieser Reihenfolge: Auth, Laden, Status, Ablauf-Pruefung, Vorlauf-Re-Validierung, Fenster-Re-Check, atomarer Claim, CalDAV-Ueberlappung, CalDAV-Block, Persistenz, Gastmail. Nach einem erfolgreichen Claim stellt jeder spaetere Fehlschlag die Whitelist-Zeile via `addSlotToWhitelist` wieder her, damit der Slot nicht verloren geht. Kleine Body/Parse-Helfer werden inline dupliziert (Vorbild `readBody` in `block.ts`), weil ein vierter Helper-File gegen die Target-Exklusivitaet verstiesse.

### Steps

1. Erstelle `components/website/src/pages/api/owner/anfragen/[id]/annehmen.ts` (annehmen.ts) als `POST: APIRoute`: `requireOwner` aus dem Cookie-Header, sonst 401 mit `{ error: 'Unauthorized' }` wie in `block.ts`; Marke aus `ownerBusiness(session).brand` mit `process.env.BRAND`-Fallback. Lade die Anfrage via `getAppointmentRequest(params.id)`; fehlt sie oder gehoert sie einer fremden Marke, antworte 404 mit `{ error: 'Anfrage nicht gefunden.' }`. Ist ihr Status nicht `offen`, antworte 409 mit `{ error: 'Diese Anfrage wurde bereits bearbeitet.' }`.
2. Implementiere die Re-Validierungen vor jeder Mutation, jede mit 409 und eigener deutscher Meldung: abgelaufener Slot (`slotStart <= now`), verletzte Berlin-Vorlauffrist (`berlinDayKey(slotStart) <= berlinDayKey(now)` aus `caldav-cache`, Vorbild `booking.ts`), Slot ausserhalb der aktuellen Zeitfenster (`isSlotInAnyWindow`). Slotlose Anfragen (Rueckruf ohne Termin) ueberspringen alle Slot-Pruefungen sowie Claim und CalDAV-Block und laufen direkt zu Schritt 5.
3. Implementiere den atomaren Availability-Recheck wie in `booking.ts`: pruefe `isSlotWhitelisted(brand, slotStart)`; nur bei Treffer konsumiere die Zeile sofort mit `claimSlot(brand, slotStart)`; meldet der Claim `false` (verlorener Race), antworte 409. Danach pruefe die CalDAV-Ueberlappung via `getAllBookings` (`status !== 'CANCELLED'`, Intervall-Schnitt); bei Treffer stelle die Whitelist-Zeile wieder her und antworte 409.
4. Erstelle den CalDAV-Block via `createCalendarEvent` mit `summary` aus Service und Gastname, `description` mit Anfragedetails, `start`/`end` aus dem Slot sowie `attendeeEmail`/`attendeeName` des Gastes. Gibt die Funktion `null` zurueck, stelle die Whitelist-Zeile wieder her und antworte 502 mit `{ error: 'Kalender konnte nicht geschrieben werden.' }` wie in `block.ts`.
5. Persistiere via `confirmAppointmentRequest(id, { caldavUid })`; meldet sie `false` (parallele Bearbeitung), antworte 409. Sende danach die Bestaetigungsmail an den Gast via `sendEmail` mit `BRAND_NAME` aus Env und `request` als zweitem Argument (E2E-Markierung, Vorbild `booking.ts`); ein `false` wird nur geloggt, die Antwort bleibt 200 mit `{ success: true }`. Unerwartete Fehler landen mit `locals.requestLogger` im 500-Handler wie in `block.ts`.
6. Pruefe Datei-Guards und Budget:
   ```bash
   if grep -rnE ': any|<any>|as any' 'components/website/src/pages/api/owner/anfragen/[id]/annehmen.ts'; then exit 1; fi
   if grep -rniE 'mentolder\.de|korczewski\.de' 'components/website/src/pages/api/owner/anfragen/[id]/annehmen.ts' | grep -v '^\s*//'; then exit 1; fi
   grep -c 'claimSlot\|requireOwner\|createCalendarEvent\|sendEmail' 'components/website/src/pages/api/owner/anfragen/[id]/annehmen.ts'
   wc -l 'components/website/src/pages/api/owner/anfragen/[id]/annehmen.ts'
   ```
   Die Muster-Guards muessen leer bleiben, der Vertrags-Guard alle vier Symbole finden, die Zeilenzahl unter 900.

### Acceptance criteria

- Unbekannte oder markenfremde IDs geben 404, Nicht-Owner 401, bereits bearbeitete Anfragen 409; doppelte POSTs sind dadurch idempotent.
- Abgelaufene Slots, verletzte Vorlauffrist, gueltigkeitsverlorene Fenster, verlorene Claim-Races und CalDAV-Ueberlappungen geben je 409 mit eigener Meldung; verlorene Slots werden per `addSlotToWhitelist` zurueckgegeben.
- Erfolgreiche Annahmen erzeugen genau einen CalDAV-Termin mit Gast-Attendee, persistieren Status plus `caldav_uid` und senden die Bestaetigungsmail.
- Die Datei bleibt unter dem `.ts`-Limit, ohne `any` und ohne hartcodierte Domains.

## Task 3: Ablehnungs-Endpunkt ablehnen.ts mit Gast-Notiz

Kontext. Dieser Task erstellt den POST-Endpunkt, der eine offene Anfrage ablehnt und die Begruendung per Mail an den Gast sendet. Ablehnen verbraucht keinen Slot und schreibt keinen Kalender: Die Whitelist-Zeile bleibt fuer andere Anfragen bestehen.

### Steps

1. Erstelle `components/website/src/pages/api/owner/anfragen/[id]/ablehnen.ts` (ablehnen.ts) als `POST: APIRoute` mit derselben Auth-, Marken- und Lade-Logik wie Task 2 Schritt 1 (401/404/409-Faelle identisch). Lies den Body JSON- oder formular-tolerant mit einem inline `readBody` wie in `block.ts`; `note` ist optional, wird getrimmt und darf hoechstens 1000 Zeichen haben, sonst 400 mit `{ error: 'Notiz maximal 1000 Zeichen.' }`.
2. Persistiere via `declineAppointmentRequest(id, { note })`; meldet sie `false`, antworte 409 mit der Bereits-bearbeitet-Meldung. Sende danach die Absagemail an den Gast via `sendEmail` (Betreff und Text im Ton von `booking.ts`, mit der Notiz, wenn sie nicht leer ist); `request` als zweites Argument, `false` nur loggen. Antworte 200 mit `{ success: true }`; 500-Handler wie in `block.ts`.
3. Pruefe Datei-Guards und Budget:
   ```bash
   if grep -rnE ': any|<any>|as any' 'components/website/src/pages/api/owner/anfragen/[id]/ablehnen.ts'; then exit 1; fi
   if grep -rniE 'mentolder\.de|korczewski\.de' 'components/website/src/pages/api/owner/anfragen/[id]/ablehnen.ts' | grep -v '^\s*//'; then exit 1; fi
   if grep -nE 'claimSlot|createCalendarEvent|deleteCalendarEvent' 'components/website/src/pages/api/owner/anfragen/[id]/ablehnen.ts'; then exit 1; fi
   wc -l 'components/website/src/pages/api/owner/anfragen/[id]/ablehnen.ts'
   ```
   Alle drei Guards muessen leer bleiben (kein Slot- oder Kalenderzugriff im Ablehnpfad), die Zeilenzahl unter 900.

### Acceptance criteria

- Auth-, 404- und Doppelbearbeitungs-Verhalten stimmen mit dem Annahme-Endpunkt ueberein; zu lange Notizen geben 400.
- Erfolgreiche Ablehnungen persistieren Status plus Notiz und senden die Absagemail mit Notiz an den Gast.
- Der Ablehnpfad ruft weder `claimSlot` noch CalDAV-Schreibfunktionen auf und bleibt unter dem `.ts`-Limit.

## Task 4: Verify, Scope-Nachweis und Commit

Kontext. Dieser Task beweist Rot-nach-Gruen, die Target-Exklusivitaet, die S1-Budgets und die CI-Gates und committet genau die drei Dateien.

<!-- vitest: kein neuer Test noetig, weil die Endpunkt-Abdeckung in der Ticket-Spec-Suite tests/spec/appointment-requests.bats des Tests-Partials liegt und dieses Partial aus Target-Exklusivitaet keine Testdatei anlegt -->

### Steps

1. Rot-nach-Gruen gegen die Ticket-Spec (gehoert dem Tests-Partial, wird hier nur ausgefuehrt, nicht angelegt):
   ```bash
   bats tests/spec/appointment-requests.bats
   ```
   Vor Task 2 und 3 ist das Ergebnis erwartet rot (expected: FAIL, fehlende Endpunkte oder noch nicht gelandete Spec); nach allen Tasks muss die Suite gruen sein. Ist die Spec-Datei noch nicht vorhanden, protokolliere Rot-durch-Abwesenheit und ziehe den Lauf nach Landung des Tests-Partials nach.
2. Weise die Target-Exklusivitaet nach: `git status --porcelain` darf nur die drei Zieldateien zeigen (plus keine anderen Aenderungen):
   ```bash
   git status --porcelain
   ```
3. Pruefe die S1-Budgets gegen die wirksame Schwelle neu (Ratchet, kein statisches Limit):
   ```bash
   wc -l components/website/src/pages/owner/anfragen.astro 'components/website/src/pages/api/owner/anfragen/[id]/annehmen.ts' 'components/website/src/pages/api/owner/anfragen/[id]/ablehnen.ts'
   jq -r '."S1:components/website/src/pages/owner/anfragen.astro".metric // "nicht-baselined"' docs/code-quality/baseline.json
   ```
   `anfragen.astro` muss unter 1000 bleiben, beide Endpunkte unter 900; der Baseline-Wert muss weiter `nicht-baselined` lauten.
4. Fahre die Pflicht-Gates:
   ```bash
   task test:changed
   task freshness:regenerate
   task freshness:check
   ```
   Alle drei muessen gruen sein; `freshness:check` deckt den S1-Ratchet, S2 bis S4 und die Baseline-Assertion ab.
5. Committe genau die drei Dateien im Ticket-Scope:
   ```bash
   git add components/website/src/pages/owner/anfragen.astro 'components/website/src/pages/api/owner/anfragen/[id]/annehmen.ts' 'components/website/src/pages/api/owner/anfragen/[id]/ablehnen.ts'
   git commit -m "feat(T901024): owner confirm slot [T901024]"
   git show --stat --oneline HEAD
   ```
   Der Stat muss exakt drei Dateien zeigen.

### Acceptance criteria

- Die Ticket-Spec ist nach den Tasks gruen (oder Rot-durch-Abwesenheit ist bei fehlendem Tests-Partial protokolliert und zur Nachholung markiert).
- `git status` und der Commit-Stat zeigen exakt die drei Zieldateien, keine weitere.
- Alle S1-Budgets halten gegen die wirksame Schwelle und `task test:changed`, `task freshness:regenerate`, `task freshness:check` sind gruen.
