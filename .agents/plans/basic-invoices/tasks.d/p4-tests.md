# p4-tests — Test-Partial für T901027 (Slug basic-invoices)

Scope: genau zwei neue Dateien (exklusiv, keine anderen Dateien einplanen, keine
Implementierung — nur Tests):

- `tests/spec/basic-invoices.bats` (BATS Spec-Guards, Stilvorlage:
  `tests/spec/client-directory.bats`, 71 Zeilen)
- `components/website/src/lib/__tests__/invoices.test.ts`
  (Vitest-Suite, Stilvorlage:
  `components/website/src/lib/__tests__/clients.test.ts`, 221 Zeilen)

Lesereihenfolge vor Task 1: `intel.json` dieses Plan-Ordners,
`.agents/skills/references/plan-quality-gates.md`, beide Stilvorlagen oben.

## File Structure

| Datei | Status | S1-Schwelle | Budget | Planziel |
| `tests/spec/basic-invoices.bats` | neu, Ist 0 | keine (`.bats` steht nicht in `s1.limits`, Gate überspringt die Extension) | unlimitiert, trotzdem knapp halten | max. 120 Zeilen |
| `components/website/src/lib/__tests__/invoices.test.ts` | neu, Ist 0, nicht-baselined | `.ts`-Limit 900 aus `docs/code-quality/gates.yaml` | 900 | max. 450 Zeilen (Reserve über 50 %) |

S1-Budget-Notizen:

- BATS-Datei: `_ext_limit` in `scripts/plan-lint.sh` liefert `0`
  (ungated), sobald die Extension nicht in `s1.limits` gelistet ist; `.bats`
  ist in `gates.yaml` nicht gelistet (geprüft: nur `.astro`, `.ts`, `.svelte`,
  `.sh`, `.mjs`, `.mts`, `.py`, `.js`, `.jsx`, `.tsx`, `.cjs`, `.bash`,
  `.java`, `.php`). Es gibt daher keine wirksame S1-Schwelle. Das Planziel
  120 Zeilen folgt allein der Lesbarkeit (Vorlage: 71 Zeilen für 5 Guards).
- Vitest-Datei: `jq`-Abfrage auf `docs/code-quality/baseline.json` liefert
  `nicht-baselined`; wirksame Schwelle ist das statische `.ts`-Limit 900,
  Budget 900 − 0 = 900. Bei 450 Zeilen liegt die Datei bei 50 % der Schwelle,
  also deutlich unter der 80-%-Split-Empfehlung — kein Split einplanen.
- Beide Dateien sind neu: kein Baseline-Eintrag, keine Baseline-Key-Erhöhung.
- CQ02-Ist: 0 explizite `any`-Verwendungen in `components/website/src`
  (Limit 200) — die neue Suite darf diesen Zähler nicht erhöhen.

Vertrags-Anker (nur lesen, nicht ändern — Implementierung liefern die
Geschwister-Partials):

- Lib: `components/website/src/lib/invoices.ts` (Snapshot-Bildung,
  Nummernvergabe, Status-Übergänge, Kleinunternehmer-Hinweis,
  Korrektur-Verknüpfung)
- Migration: `components/website/src/db/migrations/20261008_invoices.sql`
  (Tabellen + Jahr-Nummer-Eindeutigkeit)
- Owner-Seiten: `components/website/src/pages/owner/rechnungen.astro`,
  `components/website/src/pages/owner/rechnungen/[id].astro`
- Owner-API: `components/website/src/pages/api/owner/rechnungen/erstellen.ts`,
  `components/website/src/pages/api/owner/rechnungen/[id]/zahlungsstatus.ts`,
  `components/website/src/pages/api/owner/rechnungen/[id]/korrigieren.ts`,
  `components/website/src/pages/api/owner/rechnungen/export.ts`
- Bestand: `components/website/src/lib/owner-guard.ts` exportiert
  `requireOwner` und `isOwnerSession`; alle Owner-Routen unter
  `components/website/src/pages/api/owner/` importieren `requireOwner`
  (belegt an den `kunden`-Routen).

## Task 1 — BATS Spec-Guards anlegen

Lege `tests/spec/basic-invoices.bats` an (shebang `#!/usr/bin/env bats`,
Pfad-Konstanten am Dateikopf wie in der Stilvorlage). Fünf Guards mit
`@test "T901027-<n>: ..."`-Titeln (IDs T901027-1..5 speisen
`components/website/src/data/test-inventory.json` via
`scripts/build-test-inventory.sh`):

1. Owner-Guard auf allen Rechnungs-Routen: Alle sechs Routen-Dateien
   (beide `.astro`-Seiten plus die vier API-Handler aus den
   Vertrags-Ankern) existieren und enthalten je den Owner-Guard.
   Assert per `grep` auf `owner-guard|requireOwner|isOwnerSession` in jeder
   der sechs Dateien — analog zu Guard T901026-1 (fail-closed: fehlende
   Datei oder fehlender Guard lässt den Test scheitern).
2. Nummernsequenz pro Jahr: Die Rechnungsnummer ist pro Kalenderjahr
   eindeutig und fortlaufend. Asserts: die Migration
   `20261008_invoices.sql` definiert eine Jahr-Nummer-Eindeutigkeit
   (`UNIQUE` über Jahr- und Nummer-Spalte, per `grep` auf beide
   Spaltennamen in einer `UNIQUE`-Zeile); die Lib `invoices.ts` enthält
   den jahrbezogenen Nummern-Helfer (exakter Exportname aus Task 0),
   per `grep` auf Definition und Aufruf wie in Guard T901026-2
   (Definition steht vor dem Aufruf).
3. Doppel-Erstellung-409: Eine zweite Erstellung für denselben
   Abrechnungsgegenstand antwortet mit 409 statt ein Duplikat anzulegen.
   Asserts in `erstellen.ts`: `status: 409` vorhanden; ein
   Dedupe-Lesepfad ist vorhanden (`idempotency-key`-Header,
   case-insensitiv, oder Vorab-Lookup einer bestehenden Rechnung zum
   Auftrag); per Zeilennummern-Vergleich steht die Dedupe-Prüfung vor der
   Insert-Zeile (Muster wie Guard T901026-3: `guard_line` kleiner als
   `insert_line`).
4. Pflichtangaben-Präsenz: Jede Rechnung trägt die Pflichtangaben.
   Asserts per `grep` auf dem Snapshot-Bauer in `invoices.ts` (exakter
   Funktionsname aus Task 0): Rechnungsnummer, Rechnungsdatum,
   Leistungsbeschreibung, Betrag sowie Steuer-Ausweis oder
   Kleinunternehmer-Hinweis sind als Felder/Schlüssel vorhanden. Fehlt
   eine Angabe, scheitert der Guard.
5. Kein Online-Payment-Pfad: Rechnungen kennen nur manuelle
   Zahlungsabwicklung, keinen Online-Zahlungsfluss. Asserts: negativer
   `grep` über alle acht Rechnungs-Dateien aus den Vertrags-Ankern auf
   `stripe|paypal|checkout|payment-intent|zahlungslink` (case-insensitiv)
   liefert null Treffer; zusätzlich enthält `zahlungsstatus.ts` nur
   manuelle Statuswerte (exakte Enum-Namen aus Task 0, z. B. offen /
   bezahlt / storniert) und keinen Zahlungsanbieter-Import.

Akzeptanzkriterien:

- Datei läuft unter `bats tests/spec/basic-invoices.bats` (nach
  Geschwister-Implementierung grün, davor rot — siehe Task 3).
- Jeder Guard nutzt `@test "T901027-<n>: ..."`-Titel analog zur Vorlage.
- Keine hartcodierten Brand-Hostnamen (S3); Test-Mailadressen nur unter
  `example.test`.
- Max. 120 Zeilen.

## Task 2 — Vitest-Suite anlegen

Lege `components/website/src/lib/__tests__/invoices.test.ts` an.
Stil: Pure-Module-Suite wie die Vorlage `clients.test.ts` — Fixture-Helfer
am Dateikopf, `describe`/`it` mit `expect`, keine DB, kein Netz, keine
Mocks nötig, fiktive Namen und `example.test`-Adressen. Fünf
`describe`-Blöcke:

1. Snapshot-Bildung: Import des Snapshot-Bauers aus `../invoices.js`
   (exakter Exportname aus Task 0). Fälle: Leistungsname, Preis und
   Dauer werden zum Erstellungszeitpunkt eingefroren; eine spätere
   Preisänderung in der Stammdaten-Fixture verändert den eingefrorenen
   Snapshot nicht (`toEqual` auf den ursprünglichen Snapshot nach
   simulierter Preisänderung); leere Leistungsliste wird abgewiesen.
2. Nummernvergabe: Import des Nummern-Helfers aus `../invoices.js`.
   Fälle: fortlaufende Nummern innerhalb eines Jahres (1, 2, 3…);
   Jahreswechsel startet die Folge neu; stornierte Nummern werden nicht
   wiederverwendet; Eingaben ohne Jahr werden abgewiesen oder erhalten
   das laufende Jahr (Verhalten aus dem Lib-Partial übernehmen und hier
   fest verdrahten).
3. Status-Übergänge: Import der Transitions-Funktion aus
   `../invoices.js` (exakte Export- und Enum-Namen aus Task 0). Fälle:
   jeder legale Übergang wird akzeptiert (z. B. Entwurf zu gestellt,
   gestellt zu bezahlt, gestellt zu storniert); jeder illegale Übergang
   wird abgewiesen (z. B. bezahlt zu Entwurf, storniert zu bezahlt,
   jeder Übergang aus einem terminalen Zustand). Jeder illegale Fall ist
   eine eigene Assertion.
4. Kleinunternehmer-Hinweis-Logik: Import des Hinweis-Helfers aus
   `../invoices.js`. Fälle: im Kleinunternehmer-Modus enthält die
   Rechnung den Hinweis auf § 19 UStG und weist keine Mehrwertsteuer
   aus; im Regelmodus wird die Steuer ausgewiesen und der Hinweis fehlt;
   beide Varianten gleichzeitig kommen nie vor (je eine Assertion pro
   Modus plus eine Ausschluss-Assertion).
5. Korrektur-Verknüpfung: Import der Korrektur-Helfer aus
   `../invoices.js`. Fälle: die Korrekturrechnung verweist auf die
   Original-ID; das Original wird als korrigiert markiert; die Beträge
   gleichen sich aus (Summe null oder Differenzbetrag korrekt);
   Korrektur einer bereits korrigierten Rechnung wird abgewiesen;
   Korrektur ohne Original-ID wird abgewiesen.

Task 0 (zuerst ausführen, kein eigener Commit): Exakte Exportnamen der Lib
(`../invoices.js` — Snapshot-Bauer, Nummern-Helfer, Transitions-Funktion,
Hinweis-Helfer, Korrektur-Helfer) sowie die exakten Status-Enum-Werte aus
den Geschwister-Partials ablesen und alle Importzeilen und Enum-Literale
der Suite daran ausrichten.

Akzeptanzkriterien:

- `npx vitest run src/lib/__tests__/invoices.test.ts` im
  Verzeichnis `components/website` ist nach Geschwister-Implementierung grün
  (davor rot — siehe Task 3).
- Kein `any`-Typ im neuen Code (`: any`, `<any>`, `as any` verboten; Ist 0,
  Limit 200 — siehe Task 4).
- Keine hartcodierten Brand-Hostnamen; keine echten DB-/Netzaufrufe
  (reine Funktionsaufrufe mit Fixtures wie in der Vorlage).
- Max. 450 Zeilen.

## Task 3 — Rot-grün-Lauf beider Runner

Dieser Task beweist, dass die neuen Tests echte Guards sind (sie schlagen ohne
Implementierung fehl und bestehen mit ihr):

1. Neue Testdateien gegen den aktuellen Baum ohne Geschwister-Implementierung
   laufen lassen:
   `bats tests/spec/basic-invoices.bats` und
   `npx vitest run src/lib/__tests__/invoices.test.ts`
   (letzteres in `components/website`) — expected: FAIL in beiden Runnern.
2. Nach Merge der Geschwister-Implementierung beide Befehle wiederholen —
   erwartet: alle Guards grün.

Akzeptanzkriterien:

- Schritt 1 zeigt fehlschlagende Tests in beiden Runnern (Rot-Nachweis).
- Schritt 2 zeigt null Fehlschläge in beiden Runnern (Grün-Nachweis).

## Task 4 — Verify und Inventar

Steps in dieser Reihenfolge:

```bash
task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
bash -c "count=$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: $count (limit: 200)\"; [ $count -le 200 ]"
wc -l tests/spec/basic-invoices.bats components/website/src/lib/__tests__/invoices.test.ts
```

Akzeptanzkriterien:

- `task test:inventory` regeneriert; `components/website/src/data/test-inventory.json`
  ist mitcommittet (neue Testdateien ohne Inventar-Eintrag lassen CI scheitern).
- `task test:changed`, `task freshness:regenerate` und `task freshness:check`
  sind grün (S1–S4-Ratchet, Baseline-Key-Assertion).
- Any-Zählung bleibt bei 0 (Limit 200).
- Zeilenziele eingehalten: BATS max. 120, Vitest max. 450.
