---
title: "portal-profile-update.bats offline grün: Validierungslogik aus customer-crm-db.ts isolieren"
ticket_id: T003144
domains: [test, website]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# portal-profile-bats — Implementation Plan

Der Offline-Test `tests/unit/portal-profile-update.bats` ist 4/4 rot, weil sein Import von
`customer-crm-db.ts` transitiv `content-bundle.ts` mit der Vite-only API `import.meta.glob`
zieht (TypeError unter plain tsx/node). Der Fix isoliert die reine Validierungslogik in ein
import-freies Modul, re-exportiert sie aus `customer-crm-db.ts` (API-Identität) und nimmt den
Test zurück in den Offline-Gate.

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `website/src/lib/profile-validation.ts` | neu | Limit 900 (.ts), Ziel ≈ 80 |
| `website/src/lib/customer-crm-db.ts` | 190 | 710 (Limit 900, nicht-baselined — wird kleiner) |
| `tests/unit/portal-profile-update.bats` | 26 | ungated (kein Extension-Limit) |
| `tests/unit/.coverage-allowlist` | 67 | ungated (wird kleiner) |

## Task 1 — RED: BATS-Test auf das reine Validierungsmodul umstellen

Datei: `tests/unit/portal-profile-update.bats`

- In allen vier `@test`-Blöcken den Import von `'./src/lib/customer-crm-db.ts'` auf
  `'./src/lib/profile-validation.ts'` umstellen (die `npx tsx -e`-Expression, keine anderen
  Zeilen).
- Test 4 (`CONTACT_TYPES enum excludes profile_update`) um den Positiv-Anker erweitern
  (T002356-M1: erst der gültige Fall, dann die Negativ-Aussage — Reihenfolge im Ausdruck):
  `process.exit(CONTACT_TYPES.includes('email') && !CONTACT_TYPES.includes('profile_update') ? 0 : 1)`
- Keine anderen inhaltlichen Änderungen; die Test-Semantik (Feldlängen, Enums) bleibt.

Rot-Grün-Nachweis (STRUCT2) — das Modul existiert noch nicht, der Import muss fehlschlagen:

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/portal-profile-update.bats
# expected: FAIL — 4/4 rot mit Modul-Import-Fehler (profile-validation.ts nicht gefunden),
# NICHT mehr mit TypeError aus content-bundle.ts
```

## Task 2 — `website/src/lib/profile-validation.ts` anlegen (pure Leaf-Module, S2)

Neue Datei `website/src/lib/profile-validation.ts`, Inhalt 1:1 aus `customer-crm-db.ts`
verschoben (reiner Verschiebe-Refactor, keine Logikänderung):

- `ProfileInput` (interface) und `MAXLEN` (Record)
- `validateProfileInput` (Funktion)
- `CONTACT_CHANNELS`, `COMM_FREQUENCIES`, `CUSTOMER_STATUSES`, `CONTACT_TYPES` (consts)
- Typen `ContactChannel`, `CommFrequency`, `CustomerStatus`, `ContactType` — jetzt alle
  exportiert (zwei waren bisher file-private; Export schadet nicht)

Verbindlich:

- **Keinerlei Imports** in dieser Datei (kein `./website-db`, kein `./content-bundle`, keine
  Vite-API) — nur der Zweck, unter plain tsx/node ladbar zu sein.
- Reihenfolge wie im Quellmodul belassen, damit der Diff lesbar bleibt.
- Kein `any` einführen (CQ02: `website/src` zählt `: any`-Verwendungen, Limit 200).

## Task 3 — `customer-crm-db.ts`: Import + Re-Export, API-Identität

Datei: `website/src/lib/customer-crm-db.ts`

- Die in Task 2 verschobenen Blöcke (Enums, `MAXLEN`, `validateProfileInput`,
  `ProfileInput`, Typen) aus der Datei entfernen.
- Import aus dem neuen Modul — wegen `verbatimModuleSyntax: true` (website/tsconfig.json:4)
  reine Typ-Symbole als `import type { ... }` (in einem `import type`-Statement zusammenfassen).
  Intern gebraucht wird: `CUSTOMER_STATUSES` (Wert, in `updateCustomerCrm`), `ProfileInput`
  (Typ, in `UPDATABLE` und `updateCustomerProfile`), `CustomerStatus` (Typ, in
  `updateCustomerCrm`). `MAXLEN`, `ContactChannel`, `CommFrequency` und `CONTACT_TYPES` werden
  intern nicht mehr gebraucht — sie leben nur noch im neuen Modul (bzw. im Re-Export).
- Re-Export-Statements anhängen, damit die öffentliche API von `customer-crm-db.ts`
  unverändert bleibt:
  - `export { CONTACT_CHANNELS, COMM_FREQUENCIES, CUSTOMER_STATUSES, CONTACT_TYPES, validateProfileInput } from './profile-validation';`
  - `export type { ProfileInput, CustomerStatus, ContactType } from './profile-validation';`
  - Die bisher file-private Typen `ContactChannel`, `CommFrequency` und `MAXLEN` werden NICHT
    re-exportiert (waren nie öffentlich).
- Der bestehende `import { pool, ensureSchemaOnce } from './website-db'` bleibt für die
  DB-Funktionen unverändert bestehen (die DB-Funktionen ziehen NICHT um).
- Kein neuer Import-Zyklus: `profile-validation.ts` ist ein Leaf (importiert nichts); die
  Importkante `customer-crm-db → profile-validation` ist azyklisch.

Verifikation (auf dem fertigen Stand von Task 4, da sonst der Allowlist-Guard meckert — als
Schritt hier dokumentiert, ausgeführt nach Task 4):

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/portal-profile-update.bats   # 4/4 grün
cd website && npx tsc --noEmit                                            # Typen konsistent
```

## Task 4 — Allowlist-Eintrag entfernen, Offline-Gate wiederherstellen

Datei: `tests/unit/.coverage-allowlist`

- Den Eintrag `portal-profile-update` (Zeile) samt dem Kommentar-Block
  (`# --- Currently FAILS offline: website/src/lib/customer-crm-db.ts importiert transitiv
  ... [T003144]`) entfernen — kein Ersatz-Eintrag, die Datei soll wieder vom
  `test:unit`-Sweep erfasst werden.
- Danach keine weiteren Allowlist-Zeilen anfassen (die übrigen Einträge gehören zu anderen
  Tickets).

Verifikation (Output-basiert):

```bash
bash scripts/tests/unit-coverage-guard.sh                               # grün — Datei vom Sweep erfasst
tests/unit/lib/bats-core/bin/bats tests/unit/portal-profile-update.bats # 4/4 grün
```

## Task 5 — Gesamt-Verifikation (STRUCT3)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- `task test:changed` selektiert `tests/unit/portal-profile-update.bats` über
  `scripts/find-changed-tests.sh` und führt sie im CI-äquivalenten Pfad aus; die
  Coverage-Guard-Logik läuft darin mit.
- `task freshness:regenerate` aktualisiert generierte Artefakte. Hinweis: `portal-profile-update`
  kommt im Test-Inventory (`website/src/data/test-inventory.json`) nicht vor (0 Treffer) —
  ein Inventory-Diff ist nicht erwartet; falls `freshness:regenerate` ihn dennoch erzeugt,
  wird er committet (CI-Inventar-Check).
- `task freshness:check` deckt die S1–S4-Ratchets ab (alle betroffenen Dateien
  nicht-baselined bzw. unter Limit, siehe File Structure) und die Baseline-Key-Assertion.

<!-- vitest: kein neuer Test nötig, weil die bestehenden Vitest-Dateien
website/src/lib/customer-crm-db.test.ts und customer-crm-db.ensure.test.ts die identische
Logik weiterhin über den customer-crm-db.ts-Import abdecken (Re-Export, keine Logikänderung);
die neue Datei ist ein reiner Verschiebe-Refactor ohne Verhaltensänderung. -->
