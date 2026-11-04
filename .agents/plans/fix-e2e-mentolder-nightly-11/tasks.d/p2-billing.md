# p2 — Billing-Specs auf Klientenakte-Flow heben

## Ziel
In `tests/e2e/specs/fa-21-billing.spec.ts` (ist 104, nicht-baselined) und `tests/e2e/helpers/billing.ts`
(ist 53, nicht-baselined): `klientId` aus `discovery.md` (p1, verbindlich — kein Raten) in
`createTestInvoice`-Payload + T3/PR-A-Calls übernehmen; T3-Erwartung an live Auth-Ordering anpassen
(aktuell: unauthentifiziert → 401, passend zu `create-invoice.ts:14-19`); PR-A-Ablauf auf Klientenakte-Flow
umstellen. Helper-Signatur abwärtskompatibel (`klientId?` optional) — einziger Caller ist `fa-21` (verifiziert),
trotzdem kein Breaking-Change.

## Methode
1. RED-Lauf zuerst: `npx playwright test fa-21-billing` → `expected: FAIL` (3 rote Tests, nightly belegt).
2. Payloads + Erwartungen gemäß `discovery.md` anpassen (exakte Feldnamen aus p1, keine Erfindung).
3. Helper-Typisierung ohne `any` (CQ02: Count nicht erhöhen).
4. Grün-Lauf: `npx playwright test fa-21-billing` → 0 failed.

## Eigner-Override 04.11. (Platzhalter statt Fail-Closed-Stop)
p2 war nach Discovery blockiert (`klientId`-Wert-Shape ohne Prod-Auth nicht verifizierbar).
Eigner-Entscheidung: Billing bekommt vorerst einen Platzhalter — umgesetzt als Env-Gate, NICHT als
erfundener Wert: `createTestInvoice` nimmt `klientId?` (Param oder `E2E_KLIENT_ID`), beide PR-A-Tests
skippen explizit ohne `E2E_KLIENT_ID` (Muster wie `adminLogin`/CRON_SECRET). T3 unverändert (live 401 =
Erwartung, per curl 04.11. 20:40Z belegt). Sobald Shape + Secret stehen: Skip entfernen, Grün-Lauf,
Nightly hebt G-E2E01.

## Gates
- RED vor Grün im selben Partial belegt (Log-Auszug in `phase-events.log`).
- `npx playwright test fa-21-billing` Exit 0.
- Keine Änderung außerhalb der zwei Dateien (S1-Budgets: beide klein, nicht-baselined).
- <!-- vitest: kein neuer Test nötig, weil E2E-Spec-Update ohne Produkt-Code-Change -->
