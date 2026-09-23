# dev.mentolder.de — Operator Runbook

Die Dev-Umgebung (`workspace-dev`) läuft als Flux-Kustomization `flux-dev` (`flux/clusters/fleet/ks-dev.yaml`) auf dem **`fleet`**-Cluster.
Sie spiegelt die Website und Brett gegen die Testdaten; CI baut und veröffentlicht die `:dev`-Images nach ghcr.io (`ghcr.io/paddione/website:dev`, `ghcr.io/paddione/workspace-brett:dev`).
Ad-hoc Reverse-SSH-Tunnel über sish ermöglichen das Veröffentlichen lokaler Ports unter `<name>.dev.mentolder.de`.

## Architektur

`prod-fleet/dev` bindet `k3d/dev-stack/` ein und wird von Flux automatisch auf `fleet` im Namespace `workspace-dev` reconciliert.
Deployments verwenden `imagePullPolicy: Always`. Ein Redeploy nach einem Commit/CI-Build erfordert lediglich einen Rollout-Restart (`task dev:redeploy:website` bzw. `task dev:redeploy:brett`).

```
client
  └─ HTTPS ─► Traefik (fleet)
              └─ dev-ingress (host *.dev.mentolder.de)
                  ├─ web.dev.mentolder.de  → website
                  ├─ brett.dev.mentolder.de → brett
                  └─ *.dev.mentolder.de    → sish (catch-all)
                                                ▲
                                                └─ ssh -R from operator
```

## Day-to-day operations

| What | Command | Notes |
|---|---|---|
| Website redeploy | `task dev:redeploy:website` | Startet Deployment neu (setzt voraus, dass CI das `:dev`-Image gebaut hat). |
| Brett redeploy | `task dev:redeploy:brett` | Startet Deployment neu (setzt voraus, dass CI das `:dev`-Image gebaut hat). |
| Secrets materialisieren | `task dev:secrets` | Legt Secrets (`shared-db-dev-secrets`, `workspace-secrets`, `mcp-tokens`, `ghcr-pull-secret`) in `workspace-dev` an. |
| DB refresh | `task dev:db:refresh` | Stellt den aktuellen Prod-Snapshot in `shared-db-dev` wieder her. |
| Tunnel | `task dev:tunnel -- <name> <port>` | Veröffentlicht `localhost:<port>` als `https://<name>.dev.mentolder.de`. |
| Logs | `task dev:logs -- <svc>` | `<svc>` ∈ `website \| brett \| shared-db-dev \| sish`. |
| psql | `task dev:psql` | Öffnet eine psql-Shell zu `shared-db-dev` als `postgres`. |

## Gotchas

- **Redeploy erfordert CI-Build:** `task dev:redeploy:*` baut keine lokalen Images mehr, sondern triggert `kubectl rollout restart`. Es muss zuvor ein CI-Build für das `:dev`-Image gelaufen sein.
- **Manifest-Änderungen über GitOps:** Manifest-Änderungen an `k3d/dev-stack/` werden per PR nach `main` gemergt und von Flux auf dem Cluster reconciliert. Es gibt kein imperatives `dev:apply` mehr.
