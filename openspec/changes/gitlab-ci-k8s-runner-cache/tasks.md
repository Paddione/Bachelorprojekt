---
title: "gitlab-ci-k8s-runner-cache — Implementation Plan"
ticket_id: T012177
domains: [ci-cd, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# gitlab-ci-k8s-runner-cache — Implementation Plan

_Ticket: T012177_

## File Structure

```
k3d/gitlab-runner-stack/namespace.yaml              (neu)  Namespace + Quota + LimitRange + PriorityClass
k3d/gitlab-runner-stack/kustomization.yaml          (neu)  Stack-Einstieg
k3d/gitlab-runner-stack/values/gitlab-runner.yaml   (neu)  Helm-Values (Eingabe des Renderns)
k3d/gitlab-runner-stack/gitlab-runner-rendered.yaml (neu)  helm-template-Ausgabe, committet
k3d/gitlab-runner-stack/registry-cache.yaml         (neu)  Pull-Through-Cache auf fleet
flux/clusters/fleet/ks-gitlab-runner.yaml           (neu)  Flux-Kustomization für den Stack
scripts/flux-render-artifact.sh                     (Erweiterung) rendert den neuen Stack ins OCI-Artefakt
environments/schema.yaml                            (Erweiterung) extra_namespaces für das Runner-Token-SealedSecret
scripts/gitlab-runner-cache.sh                      (neu)  lokaler Cache auf PK-Desktop
docs/runbooks/gitlab-runner.md                      (Erweiterung) Zwei-Runner-Betrieb, Cache-Diagnose
tests/spec/ci-cd/gitlab-runner-fleet-guardrails.bats (neu) Quota/LimitRange/Priority/nodeSelector
tests/spec/ci-cd/gitlab-runner-fleet-rbac.bats      (neu)  Role statt ClusterRole, kein SA-Token
tests/spec/ci-cd/gitlab-registry-cache.bats         (neu)  Cache an beiden Standorten
components/website/src/data/test-inventory.json     (generiert, durch die neuen .bats-Dateien)
```

Der Pfad steht in jeder Zeile zuerst — die touched-files-Ableitung liest das erste Feld als
Repo-Pfad. Das Taskfile-Render-Target wird in der bestehenden `Taskfile.yml` ergänzt (analog
`monitoring`, dort Zeile 2712 ff.); die Datei ist zu groß für ein Zeilenbudget und wird nur
punktuell erweitert.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-namespace-guardrails.md | impl | k3d/gitlab-runner-stack/namespace.yaml, k3d/gitlab-runner-stack/kustomization.yaml, flux/clusters/fleet/ks-gitlab-runner.yaml, scripts/flux-render-artifact.sh | |
| p2 | tasks.d/p2-runner-helm.md | impl | k3d/gitlab-runner-stack/values/gitlab-runner.yaml, k3d/gitlab-runner-stack/gitlab-runner-rendered.yaml, environments/schema.yaml | p1 |
| p3 | tasks.d/p3-cache.md | impl | k3d/gitlab-runner-stack/registry-cache.yaml, scripts/gitlab-runner-cache.sh, docs/runbooks/gitlab-runner.md | |
| p4 | tasks.d/p4-tests.md | tests | tests/spec/ci-cd/gitlab-runner-fleet-guardrails.bats, tests/spec/ci-cd/gitlab-runner-fleet-rbac.bats, tests/spec/ci-cd/gitlab-registry-cache.bats | p1,p2,p3 |

p1 und p3 sind unabhängig. p2 hängt an p1, weil das Rendern den Namespace-Namen aus dessen
Manifest übernimmt. p4 hängt an allen dreien, weil seine Guards deren Dateien lesen.

## Kontext für alle Partials

**Gemessene Ausgangslage (Etappe 1, T011790, 2026-08-18)** — die Zahlen, gegen die abgenommen
wird: `gitleaks` 50 s, `manifests` 84 s, `bats-unit` 284 s auf dem Desktop-Runner; dieselben
Jobs auf SaaS 24 / 29 / 118 s.

**Cluster-Befund (`kubectl --context fleet`, 2026-08-18):**

- 3 Control-Plane-Knoten (je 8 CPU / 15,2 GiB) mit 96 %, 77 % und 60 % CPU-Requests
- 2 Worker `gekko-hetzner-3` und `gekko-hetzner-4` (je 4 CPU / 7,6 GiB) mit 41 % und 47 %
- Pod-Limit 110 je Knoten
- StorageClasses: `local-path` (default, WaitForFirstConsumer, keine Expansion), `longhorn`,
  `longhorn-static` (RWO, Expansion)
- Außer `flux-system` trägt **kein** Namespace eine ResourceQuota — diese Etappe führt die
  Konvention ein
- Keine Registry- und keine Cache-Infrastruktur vorhanden

**Namen (in allen Partials identisch):**

- Namespace: `gitlab-runner`
- Runner-Tag: `bachelorprojekt-local` — **derselbe wie beim Desktop-Runner** (Design D5); der
  Name bezeichnet ab jetzt „self-hosted", nicht einen Ort
- PriorityClass: `ci-low` mit einem Wert **unter** dem Cluster-Default
- Cache-Service auf fleet: `registry-cache`, Port 5000

**Repo-Konventionen, die hier greifen:**

- Stack-Verzeichnis nach dem Muster `k3d/monitoring/` — eigenes `namespace.yaml`, eigenes
  `kustomization.yaml`, **nicht** in `k3d/kustomization.yaml` eingehängt (das ist workspace-only)
- Helm wird gerendert und committet (`*-rendered.yaml` plus `values/`), Regeneration über ein
  Taskfile-Target — Vorbild `Taskfile.yml:2712 ff.`
- Der vendored BATS-Runner ist `tests/unit/lib/bats-core/bin/bats`

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die drei Guards aus p4 anlegen und ausführen, bevor die
      Manifeste existieren. Sie müssen fehlschlagen, weil die geprüften Dateien fehlen — nicht,
      weil der Test selbst kaputt ist. Der Fehlertext muss die fehlende Datei benennen.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd/gitlab-runner-fleet-guardrails.bats \
  tests/spec/ci-cd/gitlab-runner-fleet-rbac.bats tests/spec/ci-cd/gitlab-registry-cache.bats
# expected: FAIL (rot — die Manifeste und das Cache-Skript fehlen noch)
```

- [ ] **Implementierungs-Schritte (GREEN).** p1 bis p3 abarbeiten. Danach müssen dieselben
      Guards grün sein:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd/gitlab-*.bats
# expected: PASS
```

- [ ] **Manifest-Validierung.** Der Stack muss sich bauen lassen, ohne den Cluster zu berühren:

```bash
kubectl kustomize k3d/gitlab-runner-stack/
tests/unit/lib/bats-core/bin/bats tests/unit/manifests.bats
```

- [ ] **Manuelle Abnahme gegen den laufenden Cluster.** Nicht automatisierbar, gehört ins
      Ticket, nicht in CI:
      1. Zweiten Runner in GitLab anlegen (Tag `bachelorprojekt-local`), `glrt-`-Token in ein
         SealedSecret für den Namespace `gitlab-runner` legen.
      2. Stack anwenden, Runner-Pod läuft auf einem **Worker**-Knoten — per
         `kubectl --context fleet get pod -n gitlab-runner -o wide` belegen.
      3. Pipeline starten, belegen dass Jobs auf beiden Runnern landen.
      4. **Laufzeit gegen die Etappe-1-Werte messen** (50 / 84 / 284 s) und die neuen Zahlen im
         Ticket vermerken. Sinkt sie nicht, ist der Cache wirkungslos — dann Cache-Trefferquote
         prüfen, bevor etwas anderes geändert wird.
      5. **Quota-Nachweis:** Einen Job über die Quota hinaus erzeugen und belegen, dass seine
         Pod-Erzeugung vom API-Server abgelehnt wird und der GitLab-Job dadurch fehlschlägt
         (kein `pending` — das gilt nur für einen bereits erzeugten, aber nicht schedulebaren
         Pod, nicht für eine Quota-Ablehnung bei der Objekt-Erzeugung selbst; S5, Review
         T012177) **und** kein produktiver Pod in `workspace` oder `workspace-korczewski`
         betroffen ist.
      5a. **PriorityClass-Annahme prüfen.** Der geplante Wert `-1000` ruht auf der Annahme, dass
         im Cluster keine Klasse mit `globalDefault: true` existiert und produktive Pods damit
         auf Priorität 0 laufen. Das war bei der Planung **nicht verifizierbar** — die
         Erhebung durfte `priorityclasses` nicht cluster-weit lesen. Vor dem Anwenden prüfen:
         `kubectl --context fleet get priorityclass` — existiert eine `globalDefault`-Klasse mit
         negativem oder sehr niedrigem Wert, muss `ci-low` darunter liegen. Liegt sie darüber,
         verdrängt CI im Ernstfall doch produktive Last, und die Zusicherung wäre gebrochen.
      6. **Ausfalltest:** Den Desktop-Runner-Dienst stoppen, Pipeline starten, belegen dass der
         fleet-Runner übernimmt — ohne Variablenänderung. Danach wieder starten.
      7. **N6 (Nachreview T012177) — Speicher-Enge im Blick behalten.** Der LimitRange-Default
         `default.memory = 700Mi` (`namespace.yaml`) gilt auch für den `build`-Container, und
         `npm ci` unter `node:22` (bats-unit-Job) läuft damit knapp. Bewusste Entscheidung,
         **jetzt nicht** anzupassen: die Worker sind klein, eine höhere Grenze überzöge die
         gemessene Reserve. Stirbt `bats-unit` auf dem fleet-Runner mit OOM
         (`OOMKilled`/exit 137), ist das die erste Stelle zum Nachsehen — die Antwort ist dann
         ein `memory_limit`-Override für den Build-Container in `runners.config`
         (`[runners.kubernetes] memory_limit = "..."`), nicht eine größere Namespace-Quota.

- [ ] **Final Verification.** Die drei Pflicht-Gates fahren:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Die drei neuen `.bats`-Dateien verändern `components/website/src/data/test-inventory.json`; der
CI-Inventory-Check vergleicht die committete Fassung gegen die neu erzeugte.
