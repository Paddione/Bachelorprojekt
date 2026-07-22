---
title: "e2e-suite-repair — Implementation Plan"
ticket_id: T002068
domains: [website, test, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# e2e-suite-repair — Implementation Plan

_Ticket: T002068 — 150 E2E-Failures, fünf verifizierte Root-Cause-Cluster (siehe
`docs/superpowers/specs/2026-07-22-e2e-suite-repair-design.md` und `proposal.md`)._

## File Structure

```
website/src/pages/api/auth/e2e-login.ts        # Cluster 1: case-insensitiver User-Match
website/src/pages/api/auth/e2e-login.test.ts   # Cluster 1: RED-Vitest (bereits committed)
tests/e2e/lib/health-assertions.test.ts        # Cluster 2: PROD_DOMAIN-Isolation
k3d/oauth2-proxy-brett.yaml                    # Cluster 3: --skip-auth-routes healthz/Assets
tests/e2e/playwright.config.ts                 # Cluster 3: fa-27-Daten-API-Tests → auth. Projekt
tests/e2e/specs/fa-27-brett.spec.ts            # Cluster 3: Split public/auth Probes
tests/e2e/specs/fa-13-docs.spec.ts             # Cluster 3: T3 akzeptiert Auth-Redirect
tests/e2e/specs/fa-ios-talk.spec.ts            # Cluster 4: notify_push-Probe-Pfad
tests/e2e/specs/korczewski-home.spec.ts        # Cluster 5: Assertions an Live-Content angleichen
website/src/data/test-inventory.json           # Inventar-Regenerat nach Test-Änderungen
```

S1-Budgets (wirksame Schwelle = max(Limit, Baseline); alle Dateien nicht-baselined,
Limit `.ts` = 600):

- `website/src/pages/api/auth/e2e-login.ts` — 57 Zeilen, Budget: 543
- `tests/e2e/lib/health-assertions.test.ts` — 242 Zeilen, Budget: 358
- `tests/e2e/specs/fa-27-brett.spec.ts` — 106 Zeilen, Budget: 494
- `tests/e2e/specs/fa-13-docs.spec.ts` — 46 Zeilen, Budget: 554
- `tests/e2e/specs/fa-ios-talk.spec.ts` — 34 Zeilen, Budget: 566
- `tests/e2e/specs/korczewski-home.spec.ts` — 193 Zeilen, Budget: 407
- `tests/e2e/playwright.config.ts` — 342 Zeilen, Budget: 258
- `k3d/oauth2-proxy-brett.yaml` — YAML, kein S1-Gate

Keine Brand-Domain-Literale in neuem Code: Hosts kommen aus `PROD_DOMAIN`/Env
(Muster wie in `fa-13-docs.spec.ts` bereits vorhanden).

## Task 1 — Cluster 1 RED: e2e-login Case-Sensitivity (Test liegt bereits im Branch)

Der Vitest `website/src/pages/api/auth/e2e-login.test.ts` ist mit dem Plan-Stage-Commit
committed und reproduziert den Bug (gemockter `listUsers()` liefert `Paddione`,
Request sendet `paddione`).

```bash
cd website && npx vitest run src/pages/api/auth/e2e-login.test.ts
# expected: FAIL — 2 von 4 Cases rot (case-insensitiver Username- und E-Mail-Match)
```

## Task 2 — Cluster 1 GREEN: case-insensitiver Match in e2e-login.ts

In `website/src/pages/api/auth/e2e-login.ts` den `users.find(...)` ersetzen:
exakter Match (`u.username === username || u.email === username`) hat Vorrang;
Fallback ist ein case-insensitiver Vergleich über `username` UND `email`
(`toLowerCase()` beidseitig). Verhalten bei unbekanntem User unverändert (404).

- target_files: `website/src/pages/api/auth/e2e-login.ts` (Budget: 543)

```bash
cd website && npx vitest run src/pages/api/auth/e2e-login.test.ts   # jetzt grün (4/4)
```

## Task 3 — Cluster 2: PROD_DOMAIN-Isolation in health-assertions.test.ts

RED-Nachweis vor der Änderung:

```bash
cd tests/e2e && PROD_DOMAIN=example.com CRON_SECRET=dummy WEBSITE_URL=http://127.0.0.1:9 \
  npx playwright test --project=unit 2>&1 | tail -5
# expected: FAIL — die 4 Dev-Mode-Cases kippen in den Prod-Modus
```

(Hinweis: globalSetup braucht `CRON_SECRET`; der Purge-Call gegen die unerreichbare
`WEBSITE_URL` darf den Setup nicht hart abbrechen — falls doch, den RED-Nachweis
stattdessen mit gesetztem echten `CRON_SECRET`+`WEBSITE_URL` führen, identisch zum
Fehlbild aus dem 150er-Lauf.)

Fix: In `tests/e2e/lib/health-assertions.test.ts` eine gemeinsame
`beforeEach`/`afterEach`-Klammer einführen, die `process.env.PROD_DOMAIN` sichert und
**löscht** (Dev-Modus als Test-Default) und danach exakt wiederherstellt; die
bestehenden Prod-Mode-Cases setzen die Variable weiterhin explizit selbst. Kein
Verhaltens-Change in `health-assertions.ts`.

- target_files: `tests/e2e/lib/health-assertions.test.ts` (Budget: 358)

```bash
cd tests/e2e && PROD_DOMAIN=example.com npx playwright test --project=unit   # grün
cd tests/e2e && npx playwright test --project=unit                            # grün ohne Env
```

## Task 4 — Cluster 3: oauth2-proxy skip-auth-routes (brett) + Test-Restrukturierung

1. `k3d/oauth2-proxy-brett.yaml`: `--skip-auth-routes` ergänzen für exakt verankerte,
   datenfreie Routen: `GET=^/healthz$` und `GET=^/three\.min\.js$`. KEINE Daten-APIs
   (`/api/state`, `/api/snapshots`, `/api/customers`, `/presets`) freigeben.
   Vorher prüfen, ob `prod/`, `prod-mentolder/` oder `prod-fleet/mentolder/` die
   oauth2-proxy-brett-Args patchen (`grep -rn "oauth2-proxy-brett" prod*/`) — falls ja,
   Patch dort ergänzen, sonst wirkt die Base-Änderung nicht in Prod.
2. `tests/e2e/specs/fa-27-brett.spec.ts` aufteilen: T1/T2/T4 (reachability, healthz,
   three.min.js) bleiben unauthentifiziert im `services`-Projekt; die Daten-API-Cases
   (T3, T5–T13) wandern in einen `test.describe`-Block, der den `storageState` des
   `brett-mentolder`-Projekts nutzt — dazu in `tests/e2e/playwright.config.ts` die
   Datei zusätzlich in das `brett-mentolder`-`testMatch` aufnehmen und im
   `services`-Kontext via `test.skip` bei fehlendem Auth-State überspringen
   (Muster: bestehende authenticated-describe-Blöcke in `fa-53`/`fa-54`).
3. `tests/e2e/specs/fa-13-docs.spec.ts` T3: Der Redirect auf den Auth-Host ist für den
   unauthentifizierten Reachability-Check das korrekte, erwartbare Verhalten — die
   Assertion akzeptiert final 200 auf dem Auth-Host ODER 2xx auf dem Docs-Host
   (Host aus `PROD_DOMAIN` abgeleitet, kein Domain-Literal).

- target_files: `k3d/oauth2-proxy-brett.yaml` (YAML, kein S1-Gate),
  `tests/e2e/specs/fa-27-brett.spec.ts` (Budget: 494),
  `tests/e2e/playwright.config.ts` (Budget: 258),
  `tests/e2e/specs/fa-13-docs.spec.ts` (Budget: 554)

```bash
task workspace:validate
./tests/runner.sh local FA-27 || true   # lokale Struktur-Checks; Live-Verify nach Deploy
```

## Task 5 — Cluster 4: notify_push-Probe korrigieren

`tests/e2e/specs/fa-ios-talk.spec.ts` T2: Probe von `${NC_URL}/push` auf
`${NC_URL}/push/test/cookie` umstellen (echter notify_push-Endpoint; antwortet ohne
Session mit 400/200 — beides belegt, dass der Daemon lebt). Akzeptierte Stati:
200, 400, 405. Begründungskommentar im Test auf den Apache-ProxyPass
(`/push/` → `127.0.0.1:7867`) in `k3d/nextcloud.yaml` verweisen lassen.

- target_files: `tests/e2e/specs/fa-ios-talk.spec.ts` (Budget: 566)

## Task 6 — Cluster 5: korczewski-Assertions gegen Live-Content abgleichen (Diagnose-first)

1. Diagnose: `curl -s https://web.korczewski.de/` + Playwright-Snapshot der Live-Nav;
   dokumentieren, welche der erwarteten Nav-Einträge („Leistungen", „Über mich",
   „Notizen", „Kontakt"), Service-Cards, Timeline-„Mehr laden", Footer-Copyright und
   Subpages (`/ueber-mich`, `/leistungen`, `/registrieren`, `/software-dev`, `/404`)
   tatsächlich abweichen (Stand Triage: „Über mich"/„Notizen" fehlen in der Live-Nav).
2. Pro Abweichung entscheiden: Ist der Live-Zustand gewollt (Content-Redesign) →
   Assertion in `tests/e2e/specs/korczewski-home.spec.ts` anpassen; ist er ungewollt →
   separates Content-Bug-Ticket eröffnen und den Test unverändert lassen (der Test
   dokumentiert dann den offenen Bug). Keine pauschalen Lockerungen der Assertions.
3. brett-mannequin (7 Tests) nach Task 4 gegen Prod re-runnen; verbleibende Failures
   als eigenständigen Befund im Ticket T002068 kommentieren (nicht in diesem Change
   blind mitfixen).

- target_files: `tests/e2e/specs/korczewski-home.spec.ts` (Budget: 407)

## Task 7 — Verifikation (CI-Äquivalent)

Nach Test-Änderungen zusätzlich das Inventar regenerieren und committen:

```bash
task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
task test:openspec
```

Abschließend im Worktree den kompletten Unit-Anteil lokal grün ziehen
(`cd website && npx vitest run src/pages/api/auth/e2e-login.test.ts`;
`cd tests/e2e && npx playwright test --project=unit`). Der Live-E2E-Nachweis
(mentolder-setup + website-Projekt gegen Prod) läuft nach Merge+Deploy über
`dev-flow-e2e` mit `task test:e2e ENV=mentolder`.
