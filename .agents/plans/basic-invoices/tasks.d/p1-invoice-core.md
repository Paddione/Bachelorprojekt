---
title: p1-invoice-core — Rechnungs-Kernlogik mit Nummer, Snapshot und Status
ticket_id: T901027
domains: [website, rechnungen]
status: staged
---

# basic-invoices (p1-invoice-core) — Implementation Plan

Herleitung: T901019 `docs/website/massage-privacy-requirements/README.md` §5
(Pflichtangaben §14 UStG, §19-Hinweis „Gemäß § 19 UStG wird keine
Umsatzsteuer berechnet", Aufbewahrung, E-Rechnung als Klärpunkt),
`invoice-payments.ts` (Transaktionsmuster `BEGIN` + `SELECT … FOR UPDATE` +
`ROLLBACK`-Pfad, Methoden `sepa|cash|bank|other`), `business-settings.ts`
(reine Parser mit `RangeError` und Default-Konstanten),
`content/massage/leistungen.json` (Katalogschlüssel, Preis dort Platzhalter),
`website-core-db.ts` (`getSiteSetting`/`setSiteSetting`, Key `tax_mode` mit
Präzedenz aus `system-test-seed-data.ts`), T901024 `appointment-requests.ts`
(`toAppointmentRequest`, `ServiceSnapshotLike`). Status:
Recherche-Checkliste, keine Rechts- oder Steuerberatung.

<!-- vitest: kein neuer Test in diesem Partial, weil die Suite components/website/src/lib/__tests__/invoices.test.ts im Sibling-Partial des Tickets gepflegt wird (Rot→Grün-Nachweis in Task 5 läuft über diese Suite) -->

## File Structure

| Datei | Art | Ist-Zeilen | S1-Budget |
| --- | --- | --- | --- |
| `components/website/src/lib/invoices.ts` | neu | 0 | Limit `.ts` 900, Restbudget 900, Zielgröße unter 450 |
| `components/website/src/db/migrations/20261008_invoices.sql` | neu | 0 | `.sql` steht nicht in `s1.limits`, kein S1-Budget nötig |

Budget-Herkunft: `gates.yaml` (`.ts: 900`, `.sql` nicht gelistet),
Baseline-Abfrage
`jq -r '."S1:components/website/src/lib/invoices.ts".metric // "nicht-baselined"' docs/code-quality/baseline.json`
ergibt `nicht-baselined`, daher wirksame Schwelle = statisches Limit.
CQ02-Ist: 0 `any`-Verwendungen in `components/website/src` (Limit 200);
dieses Partial fügt null hinzu. Target-Files exklusiv: keine weiteren
Dateien anlegen oder ändern.

## Task 1: Migration `20261008_invoices.sql` — Tabelle `massage_invoices`

Neue Tabelle `public.massage_invoices`, bewusst NICHT `billing_invoices`:
letztere gehört dem Portal-Billing (Kunden-FK, Dunning, DATEV-Export) und
darf nicht umgenutzt werden. Die Massage-Rechnung ist ein eigener,
einfacher Beleg mit eingefrorenem Preis-Snapshot.

Spalten:

- `id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text`
- `brand TEXT NOT NULL` (FK auf `public.brands(id)`, Guard-Muster aus
  `20261007_business_memberships.sql`: nur anlegen wenn `brands` existiert)
- `invoice_year INT NOT NULL`, `invoice_number INT NOT NULL`,
  `UNIQUE (brand, invoice_year, invoice_number)` — lückenlose
  Nummernsequenz pro Brand und Jahr, Anzeigeformat `JJJJ-NNNN` bildet
  der Service
- Snapshot-Spalten (eingefroren bei Ausstellung, danach nie per `UPDATE`
  änderbar, nur lesbar): `customer_name TEXT NOT NULL`,
  `customer_contact TEXT NOT NULL`,
  `service_key TEXT NOT NULL`, `service_name TEXT NOT NULL`,
  `service_duration_min INT NOT NULL`,
  `unit_price_cents INT NOT NULL CHECK (unit_price_cents >= 0)`,
  `tax_mode TEXT NOT NULL CHECK (tax_mode IN ('kleinunternehmer', 'regelbesteuerung'))`,
  `tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0`,
  `tax_amount_cents INT NOT NULL DEFAULT 0`,
  `gross_amount_cents INT NOT NULL`,
  `tax_note TEXT` (bei Kleinunternehmer der §19-Hinweis)
- `issue_date DATE NOT NULL`, `service_date DATE NOT NULL`
- `status TEXT NOT NULL DEFAULT 'offen'
  CHECK (status IN ('offen', 'bezahlt', 'storniert'))`
- `payment_method TEXT CHECK (payment_method IN ('sepa', 'cash', 'bank', 'other'))`
  (nur gesetzt bei `bezahlt`)
- `appointment_token TEXT` (Referenz auf die Inbox-Anfrage, kein FK —
  Inbox-Zeilen können gelöscht werden, der Beleg bleibt per
  Aufbewahrungspflicht bestehen)
- `cancels_invoice_id TEXT REFERENCES massage_invoices(id)`
  (Korrektur-Verweis Storno→Original bzw. Nachfolger→Original)
- `notes TEXT`, `is_test_data BOOLEAN NOT NULL DEFAULT false`,
  `created_at`/`updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- Sequenz-Tabelle `public.massage_invoice_sequences
  (brand TEXT NOT NULL, invoice_year INT NOT NULL,
   last_number INT NOT NULL DEFAULT 0, PRIMARY KEY (brand, invoice_year))`
  für die Jahr-Sequenz mit Zeilen-Lock
- Indexe: `(brand, status)`, `(brand, invoice_year, invoice_number)`
- `GRANT SELECT, INSERT, UPDATE ON beide Tabellen TO website`

Steps:

1. Datei im Stil von `20261007_business_memberships.sql` anlegen:
   `IF NOT EXISTS`-Idempotenz, FK-Guard per `DO $$`, deutsche
   Kopf-Kommentare mit Regelquelle (T901019 §5, Aufbewahrung).
2. SQL-Syntax prüfen: `psql` Dry-Run oder `pg_query`-Parse, falls
   verfügbar; mindestens per `psql -f` gegen eine lokale Test-DB
   anwenden und `\\d massage_invoices` sichten.

Akzeptanz: Tabelle und Sequenz-Tabelle existieren nach dem Anwenden;
`UNIQUE (brand, invoice_year, invoice_number)` greift (Doppel-Insert
scheitert); `billing_invoices` unangetastet; kein S1-Budget nötig.

## Task 2: `invoices.ts` — reine Bausteine (Snapshot, Nummer, Pflichtangaben)

Reine Funktionen ohne DB-Zugriff (S2-freundlich, im selben File oberhalb
der DB-Funktionen, analog zu den Parsern in `business-settings.ts`).
Keine `any`-Typen (CQ02), keine Hostnamen-Literale (S3).

Öffentliche API (rein):

- `KLEINUNTERNEHMER_NOTE = 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet'`
- `DEFAULT_TAX_MODE = 'kleinunternehmer'` — Kleinunternehmer ist Default an
- `formatInvoiceNumber(year: number, seq: number): string` → `JJJJ-NNNN`
  (vierstellig, null-aufgefüllt; wirft `RangeError` bei Jahr < 2000 oder
  Seq < 1)
- `InvoiceSnapshotInput { customerName, customerContact, serviceKey,
  serviceName, serviceDurationMin, unitPriceCents, taxMode, taxRate,
  issueDate, serviceDate, appointmentToken? }`, alles strikt typisiert
  (Cents als `number`-Integer, Daten als `YYYY-MM-DD`-Strings)
- `buildSnapshot(input: InvoiceSnapshotInput): InvoiceSnapshot` —
  validiert (nicht-leere Namen, `unitPriceCents >= 0`, Datum per
  Kalender-Check wie `isRealDay`), friert den Preis ein: bei
  `kleinunternehmer` gilt `taxRate = 0`, `taxAmountCents = 0`,
  `gross = unit`, `taxNote = KLEINUNTERNEHMER_NOTE`, kein Steuerausweis;
  bei `regelbesteuerung` rechnet `gross = round(unit * (1 + rate/100))`.
  Gibt den vollständigen, unveränderlichen Snapshot zurück.
- `validatePflichtangaben(snapshot, creditor: { name, address, taxId }):
  string[]` — prüft die §14-UStG-Angaben: Namen/Anschriften beider
  Seiten, Steuernummer oder USt-IdNr., Rechnungsnummer, Leistungsdatum,
  Entgelt, Steuersatz/-betrag bzw. Steuerbefreiungs-Hinweis.
  Gibt die Liste fehlender Punkte zurück (leer = vollständig).
  Datei-Kopf trägt den Hinweis: Recherche-Checkliste nach T901019 §5,
  keine Rechts- oder Steuerberatung.
- `resolveCatalogService(catalog: unknown, serviceKey: string):
  { serviceName: string; serviceDurationMin: number }` — löst den
  Schlüssel gegen `leistungen.json`-Struktur auf (`key`/`name`/
  `durationMin`); wirft `RangeError` bei unbekanntem Schlüssel.
  Der Katalogpreis wird bewusst NICHT gelesen (dort steht
  „Platzhalter"): der Betrag kommt explizit als `unitPriceCents` aus
  dem Aufruf (Termin-Kontext) und wird im Snapshot eingefroren.
  Spätere Katalogänderungen berühren ausgestellte Rechnungen nicht.

Steps:

1. Datei mit Header anlegen (Regelquelle T901019 §5, Abgrenzung zu
   `billing_invoices`, Aufrufer-Vertrag: Brand-Filter und
   `is_test_data`-Ausschluss passieren beim Laden, nicht hier).
2. Reine Funktionen plus Typen implementieren, Zielgröße dieses
   Abschnitts unter 250 Zeilen.
3. `npx tsc --noEmit -p components/website/tsconfig.json` muss
   fehlerfrei laufen.

Akzeptanz: Alle fünf Funktionen verhalten sich wie oben; Kleinunternehmer
weist keine Steuer aus und setzt den §19-Hinweis; unbekannter
Katalogschlüssel wirft `RangeError`; kein `any` im File.

## Task 3: `invoices.ts` — DB-Funktionen (Sequenz, Status, Korrektur)

DB-Zugriff nur über `pool` aus `./website-db.js` und `getSiteSetting`
aus `./website-core-db.js`; Typen aus `./appointment-requests.js`.
Kein Rück-Import dieser Module auf `invoices.ts` (S2: kein neuer Zyklus).
Transaktionsmuster aus `invoice-payments.ts`: `BEGIN`, `SELECT … FOR
UPDATE`, Fehler → `ROLLBACK`, Erfolg → `COMMIT`, Client in `finally`
freigeben.

Öffentliche API (DB):

- `nextInvoiceNumber(brand: string, year: number): Promise<number>` —
  eigene Transaktion: Zeile in `massage_invoice_sequences` per
  `INSERT … ON CONFLICT DO NOTHING` sicherstellen, dann
  `SELECT last_number … FOR UPDATE`, `+1` zurückschreiben und
  zurückgeben. Lückenlos pro Brand und Jahr unter Nebenläufigkeit.
- `createInvoice(brand: string, snapshot: InvoiceSnapshot):
  Promise<MassageInvoice>` — Ablauf: `taxMode` aus
  `site_settings` Key `tax_mode` lesen (`getSiteSetting`), Fallback
  `DEFAULT_TAX_MODE`; Snapshot bauen bzw. übernehmen;
  `validatePflichtangaben` mit Creditor-Daten aus `site_settings`
  (`creditor_name`, `creditor_address`, `creditor_tax_id`) prüfen —
  bei fehlenden Angaben `RangeError` mit der Fehlliste werfen, kein
  Insert; Sequenznummer ziehen; Insert mit Status `offen`.
  Alles in einer Transaktion.
- `markPaid(id: string, method: 'sepa' | 'cash' | 'bank' | 'other',
  paidBy: string): Promise<MassageInvoice>` — `FOR UPDATE`-Lock,
  nur aus Status `offen`; setzt `bezahlt` + `payment_method`.
  Aus `bezahlt`/`storniert` wirft sie einen Fehler.
- `markStorniert(id: string, reason: string): Promise<MassageInvoice>` —
  `FOR UPDATE`-Lock, nur aus Status `offen`; `reason` Pflicht
  (nicht-leer); setzt `storniert`. `storniert` ist terminal.
- `correctInvoice(id: string, corrected: InvoiceSnapshotInput,
  correctedBy: string): Promise<{ storno: MassageInvoice;
  successor: MassageInvoice }>` — Korrektur-Modell Storno +
  Neuausstellung: Original per `FOR UPDATE` sperren (nur aus
  `offen`), auf `storniert` setzen, Nachfolger mit neuer
  Sequenznummer und `cancels_invoice_id = Original-id` anlegen.
  Niemals werden Snapshot-Spalten einer ausgestellten Rechnung per
  `UPDATE` verändert.
- `getInvoice(id: string): Promise<MassageInvoice | null>`,
  `listInvoices(brand: string): Promise<MassageInvoice[]>` —
  Lesezugriff, neueste zuerst.

Explizit KEIN Online-Payment: kein Stripe-/PayPal-/SDK-Import, keine
Zahlungs-Redirects, keine Webhooks. Zahlung ist ausschließlich der
manuelle Statuswechsel mit Methode `sepa|cash|bank|other`.

Steps:

1. DB-Funktionen unterhalb der reinen Bausteine implementieren;
   Gesamtdatei unter 450 Zeilen halten.
2. `npx tsc --noEmit -p components/website/tsconfig.json` fehlerfrei.
3. Negativ-Check: `grep -rn 'stripe\|paypal\|checkout\|webhook'
   components/website/src/lib/invoices.ts` liefert keine Treffer.

Akzeptanz: Sequenz ist pro Brand/Jahr eindeutig und lückenlos;
Statuswechsel jenseits `offen → bezahlt|storniert` scheitern;
Korrektur erzeugt Storno + Nachfolger mit Verweis; Snapshot-Spalten
werden nie per `UPDATE` angefasst; kein Payment-SDK im File.

## Task 4: Rot→Grün-Nachweis über die Ticket-Testsuite

Der Nachweis läuft über die Sibling-Suite des Tickets
(`components/website/src/lib/__tests__/invoices.test.ts`,
Sibling-Partial). Rot-Beleg: Suite gegen fehlendes Modul ausführen,
Import-Fehler beobachten. Grün-Beleg: nach Task 2 und 3 erneut
ausführen, Suite grün.

Steps:

1. `npx vitest run components/website/src/lib/__tests__/invoices.test.ts`
   vor der Implementierung — expected: FAIL (Modul fehlt,
   Import-Fehler).
2. Implementierung aus Task 2 und 3 ausführen, Migration aus Task 1
   anwenden.
3. Gleicher `npx vitest run`-Befehl nach der Implementierung — alle
   Fälle grün (Nummernformat, Snapshot, §19-Hinweis, Statuswechsel,
   Storno+Neuausstellung, Pflichtangaben-Check).
4. Falls das Sibling-Partial noch nicht gemergt ist, Rot→Grün im
   Sibling-Verify nachholen und hier als Ausführungsnotiz vermerken
   (kein separates Gate, nur Reihenfolge-Hinweis).

Akzeptanz: Schritt 1 belegt Rot per Import-Fehler, Schritt 3 belegt
Grün per Testrunner-Ausgabe; beide Ausgaben liegen dem
Verify-Protokoll bei.

## Task 5: Verify — Gates und Freshness

Steps:

1. `task test:changed`
2. `task freshness:regenerate`
3. `task freshness:check`
4. CQ02-Nachweis:
   `bash -c "count=$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: $count (limit: 200)\"; [ $count -le 200 ]"`
5. S1-Nachweis: `wc -l components/website/src/lib/invoices.ts` liegt
   unter dem `.ts`-Limit 900 mit deutlicher Reserve (Ziel unter 450);
   die `.sql`-Datei braucht kein S1-Budget.
6. S3-Nachweis: kein `*.mentolder.de`- / `*.korczewski.de`-Literal in
   beiden Target-Files.

Akzeptanz: Alle drei `task`-Befehle grün, `any`-Zähler unverändert
bei 0, `invoices.ts` unter 450 Zeilen, ausschließlich die zwei
Target-Files angelegt.
