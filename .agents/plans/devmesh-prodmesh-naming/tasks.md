---
title: "devmesh/prodmesh — eine Infra, zwei Domain-Welten (Goal devmesh-prodmesh-naming)"
domains: [infra, registry]
status: active
goal: devmesh-prodmesh-naming
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# devmesh/prodmesh — Implementation Plan

Zweck (Deutsch): Eine Infra (ein Cluster-Setup, ein Flux-Stand) dient zwei
Domain-Welten: `devmesh` für Dev, `prodmesh` für Prod. `fleet` wird zum
technischen Alias. Eigner-Entscheidungen 2026-11-02: Produmfang = alle heutigen
Fleet-Hosts; Infrazeit = file-fertig für den Fleet-Nachfolger (kein Live-Deploy,
Cluster ist weg/geparkt); Fleetalias = auch Env-/Task-Namen umbenennen.

Prior-Art: ADR-015 (Website-Basis in k3d als SSOT für prod-fleet),
ADR-017 (korczewski-prod-flux — heute kein GitOps-Weg, nur historische
`prod-fleet/*`-Overlays ohne Ziel-Cluster). Guards: `scripts/domains-check.mjs`
(`cluster`-Pflichtfeld, `ALLOWED_CLUSTER = fleet|devmesh`, Funktions-Matrix je
Cluster), Spec-Suite
`tests/py/spec/remaining_root_specs/domain_registry/test_domains_registry.py`.

## File Structure

| Datei | Ist-Zeilen | Status |
|---|---|---|
| `docs/agent-guide/registry/domains.yaml` | 327 | umschreiben (`cluster:` → `mesh: devmesh\|prodmesh`, alle `fleet`-Einträge → `prodmesh`, `.yaml` ungated) |
| `scripts/domains-check.mjs` | 352 | ändern (Pflichtfeld + Mengen + Matrix je Mesh, `.mjs` ungated) |
| `tests/py/spec/remaining_root_specs/domain_registry/test_domains_registry.py` | — | anpassen (Mesh-Asserts, Fixtures) |
| `docs/agent-guide/maps/domains-map.md` | generiert | regenerieren + committen |
| `environments/fleet.yaml` | — | umbenennen/prüfen (`prodmesh.yaml`, Referenzen mitziehen, `.yaml` ungated) |
| `environments/fleet-korczewski.yaml` | — | umbenennen/prüfen (`prodmesh-korczewski.yaml`, `.yaml` ungated) |
| `environments/korczewski-prod.yaml` | — | prüfen (Prod-Referenzen, `.yaml` ungated) |
| `environments/schema.yaml` | — | anpassen (Env-Namen-Mengen, `.yaml` ungated) |
| `flux/clusters/fleet/` | — | umbenennen → `flux/clusters/prodmesh/` (Kustomizations, suspend-Verhalten unverändert) |
| `taskfiles/*.yml` | — | umbenennen (`fleet:`-Namespaces/Tasks → `prodmesh:`, Referenzen mitziehen) |
| `prod-fleet/` | — | prüfen (Overlay-Namen bleiben, Host-Belegung je Mesh dokumentieren) |
| `docs/` (Sprachregel) | — | ändern (`devmesh`/`prodmesh` Standard, `fleet` nur Alias) |
| `.github/workflows/domains-probe.yml` | — | anpassen (Mesh-Hosts, file-fertig-Erwartung bis Nachfolger steht) |

## Partials (disjunkte target_files)

### p1 — Registry + Guard auf Mesh umstellen

Ziel: `domains.yaml` führt `mesh: devmesh|prodmesh` (statt `cluster:`), alle
heutigen Fleet-Einträge stehen auf `prodmesh`. `scripts/domains-check.mjs`
prüft Pflichtfeld `mesh`, Mengen `devmesh|prodmesh`, Manifest-Abgleich und
Funktions-Matrix je Mesh. Spec-Suite angepasst. `domains-map.md` regeneriert.
`task domains:check` grün, `task domains:map` grün.

target_files:
- `docs/agent-guide/registry/domains.yaml`
- `scripts/domains-check.mjs`
- `tests/py/spec/remaining_root_specs/domain_registry/test_domains_registry.py`
- `docs/agent-guide/maps/domains-map.md`

Rotphase (failing-test, zuerst ausführen): `pytest
tests/py/spec/remaining_root_specs/domain_registry/test_domains_registry.py -k mesh`
gegen eine Mesh-Fixture (ein Eintrag mit `mesh: prodmesh`) laufen lassen —
expected: FAIL (fail-Beleg: Suite kennt kein `mesh`-Feld, Exit != 0). Flankierend
`node scripts/domains-check.mjs --registry <fixture>` (Exit != 0). Erst danach
umsetzen.

Beleg: Rotphase-FAIL protokolliert, danach `node scripts/domains-check.mjs`
Exit 0 + pytest der Registry-Suite grün.

### p2 — Env-/Task-/Flux-Namen auf prodmesh heben (file-fertig)

Ziel: `environments/fleet.yaml` → `prodmesh.yaml`,
`environments/fleet-korczewski.yaml` → `prodmesh-korczewski.yaml`
(inkl. `schema.yaml`-Mengen und aller Referenzen in Taskfiles, Skripten,
Docs). `flux/clusters/fleet/` → `flux/clusters/prodmesh/` (alle
Kustomization-Refs mitziehen). Suspend-Verhalten unverändert lassen
(`ks-korczewski`, `ks-jobs-korczewski` bleiben `suspend: true` per
brand-trennung/Freeze-Doktrin). Kein Live-Deploy, kein Reconcile-Eingriff —
rein file-fertig für den Nachfolger-Cluster.

target_files:
- `environments/fleet.yaml`
- `environments/fleet-korczewski.yaml`
- `environments/korczewski-prod.yaml`
- `environments/schema.yaml`
- `flux/clusters/fleet/**`
- `taskfiles/*.yml`
- `Taskfile.yml`

Beleg: `task workspace:validate` grün + `freshness:check` grün + grep-Beleg
kein unmarkierter `fleet`-Primärname in den angefassten Pfaden
(Historie-Kommentare ausgenommen und begründet).

### p3 — Sprachregel, Probe, Doku (file-fertig)

Ziel: Docs nennen `devmesh`/`prodmesh` als Standard, `fleet` nur als Alias.
`domains-probe` kennt beide Mesh-Host-Sets; bis der Nachfolger-Cluster steht,
ist Rot für prodmesh-Hosts dokumentiertes Rauschen (Präzedenz:
brand-trennung-Hinweis zu fleet-Hosts), kein Fix-Loop. E2E-Spec für je einen
Dev- und Prod-Host angelegt (skip ohne Cluster, file-fertig).

target_files:
- `docs/agent-guide/registry/*.md`
- `docs/runbooks/*.md` (nur fleet-Alias-Stellen)
- `.github/workflows/domains-probe.yml`
- `tests/e2e/specs/*prodmesh*.spec.ts` (neu, skip ohne Cluster)
- `docs/agent-guide/maps/domains-map.md` (nur p3-Anteile: Mesh-Legende)

Beleg: Probe-Workflow rendert beide Sets; E2E-Spec vorhanden und begründet
übersprungen ohne Cluster.

## Verify-Task (gesamt)

1. `task test:changed` grün (Registry-Suite + Guard-Specs).
2. `task freshness:regenerate`, danach `task freshness:check` grün.
3. `node scripts/domains-check.mjs` → Exit 0.
4. `task domains:map` → `domains-map.md` regeneriert und committet.
5. `task workspace:validate` grün.
6. grep-Beleg: kein `prodmesh`-Host ohne Registry-Eintrag, kein Eintrag ohne
   Manifest; kein unmarkierter `fleet`-Primärname außerhalb begründeter Historie.
7. Kein Live-Eingriff erfolgt (kein Deploy, kein DNS-Cutover, kein Reconcile).
