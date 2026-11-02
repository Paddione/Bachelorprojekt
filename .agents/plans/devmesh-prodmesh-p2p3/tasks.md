---
title: "devmesh/prodmesh p2+p3 — Env-/Task-Namen auf prodmesh, Sprache/Probe, E2E (Goal devmesh-prodmesh-naming)"
domains: [infra, registry]
status: active
goal: devmesh-prodmesh-naming
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans:
  - devmesh-prodmesh-naming
---

# devmesh/prodmesh p2+p3 — Implementation Plan

Zweck (Deutsch): Nach p1 (Registry/Guarde auf `mesh`, gemergt als PR #7101)
folgt der file-fertige Rest ohne Live-Deploy (Fleet-Cluster ist weg/geparkt):
p2 benennt das lebendige Prod-Set auf `prodmesh` um, p3 zieht Sprache/Probe
nach und liefert E2E-Evidenz so weit ohne Cluster möglich.

Eigner-Entscheidungen 2026-11-02: Produmfang = alle heutigen Fleet-Hosts;
Infrazeit = file-fertig für den Nachfolger; Env-/Task-Namen werden mit
umbenannt; `fleet` bleibt nur Alias.

Leitplanke (hart): `flux/clusters/fleet/**/DECOMMISSIONED.md` (2026-10-22)
verbietet Änderungen in den Dekommissions-Verzeichnissen ohne geklärtes
Nachfolge-Ziel. Deshalb bleiben unangetastet (begründet): `flux/clusters/fleet/`,
`flux/clusters/fleet-gekko/`, `environments/fleet.yaml` (toter gekko-Cluster),
`environments/sealed-secrets-key.fleet.yaml` (toter Cluster-Key),
`environments/dev-cluster.yaml` (Fleet-Dev-Stack), Historie
(`docs/superpowers/specs/*`, `docs/adr/*`, Archiv-Pläne, Eval-Goldens),
Registry-`decision`-Texte mit historischem Fleet-Kontext sowie
`docs/fleet-stage2-cutover-runbook.md`.

## File Structure

| Datei | Ist | Status |
|---|---|---|
| `environments/fleet-korczewski.yaml` | Datei | umbenennen → `environments/prodmesh-korczewski.yaml` (inkl. `environment:`- und `CLUSTER_ENV`-Werte) |
| `environments/.secrets/fleet-korczewski.yaml` | Datei | umbenennen → `.secrets/prodmesh-korczewski.yaml` (Inhalt unberührt) |
| `environments/sealed-secrets/fleet-korczewski.yaml` | Datei prüfen | umbenennen, falls vorhanden (Inhalt unberührt) |
| `environments/korczewski.yaml` | Zeiger | `secrets_env`/`secrets_ref`/Kommentar auf prodmesh heben |
| `environments/schema.yaml` | Mengen | Env-Namen-Mengen auf prodmesh heben |
| `scripts/domains-probe.mjs` | p1-Stand | Env-Map `prodmesh` → `environments/prodmesh-korczewski.yaml` |
| `scripts/domains-graph.mjs` | p1-Stand | dto. |
| `taskfiles/Taskfile.platform.yml` | Tasks | `fleet:`-Namespaces/Beispiele → `prodmesh:` (tote Kontexte bleiben file-fertig) |
| `scripts/flux-render-artifact.sh` | Ref | Dateinamen-Referenzen mitziehen |
| `scripts/post-deploy-watch.sh` | Ref | dto. |
| `scripts/claude-key-picker.sh` | Ref | dto. |
| `scripts/generate-bitwarden-export.py` | Ref | dto. |
| `.github/workflows/build-website.yml` | Ref | Env-Referenz mitziehen |
| `docs/runbooks/credentials-finden.md` | Doku | Dateinamen mitziehen |
| `docs/runbooks/gitlab-restore.md` | Doku | dto. |
| `docs/runbooks/sealed-secrets-service-mapping.md` | Doku | dto. |
| `docs/agent-guide/brand-separation-inventory.md` | Inventar | Env-Namen mitziehen |
| `tests/py/unit/test_secrets_sync.py` + betroffene Specs | Tests | Erwartungen auf neue Namen heben (nur wo sie das Umbenannte testen) |
| `docs/agent-guide/maps/domains-map.md` | generiert | regenerieren + committen (falls Drift) |
| `docs/code-quality/repo-index.json` | generiert | via Task regenerieren, nicht von Hand |
| `.github/workflows/domains-probe.yml` | Workflow | Optionen `[both, devmesh, prodmesh]` (`fleet` bleibt Skript-Alias) |
| `tests/e2e/specs/*prodmesh*.spec.ts` | neu | Prod-Host-Spec, skip ohne Cluster (file-fertig) |
| `docs/` Sprachpass | Doku | `devmesh`/`prodmesh` Standard, `fleet` nur Alias |

## Partials (disjunkte target_files)

### p1 — Env + Secrets-Dateinamen (Inhalte unberührt)

Ziel: `fleet-korczewski`-Dateiset → `prodmesh-korczewski` in
`environments/`, `.secrets/`, `sealed-secrets/` (falls vorhanden),
Zeiger in `korczewski.yaml`, Mengen in `schema.yaml`. Secret-Inhalte und
Keys werden weder gelesen noch neu gewürfelt.

Rotphase (failing-test, zuerst ausführen): `pytest
tests/py/unit/ported/test_fleet_dns_cutover.py -k prodmesh` — expected: fail
(FAIL-Beleg: keine prodmesh-Abdeckung, Exit 5). Flankierend
`test ! -f environments/prodmesh-korczewski.yaml` (Rot-Beleg).

target_files:
- `environments/prodmesh-korczewski.yaml`
- `environments/.secrets/prodmesh-korczewski.yaml`
- `environments/sealed-secrets/prodmesh-korczewski.yaml`
- `environments/korczewski.yaml`
- `environments/schema.yaml`

Beleg: `task workspace:validate` grün + betroffene Secret-Sync-Tests grün;
`git diff --stat` zeigt nur Renames + Zeiger, keine Wert-Diffs
(`git diff -U0 -- environments/.secrets/ | grep -c '^[-+][^-+]'` klein und
nur Pfad-Zeilen — Beleg im PR).

### p2 — Skripte, Tasks, Workflow-Referenzen

Ziel: alle lebendigen Dateinamen-Referenzen auf die neuen Env-Namen heben
(Probe-/Graph-Maps, Task-Namespaces, Render-/Watch-/Export-Skripte,
`build-website.yml`). Keine Verhaltensänderung, nur Namen. Tote Kontexte
(`kubectl --context fleet`) werden zu `--context prodmesh` (file-fertig für
den Nachfolger), mit Alias-Kommentar wo nötig.

target_files:
- `scripts/domains-probe.mjs`
- `scripts/domains-graph.mjs`
- `taskfiles/Taskfile.platform.yml`
- `scripts/flux-render-artifact.sh`
- `scripts/post-deploy-watch.sh`
- `scripts/claude-key-picker.sh`
- `scripts/generate-bitwarden-export.py`
- `.github/workflows/build-website.yml`

Beleg: `node scripts/domains-probe.mjs --validate-only` Exit 0 (15 PASS,
3 SKIP, 0 FAIL erwartet) + `--cluster fleet`-Alias weiter Exit 0;
`task workspace:validate` grün.

### p3 — Sprache, Probe-Workflow, E2E (file-fertig)

Ziel: Doku-Sprache `devmesh`/`prodmesh` als Standard, `fleet` nur Alias
(Runbooks + Inventar + Task-Beschreibungen aus p2-Datei? nein —
disjunkt: nur die drei Runbooks + Inventar sind p2, hier Rest-Sprachpass in
`docs/agent-guide/*.md` ausgenommen Registry). Probe-Workflow kennt
`prodmesh`. E2E-Spec für je einen Dev-/Prod-Host, skip ohne Cluster.

Ehrlichkeitsklausel: Live-Grün für prodmesh ist ohne Nachfolger-Cluster
unmöglich (Fleet tot, Nightly-Rauschen dokumentiert). p3 liefert: Spec
vorhanden + begründet übersprungen, devmesh-Probe manuell vom Tailnet-Host
wo möglich. Kein erfundener Grün-Beleg.

target_files:
- `docs/agent-guide/brand-separation-inventory.md`
- `docs/runbooks/credentials-finden.md`
- `docs/runbooks/gitlab-restore.md`
- `docs/runbooks/sealed-secrets-service-mapping.md`
- `.github/workflows/domains-probe.yml`
- `tests/e2e/specs/domains-prodmesh-smoke.spec.ts`
- `docs/agent-guide/maps/domains-map.md` (nur hiesige Regenerat-Anteile)

Beleg: Workflow rendert beide Mesh-Sets; E2E-Spec vorhanden und begründet
skip; `task domains:check` grün.

### p4 — Tests + generierte Artefakte nachziehen

Ziel: alle Tests, die alte Env-Namen pinnen (`test_secrets_sync.py` u. a.),
auf neue Namen heben; `repo-index.json` + Karten via Tasks regenerieren.
Historien-Fixtures (alte Namen als TestDATEN für Migration/Parität) bleiben
unberührt und werden im PR begründet.

target_files:
- `tests/py/unit/test_secrets_sync.py`
- weitere Specs, die nachweislich neue Namen erwarten (Liste im PR belegt)
- `docs/code-quality/repo-index.json`
- `docs/agent-guide/maps/domains-map.md` (nur Regenerat)

Beleg: `task test:changed` ohne NEUE Fehler vs. p1-Baseline (18 vorbestehende
fachfremde dokumentiert); `task freshness:check` grün.

## Verify-Task (gesamt)

1. `task test:changed` grün bis auf dokumentierte vorbestehende Fehler.
2. `task freshness:regenerate`, danach `task freshness:check` grün.
3. `task workspace:validate` grün.
4. `node scripts/domains-check.mjs` Exit 0 + `--cluster fleet`-Alias Exit 0.
5. grep-Beleg: kein lebendiger `fleet-korczewski`-Verweis außerhalb begründeter
   Historie/Dekommission; Secret-Werte unverändert.
6. Kein Live-Eingriff (kein Deploy, kein DNS-Cutover, kein Reconcile).
