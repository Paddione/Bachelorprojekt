# Deploy-Routing

Diese Tabelle ist die **einzige** verbindliche Quelle dafür, welcher Deploy-Task zu welchen
geänderten Pfaden gehört. `dev-flow-execute` (Post-Merge-Deploy), `dev-flow-chore` (Schritt 7)
und `dev-flow-iterate` (Dev-Cluster-Redeploy) verweisen alle hierher — **nicht** die Tabelle
kopieren, sondern verlinken.

> **Pull-basiertes Deploy-Modell (Flux, T002083).** Prod wird auf dem fleet-Cluster von
> FluxCD reconciled: `.github/workflows/render-fleet-artifact.yml` rendert bei jedem
> `main`-Push das OCI-Artefakt `ghcr.io/paddione/fleet-manifests`, Flux zieht es. Container-
> Images baut GitHub Actions (`build-website.yml`, `build-brett.yml`, `build-docs.yml`).
> Die `task feature:*`-Tasks sind **Break-Glass-Fallback**, kein Regelweg.

> **Generierte Artefakte lösen kein Deploy aus (T002255).** Pfade, die in `.gitattributes`
> als `linguist-generated` markiert sind, werden vor der Selektion aus `$CHANGED` entfernt.
> Grund: `task freshness:regenerate` schreibt 16 Artefakte, mehrere davon unter `website/`
> und `docs/` — u.a. `website/src/data/openspec-status.json`, das im Diff **jedes** Changes
> mit OpenSpec-Artefakt liegt. Ohne den Filter deployte ein reiner Manifest- oder Test-Change
> die Website. Filter: `scripts/filter-generated.sh`; er liest ausschließlich das
> Git-Attribut, führt also **keine** eigene Pfadliste.

> **SDLC-Stack löst kein Prod-Deploy aus (T003982).** `k3d/sdlc-stack/**` wird vor der
> Selektion aus `$CHANGED` entfernt — der Stack existiert nur auf dem lokalen k3d-Dev-
> Cluster. `grep -E` kann kein Lookahead, deshalb läuft der Ausschluss als vorgeschalteter
> `sed`-Filter in `scripts/devflow-post-merge-deploy.sh`.

### Prod-Deploy (nach Merge — beide Brands auf fleet)

| Geänderte Dateipfade | Weg |
|---|---|
| `website/**` | `.github/workflows/build-website.yml` (baut + rollt aus). Break-Glass: `task feature:website` — braucht GHCR-Login. |
| `brett/**` | `.github/workflows/build-brett.yml`. Break-Glass: `task feature:brett`. |
| `docs/**` | `.github/workflows/build-docs.yml`. Break-Glass: `task docs:deploy`. |
| `k3d/**`, `prod*/**`, `prod-fleet/**`, `environments/**` | Flux reconciled das OCI-Artefakt. Break-Glass: `task feature:deploy` (kein Registry-Login nötig). |
| `k3d/sdlc-stack/**` | **kein Deploy** — rein lokaler Stack (k3d-Dev-Cluster), existiert nicht auf fleet; wird vor dem `k3d/**`-Match aus `$CHANGED` gefiltert (T003982) |
| `linguist-generated`-Pfade | **kein Deploy** — aus der Selektion gefiltert |
| Mehrere Bereiche | Alle zutreffenden Wege |

**Auto-Detection (implementiert in `scripts/devflow-post-merge-deploy.sh`, Schritt 8):**
```bash
MERGE_COMMIT=$(git log origin/main -1 --format="%H")
CHANGED=$(git diff-tree --no-commit-id -r --name-only "$MERGE_COMMIT" | bash scripts/filter-generated.sh | sed '/^k3d\/sdlc-stack\//d')
echo "$CHANGED" | grep -qE '^website/'  && echo "→ build-website.yml (kein lokaler Build)"
echo "$CHANGED" | grep -qE '^brett/'    && echo "→ build-brett.yml (kein lokaler Build)"
echo "$CHANGED" | grep -qE '^docs/'     && echo "→ build-docs.yml (kein lokaler Build)"
echo "$CHANGED" | grep -qE '^(k3d/|prod|prod-fleet|prod-mentolder|prod-korczewski|environments/)' && task feature:deploy
```

Das Skript baut bewusst **keine** Container-Images mehr: der lokale Build scheiterte
reproduzierbar an fehlendem GHCR-Login und wurde als `deploy/blocked` gemeldet, obwohl der
CI-Build für denselben SHA grün war — das verfälschte die DORA-Auswertung (T002251/PR #3300).

**Verify nach dem Deploy:**
```bash
kubectl --context fleet get pods -n workspace            | grep -v Running
kubectl --context fleet get pods -n workspace-korczewski | grep -v Running
```

### Dev-Cluster-Redeploy (für `dev-flow-iterate`, k3d)

| SURFACE | Redeploy-Task | Watched pods |
|---------|--------------|--------------|
| `website` | `task dev:redeploy:website ENV=$ENV` | `app=website` |
| `brett` | `task dev:redeploy:brett ENV=$ENV` | `app=brett` |
| `full` | `task dev:deploy ENV=$ENV` | `app=website`, `app=brett` |

### Footguns

- `task feature:*` baut aus dem **Working Tree des aktuellen cwd** — aus einem frischen, mit
  `origin/main` synchronisierten Tree deployen, sonst landet alter Code (Memory:
  *Deploy from a fresh tree, not a stale main checkout*).
- Die image-bauenden `task feature:website|feature:brett|docs:deploy` brauchen einen
  **GHCR-Login**. Ein Agent hat den in der Regel nicht; ihr Fehlschlag ist deshalb kein
  Deploy-Fehler, sondern ein falsch gewählter Weg — den CI-Workflow prüfen statt lokal bauen.
- Website-Deploys werden über `build-website*.yml` digest-gepinnt → ein bloßer `rollout restart`
  landet das neue Image evtl. nicht (Memory: *Website deploy goes silently stale*).
- `ENV=` ist immer explizit; ohne `ENV=` greift `dev` und der Context-Mismatch-Check entfällt.
