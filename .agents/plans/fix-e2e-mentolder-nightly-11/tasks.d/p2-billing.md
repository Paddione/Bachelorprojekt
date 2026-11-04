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

## Gates
- RED vor Grün im selben Partial belegt (Log-Auszug in `phase-events.log`).
- `npx playwright test fa-21-billing` Exit 0.
- Keine Änderung außerhalb der zwei Dateien (S1-Budgets: beide klein, nicht-baselined).
- <!-- vitest: kein neuer Test nötig, weil E2E-Spec-Update ohne Produkt-Code-Change -->
