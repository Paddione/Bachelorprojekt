# p2 — Tests

**Rolle:** tests
**depends_on:** p1
**target_files:** `website/src/lib/__tests__/website-db-customer.test.ts` (extend)

| Datei | Ist | Budget |
| --- | --- | --- |
| `website/src/lib/__tests__/website-db-customer.test.ts` | 29 | 571 |

`website-db-core.ts` (angelegt in p1) ist auf diesem Branch noch nicht vorhanden — das ist die
Voraussetzung für den RED-Schritt in Task 1.

## Datei-Wahl (Begründung)

Erweitert wird die bestehende `website/src/lib/__tests__/website-db-customer.test.ts` statt eine
neue Datei anzulegen — Vitest-Konvention laut `plan-quality-gates.md`: "Bestehende Tests erweitern
statt neue Dateien anlegen". Diese Datei passt inhaltlich am besten: sie testet bereits
Customer-Funktionen (`getCustomerByKeycloakId`), also genau den Funktionsbereich, den p1 nach
`website-db-core.ts` verschiebt (`getCustomerFullById`, `getCustomerByKeycloakId`,
`upsertCustomer`, `setCustomerNumber`, `setIsAdmin`, …). Die Datei hat bereits den passenden
`vi.mock('pg', …)`-Boilerplate auf Modulebene (einfacher `MockPool`-Mock mit `mockQuery`), den
beide neuen Tests wiederverwenden — kein zweiter Mock-Setup nötig. Eine neue
`website-db-core.test.ts` wäre redundant zu diesem bereits vorhandenen Setup.

## Task 1 — Failing-Test-Step (RED)

Vor der Umsetzung von p1 wird in `website/src/lib/__tests__/website-db-customer.test.ts` ein neuer
`describe`-Block ergänzt, der `getCustomerFullById` **direkt** aus `../website-db-core.js`
importiert (nicht über den Re-Export aus `../website-db.js`):

```ts
describe('website-db-core module boundary (T002149 Stage 1)', () => {
  it('exposes getCustomerFullById importable directly from website-db-core', async () => {
    const core = await import('../website-db-core.js');
    expect(typeof core.getCustomerFullById).toBe('function');
  });
});
```

Auf dem aktuellen Branch (vor p1) existiert `website/src/lib/website-db-core.ts` nicht — der
dynamische `import('../website-db-core.js')` schlägt mit einem Modul-Auflösungsfehler fehl, der
Test wirft und ist rot.

**Step:**

```bash
npx vitest run website/src/lib/__tests__/website-db-customer.test.ts
# expected: FAIL — website-db-core.ts existiert vor p1 noch nicht, der Import kann nicht aufgelöst werden
```

## Task 2 — Grün stellen nach p1 + Re-Export-Identitätsprüfung

Nach der Umsetzung von p1 (Extraktion nach `website-db-core.ts`, Re-Export aus `website-db.ts`)
wird derselbe `describe`-Block um eine zweite Assertion ergänzt, die beweist, dass der alte
Importpfad (`./website-db`) weiterhin funktioniert und **dieselbe** Funktionsreferenz liefert wie
der neue direkte Importpfad (`./website-db-core`) — kein Wrapper, keine Kopie:

```ts
describe('website-db-core module boundary (T002149 Stage 1)', () => {
  it('exposes getCustomerFullById importable directly from website-db-core', async () => {
    const core = await import('../website-db-core.js');
    expect(typeof core.getCustomerFullById).toBe('function');
  });

  it('re-exports getCustomerFullById from website-db.ts as the same reference as website-db-core.ts', async () => {
    const core = await import('../website-db-core.js');
    const legacy = await import('../website-db.js');
    expect(legacy.getCustomerFullById).toBe(core.getCustomerFullById);
  });
});
```

`toBe` (Referenzgleichheit, nicht `toEqual`) ist hier bewusst gewählt: `website-db.ts` muss die
Funktion aus `website-db-core.ts` per `export { getCustomerFullById } from './website-db-core'`
re-exportieren, nicht neu implementieren oder in einen Wrapper packen. Ein Wrapper würde diese
Assertion durchfallen lassen, obwohl `typeof` weiterhin `'function'` liefert — genau die Regression,
die dieser Test verhindert.

**Step:**

```bash
npx vitest run website/src/lib/__tests__/website-db-customer.test.ts
# beide Tests grün nach p1
```

## Task 3 — Bestehende Testdateien unverändert verifizieren (Regressionsschutz)

Die sechs bestehenden Testdateien, die heute `website-db.ts`-Verhalten abdecken, werden **nicht
verändert** und müssen nach p1 unverändert weiterlaufen — das ist der Beleg, dass die Extraktion
reines Refactoring ist (keine Call-Site- oder Verhaltensänderung):

```bash
npx vitest run \
  website/src/lib/website-db.test.ts \
  website/src/lib/website-db.content-store.test.ts \
  website/src/lib/website-db-init-hotpath.test.ts \
  website/src/lib/website-db.time-entries.test.ts \
  website/src/lib/website-db-projects.test.ts \
  website/src/lib/__tests__/website-db-customer.test.ts
```

Alle sechs Dateien müssen grün sein — ohne dass an ihrem Inhalt etwas geändert wurde (Diff auf
diese sechs Pfade bleibt leer, außer den beiden neuen Tests in
`website-db-customer.test.ts` aus Task 1/2).

## Task 4 — Test-Inventar regenerieren (CI-Gate)

Neue `it(...)`-Blöcke ändern das Test-Inventar. Ohne Regenerierung failt der CI-Inventar-Check
(`task test:inventory` vs. committeter `website/src/data/test-inventory.json`):

```bash
task test:inventory
git add website/src/data/test-inventory.json
```

## Final Verification

- [ ] **Failing-Test-Step (RED).** Siehe Task 1 — muss vor p1 rot sein.

```bash
npx vitest run website/src/lib/__tests__/website-db-customer.test.ts
# expected: FAIL
```

- [ ] **Fix-Step (GREEN).** Nach p1 (Extraktion + Re-Export) und Task 2 (Identitätsprüfung) müssen
      beide neuen Tests sowie alle sechs bestehenden Testdateien aus Task 3 grün sein.

- [ ] **Final Verification.** Die drei mandatory CI-Gates ausführen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
