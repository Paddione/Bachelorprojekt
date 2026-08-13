---
ticket_id: T003144
plan_ref: openspec/changes/portal-profile-bats/tasks.md
status: active
date: 2026-08-13
---

# Design: portal-profile-bats

## Symptom vs. Ursache (T002448-M5)

**Symptom (Fakt):** `tests/unit/portal-profile-update.bats` ist offline 4/4 rot. Der Allowlist-
Grund „Requires a live DB" trägt nicht: Der Test ruft reine Funktionen
(`validateProfileInput`, `CONTACT_TYPES`) auf, keine DB-Operation.

**Ursache (mit Reproducer belegt):** Die Tests importieren `customer-crm-db.ts` unter plain
tsx/node. Die Datei hat den Top-Level-Import `./website-db`; `website-db.ts:267` re-exportiert
aus `./content-bundle`, dessen Zeile 52 `import.meta.glob` (Vite/Astro-only API) ausführt.
Unter tsx/node existiert `import.meta.glob` nicht → der Modul-Graph bricht ab, bevor eine
Assertion laufen kann.

```bash
# Stand, gegen den gemessen wurde — origin/main b2635814e
cd website && npx tsx -e "import {validateProfileInput} from './src/lib/customer-crm-db.ts'; const r=validateProfileInput({phone:'x'.repeat(31)}); process.exit(r.ok?1:0)"
# → TypeError: define_import_meta_default.glob is not a function
#   at website/src/lib/content-bundle.ts:52 (via website-db.ts:267)
```

Zweitbefund: `validateProfileInput` und die Enums sind reine Logik — sie brauchen weder `pool`
noch `ensureSchemaOnce`. Der DB-Kontakt ist eine Import-Transitivität, keine funktionale
Abhängigkeit.

## Entscheidung

**Option A — Validierungslogik in ein import-freies Modul isolieren** (`profile-validation.ts`),
`customer-crm-db.ts` re-exportiert:

1. Neues Leaf-Modul `website/src/lib/profile-validation.ts` ohne jegliche Imports: `ProfileInput`,
   `MAXLEN`, `validateProfileInput`, `CONTACT_CHANNELS`, `COMM_FREQUENCIES`,
   `CUSTOMER_STATUSES`, `CONTACT_TYPES` und die Typen (`ContactChannel`, `CommFrequency`,
   `CustomerStatus`, `ContactType`). Semantik 1:1 — reiner Verschiebe-Refactor.
2. `customer-crm-db.ts` importiert die Symbole (`import type` für reine Typen, da
   `verbatimModuleSyntax: true`) und re-exportiert die bisher öffentlichen Symbole
   (`ProfileInput`, `validateProfileInput`, alle Enums, `CustomerStatus`, `ContactType`) —
   API-Identität garantiert.
3. Der BATS-Test importiert aus `./src/lib/profile-validation.ts`. Test 4 bekommt den
   Positiv-Anker (T002356-M1): erst prüfen, dass `CONTACT_TYPES` `'email'` enthält, dann dass
   `'profile_update'` fehlt.
4. Allowlist-Eintrag + Kommentar-Block entfernen — `task test:unit` sweept die Datei wieder in
   den Offline-Gate.

Begründung: `tsx` kann keine Module mocken (kein `vi.mock`-Äquivalent) — „per mocks laden"
hieße einen Loader bauen, der `import.meta.glob` stubbet: fragil, kein Repo-Muster, wartet auf
die nächste Vite-API. Die Isolierung entfernt die Vite-Abhängigkeit dauerhaft aus dem
Testpfad, hält die Laufzeit-API unverändert und entspricht S2 (pure Helper-Module, keine
Import-Zyklen). SSOT-Requirements (`openspec/specs/portal.md`) bleiben erfüllt — das Szenario
„CONTACT_TYPES ist aus `customer-crm-db.ts` importiert" bleibt dank Re-Export wahr.

## Verworfen

- **Option B (Loader-Mock für `import.meta.glob`):** kein Bestand-Muster, Vite-API-Kopplung
  bleibt bestehen, Testpfad bleibt fragil.
- **Option C (Test löschen, Vitest deckt ab):** entfernt das Offline-BATS-Gate aus T000614; der
  Vitest-CI-Pfad ist laut Erfahrung nicht äquivalent zum Offline-Gate (shallow-History-Selektion).
- **Option D (Test auf customer-crm-db.ts belassen):** ändert nichts — der Import zieht
  `website-db` weiterhin und bleibt rot.

## Umgebung

`npx tsx` ist im CI-Job „BATS Unit + Quality Gates" verfügbar: `tsx` ist Root-devDependency
(`package.json:42`, `npm ci` installiert es), die bestehenden Offline-Tests
(`tests/unit/coaching-json-ingest.bats`, `scs-index.bats`) nutzen dasselbe Muster. Kein
Verfügbarkeits-Guard nötig.

S1-Budgets (plan-lint `residual_budget`, Gates aus `docs/code-quality/gates.yaml`):
- `website/src/lib/customer-crm-db.ts`: Ist 190 · nicht-baselined → Limit 900 → **Budget 710**
  (die Änderung macht die Datei kleiner — Verschiebung ≈ 45 Zeilen raus, ~6 Zeilen rein).
- `website/src/lib/profile-validation.ts`: **neu** → Limit 900, Ziel ≈ 80 Zeilen.
- `tests/unit/portal-profile-update.bats` und `tests/unit/.coverage-allowlist`: kein
  Extension-Limit (ungated) — keine Budget-Angabe.
