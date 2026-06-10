# Deploy-Routing (Single Source of Truth)

Diese Tabelle ist die **einzige** verbindliche Quelle dafür, welcher Deploy-Task zu welchen
geänderten Pfaden gehört. `dev-flow-execute` (Post-Merge-Deploy), `dev-flow-chore` (Schritt 7)
und `dev-flow-iterate` (Dev-Cluster-Redeploy) verweisen alle hierher — **nicht** die Tabelle
kopieren, sondern verlinken.

> Push-basiertes Deploy-Modell: Es gibt **keinen** GitOps-Reconciler auf dem fleet-Cluster.
> Ein Merge nach `main` deployt nichts automatisch (außer `website/**` via `build-website*.yml`).
> Nach dem Merge muss explizit deployt werden.

## Prod-Deploy (nach Merge — beide Brands auf fleet)

| Geänderte Dateipfade | Task |
|---|---|
| `website/**` | `task feature:website` (rollt auto via CI; manueller Re-Deploy bei Bedarf) |
| `brett/**` | `task feature:brett` |
| `docs/**` | `task docs:deploy` |
| `k3d/**`, `prod*/**`, `prod-fleet/**`, `environments/**` | `task feature:deploy` |
| Mehrere Bereiche | Alle zutreffenden Tasks nacheinander |

**Auto-Detection (für `dev-flow-execute` Schritt 8):**
```bash
MERGE_COMMIT=$(git log origin/main -1 --format="%H")
CHANGED=$(git diff-tree --no-commit-id -r --name-only "$MERGE_COMMIT")
echo "$CHANGED" | grep -qE '^website/'                                            && task feature:website
echo "$CHANGED" | grep -qE '^brett/'                                              && task feature:brett
echo "$CHANGED" | grep -qE '^docs/'                                               && task docs:deploy
echo "$CHANGED" | grep -qE '^(k3d/|prod|prod-fleet|prod-mentolder|prod-korczewski|environments/)' && task feature:deploy
```

**Verify nach dem Deploy:**
```bash
kubectl --context fleet get pods -n workspace            | grep -v Running
kubectl --context fleet get pods -n workspace-korczewski | grep -v Running
```

## Dev-Cluster-Redeploy (für `dev-flow-iterate`, k3d)

| SURFACE | Redeploy-Task | Watched pods |
|---------|--------------|--------------|
| `website` | `task dev:redeploy:website ENV=$ENV` | `app=website` |
| `brett` | `task dev:redeploy:brett ENV=$ENV` | `app=brett` |
| `full` | `task dev:deploy ENV=$ENV` | `app=website`, `app=brett` |

## Footguns

- `task feature:*` baut aus dem **Working Tree des aktuellen cwd** — aus einem frischen, mit
  `origin/main` synchronisierten Tree deployen, sonst landet alter Code (Memory:
  *Deploy from a fresh tree, not a stale main checkout*).
- Website-Deploys werden über `build-website*.yml` digest-gepinnt → ein bloßer `rollout restart`
  landet das neue Image evtl. nicht (Memory: *Website deploy goes silently stale*).
- `ENV=` ist immer explizit; ohne `ENV=` greift `dev` und der Context-Mismatch-Check entfällt.
