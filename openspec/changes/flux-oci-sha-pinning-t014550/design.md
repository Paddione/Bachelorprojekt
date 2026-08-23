# Design: flux-oci-sha-pinning-t014550

## Kontext

Flux reconciliert die Fleet-Manifeste pull-basiert aus dem OCI-Artifact
`ghcr.io/paddione/fleet-manifests` (T002083). Der Render-Workflow baut, pusht und
signiert bei jedem Main-Push; aktuell floatet der Cluster auf `latest`.

## Entscheidung 1: sha-Tag-Pinning + Bump-Commit (nicht digest, nicht image-automation)

| Option | Bewertung |
|--------|-----------|
| **sha-Tag + Bump-Commit (gewählt)** | Repo ist SSOT für die deployte Revision; Rollback = Git-Revert; nutzt existierende `flux tag artifact`-Zeile; kein neuer Controller |
| digest-Pinning | Strenger, aber Bump-Logik muss Digest aus Workflow-Output parsen und YAML mit `ref.digest:` umschreiben — gleiche Komplexität, weniger lesbare Diffs; Folgeschritt möglich |
| Flux Image-Automation (ImagePolicy) | Neuer Controller + CRDs für einen einzigen Pin-Mechanismus — Overhead ohne Zusatznutzen hier |

## Entscheidung 2: Loop-Schutz des Bump-Commits

Der Workflow triggert auf `push: main` mit Pfadfilter inkl. `flux/clusters/**` — ein
Bump-Commit würde sich selbst re-triggern. Dreifacher Schutz:

1. **GITHUB_TOKEN:** Pushes mit dem Default-Token lösen keine weiteren Workflow-Runs aus
   (GitHub-Verhalten).
2. **`[skip ci]`** im Commit-Message-Body — explizit, auch falls künftig ein PAT genutzt
   wird.
3. **Best-effort-Fehlerbehandlung:** Schlägt der Bump-Push fehl (Race mit parallelem
   Merge), loggt der Schritt eine Warnung und failt NICHT — der nächste Render holt den
   Pin nach. Der Render selbst (Push+Sign) muss vorher erfolgreich sein.

## Entscheidung 3: Initiales Pin beim Execute

Zwischen Merge dieses Changes und dem nächsten Render-Run darf Flux keinen unbekannten
Tag ziehen. Der Execute löst daher VOR dem Merge den aktuell gültigen sha-Tag auf:

```bash
crane ls ghcr.io/paddione/fleet-manifests | grep '^sha-' | sort | tail -1
```

(oder via `gh run view --json` des letzten grünen Render-Runs) und pinnt diesen. Der
erste Render nach dem Merge bumped dann auf die neue Revision.

## Konsequenzen

- `git log` auf `flux/clusters/fleet/oci-source*.yaml` wird zur Deploy-Historie
  (jeder Deploy = ein Bump-Commit).
- Der suspended GitLab-Mirror (`oci-source-gitlab.yaml`, `suspend: true`) wird
  mitgepinnt, damit ein späteres Unsuspend nicht plötzlich auf `latest` läuft.
- `verify.cosign` bleibt unverändert — Signatur hängt am Digest, gilt für beide Tags.

## Risiken

- **Vergessener Bump bei Workflow-Dispatch-Runs:** `workflow_dispatch`/`workflow_call`
  auf Nicht-main-Refs bumpen nicht (Guard `if: github.event_name == 'push' &&
  github.ref == 'refs/heads/main'`) — gewollt, nur main deployt.
- **Flux-Ziehfehler bei falschem Tag-Muster:** Guard-BATS verhindert Tippfehler im
  Muster (`sha-[0-9a-f]{7,40}`).
