# p2-tests — RED/GREEN coverage for the `website-db-ops` extraction

Rolle: `tests`. Dieses Partial hängt von `p1` ab (`tasks.d/p1-extract-stage2-module.md`, das
Time-Entries/Client-Notes/Onboarding/Follow-ups/Admin-Shortcuts/DSGVO-Audit-Log/Invoice-Counter/
Brett/Custom-Sections/Content-Store aus `website-db.ts` nach `website-db-ops.ts` verschiebt und
`website-db.ts` Re-Exports unter den alten Namen behalten lässt). Es ist der reine Refactor-Test:
kein Verhalten ändert sich, nur der Modul-Ort einer bereits existierenden Funktion
(`createTimeEntry`) — die drei bestehenden Testdateien für `website-db.ts` MÜSSEN unverändert grün
bleiben.

**Datei-Wahl (dokumentiert, wie gefordert):** Die RED/GREEN-Assertion wird in
`website/src/lib/website-db.time-entries.test.ts` ergänzt (bestehende Datei, testet bereits
`createTimeEntry` direkt gegen `./website-db` — Stage 2 fügt dort einen zweiten `describe`-Block
hinzu, der stattdessen den neuen Modul-Pfad `./website-db-ops` prüft). Kein neues
`website-db-ops.test.ts` — die bestehende Datei ist der natürlichere Ort, weil sie bereits exakt
diese Funktion importiert und mockt; eine zusätzliche Datei würde nur Boilerplate (pg-Mock-Setup)
duplizieren. D1-disjunkt zu p1 (p1 rührt keine `*.test.ts`-Datei an).

## File Structure

| Datei | Status | Budget |
|---|---|---|
| `website/src/lib/website-db.time-entries.test.ts` | erweitert (bestehend) | 600 (`.ts`-Limit; Datei ist mit 94 Zeilen weit darunter, reichlich Reserve) |

Testrunner-Pfad im Repo (verifiziert gegen `Taskfile.yml:809`, Stage-1-Sibling-Muster):
- Website-Vitest: `cd website && pnpm vitest run src/lib/website-db.time-entries.test.ts`

Abbildung Requirement → Test (Nachweispflicht gegen
`openspec/changes/website-db-split-stage2/specs/website-db-split-stage2.md`):

| Requirement (Szenario) | Test |
|---|---|
| REQ-WEBSITE-DB-SPLIT-STAGE2-001 — Stage 2 extrahiert ohne Imports zu brechen | neuer `describe`-Block (direkter Import von `./website-db-ops` + Re-Export-Identität aus `./website-db`) |
| REQ-WEBSITE-DB-SPLIT-STAGE2-002 — keine Import-Zyklen | abgedeckt durch bestehenden S2-Graph-Gate in `task freshness:check` (kein dedizierter Vitest-Test nötig — Zyklen sind ein statischer Graph-Check, kein Laufzeitverhalten) |

## Task 1: RED — `createTimeEntry` direkt aus `./website-db-ops` importierbar (schlägt heute fehl)

- [ ] In `website/src/lib/website-db.time-entries.test.ts` unterhalb des bestehenden
      `describe('createTimeEntry entry_date default (T001351)', …)`-Blocks einen neuen
      `describe`-Block ergänzen, der `createTimeEntry` **direkt** aus `'./website-db-ops'`
      importiert (statt aus `'./website-db'` wie der bestehende Block). Der Import steht am
      Datei-Kopf neben dem bestehenden `import { createTimeEntry } from './website-db';` — mit
      einem Alias, damit beide Importe im selben Dateiscope koexistieren:

```ts
// Neuer Import-Kopf (ergänzt den bestehenden `import { createTimeEntry } from './website-db';`):
import { createTimeEntry as createTimeEntryFromOps } from './website-db-ops';
```

- [ ] Assertion-Block:

```ts
describe('website-db-ops module (Stage 2 extraction, T002150)', () => {
  it('exports createTimeEntry directly from the new website-db-ops module', () => {
    expect(typeof createTimeEntryFromOps).toBe('function');
  });
});
```

- [ ] **Failing-Test-Step (RED).** `website-db-ops.ts` existiert vor p1 nicht — der
      Top-Level-Import scheitert an der Modulauflösung, die gesamte Testdatei kann nicht geladen
      werden und vitest meldet die Datei als fehlgeschlagen (nicht nur den einen `it`-Block).

```bash
cd website && pnpm vitest run src/lib/website-db.time-entries.test.ts
# expected: FAIL (RED — './website-db-ops' existiert noch nicht, Modulauflösung schlägt fehl)
```

## Task 2: GREEN — direkter Import + Re-Export-Identität nach p1

- [ ] Nach p1 (Modul existiert, `website-db.ts` re-exportiert `createTimeEntry` unter dem alten
      Namen) den bestehenden `import { createTimeEntry } from './website-db';` **unverändert**
      lassen (bestehender Block testet weiterhin den alten Importpfad — Kompatibilitätsnachweis)
      und im neuen `describe`-Block eine zweite Assertion ergänzen, die beweist, dass der
      Re-Export aus `website-db.ts` dieselbe Funktionsreferenz ist wie das Original in
      `website-db-ops.ts` (identisches Muster wie die bestehende Re-Export-Identitätsprüfung in
      `website/src/lib/factory-floor.order.test.ts`: `expect(FF_PIPELINE_LANES).toBe(PIPELINE_LANES)`):

```ts
import { createTimeEntry } from './website-db';
import { createTimeEntry as createTimeEntryFromOps } from './website-db-ops';

describe('website-db-ops module (Stage 2 extraction, T002150)', () => {
  it('exports createTimeEntry directly from the new website-db-ops module', () => {
    expect(typeof createTimeEntryFromOps).toBe('function');
  });

  it('website-db.ts re-exports createTimeEntry as the identical function reference (no wrapper, no copy)', () => {
    expect(createTimeEntry).toBe(createTimeEntryFromOps);
  });
});
```

- [ ] Ausführen — beide Assertions grün, weil `website-db.ts` jetzt
      `export { createTimeEntry, … } from './website-db-ops';` verwendet (echter Re-Export, keine
      Wrapper-Funktion, sonst schlägt die `toBe`-Referenzgleichheit fehl):

```bash
cd website && pnpm vitest run src/lib/website-db.time-entries.test.ts
# expected: PASS (GREEN — Modul existiert, Re-Export ist referenzgleich)
```

## Task 3: bestehende Test-Suiten bleiben unverändert grün (Regressions-Nachweis)

Reiner Refactor — keine der drei Testdateien, die `website-db.ts`-Verhalten aus dem Stage-2-
Funktionsumfang abdecken, wird inhaltlich verändert (nur die eine Erweiterung aus Task 1/2 in
`website-db.time-entries.test.ts`). Alle drei müssen vor UND nach p1 grün bleiben:

```bash
cd website && pnpm vitest run src/lib/website-db.test.ts
cd website && pnpm vitest run src/lib/website-db.time-entries.test.ts
cd website && pnpm vitest run src/lib/website-db-projects.test.ts
# expected: PASS (vor UND nach p1 — reiner Modul-Umzug, kein Verhaltenswechsel)
```

## Task 4: `s1.ignore`-Eintrag für `website-db.ts` — Zeilenzahl-Check (Bonus, kein Hard-Gate)

`proposal.md` markiert die Entfernung des `s1.ignore`-Eintrags für
`website/src/lib/website-db.ts` in `docs/code-quality/gates.yaml` ausdrücklich als **Bonus, kein
Hard-Requirement** (nur falls die Datei nach Stage 2 unter 600 Zeilen fällt). Stage 1 (T002149)
läuft vor diesem Partial und könnte den Eintrag bereits entfernt haben, falls Stage 1 allein schon
unter 600 Zeilen kam — unwahrscheinlich (Ist-Stand vor jedem Split: 1939 Zeilen), aber die Prüfung
muss beide Fälle abdecken, ohne eine Annahme über Stage 1 fest zu verdrahten.

- [ ] Nach p1 (Stage 2 gemerged) folgenden Check ausführen — er ist **informativ, nicht
      blockierend** (kein `set -e`-Abbruch, kein CI-Hard-Gate; deckt sich mit
      `docs/code-quality/gates.yaml`s eigenem `s1.ignore`, das dieser Plan nicht direkt editiert,
      weil das Stage-2-eigene `p1` dafür zuständig ist):

```bash
LINES=$(wc -l < website/src/lib/website-db.ts | tr -d ' ')
echo "website-db.ts: ${LINES} lines"
if [ "$LINES" -lt 600 ]; then
  echo "unter 600 Zeilen — s1.ignore-Eintrag MUSS entfernt sein:"
  grep -q '"website/src/lib/website-db.ts"' docs/code-quality/gates.yaml \
    && echo "FAIL: s1.ignore-Eintrag ist noch vorhanden, obwohl Datei < 600 Zeilen" \
    || echo "OK: s1.ignore-Eintrag korrekt entfernt (oder war es schon vor diesem Partial)"
else
  echo "weiterhin >= 600 Zeilen — s1.ignore-Eintrag bleibt korrekt bestehen (kein Bonus-Fall)"
  grep -q '"website/src/lib/website-db.ts"' docs/code-quality/gates.yaml \
    && echo "OK: s1.ignore-Eintrag vorhanden" \
    || echo "FAIL: s1.ignore-Eintrag fehlt, obwohl Datei weiterhin >= 600 Zeilen ist"
fi
```

- [ ] Ergebnis im PR notieren (Kommentar oder Task-Checkbox), nicht als zusätzlichen Vitest-/BATS-
      Test verdrahten — `docs/code-quality/gates.yaml` selbst wird vom `s1`-Gate in
      `task freshness:check` bereits konsistent gegen `docs/code-quality/baseline.json` geprüft
      (Baseline-Key-Count darf nicht wachsen); dieser Task ist nur die dokumentierte
      Sichtprüfung, dass das Bonus-Kriterium aus `proposal.md` korrekt umgesetzt wurde, kein
      zusätzliches Gate.

<!-- vitest: kein weiterer neuer Test nötig über Task 1/2 hinaus — Task 4 ist ein Zeilenzahl-/
     Grep-Check auf docs/code-quality/gates.yaml, kein TS-Verhalten; Task 3 belegt die Regression
     über die drei bestehenden Suiten. -->

## Final Verification

Der zentrale Drei-Gate-Verify läuft im Index-Plan (`tasks.md`, Abschnitt "Verify (RED → GREEN)")
und wird hier nur noch einmal referenziert, damit dieses Partial für sich lesbar bleibt:

```bash
task test:changed          # website-Domain erkannt (website/src/lib/*.test.ts geändert) -> vitest --changed
task freshness:regenerate  # aktualisiert generierte Artefakte (u.a. test-inventory.json, falls nötig)
task freshness:check       # CI-Äquivalent: Freshness + quality:check (S1–S4-Ratchet) + Baseline-Assertion
```

Kein neues Test-Inventar-Eintrag zu erwarten (keine neue Testdatei, nur ein erweiterter
`describe`-Block in einer bereits inventarisierten Datei) — `task freshness:regenerate` bleibt
trotzdem Pflichtschritt, falls sich das Inventar-Skript doch an Inhalt statt nur Dateipfaden
orientiert.
