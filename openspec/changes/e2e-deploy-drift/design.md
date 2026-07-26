---
ticket_id: T002202
plan_ref: openspec/changes/e2e-deploy-drift/tasks.md
status: active
date: 2026-07-26
---

# Design: E2E-Läufe trennen Code-Stand und Deploy-Stand

**Ticket:** T002202
**Branch:** `fix/e2e-deploy-drift-T002202`
**Typ:** fix

## Purpose

Ein E2E-Lauf gegen Prod misst immer zwei Dinge gleichzeitig: den **Code** und den **Deploy-Stand**. Die Suite kann sie heute nicht unterscheiden und schreibt jede Abweichung dem Code zu. Dadurch erzeugt sie automatisch Tickets gegen Bugs, die im Repository nicht existieren.

Dieser Change gibt der Suite die Fähigkeit, beides zu trennen — und entzieht dem Auto-Ticketing die Grundlage, sobald sie es nicht kann.

### Belegte Vorfälle (2026-07-26)

**T002192** meldete „`/api/poll/:id` returns HTML instead of JSON on 404". Der Fehler war zum Messzeitpunkt live real, aber `website/src/pages/api/poll/[id].ts` auf `main` setzt in beiden 404-Zweigen explizit `Content-Type: application/json`. Der Quellcode war die ganze Zeit korrekt; nur der deployte Build lag hinter `main`. Nachverifikation nach Flux-Reconciliation: beide Brands liefern `404 application/json`. Das Ticket beschrieb einen Bug, den es im Repo nie gab. Geschlossen als `obsolete`.

**Die Falschdiagnose zweiter Ordnung.** Derselbe Lauf meldete drei Failures in `korczewski-home.spec.ts` als „veraltete Test-Erwartungen". Live liefert auf Apex *und* Subdomain exakt das, was `main` erzeugt (`h1` „Kubernetes & KI,", `aria-label="Seitennavigation"`, Footer vorhanden). Wäre diese Diagnose befolgt worden, hätte man **korrekte Tests an einen veralteten Deploy angeglichen**. Die `T002068`-Kommentare in derselben Datei zeigen, dass genau das dort bereits einmal passiert ist — die Assertions wurden damals abgeschwächt, um zu einem Live-Zustand zu passen.

Das ist die eigentliche Gefahr: Deploy-Drift verfälscht nicht nur Tickets, sondern korrumpiert über die Zeit die Testsuite selbst.

**Erkenntnis 1 (verwandte Klasse).** In T002199 (PR #3242, gemergt) prüfte das Auth-Setup-Gate `E2E_ADMIN_PASS`, während `loginViaE2E()` tatsächlich `CRON_SECRET` konsumiert. Der Lauf *hatte* die Credentials und warf sie weg. Fail-closed war in der Codebase längst etabliert — `tests/e2e/specs/global-db-cleanup.ts` bricht ohne `CRON_SECRET` hart ab — nur eben nicht dort, wo es zählte. Folge: 33 sessionlose Tests und drei weitere falsche Tickets (T002193/T002194/T002195). Der Einzelfall ist behoben, die Klasse nicht.

**Gemeinsame Klammer:** Die E2E-Testinfrastruktur lügt über ihren eigenen Zustand.

## Root Cause

Es gibt keinen Weg, den deployten Commit zu ermitteln:

- `/api/health` liefert nur `{"ok":true}`
- `/api/version`, `/api/build-info` → 404
- Kein `GIT_SHA`/`BUILD_SHA`-Handling im gesamten Repo (verifiziert per grep über `openspec/`, `tests/e2e/`, `website/src/pages/api/`, `.github/workflows/`)

## Architektur

### Datenfluss

```
build-website.yml ──build-args: GIT_SHA=${{ github.sha }}──> Dockerfile (runtime stage)
                                                                    │ ENV GIT_SHA
                                                                    ▼
                                                            deployed image
                                                                    │
                    ┌───────────────────────────────────────────────┤
                    ▼                                               ▼
         GET /api/health                          POST /api/admin/tests/ingest-e2e
         { ok, commit, builtAt }                  vergleicht payload.testedSha
                    │                             gegen eigenes GIT_SHA
                    ▼                                               │
         globalSetup: WARN DEPLOY_DRIFT                             ▼
         (Lauf läuft weiter)                       Drift -> ticketsOpened = 0
                                                   test_results bleiben erhalten
```

### K1 — Build-SHA klebt am Image, nicht am Manifest

`website/Dockerfile` erhält in der **Runtime-Stage** zwei Build-Args mit Defaults und reicht sie als `ENV` weiter:

```dockerfile
ARG GIT_SHA=unknown
ARG BUILT_AT=unknown
ENV GIT_SHA=${GIT_SHA}
ENV BUILT_AT=${BUILT_AT}
```

Beide Build-Workflows (`build-website.yml`, `build-website-korczewski.yml`) übergeben sie im `docker/build-push-action`-Step:

```yaml
build-args: |
  GIT_SHA=${{ github.sha }}
  BUILT_AT=${{ steps.compute-tags.outputs.built_at }}
```

`built_at` kommt aus dem bestehenden `compute-tags`-Step, der ohnehin schon `date +%Y%m%d-%H%M%S` aufruft — dort wird zusätzlich ein ISO-8601-Zeitstempel als Output gesetzt. `BUILT_AT` ist reine Diagnose-Hilfe („der Deploy ist drei Tage alt") und geht **nicht** in die Drift-Entscheidung ein; die trifft allein `GIT_SHA`.

**Warum am Image und nicht als Deployment-Env-Var:** Die Website hat drei Render-Pfade (Flux-OCI-Artefakt als primärer, `task workspace:deploy` als Break-glass, CI-Deploy-Jobs als Legacy). Ein SHA im Manifest müsste in allen dreien korrekt gesetzt werden und driftet sonst selbst. Am Image klebend ist er per Konstruktion korrekt, egal wer deployed.

**Warum die Runtime-Stage:** Docker-`ARG` gilt pro Stage. Ein `ARG` nur in der Build-Stage wäre in der Runtime-Stage unsichtbar.

> **Historischer Footgun.** `build-website.yml` trägt den Kommentar: *„website/Dockerfile has no ARG line, so the former --build-arg / env values were no-ops."* Es wurden bereits einmal Build-Args übergeben, die stillschweigend nichts taten. Genau diese Klasse Fehler adressiert K4.

Astro läuft als `output: 'server'` mit Node-Adapter (`standalone`), also ist `process.env.GIT_SHA` zur Laufzeit verfügbar.

### K2 — `/api/health` deklariert den Stand

```ts
{ ok: true, commit: process.env.GIT_SHA ?? 'unknown', builtAt: process.env.BUILT_AT ?? 'unknown' }
```

Rein additiv: `ok: true` bleibt unverändert, bestehende Aufrufer brechen nicht.

### K3 — Zwei Wächter mit getrennten Rollen

**Wächter A — `globalSetup` (`tests/e2e/specs/global-db-cleanup.ts`):** Holt `/api/health` pro Zielhost, vergleicht mit `GITHUB_SHA ?? git rev-parse HEAD`, loggt bei Abweichung sichtbar `DEPLOY_DRIFT` mit beiden SHAs — und **läuft weiter**.

*Warum nicht abbrechen:* Flux reconciled alle 10 Minuten; Drift ist häufig transient. Ein harter Abbruch würde nächtliche Läufe wegen weniger Minuten Verzug komplett ausfallen lassen und die Trend-/Flake-Daten verlieren, die auch bei Drift valide sind.

**Wächter B — `ingest-e2e.ts`:** Vergleicht `payload.testedSha` gegen sein **eigenes** `GIT_SHA` und setzt bei Abweichung `ticketsOpened = 0` mit `reason: 'deploy-drift'`. `test_results` werden weiterhin gespeichert.

*Warum das Gate hier autoritativ ist:* Der Ingest-Endpoint **ist** der deployte Build. Er kennt seinen Commit ohne HTTP-Roundtrip — es gibt keine Race-Condition zwischen „SHA abfragen" und „Ergebnisse einliefern", und ein fehlkonfigurierter Workflow-Step kann das Gate nicht umgehen. Das Gate sitzt dort, wo die Konsequenz entsteht, nicht dort, wo der Fehler auffällt.

### K4 — `unknown` zählt als Drift (fail-closed)

Ist `GIT_SHA` auf einer der beiden Seiten leer oder `unknown`, gilt der Lauf als **drift-behaftet** — nicht als drift-frei.

Das ist die Entscheidung, an der die Wirksamkeit des gesamten Changes hängt. Ein Gate, das bei fehlendem Wert durchwinkt, ist exakt der T002199-Fehler in neuer Kleidung. Und der Wert *kann* fehlen: der no-op-Build-Arg-Kommentar in `build-website.yml` beweist, dass diese Kette hier schon einmal gerissen ist.

Bewusst in Kauf genommener Preis: Bricht die Build-Arg-Kette, entstehen keine Auto-Tickets mehr. Das ist der richtige Ausfallmodus — lieber keine Tickets als falsche.

### K5 — Env-Var-Konsistenz (Erkenntnis 1)

BATS-Test in `tests/spec/e2e-test-infrastructure.bats`. Die Invariante muss **funktionsbezogen** sein, nicht dateibezogen:

> Ein Setup, das `loginViaE2E()` aufruft, muss auf `CRON_SECRET` gaten — der Variable, die genau diese Funktion liest.

**Warum die naheliegende Formulierung nicht trägt.** Ein Test nach dem Muster „jede Gate-Variable muss irgendwo in `auth.ts` vorkommen" wäre bei `E2E_ADMIN_PASS` **grün** gewesen und hätte T002199 nicht gefangen: `auth.ts` referenziert die Variable sehr wohl — in `getAdminCredentials()`, einem anderen Code-Pfad als dem, den das Setup aufruft. Die Zuordnung Gate → Variable muss an der aufgerufenen Funktion hängen.

Zwei Fallstricke, die beim Testbau auffielen und die die Implementierung beachten muss:

- **Aufruf statt Import matchen.** `brett-mentolder-auth-setup.spec.ts` importiert `loginViaE2E`, ruft es aber nie auf — es macht unbedingt `testInfo.fixme(true, …)`, weil der oauth2-proxy-Login noch nicht implementiert ist. Ein grep auf den bloßen Bezeichner meldet es falsch-rot. Der Test muss auf `loginViaE2E(` prüfen.
- **Nur der Admin-Pfad.** `mentolder-auth-setup.spec.ts` enthält einen zweiten `setup()`-Block für den Portal-User, in dem `writeEmptyState` legitim ist (fehlendes `E2E_USER_PASS` skippt nur die Portal-Tests). Ein Test, der die Datei als Ganzes betrachtet, erfasst ihn fälschlich mit.

Ein **Meta-Test** sichert die Zuordnung selbst ab: Er prüft, dass `loginViaE2E` in `auth.ts` weiterhin `CRON_SECRET` liest. Wechselt die Funktion je ihre Credentials, schlägt er zuerst fehl und zeigt auf die Zuordnung — statt das Gate-Gate still die falsche Variable prüfen zu lassen.

## Requirements

### R1 — Deployed commit is observable
The website SHALL expose the commit SHA it was built from via `GET /api/health` as field `commit`, alongside the existing `ok` field.

**Scenario:** Given a website image built from commit `abc1234`, when `GET /api/health` is called, then the response contains `{"ok":true,"commit":"abc1234",...}`.

**Scenario:** Given an image built without the `GIT_SHA` build-arg, when `GET /api/health` is called, then `commit` is `"unknown"` — never absent, never a stale value.

### R2 — Drift is visible during the run
The E2E `globalSetup` SHALL fetch the deployed commit per target host and compare it against the tested SHA, logging a `DEPLOY_DRIFT` warning containing both values on mismatch, without aborting the run.

**Scenario:** Given the deployed commit differs from the tested SHA, when the suite starts, then a `DEPLOY_DRIFT` warning naming both SHAs is logged and the run proceeds.

### R3 — Drifted runs cannot open tickets
`POST /api/admin/tests/ingest-e2e` SHALL NOT open failure tickets when the submitted `testedSha` does not match the handler's own `GIT_SHA`, and SHALL still persist `test_results`.

**Scenario:** Given a payload whose `testedSha` differs from the deployed build, when ingest runs, then the response reports `ticketsOpened: 0` with `reason: "deploy-drift"` and the `test_results` rows are written.

**Scenario:** Given either side's SHA is missing or `"unknown"`, when ingest runs, then the run is treated as drifted and no tickets are opened.

### R4 — Setup gates check the variable the called function reads
An automated test SHALL fail when an auth-setup that calls `loginViaE2E()` does not gate on `CRON_SECRET`, or gates the e2e-login path on a credential that `loginViaE2E()` does not read.

**Scenario:** Given a setup calls `loginViaE2E()` and gates on `E2E_ADMIN_PASS`, when the spec suite runs, then the test fails naming the file and the mismatched variable.

**Scenario:** Given a setup imports `loginViaE2E` without calling it and fixmes unconditionally, when the spec suite runs, then the test does not flag it.

**Scenario:** Given `loginViaE2E()` in `tests/e2e/lib/auth.ts` stops reading `CRON_SECRET`, when the spec suite runs, then the meta-test guarding the mapping fails.

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `website/Dockerfile` | `ARG`/`ENV` für `GIT_SHA` + `BUILT_AT` in Runtime-Stage |
| `.github/workflows/build-website.yml` | `built_at`-Output in `compute-tags`; `build-args` im Build-Step |
| `.github/workflows/build-website-korczewski.yml` | dito |
| `website/src/pages/api/health.ts` | `commit` + `builtAt` ergänzen |
| `tests/e2e/specs/global-db-cleanup.ts` | Drift-Check im `globalSetup` |
| `website/src/pages/api/admin/tests/ingest-e2e.ts` | Ticket-Gate bei Drift |
| `.github/workflows/e2e.yml` | `testedSha` in Ingest-Envelope |
| `tests/spec/e2e-test-infrastructure.bats` | R4-Test + Drift-Tests |

## Nicht in diesem Change

- **Rückwirkende Bereinigung** früherer Tickets — bereits manuell erledigt (T002192/T002194/T002195 geschlossen, T002193 zur Neumessung markiert).
- **Zurückdrehen der T002068-Abschwächungen** in `korczewski-home.spec.ts`. Sie sind heute teilweise noch zutreffend (die Nav enthält live tatsächlich nur den CTA-Link). Eine Prüfung, welche Abschwächungen nur einem damals veralteten Deploy geschuldet waren, braucht einen driftfreien Referenzlauf — den es erst nach diesem Change gibt. Eigenes Ticket.
- **Andere Services als die Website.** Brett, Docs usw. haben dieselbe Lücke, aber die Website ist der einzige Konsument des Auto-Ticketings.
