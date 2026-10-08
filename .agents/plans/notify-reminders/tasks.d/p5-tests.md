---
partial: p5-tests
slug: notify-reminders
ticket_id: T901025
depends_on: [p1-core, p2-api, p3-cron, p4-ui]
---

# p5-tests — Test-Guards für Notify-Reminders (T901025)

Scope: exakt zwei neue Dateien. Keine Implementierungsänderung, nur Tests.

- `tests/spec/notify-reminders.bats` — BATS-Guards T901025-1..5
- `components/website/src/lib/__tests__/appointment-notify.test.ts` — Vitest-Suite

## File Structure

| Datei | Status | S1-Lage |
| --- | --- | --- |
| `tests/spec/notify-reminders.bats` | neu | `.bats` steht nicht in `s1.limits` (`scripts/code-quality/gates/s1-filesize.mjs` überspringt Extensions ohne Limit) → nicht S1-gated; Stilvorlage `tests/spec/appointment-requests.bats` hat 61 Zeilen, Zielgröße unter 120 Zeilen |
| `components/website/src/lib/__tests__/appointment-notify.test.ts` | neu | nicht-baselined, `.ts`-Limit 900 → Budget 900, Zielgröße unter 250 Zeilen mit Wachstumsreserve |

Referenzierte Implementierung (nur gelesen, nicht geändert): `components/website/src/lib/appointment-notify.ts`,
`components/website/src/pages/api/cron/appointment-reminders.ts`. Falls p1–p4 Funktionsnamen anders
wählen als hier angenommen, greift Task 0 (Namensabgleich) vor allen anderen Tasks.

## Task 0 — Namensabgleich gegen p1–p4 (Voraussetzung)

Steps:

1. In `components/website/src/lib/appointment-notify.ts` die exportierten Namen für
   Erinnerungsversand, Dedupe-Key-Bildung, Retry-Zähler und 24h-Fensterprüfung feststellen
   (`grep -n "^export" components/website/src/lib/appointment-notify.ts`).
2. In `components/website/src/pages/api/cron/appointment-reminders.ts` die Bearer-Prüfung
   feststellen (`grep -n -i "bearer\|authorization" ...`).
3. Die in Task 1 und 2 angenommenen Bezeichner an die gefundenen Namen anpassen.

Akzeptanz: Jede `grep`-Assertion in Task 1 und jeder Import in Task 2 trifft einen real
existierenden Bezeichner der p1–p4-Implementierung.

## Task 1 — BATS-Guards schreiben (`tests/spec/notify-reminders.bats`)

Stilvorlage: `tests/spec/appointment-requests.bats` — Kopfkommentar mit Ticket-Scope,
Pfadkonstanten über `BATS_TEST_DIRNAME`, ein `@test` pro Guard mit ID `T901025-<n>`,
`grep`-Assertionen mit ausgabefähiger Fehlermeldung und `return 1`.

Steps:

1. Datei anlegen mit Shebang `#!/usr/bin/env bats`, Kopfkommentar (Scope T901025,
   Hinweis auf Inventar-Einspeisung via `scripts/build-test-inventory.sh`) und
   Pfadkonstanten für Lib (`appointment-notify.ts`) und Cron-Endpunkt
   (`api/cron/appointment-reminders.ts`).
2. Guard `T901025-1` (Erinnerung nur an bestätigte): assertet, dass der Versandpfad
   den Status `bestaetigt` positiv prüft und andere Status (`offen`, `abgelehnt`)
   vom Versand ausschließt.
3. Guard `T901025-2` (keine Erinnerung nach Storno): assertet, dass ein Datensatz
   mit Status `storniert` den Versandpfad nicht erreicht (Negativprüfung auf dem
   Status-Flip-Pfad aus p1/p2, analog zu `claimSlot`-vor-`UPDATE`-Ordnung in der Stilvorlage).
4. Guard `T901025-3` (Retry maximal 3 Versuche): assertet die Retry-Obergrenze 3
   im Lib-Code (Konstante oder Vergleich, z. B. Versuchszähler gegen 3).
5. Guard `T901025-4` (Dedupe einmalig): assertet die Dedupe-Key-Prüfung vor dem
   Versand (Key-Lookup muss vor dem Sendeaufruf stehen; Ordnungsassertion per
   Zeilennummernvergleich wie in Guard T901024-4 der Stilvorlage).
6. Guard `T901025-5` (Cron-Bearer-Guard): assertet, dass der Cron-Endpunkt den
   `Authorization`-Header gegen ein Bearer-Secret prüft und ohne gültigen Header
   mit 401 antwortet.
7. Failing-Test-Lauf: die neue BATS-Datei gegen den Stand vor p1–p4 ausführen
   (oder temporär eine Assertion invertieren) und das Rot bestätigen —
   expected: FAIL — danach grün stellen:
   `bats tests/spec/notify-reminders.bats`.

Akzeptanz:

- Datei enthält genau 5 `@test`-Blöcke mit den IDs `T901025-1` bis `T901025-5`.
- `bats tests/spec/notify-reminders.bats` ist grün auf dem fertigen Stand.
- Kein Guard enthält Brand-Domains als String-Literal (S3).

## Task 2 — Vitest-Suite schreiben (`appointment-notify.test.ts`)

Stilvorlage: `components/website/src/lib/__tests__/appointment-requests.test.ts` —
reine Modulsuite ohne DB, Netzwerk oder Mocks; Zeitzonenfälle über `Europe/Berlin`,
Zustandsmaschine über `it.each`-Tabellen, negative Kontrollen inklusive.

Steps:

1. Datei anlegen mit Imports aus `../appointment-notify.js` (Namen aus Task 0)
   und `../caldav-cache.js` (`berlinDayKey`) für Fensterkanten.
2. Block Template-Rendering: assertet, dass Betreff und Body weder Gesundheitsdaten
   (kein Feld aus Anamnese/Notizen-Payload, keine Diagnose-/Symptom-Begriffe) noch
   werbliche Zusätze (kein Rabatt-, Newsletter- oder Cross-Selling-Text) enthalten —
   Positivliste erlaubter Platzhalter (Name, Datum, Uhrzeit, Praxisname) plus
   Negativ-Regex gegen Blacklist-Begriffe der Implementierung.
3. Block Dedupe-Key-Stabilität: assertet, dass derselbe Termin (gleiche ID, gleicher
   Slot) bei wiederholtem Aufruf denselben Key liefert und verschiedene Termine
   verschiedene Keys liefern (Stabilität über mindestens zwei Aufrufe, keine
   Zufalls-/Zeitanteile im Key).
4. Block Retry-Zählung: assertet, dass der Zähler nach Fehlversuch 1 und 2 einen
   weiteren Versuch erlaubt und nach dem 3. Fehlversuch endgültig abbricht
   (Zustandsübergang `retrying` → `failed`, kein 4. Versuch).
5. Block 24h-Fensterlogik: assertet anhand fester Zeitstempel (Berlin-Kanten wie in
   der Stilvorlage, inkl. Sommer-/Winterzeit-Übergang), dass ein Termin in unter
   24h fällig ist, ein Termin in über 24h nicht fällig ist und ein vergangener
   Termin nie fällig ist; unparseable Eingabe fällt geschlossen auf „nicht fällig".
6. Failing-Test-Lauf: Suite zuerst gegen eine absichtlich falsche Erwartung laufen
   lassen — expected: FAIL — danach korrigieren:
   `npx vitest run components/website/src/lib/__tests__/appointment-notify.test.ts`.

Akzeptanz:

- Alle vier Blöcke vorhanden, jeder mit mindestens einer negativen Kontrolle.
- Suite ist grün: `npx vitest run` auf der Datei meldet 0 Fehler.
- Keine `any`-Typen in der neuen Datei (CQ02: kein `: any`, `<any>`, `as any`).
- Kein neuer Importzyklus (S2): Test importiert nur Lib-Module, keine DB-/API-Schichten.

## Task 3 — Inventar und Verifikation

Steps:

1. `task test:inventory` ausführen und `components/website/src/data/test-inventory.json`
   mitcommitten (CI-Inventar-Check).
2. Gezielte Läufe: `bats tests/spec/notify-reminders.bats` und
   `npx vitest run components/website/src/lib/__tests__/appointment-notify.test.ts`.
3. CQ02-Zählung:
   `bash -c "count=$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: $count (limit: 200)\"; [ $count -le 200 ]"`.
4. `task test:changed`
5. `task freshness:regenerate`
6. `task freshness:check`

Akzeptanz: Alle sechs Steps grün, Inventar-JSON enthält die IDs `T901025-1..5`
und die neue Vitest-Datei.

## S1-Budget-Notizen (wirksame Schwellen, Stand Worktree)

- `tests/spec/notify-reminders.bats`: neue Datei, `.bats` ohne `s1.limits`-Eintrag →
  S1 überspringt sie; Budget-Notiz entfällt, Ziel unter 120 Zeilen aus Stilgründen.
- `components/website/src/lib/__tests__/appointment-notify.test.ts`: Ist 0 (neu) ·
  Baseline nicht-baselined → wirksame Schwelle = `.ts`-Limit 900 → Budget 900;
  Plan schneidet die Datei auf unter 250 Zeilen (unter 30 % der Schwelle, kein
  Split nötig).
- Keine bestehende Datei wird verändert → kein Ratchet-Risiko, keine
  Baseline-Ausnahme nötig.
