# Design: Dev-Tools aus mentolder-Prod nach devmesh

Stand 2026-10-21. Pfad: feature. Slug: `devmesh-dev-tools`. Folgeplan zu
`devmesh-flux` (A1 aus der Entkopplungs-Analyse, vom Nutzer freigegeben).

## Ziel

Drei Werkzeuge von Paddione laufen heute in mentolders Prod-Namespace `workspace`
auf fleet und hängen an mentolder-Domains und mentolders Datenbank:

| Werkzeug | heute | Quelle |
|---|---|---|
| `brain` (K3 Code-Graph-Webview, `ghcr.io/paddione/mcp-node`) + `oauth2-proxy-brain` | `brain.mentolder.de` | `prod-fleet/mentolder/brain.yaml` |
| `sessions-server` (nginx, statische Session-Seiten) + `oauth2-proxy-session-hub` | `session-<slug>.sessions.mentolder.de` | `k3d/sessions-server.yaml`, `prod-fleet/mentolder/sessions-server.yaml`, `prod-fleet/mentolder/oauth2-proxy-sessions.yaml` |
| `k1-embed` (Repo-Embeddings) | Job aus GitHub Actions per `FLEET_KUBECONFIG` in fleet `workspace`, schreibt in mentolders `shared-db` | `.github/workflows/k1-embed.yml`, `k3d/k1-embed-job.yaml` |

Nach diesem Plan laufen alle drei auf devmesh unter `*.devmesh.korczewski.de`,
nur über das Tailnet, und werden über das devmesh-Flux aus `devmesh-flux`
ausgerollt. Aus dem Repo verschwinden ihre mentolder-Overlays, aus
`k1-embed.yml` der Zugriff auf fleet.

## Abhängigkeit

Setzt `devmesh-flux` voraus (Flux auf devmesh, `dev-local/components/*`-Muster,
Artefakt `devmesh-manifests`). Ausführung erst nach dessen Merge.

## Entscheidungen

- Domains: `brain.devmesh.korczewski.de`, `session-<slug>.sessions.devmesh.korczewski.de`.
  Wildcard-Zertifikat per DNS-01 über den vorhandenen devmesh-Issuer.
- Zugang: oauth2-proxy gegen die devmesh-Pocket-ID (`auth.devmesh.korczewski.de`),
  `allowed-emails` bleibt `patrick@korczewski.de`. Kein öffentlicher Zugang (Q4).
- `k1-embed`: GitHub-Runner erreichen devmesh nicht (nur Tailnet). Der Job
  läuft deshalb als `CronJob` auf devmesh (stündlich), klont `main`, vergleicht
  mit dem zuletzt eingebetteten Commit (in der DB gespeichert, wie heute
  `MERGE_SHA`) und bettet nur geänderte Dateien ein. Ziel ist die devmesh-`shared-db`.
  `.github/workflows/k1-embed.yml` entfällt.
- Daten: Embeddings werden auf devmesh neu erzeugt (Full-Run einmalig), nicht
  aus mentolders DB kopiert. Die Altdaten in mentolders `shared-db` räumt Gekko
  (Hinweis in Runbook gekko32/mentolder-prod#18).
- mentolder-prod: `brain.yaml`, `sessions-server.yaml`, `oauth2-proxy-sessions.yaml`
  und `BRAIN_EXTERNAL_URL`/`SESSIONS_DOMAIN` werden dort in PR gekko32/mentolder-prod#20
  entfernt (separat erledigt, nicht Teil dieses Plans).

## Komponenten

- `dev-local/components/brain/`: Ressource Basis aus `prod-fleet/mentolder/brain.yaml`
  (nach `k3d/brain.yaml` verschoben, Host über `${DEVMESH_DOMAIN}`).
- `dev-local/components/sessions/`: `k3d/sessions-server.yaml` plus IngressRoute,
  Certificate und oauth2-proxy aus den mentolder-Overlays, Hosts über
  `${DEVMESH_DOMAIN}`.
- `dev-local/components/k1-embed/`: `CronJob` auf Basis von `k3d/k1-embed-job.yaml`.
- Einbindung in `dev-local/core/kustomization.yaml` unter `components:`.

## Fehlerfälle

| Fall | Verhalten |
|---|---|
| Zertifikat für Wildcard schlägt fehl | IngressRoute ohne TLS nicht erreichbar, Certificate-Status zeigt Fehler |
| k1-embed-Lauf schlägt fehl | nächster Lauf vergleicht weiter mit dem letzten erfolgreichen Commit |
| devmesh-flux noch nicht gemergt | Plan nicht ausführen |

## Tests

pytest unter `tests/py/spec/devmesh/test_devmesh_dev_tools.py` gegen den
devmesh-Render: `brain`, `sessions-server`, `oauth2-proxy-session-hub` und
`CronJob/k1-embed` vorhanden, Namespace `workspace`, keine `mentolder.de`-Hosts,
k1-embed-DB-Host `shared-db.workspace.svc.cluster.local`. Dazu: kein Workflow
unter `.github/workflows/` referenziert `k1-embed` oder `FLEET_KUBECONFIG` für
k1, `prod-fleet/mentolder/` enthält `brain.yaml` und `sessions-server.yaml` nicht mehr.
