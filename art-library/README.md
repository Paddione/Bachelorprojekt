# Art Library

Brand-scoped, cluster-native asset packs consumed by Brett (3D systembrett)
and dashboard-web (admin gallery). One set per brand under `sets/`. Each
set ships a `manifest.json` validated against `manifest.schema.json` plus
the SVG files referenced from it.

At deploy time, a Kustomize `configMapGenerator` materializes the active
set into a workspace-namespace ConfigMap named `art-library`. Both Brett
and dashboard-web mount it at `/app/public/art-library/` (Kubernetes `mountPath`;
served at the URL path `/art-library/`). Pods boot fine without it (`optional: true`).

## Adding a new set

1. `cp -r sets/korczewski sets/<brand>` and replace SVGs.
2. Update `manifest.json` (id slugs, names, palettes, file paths).
3. Run `node art-library/_tooling/validate-manifest.mjs`.
4. Wire the set into the relevant overlay's `configMapGenerator`.

See `docs/superpowers/specs/2026-05-04-art-library-design.md` for the
design rationale.
