## Task 1: Erstellungs-Endpunkt erstellen.ts mit Dedupe pro Termin

Kontext. Dieses Partial setzt die Owner-Aktionen fuer T901027 (Slug basic-invoices) um: Rechnungserstellung aus bestaetigten Terminen, manueller Zahlungsstatus, Korrektur via Storno plus Neuausstellung sowie CSV-Export. Es besitzt exakt vier Zieldateien (unten), erstellt oder aendert keine weitere Datei und setzt das Lib-Partial p1 voraus: `components/website/src/lib/invoice-payments.ts` existiert bereits im Worktree (recordPayment mit SELECT FOR UPDATE, Methoden sepa/cash/bank/other/legacy), `components/website/src/lib/invoices.ts` plus Migration muessen aus p1 gelandet sein. Der Executor verifiziert das in Schritt 1 vor jeder Code-Aenderung.

Angenommener p1-Vertrag fuer invoices.ts (kanonische Namen; weicht die Lib-Datei ab, folgen alle Schritte den echten Exporten, und die Abweichung landet in der Commit-Message): Typ `Invoice` mit `id`, `brand`, `number`, `status` (`open`, `paid`, `partially_paid`, `cancelled`, `draft`), `grossAmount`, `issuedAt`, `customerName`, `bookingUid`; Funktionen `getInvoice(id)`, `listInvoices(brand, { from, to })`, `createInvoiceFromBooking(brand, bookingUid)`, `correctInvoice(id, { reason, recordedBy })`. Die Tabelle `billing_invoices` traegt eine Unique-Restriktion ueber Marke plus Buchungsreferenz, sodass parallele Erstellungen genau einmal gewinnen. Bestaetigte Termine kommen aus der bestehenden Buchungsquelle (`getAllBookings` aus `lib/caldav`, nicht stornierte Eintraege); gehoert der Termin einer fremden Marke, gilt er als nicht gefunden.

S1-Budgets (verifiziert 2026-10-08 im Worktree, gates.yaml: `.ts` 900; alle vier Zieldateien per jq als nicht-baselined bestaetigt): wirksame Schwelle je Datei 900, Zielstaende um 150 bis 220 Zeilen. Alle vier Dateien bleiben deutlich unter 80 Prozent ihrer wirksamen Schwelle, daher ist kein Split noetig.

Zieldateien (vier neue Dateien, exklusiv):

- `components/website/src/pages/api/owner/rechnungen/erstellen.ts` (erstellen.ts): Rechnung aus bestaetigtem Termin mit Dedupe, 409 bei Duplikat.
- `components/website/src/pages/api/owner/rechnungen/[id]/zahlungsstatus.ts` (zahlungsstatus.ts): manueller Zahlungsstatus bezahlt/offen mit Methode.
- `components/website/src/pages/api/owner/rechnungen/[id]/korrigieren.ts` (korrigieren.ts): Storno plus Neuausstellung mit Verknuepfung.
- `components/website/src/pages/api/owner/rechnungen/export.ts` (export.ts): CSV-Export ueber Zeitraum.

### Steps

1. Verifiziere die Voraussetzungen vom Worktree-Root aus und halte Drift im Commit fest:
   ```bash
   ls components/website/src/lib/invoice-payments.ts components/website/src/lib/invoices.ts
   grep -n 'export .*recordPayment\|export .*listPayments' components/website/src/lib/invoice-payments.ts
   grep -n 'export .*getInvoice\|export .*listInvoices\|export .*createInvoiceFromBooking\|export .*correctInvoice' components/website/src/lib/invoices.ts
   grep -n 'getAllBookings' components/website/src/lib/caldav.ts | head -3
   ```
   Fehlt ein p1-Export unter anderem Namen, gelten die echten Namen fuer alle folgenden Schritte.
2. Erstelle `components/website/src/pages/api/owner/rechnungen/erstellen.ts` (erstellen.ts) als `POST: APIRoute`: `requireOwner` aus dem Cookie-Header, sonst 401 mit `{ error: 'Unauthorized' }` wie in `owner/bookings/[uid]/cancel.ts`; Marke aus `ownerBusiness(session).brand` mit `process.env.BRAND`-Fallback. Lies den Body JSON- oder formular-tolerant mit einem inline `readBody` wie in `cancel.ts`; `bookingUid` ist Pflicht, sonst 400 mit `{ error: 'bookingUid erforderlich.' }`.
3. Lade den Termin via `getAllBookings` und waehle den Eintrag mit passender UID; fehlt er, ist er storniert oder gehoert er einer fremden Marke, antworte 404 mit `{ error: 'Termin nicht gefunden.' }`. Pruefe vorab per Lib-Lookup (Dedupe-Check), ob fuer diesen Termin bereits eine Rechnung der eigenen Marke existiert; wenn ja, antworte 409 mit `{ error: 'Fuer diesen Termin existiert bereits eine Rechnung.' }` und der bestehenden Rechnungsnummer im Body. Erstelle sonst via `createInvoiceFromBooking(brand, bookingUid)` und antworte 201 mit der Rechnung als JSON. Fange eine Unique-Verletzung der Datenbank (verlorener Race zweier paralleler POSTs) ab und antworte ebenfalls 409 mit derselben Meldung; unerwartete Fehler landen mit `locals.requestLogger` im 500-Handler wie in `cancel.ts`.
4. Pruefe Datei-Guards und Budget:
   ```bash
   if grep -rnE ': any|<any>|as any' 'components/website/src/pages/api/owner/rechnungen/erstellen.ts'; then exit 1; fi
   if grep -rniE 'mentolder\.de|korczewski\.de' 'components/website/src/pages/api/owner/rechnungen/erstellen.ts' | grep -v '^\s*//'; then exit 1; fi
   grep -c 'requireOwner\|createInvoiceFromBooking\|409' 'components/website/src/pages/api/owner/rechnungen/erstellen.ts'
   wc -l 'components/website/src/pages/api/owner/rechnungen/erstellen.ts'
   ```
   Die Muster-Guards muessen leer bleiben, der Vertrags-Guard alle drei Symbole finden, die Zeilenzahl unter 900.

### Acceptance criteria

- Nicht-Owner erhalten 401, unbekannte oder stornierte Termine 404, fehlende `bookingUid` 400.
- Der erste POST fuer einen Termin erzeugt genau eine Rechnung (201); jeder weitere POST fuer denselben Termin gibt 409, auch bei parallelen Requests ueber die Unique-Restriktion.
- Die Datei bleibt unter dem `.ts`-Limit, ohne `any` und ohne hartcodierte Domains.

## Task 2: Zahlungsstatus-Endpunkt zahlungsstatus.ts mit Transaktion und Lock

Kontext. Dieser Task erstellt den POST-Endpunkt, der eine Rechnung manuell auf bezahlt oder offen setzt. Die Mutation laeuft ueber `recordPayment` aus `lib/invoice-payments.ts` und erbt dadurch Transaktion, `SELECT FOR UPDATE`-Lock, Ueberzahlungs-Schutz und EUE-Buchung; der Endpunkt selbst oeffnet keine eigene Transaktion. Methoden sind auf `sepa`, `cash`, `bank`, `other` begrenzt (`legacy` bleibt der Migration vorbehalten und wird abgelehnt).

### Steps

1. Erstelle `components/website/src/pages/api/owner/rechnungen/[id]/zahlungsstatus.ts` (zahlungsstatus.ts) als `POST: APIRoute` mit derselben Auth-, Marken- und Body-Logik wie Task 1 Schritt 2 (inline `readBody`). Validiere den Body: `status` muss `bezahlt` oder `offen` sein, sonst 400 mit `{ error: 'status muss bezahlt oder offen sein.' }`; bei `bezahlt` ist `method` Pflicht und muss einer der Werte `sepa`, `cash`, `bank`, `other` sein, sonst 400 mit `{ error: 'Methode muss sepa, cash, bank oder other sein.' }`.
2. Lade die Rechnung via `getInvoice(params.id)`; fehlt sie oder gehoert sie einer fremden Marke, antworte 404 mit `{ error: 'Rechnung nicht gefunden.' }`. Ist ihr Status `cancelled` oder `draft`, antworte 409 mit `{ error: 'Stornierte Rechnungen koennen nicht bebucht werden.' }`. Ist der Zielzustand bereits erreicht (`bezahlt` bei Status `paid`, `offen` bei Status `open`), antworte 409 mit `{ error: 'Rechnung hat diesen Status bereits.' }`.
3. Bei `bezahlt` rufe `recordPayment` mit `invoiceId`, `paidAt` aus dem Body (ISO-Datum, Default heute) oder dem Fehlbetrag, `method` aus dem Body, `recordedBy` aus der Owner-Session (Login-Name oder E-Mail) und optionaler `reference`; der Betrag ist der offene Restbetrag (Brutto minus gezahlte Summe), sodass Teilzahlungen korrekt auf `paid` schliessen. Bei `offen` rufe `recordPayment` mit dem negativen Gesamtzahlungsbetrag und der Notiz `Manuell auf offen zurueckgesetzt` (Pflichtfeld fuer negative Betraege) auf. Mappe Lib-Fehler: `invoice not found` auf 404, `cannot record payment`, `payment exceeds outstanding` und `correction would drive paid_amount negative` auf je 409 mit deutscher Meldung. Antworte 200 mit `{ id, status, paidAmount }`; 500-Handler wie in `cancel.ts`.
4. Pruefe Datei-Guards und Budget:
   ```bash
   if grep -rnE ': any|<any>|as any' 'components/website/src/pages/api/owner/rechnungen/[id]/zahlungsstatus.ts'; then exit 1; fi
   if grep -rniE 'mentolder\.de|korczewski\.de' 'components/website/src/pages/api/owner/rechnungen/[id]/zahlungsstatus.ts' | grep -v '^\s*//'; then exit 1; fi
   grep -c 'requireOwner\|recordPayment\|FOR UPDATE' 'components/website/src/pages/api/owner/rechnungen/[id]/zahlungsstatus.ts' || grep -c 'requireOwner\|recordPayment' 'components/website/src/pages/api/owner/rechnungen/[id]/zahlungsstatus.ts'
   if grep -n 'BEGIN\|COMMIT' 'components/website/src/pages/api/owner/rechnungen/[id]/zahlungsstatus.ts'; then exit 1; fi
   wc -l 'components/website/src/pages/api/owner/rechnungen/[id]/zahlungsstatus.ts'
   ```
   Die Muster-Guards und der Transaktions-Guard muessen leer bleiben (Transaktion und Lock leben in der Lib, nicht im Endpunkt), der Vertrags-Guard `requireOwner` und `recordPayment` finden, die Zeilenzahl unter 900.

### Acceptance criteria

- Unbekannte oder markenfremde IDs geben 404, Nicht-Owner 401, ungueltige Status- oder Methodenwerte 400, stornierte Rechnungen und bereits erreichte Zielzustaende 409.
- `bezahlt` verbucht exakt den offenen Restbetrag mit der gewaehlten Methode und schliesst die Rechnung auf `paid`; `offen` setzt bezahlte oder teilbezahlte Rechnungen per Korrekturbuchung zurueck.
- Der Endpunkt enthaelt keine eigene Transaktionssteuerung und bleibt unter dem `.ts`-Limit.

## Task 3: Korrektur-Endpunkt korrigieren.ts mit Storno und Neuausstellung

Kontext. Dieser Task erstellt den POST-Endpunkt, der eine fehlerhafte Rechnung korrigiert: Das Original wird storniert und eine neue Rechnung mit eigener Nummer ausgestellt; beide sind ueber die Korrektur-Verknuepfung der p1-Lib verbunden. Das stornierte Original bleibt unveraenderbar: Weder dieser Endpunkt noch der Zahlungsstatus fassen es danach noch an.

### Steps

1. Erstelle `components/website/src/pages/api/owner/rechnungen/[id]/korrigieren.ts` (korrigieren.ts) als `POST: APIRoute` mit derselben Auth-, Marken- und Body-Logik wie Task 1 Schritt 2 (inline `readBody`). `reason` ist Pflicht, wird getrimmt und darf hoechstens 1000 Zeichen haben, sonst 400 mit `{ error: 'Begruendung erforderlich, maximal 1000 Zeichen.' }`.
2. Lade die Rechnung via `getInvoice(params.id)`; fehlt sie oder gehoert sie einer fremden Marke, antworte 404 mit `{ error: 'Rechnung nicht gefunden.' }`. Ist ihr Status `cancelled`, antworte 409 mit `{ error: 'Diese Rechnung wurde bereits storniert.' }`. Rufe sonst `correctInvoice(id, { reason, recordedBy })` aus der p1-Lib auf, die Storno und Neuausstellung in einer Transaktion ausfuehrt: Original auf `cancelled` mit Verweis auf die Nachfolgerin, neue Rechnung mit neuer Nummer und Verweis auf das Original. Meldet die Lib einen parallelen Storno, antworte 409 mit derselben Bereits-storniert-Meldung. Antworte 201 mit `{ cancelled: { id, number }, invoice: { id, number, status } }`; 500-Handler wie in `cancel.ts`.
3. Pruefe Datei-Guards, Unveraenderbarkeit und Budget:
   ```bash
   if grep -rnE ': any|<any>|as any' 'components/website/src/pages/api/owner/rechnungen/[id]/korrigieren.ts'; then exit 1; fi
   if grep -rniE 'mentolder\.de|korczewski\.de' 'components/website/src/pages/api/owner/rechnungen/[id]/korrigieren.ts' | grep -v '^\s*//'; then exit 1; fi
   grep -c 'requireOwner\|correctInvoice\|409' 'components/website/src/pages/api/owner/rechnungen/[id]/korrigieren.ts'
   if grep -nE 'UPDATE billing_invoices|DELETE FROM' 'components/website/src/pages/api/owner/rechnungen/[id]/korrigieren.ts'; then exit 1; fi
   wc -l 'components/website/src/pages/api/owner/rechnungen/[id]/korrigieren.ts'
   ```
   Die Muster-Guards und der SQL-Guard muessen leer bleiben (der Endpunkt schreibt nie direkt in die Rechnungstabelle), der Vertrags-Guard alle drei Symbole finden, die Zeilenzahl unter 900.

### Acceptance criteria

- Unbekannte oder markenfremde IDs geben 404, Nicht-Owner 401, fehlende oder zu lange Begruendungen 400, bereits stornierte Originale 409.
- Erfolgreiche Korrekturen liefern 201 mit storniertem Original und neu ausgestellter Rechnung; beide Nummern sind verschieden und gegenseitig verknuepft.
- Das stornierte Original ist danach unveraenderbar (erneutes Korrigieren gibt 409, Bebuchen gibt 409) und der Endpunkt bleibt unter dem `.ts`-Limit.

## Task 4: CSV-Export-Endpunkt export.ts ueber Zeitraum

Kontext. Dieser Task erstellt den GET-Endpunkt, der alle Rechnungen der eigenen Marke in einem Zeitraum als CSV exportiert. Format und Helfer folgen dem Muster aus `owner/kunden/[id]/export.ts`: Semikolon-Trennung, BOM fuer Excel, CRLF-Zeilenenden, `csvCell`-Quoting.

### Steps

1. Erstelle `components/website/src/pages/api/owner/rechnungen/export.ts` (export.ts) als `GET: APIRoute`: `requireOwner` aus dem Cookie-Header, sonst 401 mit `{ error: 'Unauthorized' }`; Marke aus `ownerBusiness(session).brand` mit `process.env.BRAND`-Fallback. Lies die Query-Parameter `from` und `to` als ISO-Daten; Default ist das laufende Kalenderjahr (1. Januar bis heute), ungueltige Daten oder `from` nach `to` geben 400 mit `{ error: 'Ungueltiger Zeitraum.' }`.
2. Lade die Rechnungen via `listInvoices(brand, { from, to })` und reiche je Rechnung die letzte Zahlungsmethode aus `listPayments` an (leerer String bei unbezahlten Rechnungen); Datenbankfehler geben 500 mit Text `Datenbankfehler` wie im Kunden-Export. Baue das CSV mit Kopfzeile `Nummer;Datum;Kunde;Betrag;Status;Methode`, einer Zeile pro Rechnung (Betrag mit zwei Dezimalstellen und Komma, deutsches Zahlenformat) und `csvCell`-Quoting aus dem Kunden-Export. Sende BOM plus CRLF, `Content-Type: text/csv; charset=utf-8` und `Content-Disposition` mit Dateiname `rechnungen-<marke>-<from>-<to>.csv`.
3. Pruefe Datei-Guards und Budget:
   ```bash
   if grep -rnE ': any|<any>|as any' 'components/website/src/pages/api/owner/rechnungen/export.ts'; then exit 1; fi
   if grep -rniE 'mentolder\.de|korczewski\.de' 'components/website/src/pages/api/owner/rechnungen/export.ts' | grep -v '^\s*//'; then exit 1; fi
   grep -c 'requireOwner\|listInvoices\|csvCell' 'components/website/src/pages/api/owner/rechnungen/export.ts'
   wc -l 'components/website/src/pages/api/owner/rechnungen/export.ts'
   ```
   Die Muster-Guards muessen leer bleiben, der Vertrags-Guard alle drei Symbole finden, die Zeilenzahl unter 900.

### Acceptance criteria

- Nicht-Owner erhalten 401, ungueltige Zeitraeume 400; der Default-Zeitraum ohne Parameter ist das laufende Kalenderjahr.
- Das CSV enthaelt genau die Spalten Nummer, Datum, Kunde, Betrag, Status, Methode mit Semikolon-Trennung, BOM und CRLF und nur Rechnungen der eigenen Marke im Zeitraum.
- Die Datei bleibt unter dem `.ts`-Limit, ohne `any` und ohne hartcodierte Domains.

## Task 5: Verify, Scope-Nachweis und Commit

Kontext. Dieser Task beweist Rot-nach-Gruen, die Target-Exklusivitaet, die S1-Budgets und die CI-Gates und committet genau die vier Dateien.

<!-- vitest: kein neuer Test noetig, weil die Endpunkt-Abdeckung in der Ticket-Spec-Suite tests/spec/basic-invoices.bats des Tests-Partials liegt und dieses Partial aus Target-Exklusivitaet keine Testdatei anlegt -->

### Steps

1. Rot-nach-Gruen gegen die Ticket-Spec (gehoert dem Tests-Partial, wird hier nur ausgefuehrt, nicht angelegt):
   ```bash
   bats tests/spec/basic-invoices.bats
   ```
   Vor Task 1 bis 4 ist das Ergebnis erwartet rot (expected: FAIL, fehlende Endpunkte oder noch nicht gelandete Spec); nach allen Tasks muss die Suite gruen sein. Ist die Spec-Datei noch nicht vorhanden, protokolliere Rot-durch-Abwesenheit und ziehe den Lauf nach Landung des Tests-Partials nach.
2. Weise die Target-Exklusivitaet nach: `git status --porcelain` darf nur die vier Zieldateien zeigen (plus keine anderen Aenderungen):
   ```bash
   git status --porcelain
   ```
3. Pruefe die S1-Budgets gegen die wirksame Schwelle neu (Ratchet, kein statisches Limit):
   ```bash
   wc -l 'components/website/src/pages/api/owner/rechnungen/erstellen.ts' 'components/website/src/pages/api/owner/rechnungen/[id]/zahlungsstatus.ts' 'components/website/src/pages/api/owner/rechnungen/[id]/korrigieren.ts' 'components/website/src/pages/api/owner/rechnungen/export.ts'
   for f in 'components/website/src/pages/api/owner/rechnungen/erstellen.ts' 'components/website/src/pages/api/owner/rechnungen/[id]/zahlungsstatus.ts' 'components/website/src/pages/api/owner/rechnungen/[id]/korrigieren.ts' 'components/website/src/pages/api/owner/rechnungen/export.ts'; do jq -r --arg k "S1:$f" '.[$k].metric // "nicht-baselined"' docs/code-quality/baseline.json; done
   ```
   Alle vier Dateien muessen unter 900 bleiben; die Baseline-Werte muessen weiter `nicht-baselined` lauten.
4. Fahre die Pflicht-Gates:
   ```bash
   task test:changed
   task freshness:regenerate
   task freshness:check
   ```
   Alle drei muessen gruen sein; `freshness:check` deckt den S1-Ratchet, S2 bis S4 und die Baseline-Assertion ab.
5. Committe genau die vier Dateien im Ticket-Scope:
   ```bash
   git add 'components/website/src/pages/api/owner/rechnungen/erstellen.ts' 'components/website/src/pages/api/owner/rechnungen/[id]/zahlungsstatus.ts' 'components/website/src/pages/api/owner/rechnungen/[id]/korrigieren.ts' 'components/website/src/pages/api/owner/rechnungen/export.ts'
   git commit -m "feat(T901027): owner invoice actions [T901027]"
   git show --stat --oneline HEAD
   ```
   Der Stat muss exakt vier Dateien zeigen.

### Acceptance criteria

- Die Ticket-Spec ist nach den Tasks gruen (oder Rot-durch-Abwesenheit ist bei fehlendem Tests-Partial protokolliert und zur Nachholung markiert).
- `git status` und der Commit-Stat zeigen exakt die vier Zieldateien, keine weitere.
- Alle S1-Budgets halten gegen die wirksame Schwelle und `task test:changed`, `task freshness:regenerate`, `task freshness:check` sind gruen.
