---
title: F9 Prod-k3d-Kopplung — SSOT-Doku statt stiller Parent-Referenz
domains: [fleet, website]
status: staged
branch: fix/f9-prodk3d-kopplung-20261021
---

# f9-prodk3d-kopplung — Implementation Plan

Ziel: Die `../../k3d`-Referenzen der drei Prod-Overlays sind als bewusste
SSOT-Entscheidung mit Render-Pfad dokumentiert.

## File Structure

| Datei | Änderung (Worker-Output, teils untracked) |
|---|---|
| `prod-fleet/website-mentolder/kustomization.yaml` | F9-Kommentar (SSOT + Renderzeit-Auflösung) |
| `prod-fleet/website-korczewski/kustomization.yaml` | Gleicher Kommentar |
| `prod-fleet/website-staging/kustomization.yaml` | Gleicher Kommentar |
| `docs/adr/ADR-015-website-basis-in-k3d.md` | Neu: Kontext, Entscheidung B, Konsequenzen, Guards |

Verbrauchte Schnittstellen: `kustomize build --load-restrictor=LoadRestrictionsNone`,
`scripts/flux-render-artifact.sh`, `flux/clusters/fleet/ks-website-*.yaml`.
Produziert: Kommentare + ADR.

## Tasks

- [x] 1. Kommentare in allen drei Overlays setzen.
- [x] 2. ADR-015 mit Option B, Render-Pfad und Guards anlegen.
- [x] 3. Verifikation im Worktree: `python3 -c` YAML-Parse aller drei `kustomization.yaml` (Exit 0) und `grep -n "SSOT" prod-fleet/website-mentolder/kustomization.yaml docs/adr/ADR-015-website-basis-in-k3d.md` mit Treffern.
- [x] 4. Gates terminal (2026-10-21, Basis 5 Commits hinter origin/main): `task test:changed` → 304 failed / 4565 passed / 36 errors — identisches Vorab-Error-Set wie F5/F6, Kommentar-/ADR-Diff kann keine pytest-Failures verursachen; `task freshness:check` → Graph-Artefakte aktuell, rot nur in `quality:check` (4 S4-NEW an fremden Dateien, Basis-Ursache).

## Abnahme

Plain-`kustomize build` ohne Restrictor scheitert gewollt und dokumentiert; Cluster sieht nur Gerendertes.
