# T000480 — E2E Green-on-Skip-Muster beheben

**Status:** Design (approved)
**Ticket:** T000480
**Date:** 2026-06-07
**Source:** docs/audits/2026-06-07-e2e-reachability-test-quality.md

---

## Problem

Die Playwright-E2E-Suite hat ein systematisches Green-on-Skip-Muster, das Produktionsfehler unsichtbar macht:

1. **CI provisioniert `E2E_ADMIN_PASS` nie** — `e2e.yml` setzt `MM_TEST_USER`/`MM_TEST_PASS` aber kein `E2E_ADMIN_PASS`. `mentolder-auth-setup.spec.ts` schreibt leeres `storageState`. 35+ Admin-CRUD-, Content-Hub-, Inbox-, Ticket-, Coaching-Specs → strukturell tot.
2. **Defensive Skip-Logik** akzeptiert Fehlerzustände als "okay": `if (404) test.skip()`, `expect([200,503]).toContain()`, `.catch(() => null) → skip`
3. **Brett-Tests überspringen komplett** in Prod (`!!PROD_DOMAIN` → skip aller 11 API-Tests)
4. **Hard-Skips** (`test.skip(true, ...)`) sind unsichtbar — sie tauchen als "passed" im Report auf

## Design

### 0. Mode-Unterscheidung

```typescript
// tests/e2e/lib/health-assertions.ts
const IS_PROD = !!process.env.PROD_DOMAIN;
```

- **Prod** (`PROD_DOMAIN` gesetzt): Nichterreichbarkeit → **Hard-Failure** (`throw new Error(...)`)
- **Dev** (ohne `PROD_DOMAIN`): Nichterreichbarkeit → `test.fixme()` (sichtbar im Report, zählt als skipped)

### 1. Core Library: `tests/e2e/lib/health-assertions.ts`

#### 1.1 `assertReachable(request, url, opts?, testInfo?)`

```typescript
interface ReachableOpts {
  acceptableStatuses?: number[];  // default: [200]
  timeout?: number;               // default: 10_000
  allow404AsNotDeployed?: boolean; // 404 = service optionally not deployed → fixme in prod
}

async function assertReachable(
  request: APIRequestContext,
  url: string,
  opts?: ReachableOpts,
  testInfo?: TestInfo
): Promise<APIResponse>
```

**Verhalten:**
- HTTP-Request → Status prüfen
- Erfolg (Status in `acceptableStatuses`): Response zurückgeben
- `allow404AsNotDeployed && status === 404`: `test.fixme('service not deployed')`
- Anderer Fehler in Prod: `throw new Error(...)` mit URL + Status + Body
- Anderer Fehler in Dev: `test.fixme('service unreachable in dev')`

#### 1.2 `assertAuthenticatedReachable(request, url, opts?, testInfo?)`

```typescript
async function assertAuthenticatedReachable(
  request: APIRequestContext,
  url: string,
  opts?: ReachableOpts,
  testInfo?: TestInfo
): Promise<APIResponse>
```

**Zusätzliche Prüfung vor Request:** `E2E_ADMIN_PASS` muss gesetzt sein.
- Fehlt in Prod: Hard-Failure ("E2E_ADMIN_PASS required but not set in CI")
- Fehlt in Dev: `test.fixme('E2E_ADMIN_PASS not set')`

#### 1.3 `assertHealth(request, url, check, testInfo?)`

```typescript
type HealthCheck = (response: APIResponse) => Promise<HealthResult>;

interface HealthResult {
  ok: boolean;
  reason?: string;
}

async function assertHealth(
  request: APIRequestContext,
  url: string,
  check: HealthCheck,
  testInfo?: TestInfo
): Promise<void>
```

Macht Reachability-Check + führt `check()` auf der Response aus (z.B. Nextcloud `installed:true` prüfen).

### 2. CI-Provisionierung: `e2e.yml`

**Änderung in `.github/workflows/e2e.yml`**, `env:`-Block (nach Zeile 110):

```yaml
# Admin auth for E2E suite (was missing — T000480)
E2E_ADMIN_USER: paddione
E2E_ADMIN_PASS: ${{ secrets.E2E_ADMIN_PASS }}
```

**Voraussetzung:** `E2E_ADMIN_PASS` muss als Repository-Secret in GitHub angelegt werden.
`secrets.E2E_ADMIN_PASS` wirft einen Workflow-Error wenn das Secret nicht existiert —
es muss vor dem ersten CI-Run provisioniert werden.
Falls das Secret aus Sicherheitsgründen nicht in CI verfügbar sein soll, stattdessen
`E2E_ADMIN_PASS: ''` setzen; `health-assertions.ts` handled leeres Passwort via `test.fixme()`.

### 3. Skip-Migration — 7 Kategorien

#### K1: `!E2E_ADMIN_PASS` → skip (~35 Specs)

**Pattern:**
```typescript
// BEFORE
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;
test('admin CRUD', async ({ page }) => {
  test.skip(!ADMIN_PASS, 'E2E_ADMIN_PASS not set');
  // ...
});

// AFTER
import { assertAuthenticatedReachable } from '../lib/health-assertions';
test('admin CRUD', async ({ page, request }, testInfo) => {
  await assertAuthenticatedReachable(request, `${WEBSITE_URL}/api/admin/...`, {}, testInfo);
  // ...
});
```

**Betroffene Dateien (Auszug):**
- `fa-admin-db-crud-clients.spec.ts`
- `fa-admin-db-crud-followups.spec.ts`
- `fa-admin-db-crud-projekte.spec.ts`
- `fa-admin-db-crud-shortcuts.spec.ts`
- `fa-admin-inbox.spec.ts`
- `fa-admin-inbox-delete.spec.ts`
- `fa-admin-tickets.spec.ts`
- `fa-43-ticket-widget.spec.ts`
- `fa-45-authenticated-flows.spec.ts`
- `fa-46-lernpfad-cta.spec.ts`
- `fa-30-systemtest-failure-loop.spec.ts`
- `fa-39-coaching-sessions.spec.ts`
- `fa-39-lmstudio-integration.spec.ts`
- `fa-44-platform-health-integrity.spec.ts`
- `fa-bugs-notifications.spec.ts`
- `fa-bug-t000368.spec.ts`
- `fa-content-hub-price-ssot.spec.ts`
- `fa-fragebogen.spec.ts`
- `wissensquellen.spec.ts`
- `fa-admin-knowledge-model-selection.spec.ts`
- `fa-admin-inhalte.spec.ts`
- `fa-admin-live.spec.ts`
- `fa-admin-settings.spec.ts`
- `fa-admin-monitoring.spec.ts`
- `fa-admin-newsletter.spec.ts`
- `fa-admin-backup-settings.spec.ts`
- `fa-admin-billing-system.spec.ts`
- `fa-admin-crm.spec.ts`
- `fa-client-portal.spec.ts`
- `fa-coaching-drafts.spec.ts`
- `fa-coaching-knowledge.spec.ts`
- `fa-coaching-publish.spec.ts`
- `fa-document-signing.spec.ts`
- `fa-slot-widget.spec.ts`
- `helpers/billing.ts`

**Migrierte Specs behalten zusätzlich `test.skip()` NICHT** — sie verlassen sich vollständig auf die Assertion.

#### K2: `!!PROD_DOMAIN` → skip (Brett, 11 Tests)

**Datei:** `fa-27-brett.spec.ts`

**Fix:**
1. `brett-mentolder-auth-setup.spec.ts` macht echten Keycloak-Login auch in Prod (aktuell schreibt es leeres State bei fehlendem `E2E_ADMIN_PASS`)
2. `fa-27-brett.spec.ts` nutzt `storageState: '.auth/mentolder-brett.json'`
3. `PROD_DOMAIN`-Skips entfernen, ersetzt durch `assertReachable()` auf `/healthz`

**Auth-Setup-Änderung:**
- `brett-mentolder-auth-setup.spec.ts` erbt `E2E_ADMIN_PASS`-Prüfung analog zu `mentolder-auth-setup.spec.ts`

#### K3: `test.skip(true, ...)` Hard-Skips (~8)

**Pattern ersetzen:**
```typescript
// BEFORE
test.skip(true, 'T1-T2: kubectl-Operationen erfordern Cluster-Zugriff');

// AFTER
test.fixme(true, 'T1-T2: kubectl-Operationen erfordern Cluster-Zugriff — T000480');
```

`test.fixme()` ist im Playwright-Report als "fixme" sichtbar, nicht als "passed".
Jedes `test.skip(true, ...)` wird zu `test.fixme(true, ...)`.

**Betroffene Dateien:**
- `ak-03-technical.spec.ts:53`
- `nfa-04-scalability.spec.ts:36`
- `nfa-07-opensource.spec.ts:32`
- `nfa-08-production-deploy.spec.ts:44`
- `nfa-09-static-dns.spec.ts:31`

#### K4: `!serviceAvailable` → skip (Transcriber, 7 Tests)

**Datei:** `fa-18-transcription.spec.ts`

**Fix:** ClusterIP-only-Service kann nicht extern getestet werden.
- `beforeAll`-Service-Check → `test.fixme()` statt `test.skip()`
- Langfristig: In-Cluster-Playwright-Runner (separates Ticket)

#### K5: `if (404) test.skip(true)` (Collabora/Tracking in integration-smoke)

**Datei:** `integration-smoke.spec.ts`

**Fix:**
```typescript
// BEFORE
test('@smoke Collabora discovery', async ({ request }) => {
  const res = await request.get(`https://office.${DOMAIN}/hosting/discovery`);
  if (res.status() === 404) {
    test.skip(true, 'Collabora not deployed');
    return;
  }
  expect(res.status()).toBe(200);
});

// AFTER
test('@smoke Collabora discovery', async ({ request }, testInfo) => {
  const res = await assertReachable(
    request,
    `https://office.${DOMAIN}/hosting/discovery`,
    { acceptableStatuses: [200], allow404AsNotDeployed: true },
    testInfo
  );
  const text = await res.text();
  expect(text).toContain('wopi-discovery');
});
```

Gleiches Muster für Tracking (`allow404AsNotDeployed: true`).

#### K6: `expect([200,503]).toContain()` (Signaling)

**Datei:** `integration-smoke.spec.ts`, `fa-03-video.spec.ts`

**Fix:**
```typescript
test('@smoke Talk signaling', async ({ request }, testInfo) => {
  const res = await request.get(`https://signaling.${DOMAIN}/api/v1/welcome`);
  if (res.status() === 503) {
    test.fixme(true, 'Signaling NATS backend unavailable (503)');
    return;
  }
  expect(res.status()).toBe(200);
});
```

#### K7: `.catch(() => null) → skip` (LiveKit/Content-Hub)

**Dateien:** `fa-livekit.spec.ts`, `fa-content-hub-concurrency.spec.ts`

**Fix:** Transportfehler → `assertReachable()` mit Timeout. Netzwerkfehler sind in Prod immer real.

### 4. Integration-Smoke-Härtung

| Test | Vorher | Nachher | Begründung |
|------|--------|---------|------------|
| DocuSeal | `[200,301,302,401]` | `[200,302,401]` | 301=Permanenter Redirect (config-bug), kein akzeptabler Status |
| Mailpit | `[200,302,401,404,500]` | `[200,302,401]` | 404/500 sind Fehler, nicht "alive" |
| Docs | `[200,302,401]` | `[200,302,401]` | ✅ korrekt — oauth2-proxy redirect |
| Signaling | `[200,503]` | Nur `[200]` | 503 → `test.fixme()` separat |
| Collabora | `if (404) skip` | `allow404AsNotDeployed` | via K5 |
| Tracking | `if (404) skip` | `allow404AsNotDeployed` | via K5 |

### 5. Error-Reporting

Alle `assertReachable`-Fehler produzieren strukturierte Meldungen:

```
E2E HEALTH CHECK FAILED [prod]
  URL: https://sign.mentolder.de
  Expected: 200
  Got: 302 → Location: /setup
  Message: DocuSeal is unprovisioned — redirecting to /setup wizard
```

Diese Meldungen sind:
- Im Playwright-Report sichtbar (via `testInfo.attachments`)
- In den GitHub Action Logs suchbar (`grep "E2E HEALTH CHECK FAILED"`)
- Vom Ingest-Endpoint als Test-Failure mit klarer Fehlermeldung erfasst

### 6. Scope-Abgrenzung

**In Scope:**
- `health-assertions.ts` Bibliothek
- `e2e.yml` Änderung
- K1–K7 Migration aller 167 Skips
- Integration-Smoke-Härtung
- Brett Auth-Setup für Prod

**Out of Scope (Folgetickets):**
- In-Cluster-Playwright-Runner für ClusterIP-only Services (Transcriber)
- Recovery Browser E2E Spec (T000479)
- DocuSeal Provisionierung (T000477)
- Collabora WOPI-Konfiguration (T000478)

### 7. Testing der Tests

**Unit-Tests für `health-assertions.ts`:**
```typescript
// tests/e2e/lib/health-assertions.test.ts
// - assertReachable: 200 → pass, 503 → fixme/fail by mode
// - assertReachable: allow404AsNotDeployed
// - assertAuthenticatedReachable: without E2E_ADMIN_PASS → fixme/fail
// - Prod mode detection: PROD_DOMAIN set → hard fail
```

**Manuelle Verifikation:**
1. Lokal: `npx playwright test` → alle `test.fixme()` sichtbar im Report
2. CI-Dry-Run: `E2E_ADMIN_PASS=""` → authentifizierte Tests fixme
3. CI-Prod: `E2E_ADMIN_PASS=<real>` → authentifizierte Tests laufen durch

### 8. Rollback-Plan

Falls die CI-Änderung bricht:
1. `E2E_ADMIN_PASS`-Zeilen in `e2e.yml` auskommentieren
2. `health-assertions.ts` hat Fallback: ohne `PROD_DOMAIN` → alles `test.fixme()`
3. Migration ist rückwärtskompatibel — alte `test.skip()`-Logik kann parallel existieren

---

## Files Changed (estimated)

| File | Change |
|------|--------|
| `tests/e2e/lib/health-assertions.ts` | **NEW** — core library |
| `tests/e2e/lib/health-assertions.test.ts` | **NEW** — unit tests |
| `.github/workflows/e2e.yml` | +3 lines (E2E_ADMIN_PASS) |
| `tests/e2e/specs/integration-smoke.spec.ts` | Rewrite assertions |
| `tests/e2e/specs/fa-27-brett.spec.ts` | Remove PROD_DOMAIN skips |
| `tests/e2e/specs/brett-mentolder-auth-setup.spec.ts` | Add real auth |
| `tests/e2e/specs/mentolder-auth-setup.spec.ts` | Use assertAuthenticatedReachable |
| `tests/e2e/specs/arena-mentolder-auth-setup.spec.ts` | Use assertAuthenticatedReachable |
| `tests/e2e/specs/korczewski-auth-setup.spec.ts` | Use assertAuthenticatedReachable |
| ~35 admin spec files | Replace `test.skip(!ADMIN_PASS, ...)` |
| ~8 hard-skip files | `test.skip(true)` → `test.fixme(true)` |
| `tests/e2e/specs/fa-18-transcription.spec.ts` | `test.skip` → `test.fixme` |
| `tests/e2e/specs/fa-03-video.spec.ts` | 503 handling |
| `tests/e2e/specs/fa-livekit.spec.ts` | Transport error handling |
| `tests/e2e/specs/fa-content-hub-concurrency.spec.ts` | Transport error handling |
