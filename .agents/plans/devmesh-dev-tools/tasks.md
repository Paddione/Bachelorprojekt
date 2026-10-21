---
title: "devmesh-dev-tools — Implementation Plan"
domains: [infra, devmesh, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: [devmesh-flux]
---

# devmesh-dev-tools — Implementation Plan

Setzt `.agents/plans/devmesh-dev-tools/design.md` um: `brain`, `sessions-server`
mit Session-Hub und `k1-embed` ziehen aus mentolders Prod-Namespace auf devmesh.
Erst ausführen, wenn `devmesh-flux` gemergt ist (Flux auf devmesh, Muster
`dev-local/components/*`).

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `tests/py/spec/devmesh/test_devmesh_dev_tools.py` | neu | Budget 800 (Limit `.py`) |
| `k3d/brain.yaml` | neu (aus `prod-fleet/mentolder/brain.yaml`, 381) | n/a (YAML ohne S1-Limit) |
| `prod-fleet/mentolder/brain.yaml` | löschen | n/a |
| `prod-fleet/mentolder/sessions-server.yaml` | löschen | n/a |
| `prod-fleet/mentolder/oauth2-proxy-sessions.yaml` | löschen | n/a |
| `prod-fleet/mentolder/kustomization.yaml` | Einträge entfernen | n/a (YAML ohne S1-Limit) |
| `k3d/sessions-server.yaml` | 159 | n/a (YAML ohne S1-Limit) |
| `k3d/k1-embed-job.yaml` | Basis für CronJob | n/a (YAML ohne S1-Limit) |
| `dev-local/components/brain/kustomization.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `dev-local/components/sessions/kustomization.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `dev-local/components/sessions/sessions-ingress.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `dev-local/components/sessions/oauth2-proxy-session-hub.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `dev-local/components/k1-embed/kustomization.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `dev-local/components/k1-embed/k1-embed-cronjob.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `dev-local/core/kustomization.yaml` | 176 | n/a (YAML ohne S1-Limit) |
| `.github/workflows/k1-embed.yml` | löschen | n/a |
| `environments/fleet-mentolder.yaml` | `BRAIN_EXTERNAL_URL`, `SESSIONS_DOMAIN` entfernen | n/a (YAML ohne S1-Limit) |
| `environments/dev.yaml` | `SESSIONS_DOMAIN`, `BRAIN_EXTERNAL_URL` ergänzen | n/a (YAML ohne S1-Limit) |
| `components/website/src/data/test-inventory.json` | generiert | n/a (Inventar) |

## Task 1: Rote Verträge (pytest)

- [x] `tests/py/spec/devmesh/test_devmesh_dev_tools.py` (Fixture `repo_root`,
  Render über `bash scripts/devmesh/render-stack.sh core`, Muster
  `tests/py/spec/test_massage_devmesh.py`):
  - `test_brain_on_devmesh`: `Deployment/brain` und `Deployment/oauth2-proxy-brain`
    in Namespace `workspace`, Host `brain.devmesh.korczewski.de`, kein `mentolder.de`.
  - `test_sessions_on_devmesh`: `Deployment/sessions-server`,
    `Deployment/oauth2-proxy-session-hub`, IngressRoute mit HostRegexp auf
    `sessions.devmesh.korczewski.de`, Certificate für den Wildcard.
  - `test_k1_embed_cronjob`: `CronJob/k1-embed` mit Schedule, DB-Host
    `shared-db.workspace.svc.cluster.local`.
  - `test_mentolder_overlay_clean`: Render von `prod-fleet/mentolder`
    (`kubectl kustomize prod-fleet/mentolder`) enthält kein `brain`, kein
    `sessions-server`, kein `oauth2-proxy-session-hub`; kein Workflow unter
    `.github/workflows/` heißt `k1-embed.yml`.
- [x] Rotbeleg (expected: FAIL, alle vier Tests):
```bash
bash scripts/pytest-run.sh tests/py/spec/devmesh/test_devmesh_dev_tools.py -q
```
- [x] Commit `test(red): devmesh-dev-tools contracts`.

## Task 2: brain auf devmesh

- [x] `prod-fleet/mentolder/brain.yaml` nach `k3d/brain.yaml` verschieben
  (`git mv`), Host von `brain.${PROD_DOMAIN}` auf `brain.${DEVMESH_DOMAIN}`,
  oauth2-proxy-Issuer auf `auth.${DEVMESH_DOMAIN}`, Redirect und Whitelist-Domain
  entsprechend. Den Redirect auf `/?project=home-patrick-Bachelorprojekt` behalten.
- [x] `dev-local/components/brain/kustomization.yaml` (`kind: Component`,
  Ressource `../../../k3d/brain.yaml`), in `dev-local/core/kustomization.yaml`
  unter `components:` eintragen.
- [x] Eintrag `brain.yaml` aus `prod-fleet/mentolder/kustomization.yaml` entfernen.
- [x] Grün für `test_brain_on_devmesh`:
```bash
bash scripts/pytest-run.sh tests/py/spec/devmesh/test_devmesh_dev_tools.py -q -k brain
```

## Task 3: sessions-server und Session-Hub auf devmesh

- [x] `dev-local/components/sessions/`: Ressource `../../../k3d/sessions-server.yaml`,
  `sessions-ingress.yaml` (Certificate `sessions-wildcard` für
  `*.${SESSIONS_DOMAIN}` über den devmesh-Issuer, IngressRoute wie in
  `prod-fleet/mentolder/sessions-server.yaml`), `oauth2-proxy-session-hub.yaml`
  (aus `prod-fleet/mentolder/oauth2-proxy-sessions.yaml`, Issuer
  `auth.${DEVMESH_DOMAIN}`). In `dev-local/core/kustomization.yaml` eintragen.
- [x] `environments/dev.yaml`: `SESSIONS_DOMAIN: sessions.devmesh.korczewski.de`
  und `BRAIN_EXTERNAL_URL: https://brain.devmesh.korczewski.de` (Schema in
  `environments/schema.yaml` prüfen, Variablen existieren dort bereits).
- [x] `prod-fleet/mentolder/sessions-server.yaml` und
  `prod-fleet/mentolder/oauth2-proxy-sessions.yaml` löschen, Einträge aus
  `prod-fleet/mentolder/kustomization.yaml` entfernen; `BRAIN_EXTERNAL_URL` und
  `SESSIONS_DOMAIN` aus `environments/fleet-mentolder.yaml` entfernen, wenn kein
  anderes mentolder-Manifest sie nutzt
  (`grep -rn 'SESSIONS_DOMAIN\|BRAIN_EXTERNAL_URL' prod-fleet/mentolder prod-mentolder k3d`).
- [x] Grün für `test_sessions_on_devmesh`:
```bash
bash scripts/pytest-run.sh tests/py/spec/devmesh/test_devmesh_dev_tools.py -q -k sessions
```

## Task 4: k1-embed als CronJob auf devmesh

- [x] `dev-local/components/k1-embed/k1-embed-cronjob.yaml`: `CronJob` stündlich
  (`concurrencyPolicy: Forbid`), Pod-Template aus `k3d/k1-embed-job.yaml`.
  Statt `MERGE_SHA` aus dem Workflow: Init-Schritt klont `main`, liest den zuletzt
  eingebetteten Commit aus der DB (Tabelle und Spalte aus dem bestehenden
  k1-Embed-Code ermitteln, nicht neu erfinden), berechnet den Diff und übergibt
  die Dateiliste wie heute die ConfigMap `k1-embed-diff-*`. Ohne gespeicherten
  Commit: Full-Run.
- [x] Komponente in `dev-local/core/kustomization.yaml` eintragen.
- [x] `.github/workflows/k1-embed.yml` löschen.
- [x] Grün für `test_k1_embed_cronjob` und `test_mentolder_overlay_clean`:
```bash
bash scripts/pytest-run.sh tests/py/spec/devmesh/test_devmesh_dev_tools.py -q
```

## Task 5: Rollout und Abnahme (live, nur nach Freigabe)

- [ ] Nach Merge rollt das devmesh-Flux die Komponenten aus. Prüfen:
  `kubectl --context devmesh -n workspace get deploy brain sessions-server oauth2-proxy-session-hub`
  Ready, `kubectl --context devmesh -n workspace get certificate sessions-wildcard` Ready.
- [ ] `k1-embed` einmal manuell auslösen
  (`kubectl --context devmesh -n workspace create job --from=cronjob/k1-embed k1-embed-initial`),
  Full-Run abwarten.
- [ ] Abnahme über das Tailnet: `brain.devmesh.korczewski.de` zeigt den Code-Graph
  nach Login, eine Session-Seite unter `session-<slug>.sessions.devmesh.korczewski.de`
  ist erreichbar.
- [ ] Die mentolder-Seite (Entfernung in gekko32/mentolder-prod#20 und
  Altdaten in mentolders `shared-db`) ist nicht Teil dieses Plans.

## Task 6: Finale Verifikation

- [ ] Alle Verträge grün, Inventar aktualisiert, nur erwartete Dateien gestagt.
```bash
bash scripts/pytest-run.sh tests/py/spec/devmesh/test_devmesh_dev_tools.py tests/py/spec/test_massage_devmesh.py -q
task test:inventory
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```

<!-- vitest: kein neuer Test nötig, weil kein Website-Code geändert wird; die Verträge laufen als pytest. -->

## Umsetzung (Abweichungen vom Plan)

- `brain` liegt unter `dev-local/components/brain/brain.yaml`, nicht unter `k3d/brain.yaml`: der Guard `test_k4d_cockpit_brain_wiring_and_brain_manifests_are_absent` verbietet Brain-Manifeste in `k3d/`.
- `k1-embed` speichert keinen Commit-Stand: `index-repo.ts` überspringt unveränderte Dateien per `file_hash`, der CronJob lässt den Code-Index deshalb voll laufen. `ingest-markdown.mjs` läuft nur, wenn sich Pläne, ADRs oder Runbooks in den letzten zwei Stunden geändert haben (ermittelt im Init-Container, das Node-Image hat kein git).
- `k3d/sessions-server.yaml` bleibt Basis, ist aber aus `k3d/kustomization.yaml` entfernt (sonst rendert jedes Overlay auf `k3d/` es mit).
- Angepasste Bestandstests: `test_security_cert_hygiene` (beide Varianten) erwarten `SESSIONS_DOMAIN` jetzt in `environments/dev.yaml`; `test_wildcard_render_guard` und `test_runtime_var_unwrapping` lesen die neuen Pfade.
- Live-Vorbedingung für Task 5: Der OIDC-Client `session-hub` der devmesh-Pocket-ID braucht zusätzlich die Redirect-URL `https://session-login.sessions.devmesh.korczewski.de/oauth2/callback`.

