---
ticket_id: T000862
status: active
domains: [website, test, infra]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Fix: E2E-Specs verschmutzen den Produktions-Tracker [T000862, T000863]

## Problem (verifizierte Root-Cause-Analyse)

Zwei Playwright-Specs erzeugen echte Zeilen in `tickets.tickets` auf der Live-Prod-DB
(mentolder), die nie aufgeräumt werden:

- **T000862** — `tests/e2e/specs/fa-26-bug-report-form.spec.ts` Test *"valid data returns 200"*
  POSTet ein echtes Bug-Report-Formular. Der Cleanup ist an `CRON_SECRET` gekoppelt
  (`if (CRON_SECRET) { headers… }`). Fehlt das Secret auf dem Runner, werden die
  Marker-Header **still weggelassen** → echte Zeile → Akkumulation
  (Titel: *"Automatischer E2E-Test: Seite lädt nicht korrekt."*, 17× gesamt).
- **T000863** — `tests/e2e/specs/fa-admin-tickets.spec.ts` erzeugt den Seed via
  `/api/bug-report` **ganz ohne** Marker-Header → echte Zeile; der Test setzt am Ende
  nur `done`, löscht aber nichts (Titel: *"PR4 admin-tickets E2E seed"*, 26× gesamt).

### Mechanismus (bereits vorhanden, nur nicht scharf)

- `website/src/pages/api/bug-report.ts:77` stempelt `isTestData = isE2ETestRequest(request)`.
- `website/src/lib/e2e-marker.ts`: verlangt `X-E2E-Test: 1` **und**
  `X-Cron-Secret === process.env.CRON_SECRET`; **fail-closed** wenn `CRON_SECRET`
  serverseitig fehlt (Z. 30 `if (!expected) return false`).
- Purge: `POST /api/admin/systemtest/purge-all-test-data` (gerufen von Playwright
  globalSetup/globalTeardown + CronJob `admin-actions-cleanup` alle 30 min) löscht
  `is_test_data=true`-Zeilen.

### Warum end-to-end kaputt (verifiziert)

1. Die 3 E2E-Workflows reichen `CRON_SECRET` **nicht** an den Runner:
   `e2e.yml` hat es nur als Kommentar (Z. 114, "until CRON_SECRET is provisioned … T000408"),
   `e2e-pr.yml` (läuft gegen Live-Prod `web.mentolder.de`) und
   `factory-post-merge-e2e.yml` haben es gar nicht. → Marker-Header fehlen / sind wertlos,
   und der globalTeardown-Purge kann sich nicht authentifizieren.
2. `fa-admin-tickets` sendet die Header gar nicht erst.
3. Der Live-Website-Pod hatte beim Triage **kein** `CRON_SECRET` in der Env, obwohl
   `k3d/website.yaml:241` es aus `website-secrets` verdrahtet — d. h. Deploy-Lag
   (push-based, kein GitOps). **T000408 wurde `done/fixed` geschlossen, ohne dass die
   Verdrahtung wirklich greift** (Regression-Notiz, siehe unten).

Die existierenden geleakten Zeilen sind bereits triagiert (2 frische diese Runde geschlossen;
Rest historisch `done`). Dieser Fix verhindert **künftige** Leaks; ein nachträgliches Purgen
der Altzeilen ist nicht nötig (sie sind `is_test_data=false` und bereits `done`).

## Lösung — Scope-Trennung

**Autonom (dieser Fix):** Test-Helper + fail-loud Skip-Guard + Workflow-YAML-Verdrahtung.
Der Skip-Guard stoppt die Pollution **sofort** (skippen statt lecken), auch bevor das
Repo-Secret existiert; sobald es existiert, stempeln die Marker + globalTeardown purged.

**Mensch (Prerequisite, nicht in diesem PR — Bezug T000408):** GitHub-Repo-Secret
`CRON_SECRET` (= Wert aus `website-secrets` SealedSecret) anlegen, und Live-Pod-Env
verifizieren/redeployen. Sensibler Wert → kann/darf hier nicht gesetzt werden.

## Implementierungsschritte

### 1. Shared Helper `tests/e2e/lib/e2e-marker.ts` (neu, Leaf-Modul, kein Import-Zyklus)

```ts
const BASE = process.env.WEBSITE_URL ?? 'http://localhost:4321';

/** Marker-Header-Paar, falls CRON_SECRET verfügbar — sonst undefined (fail-closed). */
export function markerHeaders(): Record<string, string> | undefined {
  const s = process.env.CRON_SECRET;
  return s ? { 'X-E2E-Test': '1', 'X-Cron-Secret': s } : undefined;
}

export function markerAvailable(): boolean {
  return !!process.env.CRON_SECRET;
}

/** POST /api/bug-report mit Marker → is_test_data=true. Wirft, wenn Marker fehlt. */
export async function createTestBugReport(
  request: import('@playwright/test').APIRequestContext,
  fields: { description: string; email: string; category: string; url?: string },
): Promise<{ ticketId: string }> {
  const headers = markerHeaders();
  if (!headers) throw new Error('createTestBugReport ohne CRON_SECRET — Aufrufer muss vorher markerAvailable() skippen');
  const res = await request.post(`${BASE}/api/bug-report`, {
    headers,
    multipart: { url: '/', ...fields },
  });
  if (!res.ok()) throw new Error(`bug-report create failed: ${res.status()}`);
  const body = await res.json() as { success: boolean; ticketId: string };
  return { ticketId: body.ticketId };
}
```

### 2. `tests/e2e/specs/fa-admin-tickets.spec.ts` (T000863)

- Import `createTestBugReport`, `markerAvailable`.
- Am Anfang des Full-Flow-Tests: `test.skip(!markerAvailable(), 'CRON_SECRET fehlt — Seed würde Prod-Tracker verschmutzen');`
- Seed-Block (Z. 55–67) durch `const { ticketId: externalId } = await createTestBugReport(request, { description: 'PR4 admin-tickets E2E seed', email: reporter, category: 'fehler', url: '/admin/tickets-e2e' });` ersetzen.

### 3. `tests/e2e/specs/fa-26-bug-report-form.spec.ts` (T000862)

- Import `markerHeaders`, `markerAvailable`.
- Den Inline-`if (CRON_SECRET)`-Block durch `markerHeaders()` ersetzen.
- Test *"valid data returns 200"*: `test.skip(!markerAvailable(), 'CRON_SECRET fehlt — würde echtes Ticket erzeugen');` voranstellen. (Die 400-Validierungs-Tests erzeugen keine Zeilen → laufen weiter.)

### 4. Workflow-Verdrahtung — `CRON_SECRET: ${{ secrets.CRON_SECRET }}`

In den Runner-/Step-`env`-Block aufnehmen (forward-kompatibel: fehlt das Repo-Secret,
ist der Wert leer → Tests skippen statt zu lecken):

- `.github/workflows/e2e-pr.yml` (job-`env`, beim `E2E_ADMIN_*`/`MM_TEST_*`-Block).
- `.github/workflows/e2e.yml` (Playwright-Step-`env`; den reinen Kommentar Z. 114 durch die echte Zuweisung ersetzen).
- `.github/workflows/factory-post-merge-e2e.yml` (Step-`env`, falls er Playwright fährt).

### 5. Guard-Test (bereits geschrieben, rot→grün)

`website/tests/e2e-marker-hygiene.test.ts` — scannt alle Specs; jede, die zu
`/api/bug-report` POSTet, muss den Marker führen. Heute rot (fa-admin-tickets),
nach Schritt 2 grün. Läuft offline im `node`-vitest-Projekt → in `task test:all`.

### 6. (Optional, nur falls zeilenneutral machbar) fa-10 / fa-admin-inbox-delete

`fa-10-website.spec.ts` (T6) und `fa-admin-inbox-delete.spec.ts` posten zu `/api/contact`
mit dupliziertem Marker-Block — können `markerHeaders()` adoptieren. **Optional**, da
anderer Endpoint (vom Guard-Test nicht erfasst); nur anfassen, wenn risikolos.

## Verifikation (finaler Task)

```bash
cd website && pnpm vitest run tests/e2e-marker-hygiene.test.ts   # muss GRÜN sein
cd .. && task test:changed                                       # vitest + domain-BATS
task test:inventory                                              # Tests hinzugefügt → Inventar regenerieren
git add website/src/data/test-inventory.json
task freshness:regenerate && task freshness:check                # S1–S4-Ratchet (CI-Äquivalent)
```

S1–S4: `e2e-marker.ts` ist neu (kein Baseline-Budget), Spec-Edits netto-klein, Workflow-YAML
nur additive `env`-Zeilen, keine Brand-Domain-Literale in Snippets, Helper ist Leaf (kein Zyklus),
keine verwaisten Manifeste. Erwartet konfliktfrei.

## Menschlicher Folge-Schritt (separat, Bezug T000408)

1. GitHub-Repo-Secret `CRON_SECRET` = Wert aus `website-secrets` SealedSecret anlegen.
2. Live-Website-Pod-Env prüfen (`kubectl get deploy website -o jsonpath …`); falls
   `CRON_SECRET` fehlt → `task workspace:deploy ENV=mentolder` **und** `ENV=korczewski`.
3. T000408 als regrediert kommentieren/wieder-eröffnen (geschlossen, aber Verdrahtung greift nicht).

## Betroffene Tickets

- **T000862** (fa-26 silent-create) — fixed durch Schritt 1+3+4.
- **T000863** (fa-admin-tickets seed leak) — fixed durch Schritt 1+2+4.
- **T000408** (CRON_SECRET-Provisionierung) — Regression-Notiz; menschlicher Folge-Schritt.
