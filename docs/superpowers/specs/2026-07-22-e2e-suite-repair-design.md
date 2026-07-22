---
ticket_id: T002068
plan_ref: openspec/changes/e2e-suite-repair/tasks.md
status: active
date: 2026-07-22
---

# e2e-suite-repair — Design-Spec [T002068]

## Kontext

Vollständiger E2E-Lauf (`task test:e2e ENV=mentolder`) endete mit **150 failed / 4 flaky**.
Triage am 2026-07-22 hat die Failures auf fünf Root-Cause-Cluster reduziert; alle Kern-Ursachen
sind live verifiziert (curl-Proben gegen Prod, SQL gegen `pocket_id`-DB auf fleet).

## Root-Cause-Analyse (verifiziert)

### Cluster 1 — Auth-Kaskade (~110 Tests: mentolder-setup, website, systemtest, mentolder)

`/api/auth/e2e-login?username=paddione&token=<CRON_SECRET>` antwortet auf Prod mit
`404 {"error":"user \"paddione\" not found"}` — bei **korrektem** Token (der Purge-Endpoint
akzeptiert dasselbe Secret mit 200). Die Pocket-ID-Datenbank (fleet, `pocket_id.users`)
enthält genau zwei User: `gekko` und **`Paddione`** (großes P).
`website/src/pages/api/auth/e2e-login.ts` matcht case-sensitiv:

```ts
const user = users.find(u => u.username === username || u.email === username);
```

`'Paddione' !== 'paddione'` → 404 → `loginViaE2E` läuft in `waitForURL('/admin')`-Timeout →
jeder authentifizierte Test scheitert (Setup-Projekte, alle `[website]`-Logins, alle
`[systemtest]`-Wizard-Läufe).

**Entscheidung:** Case-insensitiver Match in `e2e-login.ts` (exakter Treffer gewinnt,
sonst erster case-insensitiver Treffer über username ODER email). Der Pocket-ID-User wird
NICHT umbenannt — das ist eine live SSO-Identität (OIDC-Claims, Passkeys).

### Cluster 2 — PROD_DOMAIN-Env-Leakage (4 Unit-Tests: `tests/e2e/lib/health-assertions.test.ts`)

`health-assertions.ts` schaltet über `isProd() = !!process.env.PROD_DOMAIN` zwischen
Hard-Fail (prod) und `test.fixme` (dev). Der Taskfile-Wrapper `test:e2e` exportiert
`PROD_DOMAIN=mentolder.de` — damit laufen die vier Dev-Mode-Testfälle
(`allow404AsNotDeployed: 404 → fixme`, `network error → fixme in dev`,
`without E2E_ADMIN_PASS → fixme/fail`, `failing health check → fails`) im Prod-Modus:
`skipOrFail` wirft, ohne `testInfo.fixme` aufzurufen → `calls.length`-Assertions scheitern.

**Entscheidung:** Die Tests kapseln `PROD_DOMAIN` selbst (Save → `delete` → Restore in
`beforeEach`/`afterEach` bzw. `finally`), analog zu den bereits vorhandenen Prod-Mode-Tests,
die `PROD_DOMAIN` explizit setzen. Verhalten der Library bleibt unverändert.

### Cluster 3 — oauth2-proxy vor Health-Endpoints (fa-27: 13 Tests, fa-13 T3, indirekt brett-mannequin)

`brett.mentolder.de/healthz` und `docs.mentolder.de/` antworten 302 →
`auth.mentolder.de/authorize?...` (oauth2-proxy-brett / oauth2-proxy-docs). Die
`[services]`-Tests sind bewusst unauthentifiziert und erwarten 200 bzw. JSON-APIs.

**Entscheidung:** `skip_auth_routes` (bzw. äquivalente oauth2-proxy-Flags) für exakt
verankerte, datenfreie Pfade: `^/healthz$` auf brett; für die fa-27-API-Tests
(`/api/state`, `/api/snapshots`, `/api/customers`, `/presets`, `/three.min.js`) wird im
Plan pro Pfad entschieden: Health + statische Assets freigeben; Daten-APIs NICHT —
stattdessen werden diese fa-27-Tests auf authentifizierten Kontext (storageState des
`brett-mentolder`-Projekts) umgestellt oder ins `brett-mentolder`-Projekt verschoben.
Security-Gate: keine personenbezogenen/mutierenden Endpoints ohne Auth freigeben.

### Cluster 4 — notify_push (fa-ios T2, fa-03 teilweise)

`files.mentolder.de/status.php` → 200 (Nextcloud gesund), aber `/push` → 404:
das notify_push-Routing (Ingress-Pfad → notify_push-Sidecar/Service) fehlt oder ist defekt.

**Entscheidung:** Ingress-/Service-Routing für `/push` auf dem files-Host
diagnostizieren und reparieren (k3d-Basis + prod-fleet-Overlay).

### Cluster 5 — korczewski-Content & brett-mannequin (Diagnose-first)

`web.korczewski.de` ist erreichbar (200); die Failures (Nav-Wordmark, Service-Cards,
Timeline-Button, Footer, Subpages) deuten auf Drift zwischen Live-Content und
Test-Assertions. brett-mannequin (7 Tests) hängt am `brett-mentolder`-Setup (flaky) und
an Cluster 3. Kein blinder Fix: erst Diagnose-Task (Assertions gegen Live-DOM abgleichen),
dann gezielt Test ODER Content korrigieren.

## Nicht-Ziele

- Kein Umbau des Auth-Systems (Pocket-ID bleibt SSOT der Identitäten).
- Keine Lockerung von oauth2-proxy über Health/statische Assets hinaus.
- Kein Massen-Umschreiben von Tests „bis grün" — jede Änderung braucht eine belegte Ursache.

## Testbarkeit / Rot-Grün

- **RED (Cluster 1):** neuer Vitest `website/src/pages/api/auth/e2e-login.test.ts` —
  gemockter `listUsers()` liefert `{ username: 'Paddione' }`, Request mit
  `username=paddione` → erwartet 302; schlägt vor dem Fix mit 404 fehl.
- **RED (Cluster 2):** die vier bestehenden Unit-Tests schlagen unter
  `PROD_DOMAIN=example.com npx playwright test --project=unit` fehl; nach dem Fix grün
  unabhängig vom Env.
- Cluster 3/4 werden über die bestehenden fa-27/fa-13/fa-ios-Tests gegen Prod verifiziert
  (dev-flow-e2e nach Deploy).

## Risiken

- Case-insensitiver Match: theoretische Ambiguität bei Usern, die sich nur in
  Groß-/Kleinschreibung unterscheiden → exakter Match hat Vorrang.
- skip_auth_routes: Regex müssen verankert sein (`^…$`), Review durch Security-Checkliste.
- notify_push: Fix berührt Prod-Ingress — Rollout über normalen PR/Deploy-Weg, kein Hotfix am Cluster vorbei.
