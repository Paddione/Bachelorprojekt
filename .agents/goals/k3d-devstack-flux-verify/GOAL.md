# GOAL — k3d-Devstack via Flux auf devmesh verifizieren (read-only)

## Objective
Verifiziere read-only, dass der gesamte k3d-Devstack — definiert als `k3d/` Kustomize-Base — via Flux auf dem lokalen Cluster `devmesh` vollständig reconciled ist. `k3d/` ist dabei nur Manifest-Basis, kein k3d-Cluster (T900120, `k3d/deploy.sh` fail-closed).

## Erfolgskriterien (messbar, alle müssen grün sein)
1. Flux auf `devmesh`: `ks-workspace`, `ks-platform`, `ks-secrets`, `ks-agent-board` in `flux/clusters/devmesh/` sind `Ready=True`, `suspend:false`, Revision == `origin/main` HEAD.
2. Keine Fehl-Reconciliation: `kubectl --context devmesh get kustomizations,helmreleases -A` zeigt 0x `NotReady`/`Stalled`; Flux-Events ohne Fehler seit letztem Sync.
3. Whole-Abdeckung: jede in `k3d/kustomization.yaml` gelistete Ressource hat ein korrespondierendes Flux-Objekt auf devmesh; zusätzlich `k3d/dev-stack/` und `k3d/monitoring/` explizit geprüft und als ok/fehlt berichtet.
4. Freeze respektiert: `ks-korczewski.yaml` / `ks-jobs-korczewski.yaml` bleiben `suspend:true`, zugehörige Namespaces skaliert 0 — kein Ent-Freeze.
5. Beleg: Tabelle Quelle (Git-Pfad) → Flux-Objekt → Status + Revision, plus ein Befehl für Re-Check (`task workspace:validate`, `kubectl --context devmesh ...`).

## Nicht-Ziele
- Kein Re-Deploy / kein `kubectl apply` / kein `k3d/deploy.sh`.
- Kein `fleet`, `fleet-gekko`, `korczewski-prod`; kein Wiederbeleben von `k3d-*` Kontexten.
- Keine Workload-E2E (Pods/Ingress-Erreichbarkeit) — nur Flux-Reconciliation.
- Keine Secret-Werte ausgeben.
- Kein Code, kein Plan, keine Implementierung in diesem Goal-Schritt.

## Abhängigkeiten
- Repo `Bachelorprojekt`, Branch `main`, Runner Taskfile; Kommandos via `bash scripts/vda.sh oracle '<goal>'` auflösen, nie hardcoden.
- Cluster-Kontext `devmesh` erreichbar (ADR-008); `fleet` nur als Abgrenzung.
- `k3d/*.yaml` enthalten `${VAR}` / `$${VAR}`-Platzhalter — nie direkt appliesen, nur via `task workspace:validate` / Flux-Render lesen.
- Bei Rot: nach Bug-Triage-Konvention nur als GitHub-Issue berichten, nicht still fixen.

## Annahmen
- Annahme: `flux/clusters/devmesh/ks-{workspace,platform,secrets,agent-board}.yaml` sind die maßgeblichen Kustomizations (Stand 2026-11-02 verifiziert).
- Annahme: `k3d/kustomization.yaml`-Root ist Referenz für „whole" (laut `k3d/README.md`).

## plan_refs
- (leer — wird von `dev-flow-plan` bidirektional verlinkt, Modell B)

health_goals: [G-FLUX01, G-K8S01]
