# Design: E2E-Auth-Setup fail-closed

- **Ticket:** T002199
- **Typ:** fix
- **Parent-SSOT-Spec:** `openspec/specs/e2e-test-infrastructure.md`

## Purpose

Der E2E-Auth-Setup degradiert bei fehlenden Credentials still statt zu brechen. Ein Lauf ohne
Credentials schreibt einen leeren `storageState`, endet grün, und schickt alle abhängigen
Playwright-Projekte unauthentifiziert in die Suite. Das Ergebnis sind dutzende
Locator-Timeouts, die wie Produktfehler aussehen — und aus denen am 2026-07-26 vier
falsche Bug-Tickets generiert wurden (T002189, T002190, T002191, T002197).

Dieser Change macht das Setup fail-closed: fehlt das Credential, bricht der Setup-Schritt
sichtbar ab und Playwright überspringt die abhängigen Projekte, statt sie ins Leere laufen
zu lassen.

## Root-Cause-Analyse

Belegt am Rohlauf `tests/results/.tmp-e2e-results.json` (2026-07-26 13:44 UTC,
`expected: 342, unexpected: 73, skipped: 284`).

### RC1 — Fail-open Setup (alle drei Setup-Specs)

`tests/e2e/specs/mentolder-auth-setup.spec.ts:52`, `korczewski-auth-setup.spec.ts:48`,
`brett-mentolder-auth-setup.spec.ts:31` reagieren auf ein fehlendes Credential mit
`writeEmptyState()` + `return`. Der Setup-Test endet **grün**.

Der Kommentar verspricht `admin tests will use test.fixme` — diese Degradation ist
nirgends verdrahtet. Die abhängigen Tests werden nicht geskippt, sie laufen mit einer
leeren Session in 45-Sekunden-Timeouts.

Beleg aus dem Lauf (STDERR aller vier Setup-Tests, Status jeweils `expected`):

```
[mentolder-setup] E2E_ADMIN_PASS not set — writing empty state (admin tests will use test.fixme)
[korczewski-setup] E2E_ADMIN_PASS not set — writing empty state (admin tests will use test.fixme)
[brett-mentolder-setup] E2E_ADMIN_PASS not set — writing empty state (brett tests will use test.fixme)
```

Alle fünf `tests/e2e/.auth/*.json` enthielten danach `{"cookies":[],"origins":[]}`.

### RC2 — Gate prüft die falsche Variable

`tests/e2e/lib/auth.ts:20` `loginViaE2E()` authentifiziert über
`GET /api/auth/e2e-login?username=…&token=$CRON_SECRET`. **Das Passwort wird nie
verwendet.** `E2E_ADMIN_PASS` ist damit ein Boolean-Gate für eine Variable, die der
Login-Pfad gar nicht braucht; der tatsächlich erforderliche Wert ist `CRON_SECRET`.

Konsequenz: ein Lauf *mit* `E2E_ADMIN_PASS` aber *ohne* `CRON_SECRET` passiert das Gate
und scheitert danach unverständlich im Login.

### RC3 — fa-51 im unauthentifizierten Projekt

`tests/e2e/playwright.config.ts` listet `**/fa-51-*.spec.ts` im Projekt `website`. Dieses
Projekt hat keinen `storageState` und keine `dependencies`. Die Spec navigiert aber nach
`/admin` (live ohne Session: HTTP 302 → `/api/auth/login`), sodass `.fab` nie rendert.
Die Spec ist dort **strukturell nie grün erreichbar**.

### RC4 — Floating Promise beim storageState-Schreiben

`mentolder-auth-setup.spec.ts:30` `saveStorageState()` ist als `: void` deklariert und ruft
`page.context().storageState({ path: target })` **ohne `await`** auf. Der Schreibvorgang
konkurriert mit dem Context-Teardown am Testende. `korczewski-auth-setup.spec.ts:63` macht
denselben Aufruf korrekt mit `await` — die mentolder-Variante ist die Abweichung.

Folge: auch ein Lauf *mit* korrekten Credentials hat keine Garantie, dass
`.auth/mentolder-website-admin.json` vollständig geschrieben wird.

### RC5 — irreführende Log-Meldung (kosmetisch, aber diagnoserelevant)

`korczewski-auth-setup.spec.ts:29` liest `TEST_ADMIN_PASSWORD`, meldet aber
`E2E_ADMIN_PASS not set`. Wer der Meldung folgt, setzt die falsche Variable.

## Entscheidungen

| # | Frage | Entscheidung | Begründung |
|---|---|---|---|
| D1 | Hart failen oder Tests explizit skippen? | **Hart failen** im Setup-Test | Playwright überspringt abhängige Projekte automatisch, wenn ihre `dependencies` fehlschlagen. Das erzeugt genau ein rotes Signal an der Ursache statt 33 roter Signale an den Symptomen. Ein `test.fixme`-Ansatz müsste in jeder einzelnen Spec verdrahtet werden und driftet garantiert wieder auseinander. |
| D2 | Welche Variable gated? | **`CRON_SECRET`** | Das ist der Wert, den `loginViaE2E` tatsächlich verwendet. Ein Gate muss die Bedingung prüfen, unter der der nachfolgende Code funktioniert — nicht eine korrelierte. |
| D3 | `E2E_ADMIN_PASS` entfernen? | **Nein, nur entkoppeln** | Die Variable wird weiter von `getAdminCredentials()` und `scripts/systemtest-fanout.sh` gelesen. Sie zu entfernen ist ein eigener Scope; hier wird sie nur als Gate-Kriterium abgelöst. |
| D4 | Opt-out für Läufe ohne Credentials? | **Nicht nötig** | Wer nur unauthentifizierte Projekte laufen lässt (`--project=website`, `--project=services`), triggert die Setup-Projekte gar nicht. Ein Opt-out-Flag wäre eine neue Umgehung derselben Falle. |
| D5 | Alle drei Setup-Specs anfassen? | **Ja** | Das Muster ist in allen dreien identisch. Nur eine zu fixen lässt die Falle für korczewski und brett bestehen. |
| D6 | `writeEmptyState()` behalten? | **Ja, aber nur für den Portal-User** | Der Portal-User-Pfad (`E2E_USER_PASS`) ist eine echte Opt-in-Erweiterung: fehlt er, sollen die Portal-Tests wirklich ohne Session laufen. Nur der **Admin**-Pfad wird fail-closed. |

## Scope

**In scope**
- `tests/e2e/specs/mentolder-auth-setup.spec.ts` — RC1, RC2, RC4
- `tests/e2e/specs/korczewski-auth-setup.spec.ts` — RC1, RC2, RC5
- `tests/e2e/specs/brett-mentolder-auth-setup.spec.ts` — RC1, RC2
- `tests/e2e/playwright.config.ts` — RC3
- `tests/spec/e2e-test-infrastructure.bats` — Regressionstests
- `openspec/changes/e2e-auth-setup-fail-closed/specs/e2e-test-infrastructure.md` — Delta

**Explizit NICHT in scope**
- Die Poll-API (T002192) — eigener Defekt, eigener Fix.
- Der Brett-503 (T002195) — transient, eigene Nachverfolgung.
- Veraltete Erwartungen in `korczewski-home.spec.ts` — noch ungeticketet.
- Entfernen von `E2E_ADMIN_PASS` aus `getAdminCredentials()` / `systemtest-fanout.sh`.

## Edge Cases

| Fall | Erwartetes Verhalten |
|---|---|
| Lauf ohne `CRON_SECRET`, nur `--project=website` | Setup läuft nicht, Suite läuft normal durch. |
| Lauf ohne `CRON_SECRET`, `--project=mentolder` | `mentolder-setup` **rot**, `mentolder`-Tests werden übersprungen (nicht als Failures gezählt). |
| Lauf mit `CRON_SECRET`, Login schlägt fehl | Bisheriges Verhalten: `expect(me.authenticated).toBe(true)` schlägt fehl → Setup rot. Unverändert. |
| `E2E_USER_PASS` fehlt | Unverändert: leerer Portal-State, Setup grün (D6). |
| CI (`.github/workflows/e2e.yml`) | Setzt `CRON_SECRET` bereits (Zeile 132) — kein Workflow-Change nötig. |

## Verifikation

```bash
cd tests/e2e
# 1. Fail-closed: ohne Credential MUSS der Setup rot sein
env -u CRON_SECRET -u E2E_ADMIN_PASS ./node_modules/.bin/playwright test --project=mentolder-setup
#    erwartet: exit != 0, Meldung nennt CRON_SECRET

# 2. Strukturelle Regressionstests
bats ../spec/e2e-test-infrastructure.bats

# 3. Mit Credentials: storageState ist nicht leer
./node_modules/.bin/playwright test --project=mentolder-setup
jq -e '.cookies | length > 0' .auth/mentolder-website-admin.json
```
