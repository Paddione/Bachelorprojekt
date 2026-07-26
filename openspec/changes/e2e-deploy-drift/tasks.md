---
title: E2E-Läufe trennen Code-Stand und Deploy-Stand
ticket_id: T002202
domains: [test, website, infra]
status: plan_staged
---

# e2e-deploy-drift — Implementation Plan

Design-SSOT: `openspec/changes/e2e-deploy-drift/design.md`

Ein E2E-Lauf gegen Prod misst Code und Deploy-Stand gleichzeitig und schreibt jede Abweichung dem Code zu. Belegt durch T002192: `main` war korrekt, nur der deployte Build lag zurück — das Ticket beschrieb einen Bug, den es im Repo nie gab. Dieser Plan macht den deployten Commit beobachtbar und entzieht dem Auto-Ticketing die Grundlage, sobald Code- und Deploy-Stand auseinanderfallen.

Die Strukturtests sind bereits geschrieben und **rot**: 10 Failures, 18 Passes in `tests/spec/e2e-test-infrastructure.bats`. Die R4-Tests derselben Datei sind grün und sichern den bereits gemergten T002199-Fix ab.

## File Structure

| Datei | Ist | S1-Budget |
| --- | --- | --- |
| `website/Dockerfile` | 79 | kein S1-Gate (keine Extension) |
| `.github/workflows/build-website.yml` | 415 | kein S1-Gate (`.yml` nicht limitiert) |
| `.github/workflows/e2e.yml` | 200 | kein S1-Gate (`.yml` nicht limitiert) |
| `website/src/pages/api/health.ts` | 7 | 593 |
| `tests/e2e/specs/global-db-cleanup.ts` | 91 | 509 |
| `website/src/pages/api/admin/tests/ingest-e2e.ts` | 215 | 385 |
| `tests/spec/e2e-test-infrastructure.bats` | 287 | kein S1-Gate (`.bats` nicht limitiert) |

S1 limitiert laut `docs/code-quality/gates.yaml` nur die dort gelisteten Extensions; `.ts` hat Limit 600. Keine der drei betroffenen `.ts`-Dateien ist in `docs/code-quality/baseline.json` gebaselined, alle haben komfortablen Abstand. Kein Split- oder Shrink-Schritt nötig.

## Task 1 — Build-SHA am Image verankern

Der SHA muss am Image kleben, nicht am Manifest: Die Website hat drei Render-Pfade (Flux-OCI-Artefakt, `task workspace:deploy`, CI-Deploy-Jobs), und ein SHA im Manifest müsste in allen dreien korrekt gesetzt werden.

**1.1** In `website/Dockerfile`, **Runtime-Stage** (nach `FROM node:22-alpine AS runtime`), vier Zeilen ergänzen:

```dockerfile
ARG GIT_SHA=unknown
ARG BUILT_AT=unknown
ENV GIT_SHA=${GIT_SHA}
ENV BUILT_AT=${BUILT_AT}
```

Die `ARG`-Zeilen müssen in der Runtime-Stage stehen, nicht in der Build-Stage — Docker-`ARG` gilt pro Stage. `build-website.yml` dokumentiert an Zeile 69–72, dass dieses Dockerfile schon einmal gar keine `ARG`-Zeile hatte und übergebene `--build-arg`-Werte deshalb stillschweigend wirkungslos waren.

**1.2** In `.github/workflows/build-website.yml`, Step `Compute image + tags`, einen ISO-8601-Zeitstempel als Output ergänzen:

```bash
echo "built_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$GITHUB_OUTPUT"
```

**1.3** Im Step `Build & push Docker image` die Build-Args übergeben:

```yaml
build-args: |
  GIT_SHA=${{ github.sha }}
  BUILT_AT=${{ steps.compute-tags.outputs.built_at }}
```

Es gibt nur diesen einen Website-Build-Workflow — das brand-neutrale Image speist beide Deploy-Jobs. Die in CLAUDE.md genannte `build-website-korczewski.yml` existiert nicht.

**1.4** Den veralteten Kommentar an Zeile 69–72 anpassen: Das Dockerfile hat jetzt `ARG`-Zeilen, die Aussage „the former --build-arg / env values were no-ops" gilt nur noch historisch. Der Brand-Teil (Brand-Config kommt zur Laufzeit aus der ConfigMap) bleibt korrekt und unverändert.

**Verifikation:**
```bash
bats tests/spec/e2e-test-infrastructure.bats -f "runtime stage"
bats tests/spec/e2e-test-infrastructure.bats -f "build-arg"
```

## Task 2 — `/api/health` deklariert den Stand

**2.1** `website/src/pages/api/health.ts` erweitern. Rein additiv, `ok: true` bleibt:

```ts
export const GET: APIRoute = () =>
  new Response(JSON.stringify({
    ok: true,
    commit: process.env.GIT_SHA ?? 'unknown',
    builtAt: process.env.BUILT_AT ?? 'unknown',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
```

`commit` darf nie fehlen — ein abwesendes Feld läse sich als `undefined` und ein Konsument könnte den Lauf als drift-frei behandeln. Der Fallback ist ein Wert, kein Weglassen.

Astro läuft als `output: 'server'` mit Node-Adapter (`standalone`), `process.env` ist zur Laufzeit verfügbar.

**Verifikation:**
```bash
bats tests/spec/e2e-test-infrastructure.bats -f "health endpoint"
```

## Task 3 — Wächter A: Drift im Lauf sichtbar machen

**3.1** In `tests/e2e/specs/global-db-cleanup.ts` eine Drift-Prüfung im `globalSetup` ergänzen, parallel zum bestehenden Purge-Aufruf. Die Datei ist bewusst der Ort: Ihre Fail-closed-Disziplin (`CRON_SECRET` fehlt → `throw`) ist der etablierte Referenzpunkt.

Ablauf:
1. `GET <base>/api/health` (dieselbe Base-Resolution wie `purgeUrl()`: `E2E_BASE_URL` → `WEBSITE_URL` → Default).
2. Getesteten SHA bestimmen: `process.env.GITHUB_SHA` bzw. lokal `git rev-parse HEAD`.
3. Bei Abweichung — oder wenn eine Seite `unknown`/leer ist — eine Warnung mit **beiden** SHAs loggen, Präfix `DEPLOY_DRIFT`.
4. **Nicht werfen.** Der Lauf läuft weiter.

Begründung für das Weiterlaufen: Flux reconciled alle 10 Minuten, Drift ist häufig transient. Ein Abbruch würde nächtliche Läufe wegen weniger Minuten Verzug ausfallen lassen und die Trend-/Flake-Daten verlieren, die auch bei Drift valide sind.

Netzwerkfehler beim Health-Abruf werden wie `unknown` behandelt, nicht wie „kein Drift".

**Verifikation:**
```bash
bats tests/spec/e2e-test-infrastructure.bats -f "globalSetup"
```

## Task 4 — Wächter B: Drift blockiert Auto-Ticketing

Dies ist das autoritative Gate. Der Ingest-Endpoint **ist** der deployte Build — er kennt seinen Commit ohne HTTP-Roundtrip, es gibt keine Race-Condition zwischen Abfrage und Einlieferung, und ein fehlkonfigurierter Workflow-Step kann ihn nicht umgehen.

**4.1** In `.github/workflows/e2e.yml`, Step `Ingest Playwright results into website`, den getesteten SHA in den Envelope aufnehmen. Der `jq`-Aufruf setzt bereits `cluster` und `runId`:

```bash
jq --arg cluster "${MATRIX_CLUSTER}" \
   --arg runId "gh-${GH_RUN_ID}-${MATRIX_CLUSTER}" \
   --arg testedSha "${GITHUB_SHA}" \
   '. + {cluster: $cluster, runId: $runId, testedSha: $testedSha}' \
   "${REPORT}" > /tmp/ingest-payload.json
```

`GITHUB_SHA` muss dem Step als `env:` mitgegeben werden.

**4.2** Die Drift-Entscheidung in `website/src/pages/api/admin/tests/ingest-e2e.ts` als **exportierte pure Funktion** anlegen, nicht inline im Handler. `ingest-e2e.ts` exportiert bisher nur `POST`; eine inline-Bedingung wäre ausschließlich über String-greps prüfbar, und genau diese Schwäche hat T002199 möglich gemacht.

```ts
export function isDeployDrift(testedSha?: string, deployedSha?: string): boolean {
  const norm = (s?: string) => (s ?? '').trim().toLowerCase();
  const a = norm(testedSha), b = norm(deployedSha);
  if (!a || !b || a === 'unknown' || b === 'unknown') return true;  // fail closed
  return a !== b;
}
```

Exakter Vergleich genügt: `github.sha`, `GITHUB_SHA` und `git rev-parse HEAD` liefern alle den vollen 40-stelligen SHA. Kein Prefix-Matching — das würde die Fehlerklasse „SHA wurde irgendwo abgeschnitten" stillschweigend tolerieren.

**4.3** Das Gate im Handler vor der Ticket-Schleife (aktuell um Zeile 184–203) einziehen:

- Eigenen SHA aus `process.env.GIT_SHA` lesen, `payload.testedSha` dagegen halten.
- Bei `isDeployDrift(...) === true`: Ticket-Schleife überspringen, `ticketsOpened = 0`, Response um `reason: 'deploy-drift'` und beide SHAs ergänzen.
- `saveTestResults()` läuft unverändert vorher — Trend- und Flake-Daten bleiben erhalten.
- `closeQaTicketsBySlug()` bleibt unberührt: Erledigte Tickets zu schließen ist auch bei Drift unschädlich.

Der `unknown`-Fall ist die tragende Entscheidung: Ein Gate, das bei fehlendem Wert durchwinkt, ist exakt der T002199-Fehler in neuer Kleidung. Der Preis — bei gerissener Build-Arg-Kette entstehen keine Auto-Tickets — ist der richtige Ausfallmodus.

**4.4** Vitest-Test `website/src/pages/api/admin/tests/ingest-e2e.test.ts` anlegen (Nachbarn mit derselben Konvention: `website/src/pages/api/admin/systemtest/board.test.ts`, `seed.test.ts`). Er prüft das **Verhalten**, nicht die Existenz von Strings:

| Fall | `testedSha` | `deployedSha` | erwartet |
| --- | --- | --- | --- |
| identisch | `abc…123` | `abc…123` | `false` |
| verschieden | `abc…123` | `def…456` | `true` |
| deployed unbekannt | `abc…123` | `unknown` | `true` |
| tested fehlt | `undefined` | `abc…123` | `true` |
| beide leer | `''` | `''` | `true` |
| Groß-/Kleinschreibung | `ABC…123` | `abc…123` | `false` |
| Whitespace | `abc…123\n` | `abc…123` | `false` |

**Verifikation:**
```bash
npx vitest run website/src/pages/api/admin/tests/ingest-e2e.test.ts   # expected: FAIL vor 4.2
bats tests/spec/e2e-test-infrastructure.bats -f "ingest"
bats tests/spec/e2e-test-infrastructure.bats -f "e2e workflow"
```

## Task 5 — Rot→Grün nachweisen und verifizieren

**5.1** Die vollständige Spec-Suite laufen lassen. Vor diesem Plan waren 10 Tests rot (`expected: FAIL`), jetzt müssen alle grün sein:

```bash
bats tests/spec/e2e-test-infrastructure.bats
npx vitest run website/src/pages/api/admin/tests/ingest-e2e.test.ts
```

Erwartung: 0 Failures. Die R4-Tests waren von Anfang an grün und müssen es bleiben — schlagen sie um, hat die Implementierung den T002199-Fix beschädigt.

**5.2** Manuell gegen den echten Build prüfen, sobald das Image gebaut ist:

```bash
curl -s https://web.mentolder.de/api/health | jq
```

Erwartung: `commit` ist ein 40-stelliger SHA, nicht `unknown`. Bleibt er `unknown`, ist die Build-Arg-Kette gerissen — genau der Fall, den Task 1.1 adressiert.

**5.3** Test-Inventar regenerieren (CI schlägt sonst fehl, da Tests hinzugekommen sind):

```bash
task test:inventory
```

`website/src/data/test-inventory.json` mitcommitten.

**5.4** Abschließende Verifikation:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
