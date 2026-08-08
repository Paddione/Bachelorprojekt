# Proposal: flux-artifact-versioning

## Why

Das OCI-Artefakt, über das Flux die `fleet`-Cluster beliefert, ist weder versioniert
noch in sich vollständig. Drei Defekte greifen ineinander:

1. `render-fleet-artifact.yml:88` pusht nur `fleet-manifests:latest`, und
   `oci-source.yaml:9-10` trackt genau diesen beweglichen Tag. Es existiert kein
   benannter Rollback-Punkt; ein Rollback ginge nur über Digest-Suche zwischen
   untagged GHCR-Manifesten, die zudem Garbage-Collection-Kandidaten sind.
2. `scripts/flux-render-artifact.sh:46-47` defaultet `WEBSITE_IMAGE_TAG` und
   `BRETT_IMAGE_TAG` auf den String `latest`. Der Render-Workflow hat zwei Trigger;
   nur der `workflow_call`-Pfad übergibt einen Build-SHA. Gemessen am 2026-08-08:
   88 `push` + 4 `dispatch` Läufe rendern `latest`, 100 Läufe via `build-website.yml`
   rendern den SHA — beide überschreiben dasselbe `:latest`-Artefakt. Rund jedes
   fünfte Artefakt trägt damit `website:latest`.
3. `BRETT_IMAGE_TAG` erreicht überhaupt kein Manifest. `k3d/brett.yaml:34` liest
   `${BRETT_IMAGE}`, das in `environments/fleet-*.yaml:24` fest auf `latest` steht.
   Live bestätigt: `workspace-brett:latest`.

Defekt 1 allein zu beheben wäre gefährlicher als ihn zu lassen: ein Rollback auf
`sha-<gut>` kombinierte alte Manifeste mit dem neuesten Image und sähe dabei aus wie
ein vollständiges Rollback.

## What

- **Digest-Pinning für Website und Brett** in den `prod-fleet/*`-Overlays nach dem
  bereits etablierten `STUDIO_IMAGE_DIGEST`-Muster. Base (`k3d/`) behält den
  beweglichen Tag für dev.
- **`BRETT_IMAGE_TAG` ersatzlos entfernen** und durch `BRETT_IMAGE_DIGEST` ersetzen,
  das ein Manifest tatsächlich liest. Die Workflow-Inputs `website_image_tag` /
  `brett_image_tag` werden zu `*_image_digest`.
- **`scripts/resolve-image-digest.sh`** als Einzweck-Skript für die Auflösung, mit
  drei Quellen: Build-Output (workflow_call), `crane digest` (push-Trigger),
  committeter Fallback in `environments/fleet-*.yaml` (offline).
- **Fail-closed in CI**: ein fehlgeschlagener Registry-Lookup bricht den Render ab.
  Der Offline-Fallback greift nur bei explizitem Offline-Signal, nie als Reaktion auf
  einen Fehler.
- **Unveränderlicher Artefakt-Tag** via `flux tag artifact … --tag sha-<github.sha>`
  zusätzlich zu `:latest`. Rollback wird eine Zeile in `oci-source.yaml`.

Nicht im Scope: `ImagePolicy`/`ImageUpdateAutomation` mit Semver-Tracking (zöge das
bewusst fehlende Release-Gate wieder ein), `release-please` (bleibt informativ), der
korczewski-React-Wechsel.

_Ticket: T002706_
