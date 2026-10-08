---
title: "massage-tenant — Massagepraxis auf dem korczewski-Slot live"
ticket_id: T901440
domains: [infra, website, auth, database, flux]
status: active
---

# massage-tenant — Implementation Plan

Spec: `.agents/plans/massage-tenant/design.md` (vom Operator freigegeben 2026-10-08).
Website (`BRAND=BRAND_ID=massage`) in `website-korczewski` auftauen, Pocket ID über ein neues
Overlay `prod-fleet/korczewski-auth`, Datenbanken `website_massage` und
`pocket_id_korczewski` in der zentralen shared-db. `flux-korczewski` und
`flux-jobs-korczewski` bleiben suspendiert (T002479).

## Partials

| id | plan | role | target_files | depends_on |
|---|---|---|---|---|
| p1 | tasks.d/p1-db-layer.md | impl | `k3d/shared-db.yaml`, `k3d/website.yaml`, `k3d/website-schema.yaml`, `k3d/shared-db-endpoint-policy.yaml`, `environments/schema.yaml`, `k3d/network-policies.yaml`, `k3d/backup-cronjob.yaml`, `taskfiles/Taskfile.data.yml`, `migrations/20261008-massage-brand-checks.sql`, `components/website/src/db/migrations/20261008_massage_brand_checks.sql` | |
| p2 | tasks.d/p2-auth-overlay.md | impl | `prod-fleet/korczewski-auth/kustomization.yaml`, `prod-fleet/korczewski-auth/patch-pocket-id-db.yaml`, `prod-fleet/korczewski-auth/patch-tls-reflect.yaml`, `prod-fleet/korczewski-auth/namespace.yaml`, `prod-fleet/korczewski-auth/cross-namespace-seed-rbac.yaml`, `flux/clusters/fleet/ks-korczewski-auth.yaml`, `scripts/flux-render-artifact.sh` | p1 |
| p3 | tasks.d/p3-website-thaw.md | impl | `environments/korczewski.yaml`, `environments/fleet-korczewski.yaml`, `prod-fleet/website-korczewski/kustomization.yaml`, `prod-fleet/website-korczewski/website-patch.yaml`, `prod-fleet/website-korczewski/website-apex.yaml`, `flux/clusters/fleet/ks-website-korczewski.yaml`, `.github/workflows/build-website.yml` | p1, p2 |
| p4 | tasks.d/p4-docs-runbook.md | impl | `AGENTS.md`, `CLAUDE.md`, `docs/runbooks/credentials-finden.md`, `docs/website/massage-owner-runbook/README.md`, `flux/clusters/fleet/ks-korczewski.yaml`, `flux/clusters/fleet/ks-jobs-korczewski.yaml` | p2, p3 |
| p5 | tasks.d/p5-tests.md | tests | `tests/py/spec/massage-tenant/test_render_topology.py`, `tests/py/spec/massage-tenant/test_flux_freeze.py`, `tests/py/spec/massage-tenant/test_shared_db_roles.py`, `tests/py/spec/massage-tenant/test_brand_migration.py`, `tests/py/spec/massage-tenant/test_db_network_policy.py`, `tests/local/SA-22.sh`, `tests/py/unit/ported/test_shared_db_initdb_selfheal.py` | p1, p2, p3, p4 |

## File Structure

Zusätzliche bootstrap-, Backup- und Isolationstest-Dateien ergeben sich aus dem Repository-Audit. Details und wirksame Budgets stehen in den zugehörigen Teilplänen.

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `k3d/shared-db.yaml` | 352 | n/a (YAML ohne S1-Limit) |
| `k3d/website.yaml` | 852 | n/a (YAML ohne S1-Limit) |
| `k3d/website-schema.yaml` | 1970 | n/a (YAML ohne S1-Limit) |
| `k3d/shared-db-endpoint-policy.yaml` | 32 | n/a (YAML ohne S1-Limit) |
| `environments/schema.yaml` | 1759 | n/a (YAML ohne S1-Limit) |
| `prod-fleet/korczewski-auth/kustomization.yaml` | 0 (neu) | n/a (YAML ohne S1-Limit) |
| `prod-fleet/korczewski-auth/patch-pocket-id-db.yaml` | 0 (neu) | n/a (YAML ohne S1-Limit) |
| `prod-fleet/korczewski-auth/patch-tls-reflect.yaml` | 0 (neu) | n/a (YAML ohne S1-Limit) |
| `flux/clusters/fleet/ks-korczewski-auth.yaml` | 0 (neu) | n/a (YAML ohne S1-Limit) |
| `scripts/flux-render-artifact.sh` | 454 | 346 |
| `environments/korczewski.yaml` | 112 | n/a (YAML ohne S1-Limit) |
| `environments/fleet-korczewski.yaml` | 120 | n/a (YAML ohne S1-Limit) |
| `prod-fleet/website-korczewski/kustomization.yaml` | 50 | n/a (YAML ohne S1-Limit) |
| `prod-fleet/website-korczewski/website-patch.yaml` | 10 | n/a (YAML ohne S1-Limit) |
| `flux/clusters/fleet/ks-website-korczewski.yaml` | 20 | n/a (YAML ohne S1-Limit) |
| `.github/workflows/build-website.yml` | 282 | n/a (YAML ohne S1-Limit) |
| `AGENTS.md` | 155 | n/a (Markdown ohne S1-Limit) |
| `CLAUDE.md` | 89 | n/a (Markdown ohne S1-Limit) |
| `docs/runbooks/credentials-finden.md` | 106 | n/a (Markdown ohne S1-Limit) |
| `docs/website/massage-owner-runbook/README.md` | 160 | n/a (Markdown ohne S1-Limit) |
| `flux/clusters/fleet/ks-korczewski.yaml` | 35 | n/a (YAML ohne S1-Limit) |
| `flux/clusters/fleet/ks-jobs-korczewski.yaml` | 21 | n/a (YAML ohne S1-Limit) |
| `tests/py/spec/massage-tenant/test_render_topology.py` | 0 (neu) | 800 |
| `tests/py/spec/massage-tenant/test_flux_freeze.py` | 0 (neu) | 800 |
| `tests/py/spec/massage-tenant/test_shared_db_roles.py` | 0 (neu) | 800 |
| `tests/py/spec/massage-tenant/test_brand_migration.py` | 0 (neu) | 800 |
| `tests/py/spec/massage-tenant/test_db_network_policy.py` | 0 (neu) | 800 |

| `k3d/network-policies.yaml` | 629 | n/a (YAML/SQL ohne S1-Limit) |
| `k3d/backup-cronjob.yaml` | 340 | n/a (YAML/SQL ohne S1-Limit) |
| `taskfiles/Taskfile.data.yml` | 663 | n/a (YAML/SQL ohne S1-Limit) |
| `migrations/20261008-massage-brand-checks.sql` | 0 | n/a (YAML/SQL ohne S1-Limit) |
| `components/website/src/db/migrations/20261008_massage_brand_checks.sql` | 0 | n/a (YAML/SQL ohne S1-Limit) |
| `prod-fleet/korczewski-auth/namespace.yaml` | 0 | n/a (YAML/SQL ohne S1-Limit) |
| `prod-fleet/korczewski-auth/cross-namespace-seed-rbac.yaml` | 0 | n/a (YAML/SQL ohne S1-Limit) |
| `prod-fleet/website-korczewski/website-apex.yaml` | 0 | n/a (YAML/SQL ohne S1-Limit) |
| `tests/local/SA-22.sh` | 36 | 764 |
| `tests/py/unit/ported/test_shared_db_initdb_selfheal.py` | 62 | 738 |

<!-- vitest: kein neuer Test nötig, weil keine Datei unter components/website/src geändert wird -->

## Rot-Grün-Anker

Den gezielten pytest-Rotlauf aus p5 vor der Umsetzung von p1–p4 sichern (`expected: FAIL`). Die Tests-Rolle bleibt die letzte Partial, muss dafür den Rot-Anker vorab bereitstellen.

```bash
bash scripts/pytest-run.sh tests/py/spec/massage-tenant/test_render_topology.py
```

## Manuelle Operator-Schritte (nicht vom Agenten ausführbar)

- Neue Secret-Werte erzeugen und versiegeln (`WEBSITE_MASSAGE_DB_PASSWORD`,
  `POCKET_ID_KORCZEWSKI_DB_PASSWORD` in mentolder- und korczewski-Secrets) über `env:seal`.
- DNS-A-Records für `korczewski.de`, `web.korczewski.de`, `auth.korczewski.de` bei ipv64.
- Pocket-ID-Admin-Bootstrap, Konto der Inhaberin, Gruppe `workspace-owners`.

## Task: Finale Verifikation

```bash
bash scripts/pytest-run.sh tests/py/spec/massage-tenant
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```
