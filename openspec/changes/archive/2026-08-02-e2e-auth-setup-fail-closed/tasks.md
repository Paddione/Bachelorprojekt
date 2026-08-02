---
title: E2E-Auth-Setup fail-closed + fa-51 Projektzuordnung
ticket_id: T002199
domains: [tests, ci, e2e, auth]
status: plan_staged
---

# e2e-auth-setup-fail-closed — Implementation Plan

Behebt vier Root Causes im E2E-Auth-Setup, die am 2026-07-26 gemeinsam ~33 Phantom-Failures
und vier falsche Bug-Tickets erzeugt haben. Root-Cause-Herleitung und Entscheidungen:
`openspec/changes/e2e-auth-setup-fail-closed/design.md`.

## File Structure

| Datei | Ist-Zeilen | S1-Budget (nicht-baselined → Limit − Ist) |
| `tests/e2e/specs/mentolder-auth-setup.spec.ts` | 92 | 508 |
| `tests/e2e/specs/korczewski-auth-setup.spec.ts` | 86 | 514 |
| `tests/e2e/specs/brett-mentolder-auth-setup.spec.ts` | 44 | 556 |
| `tests/e2e/playwright.config.ts` | 317 | 283 |
| `tests/spec/e2e-test-infrastructure.bats` | 129 | n/a — `.bats` hat keine S1-Grenze |
| `openspec/changes/e2e-auth-setup-fail-closed/specs/e2e-test-infrastructure.md` | neu | n/a — Spec-Delta |

Alle vier Code-Dateien liegen unter 55 % ihrer wirksamen Schwelle; kein Split nötig.

<!-- vitest: kein neuer Test nötig, weil ausschließlich Test-Harness-Dateien geändert werden — die Regressionsabdeckung liegt in tests/spec/e2e-test-infrastructure.bats -->

## Task 1 — Failing Tests (rot → grün)

**Status: bereits erledigt, RED verifiziert.** Sechs Regressionstests in
`tests/spec/e2e-test-infrastructure.bats` ergänzt (Helper `project_block()` im `setup()`).

```bash
bats tests/spec/e2e-test-infrastructure.bats
# expected: FAIL — 6 von 14 Tests rot, solange die Fixes aus Task 2–5 fehlen
```

Verifizierte Ausgangslage (2026-07-26):

```
ok 1..8    (bestehende e2e-seed-Tests)
not ok 9   admin auth-setup specs do not write an empty state for the admin path
not ok 10  admin auth-setup specs gate on CRON_SECRET, the value loginViaE2E actually uses
not ok 11  mentolder auth-setup awaits the storageState write
not ok 12  korczewski auth-setup names the variable it actually reads
not ok 13  fa-51 sidekick spec runs in the authenticated mentolder project
not ok 14  fa-51 sidekick spec is not in the unauthenticated website project
```

Nach Task 2–5 müssen alle 14 grün sein.

## Task 2 — `mentolder-auth-setup.spec.ts` fail-closed (RC1, RC2, RC4)

Betrifft `tests/e2e/specs/mentolder-auth-setup.spec.ts` (Ist 92 · Budget 508).

1. **Gate auf `CRON_SECRET` umstellen (RC2).** Der Admin-Setup-Test prüft am Anfang
   `process.env.CRON_SECRET`. Fehlt der Wert, wird ein Fehler geworfen, dessen Meldung
   die Variable beim Namen nennt und erklärt, dass `loginViaE2E` sie für
   `/api/auth/e2e-login` braucht. `E2E_ADMIN_PASS` wird als Gate-Kriterium entfernt.

2. **`writeEmptyState()` aus dem Admin-Pfad entfernen (RC1).** Der Aufruf
   `writeEmptyState('mentolder-website-admin.json')` entfällt ersatzlos. Die Funktion selbst
   bleibt bestehen — der Portal-User-Pfad nutzt sie weiter (Entscheidung D6 im Design).

3. **`saveStorageState()` awaiten (RC4).** Signatur wird `async … : Promise<void>`, die
   `forEach`-Schleife weicht einer `for…of`-Schleife mit
   `await page.context().storageState({ path: target })`. Aufrufstelle bekommt `await`.
   Vorbild ist `korczewski-auth-setup.spec.ts:63`, das den Aufruf bereits korrekt awaitet.

4. **Header-Kommentar korrigieren.** Der Env-Var-Block nennt aktuell
   `E2E_ADMIN_PASS — required for admin tests; writes empty state if absent`. Das beschreibt
   das entfernte Verhalten und wird durch die `CRON_SECRET`-Anforderung ersetzt.

```bash
cd tests/e2e && env -u CRON_SECRET ./node_modules/.bin/playwright test --project=mentolder-setup
# erwartet: Exit != 0, Fehlermeldung nennt CRON_SECRET
```

## Task 3 — `korczewski-auth-setup.spec.ts` fail-closed (RC1, RC2, RC5)

Betrifft `tests/e2e/specs/korczewski-auth-setup.spec.ts` (Ist 86 · Budget 514).

1. Beide Setup-Tests (website admin, brett) gaten auf `CRON_SECRET` statt auf
   `TEST_ADMIN_PASSWORD` und werfen bei Abwesenheit.
2. Die `writeEmptyState()`-Aufrufe in beiden Admin-Pfaden entfallen.
3. **RC5:** Die Log-Meldung `[korczewski-setup] E2E_ADMIN_PASS not set` verschwindet mit dem
   Degradationspfad. Verbleibende Meldungen nennen ausschließlich Variablen, die die Datei
   auch tatsächlich liest.

## Task 4 — `brett-mentolder-auth-setup.spec.ts` fail-closed (RC1, RC2)

Betrifft `tests/e2e/specs/brett-mentolder-auth-setup.spec.ts` (Ist 44 · Budget 556).

Gleiche Behandlung wie Task 3: Gate auf `CRON_SECRET`, `writeEmptyState()`-Aufruf im
Admin-Pfad entfernen, Header-Kommentar
`E2E_ADMIN_PASS — required for admin tests; writes empty state if absent` an das neue
Verhalten anpassen.

## Task 5 — fa-51 ins authentifizierte Projekt verschieben (RC3)

Betrifft `tests/e2e/playwright.config.ts` (Ist 317 · Budget 283).

Die Zeile `'**/fa-51-*.spec.ts'` wird aus dem `testMatch` des Projekts `website` entfernt und
im Projekt `mentolder` ergänzt. Das `mentolder`-Projekt hat
`dependencies: ['mentolder-setup']` und `storageState: '.auth/mentolder-website-admin.json'` —
damit läuft die Sidekick-Spec erstmals mit einer Admin-Session gegen `/admin`.

Der Kommentar am neuen Eintrag hält fest, warum die Spec authentifiziert laufen muss
(`/admin`-Route, FAB rendert nur eingeloggt).

```bash
grep -n 'fa-51' tests/e2e/playwright.config.ts
# erwartet: genau ein Treffer, innerhalb des mentolder-Projektblocks
```

## Task 6 — Spec-Delta schreiben

Neue Datei
`openspec/changes/e2e-auth-setup-fail-closed/specs/e2e-test-infrastructure.md` —
benannt nach dem **Parent-SSOT-Slug** `e2e-test-infrastructure`, nicht nach dem Change-Slug
(Delta-Konvention T001304).

Inhalt: eine `### Requirement: Fail-closed admin auth setup` mit Szenarien für
(a) fehlendes `CRON_SECRET` → Setup rot, abhängige Projekte übersprungen,
(b) vorhandenes `CRON_SECRET` → storageState mit nicht-leerem `cookies`-Array,
(c) `fa-51` läuft im authentifizierten Projekt.

```bash
bash scripts/openspec.sh validate
```

## Task 7 — Verifikation

```bash
bats tests/spec/e2e-test-infrastructure.bats   # erwartet: 14/14 grün
task test:inventory                            # Test-Inventar regenerieren und mitcommitten
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich der Positivnachweis gegen die echte Umgebung — er belegt, dass der Fix nicht nur
strukturell greift, sondern der storageState danach wirklich gefüllt ist:

```bash
cd tests/e2e && ./node_modules/.bin/playwright test --project=mentolder-setup
jq -e '.cookies | length > 0' .auth/mentolder-website-admin.json
```
