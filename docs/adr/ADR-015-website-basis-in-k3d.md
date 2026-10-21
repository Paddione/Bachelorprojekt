# ADR-015: Website-Basis-Manifeste in k3d/ als SSOT für prod-fleet

**Status:** Accepted
**Datum:** 2026-10-21

## Kontext

Die drei Prod-Overlays `prod-fleet/website-mentolder/`, `prod-fleet/website-korczewski/`
und `prod-fleet/website-staging/` referenzieren per `../../k3d/website.yaml` und
`../../k3d/website-seller-config.yaml` den Local-Dev-Baum (`kustomization.yaml`,
je `resources:`-Block). Kustomize erlaubt parent-übergreifende Referenzen nur mit
`--load-restrictor=LoadRestrictionsNone`; ein plain `kustomize build prod-fleet/...`
scheitert daher mit `security: file not in or below overlay`.

## Entscheidung

Die Kopplung bleibt bestehen (Option B, Minimalvariante):

- `k3d/website.yaml` + `k3d/website-seller-config.yaml` sind die Single Source of Truth
  für die Website-Basis-Manifeste. Die Prod-Overlays referenzieren sie, statt sie zu
  kopieren — keine zweite Kopie, kein Drift.
- Die Referenz wird zur Renderzeit in der CI aufgelöst
  (`scripts/flux-render-artifact.sh`, `.github/workflows/render-fleet-artifact.yml`):
  jedes Overlay wird mit `LoadRestrictionsNone` nach `out/website-*/` gerendert und
  als Flux-Artifact (`fleet-manifests`, OCI) gepusht. Der Cluster appliziert nur das
  gerenderte Manifest (`flux/clusters/fleet/ks-website-*.yaml`, `path: ./website-*`);
  `../../k3d` erreicht den Cluster nie.
- Jedes der drei `kustomization.yaml` trägt einen F9-Kommentar mit dieser Begründung.

## Konsequenzen

- Lokales Bauen der Overlays erfordert zwingend
  `kustomize build --load-restrictor=LoadRestrictionsNone prod-fleet/website-*`
  (ebenso die Test-Helper, z. B. `tests/py/spec/massage-tenant/test_render_topology.py`).
- Änderungen an `k3d/website*.yaml` wirken sofort auf alle drei Prod-Overlays —
  gewollt (SSOT), aber bei Render-Diffs bewusst prüfen.
- Alternative (eigene `prod-fleet/website-base/`-Kopie plus Drift-Guard) bleibt offen,
  falls die k3d-Kopplung je stört; bislang kein Bedarf.

## Guards

- `tests/py/spec/massage-tenant/test_render_topology.py` (Overlay-Builds)
- `tests/py/unit/ported/test_website_domain_config_overlay.py` (domain-config-Parität)
- `tests/py/spec/test_flux_render_and_security.py` (Artefakt-Assertions)
