# p5-tests — Test-Partial für T901024 (Slug appointment-requests)

Scope: genau zwei neue Dateien (exklusiv, keine anderen Dateien einplanen, keine
Implementierung — nur Tests):

- `tests/spec/appointment-requests.bats` (BATS Spec-Guards, Stilvorlage:
  `tests/spec/services-calendar.bats`, 80 Zeilen)
- `components/website/src/lib/__tests__/appointment-requests.test.ts`
  (Vitest-Suite, Stilvorlage:
  `components/website/src/lib/__tests__/booking-availability.test.ts`, 430 Zeilen)

Lesereihenfolge vor Task 1: `intel.json` dieses Plan-Ordners,
`.agents/skills/references/plan-quality-gates.md`, beide Stilvorlagen oben.

## File Structure

| Datei | Status | S1-Schwelle | Budget | Planziel |
| `tests/spec/appointment-requests.bats` | neu, Ist 0 | keine (`.bats` steht nicht in `s1.limits`, Gate überspringt die Extension) | unlimitiert, trotzdem knapp halten | max. 120 Zeilen |
| `components/website/src/lib/__tests__/appointment-requests.test.ts` | neu, Ist 0, nicht-baselined | `.ts`-Limit 900 aus `docs/code-quality/gates.yaml` | 900 | max. 450 Zeilen (Reserve über 50 %) |

S1-Budget-Notizen:

- BATS-Datei: `evalFile` in `scripts/code-quality/gates/s1-filesize.mjs` liefert
  `null`, sobald `limits[ext]` undefiniert ist; `.bats` ist in `gates.yaml` nicht
  gelistet. Es gibt daher keine wirksame S1-Schwelle. Das Planziel 120 Zeilen
  folgt allein der Lesbarkeit (Vorlage: 80 Zeilen für 8 Guards).
- Vitest-Datei: `jq`-Abfrage auf `docs/code-quality/baseline.json` liefert
  `nicht-baselined`; wirksame Schwelle ist das statische `.ts`-Limit 900,
  Budget 900 − 0 = 900. Bei 450 Zeilen liegt die Datei bei 50 % der Schwelle,
  also deutlich unter der 80-%-Split-Empfehlung — kein Split einplanen.
- Beide Dateien sind neu: kein Baseline-Eintrag, keine Baseline-Key-Erhöhung.

Vertrags-Anker (nur lesen, nicht ändern — Implementierung liefern die
Geschwister-Partials):

- Lib: `components/website/src/lib/appointment-requests.ts` (State-Maschine,
  Token-Auflösung, Idempotenz-Helfer)
- Kunden-Routen: `components/website/src/pages/anfrage/[token].astro`,
  `components/website/src/pages/api/anfrage/[token]/storno.ts`,
  `components/website/src/pages/api/anfrage/[token]/umbuchung.ts`
- Owner-Routen: `components/website/src/pages/api/owner/anfragen/[id]/annehmen.ts`,
  `components/website/src/pages/api/owner/anfragen/[id]/ablehnen.ts`
- Bestand: `components/website/src/lib/caldav-cache.ts` liefert `berlinDayKey`
  (in `booking.ts` bereits importiert), `components/website/src/pages/api/booking.ts`
  zeigt das 409-Antwortmuster mit JSON-Content-Type.

## Task 1 — BATS Spec-Guards anlegen

Lege `tests/spec/appointment-requests.bats` an (shebang `#!/usr/bin/env bats`,
Pfad-Konstanten am Dateikopf wie in der Stilvorlage). Fünf Guards:

1. Gleich-Tag-409: Die Umbuchungs-Route lehnt ein Ziel am selben Berliner
   Kalendertag mit 409 ab. Assert per `grep`: `berlinDayKey` und `status: 409`
   in `umbuchung.ts` vorhanden.
2. Vortag-ok (Negativkontrolle): Der Vorlaufvergleich ist strikt-nachfolgend,
   sodass Vortag-Anfragen erlaubt bleiben. Assert per `grep -E` auf das
   DayKey-Vergleichsmuster (`DayKey <= ` links vom Tagesvergleich) in
   `umbuchung.ts` — analog zu Guard T901023-2.
3. Token-404-generisch: Unbekanntes und abgelaufenes Token antworten
   identisch-generisch (keine aufzählbaren Unterschiede). Asserts: alle drei
   Token-Einstiege (`[token].astro`, `storno.ts`, `umbuchung.ts`) enthalten den
   gemeinsamen Token-Lookup und `status: 404`; kein Response-Literal
   unterscheidet abgelaufen von unbekannt (negativer `grep` auf
   unterscheidende Antwort-Texte in den drei Dateien).
4. Owner-Annahme-Recheck: `annehmen.ts` prüft die Slot-Verfügbarkeit unmittelbar
   vor dem Statuswechsel erneut. Asserts: Verfügbarkeits-Recheck
   (`claimSlot` oder `isSlotInAnyWindow`) ist vorhanden; per
   Zeilennummern-Vergleich steht der Recheck-Aufruf vor der Status-Update-Zeile
   (Muster wie Guard T901023-4: `claim_line` kleiner als `update_line`).
5. Idempotenz-kein-Duplikat: Doppelt gesendete Anfragen erzeugen genau einen
   Datensatz. Asserts: Der Erstellungs-Pfad liest einen Idempotenzschlüssel
   (`idempotency-key`-Header, case-insensitiv) und die Migration
   `20261008_appointment_requests.sql` definiert eine passende
   `UNIQUE`-Restriktion für den Dedupe-Schlüssel.

Akzeptanzkriterien:

- Datei läuft unter `bats tests/spec/appointment-requests.bats` (nach
  Geschwister-Implementierung grün, davor rot — siehe Task 3).
- Jeder Guard nutzt `@test "T901024-<n>: ..."`-Titel analog zur Vorlage.
- Keine hartcodierten Brand-Hostnamen (S3); Test-Marken nur als reine Slugs,
  Test-Mailadressen nur unter `example.test`.
- Max. 120 Zeilen.

## Task 2 — Vitest-Suite anlegen

Lege `components/website/src/lib/__tests__/appointment-requests.test.ts` an.
Stil: `vi.hoisted`-Fixtures, `vi.mock` für DB-/Mail-Module,
`beforeEach`-Reset, `Request`-Aufbau mit `x-forwarded-for` — alles analog zur
Vorlage `booking-availability.test.ts`. Drei `describe`-Blöcke:

1. Vorlauf Europe/Berlin inkl. DST-Wechsel: Import von `berlinDayKey`,
   `berlinWallMinutes` aus `../caldav-cache.js`. Fälle: Mitternachtsgrenze
   (23:30 UTC ist Folgetag in Berlin), Frühjahr 2026-03-29 (02:00–03:00
   existiert nicht), Herbst 2026-10-25 (doppelte 02:30-Stunde), sowie die
   Leitregel gleicher Tag abgelehnt / Folgetag erlaubt. Falls das
   Lib-Partial einen eigenen Vorlauf-Helfer exportiert, zusätzlich direkt
   gegen diesen Helfer testen (Exportnamen aus Task 0 übernehmen).
2. State-Maschinen-Übergänge: Import der Transitions-Funktion aus
   `../appointment-requests.js` (exakte Exportnamen in Task 0 aus dem
   Lib-Partial übernehmen und hier fest verdrahten). Fälle: jeder legale
   Übergang wird akzeptiert (`pending → accepted`, `pending → rejected`,
   `pending → cancelled`, `accepted → rescheduled`, `accepted → cancelled`);
   jeder illegale Übergang wird abgewiesen (`accepted → pending`,
   `rejected → accepted`, jeder Übergang aus einem terminalen Zustand).
   Jeder illegale Fall ist eine eigene Assertion.
3. Token-Validierung: leeres, fehlgeformtes, unbekanntes und abgelaufenes
   Token liefern alle dasselbe generische Nicht-gefunden-Ergebnis
   (Antworten per `toEqual` als identisch beweisen, kein unterscheidendes
   Feld); ein gültiges Token löst auf. DB-Zugriff über gemockten Pool wie
   in der Vorlage, kein echter Datenbankkontakt.

Task 0 (zuerst ausführen, kein eigener Commit): Exakte Exportnamen der Lib
(`../appointment-requests.js`) und der Routen-Handler aus den
Geschwister-Partials ablesen und die Importzeilen der Suite daran ausrichten.

Akzeptanzkriterien:

- `npx vitest run src/lib/__tests__/appointment-requests.test.ts` im
  Verzeichnis `components/website` ist nach Geschwister-Implementierung grün
  (davor rot — siehe Task 3).
- Kein `any`-Typ im neuen Code (`: any`, `<any>`, `as any` verboten; Ist 0,
  Limit 200 — siehe Task 4).
- Keine hartcodierten Brand-Hostnamen; keine echten DB-/Netzaufrufe
  (alles gemockt wie in der Vorlage).
- Max. 450 Zeilen.

## Task 3 — Rot-grün-Lauf beider Runner

Dieser Task beweist, dass die neuen Tests echte Guards sind (sie schlagen ohne
Implementierung fehl und bestehen mit ihr):

1. Neue Testdateien gegen den aktuellen Baum ohne Geschwister-Implementierung
   laufen lassen:
   `bats tests/spec/appointment-requests.bats` und
   `npx vitest run src/lib/__tests__/appointment-requests.test.ts`
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
wc -l tests/spec/appointment-requests.bats components/website/src/lib/__tests__/appointment-requests.test.ts
```

Akzeptanzkriterien:

- `task test:inventory` regeneriert; `components/website/src/data/test-inventory.json`
  ist mitcommittet (neue Testdateien ohne Inventar-Eintrag lassen CI scheitern).
- `task test:changed`, `task freshness:regenerate` und `task freshness:check`
  sind grün (S1–S4-Ratchet, Baseline-Key-Assertion).
- Any-Zählung bleibt bei 0 (Limit 200).
- Zeilenziele eingehalten: BATS max. 120, Vitest max. 450.
