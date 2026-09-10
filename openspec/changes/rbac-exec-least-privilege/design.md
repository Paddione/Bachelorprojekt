---
ticket_id: T900110
plan_ref: openspec/changes/rbac-exec-least-privilege/tasks.md
status: active
date: 2026-09-10
---

# Design: rbac-exec-least-privilege

_Ticket: T900110 · Ziel-SSOT: `openspec/specs/security.md` (ADDED), `openspec/specs/software-factory.md` (MODIFIED) · blockiert T900113_

## Ausgangslage (gemessen 2026-09-10, origin/main 1c924b5b9)

```bash
POD=$(kubectl --context fleet -n workspace-dev get pod -l app=dev-pod -o jsonpath='{.items[0].metadata.name}')
for sa in website:website website-staging:website website-korczewski:website workspace-dev:factory-tick kube-system:dev-deployer; do
  ns=${sa%%:*}; n=${sa##*:}
  kubectl --context fleet auth can-i create pods/"$POD" --subresource=exec --as="system:serviceaccount:$ns:$n" -n workspace-dev
  kubectl --context fleet auth can-i create pods --subresource=exec --as="system:serviceaccount:$ns:$n" -n workspace
done
```

| ServiceAccount | exec workspace-dev (dev-pod) | exec workspace (Prod, shared-db) | Quelle |
|---|---|---|---|
| `website/website`, `website-staging/website`, `website-korczewski/website` | yes | yes | ClusterRoleBinding `${WEBSITE_NAMESPACE}-monitoring-reader` → ClusterRole mit `{apiGroups:[""], resources:["pods/exec"], verbs:["create"]}` ohne resourceNames (`k3d/website.yaml`) |
| `workspace-dev/factory-tick` | yes | no | Role `factory-tick-exec` in `k3d/dev-stack/factory-runner.yaml` |
| `kube-system/dev-deployer` | yes | yes | ClusterRoleBinding `dev-deployer` → `cluster-admin`, manuell per `kubectl apply` am 2026-06-01, nicht im Repo, Legacy-Token-Secret `dev-deployer-token` mit `kubernetes.io/legacy-token-last-used=2026-06-01` |

Achtung Messfalle: `kubectl auth can-i create pods/exec` fragt nach einem Pod **namens** `exec` und liefert
fälschlich `no`. Richtig ist `--subresource=exec`.

### Wofür die Rechte tatsächlich gebraucht werden

- **Website:** Die Regel kam mit PR #369 (Commit `f1dc2e1b9`, 2026-04-27, "extend RBAC") für den
  SDLC-Test-Runner. Einziger in-Pod-Exec-Pfad: `POST /sdlc/api/tests/run` → `spawnTestRun()` →
  `bash tests/runner.sh local|prod` → `tests/local/*.sh`, `tests/prod/*.sh`, `tests/lib/k3d.sh` execen in
  `deploy/website` (`-n "$WEB_NAMESPACE"`) und in `deploy/shared-db|nextcloud|keycloak|vaultwarden|spreed-signaling|llm-router|whisper`
  (`-n "$NAMESPACE"`, Default `workspace`). Die TypeScript-API selbst ruft nie `/exec`. Andere Skripte
  (`health-goals-scan.sh`, `session-hub.sh`, `ticket.sh`) liegen nicht im Image; `tests/spec/*.bats` braucht `--context`.
- **factory-tick:** Der CronJob macht ausschließlich `kubectl exec deploy/factory-runner -- bash scripts/factory/wakeup.sh`.
  `resourceNames` scheidet aus (Pod-Namen zufällig). Der Runner-Pod selbst hat `automountServiceAccountToken: false`
  und nutzt die SA nicht.
- **dev-deployer:** keine Nutzung seit dem Anlagetag; die Workflows `build-brett.yml`/`build-docs.yml` nutzen
  `FLEET_KUBECONFIG` (Token-Nutzung wäre im last-used-Label sichtbar).

Vorbild im Repo: `k3d/dev-stack/sdlc-console-rbac.yaml` — namespaced Role für Schreibrechte, ClusterRole nur `nodes`, kein exec.

## Entscheidungen (Brainstorming 2026-09-10)

| Frage | Entscheidung | Verworfen |
|---|---|---|
| Website-exec | Namespaced: Role+RoleBinding im eigenen Website-Namespace und im zugehörigen Brand-Workspace | exec ganz entziehen (Test-Runner bricht); eigener Test-Runner-Job (großer Umbau) |
| factory-tick | HTTP-Wakeup statt exec, factory-tick verliert pods/exec komplett | eigener Namespace `factory` (PVC-Migration); belassen |
| dev-deployer | Löschen als Plan-Schritt (mit erneuter Rückfrage bei Ausführung) + Audit gegen unverwaltete cluster-admin-Bindings | sofort löschen; nur Token invalidieren |
| Umfang | Nur exec; übrige clusterweite Schreibrechte der Website → T900114 | alles in einem Change |

## Architektur

### 1. Website: exec namespaced

- `k3d/website.yaml`: Die ClusterRole `${WEBSITE_NAMESPACE}-monitoring-reader` verliert die `pods/exec`-Regel.
  Alle übrigen Regeln bleiben unverändert (T900114).
- `k3d/website.yaml`: neue `Role`/`RoleBinding` `website-self-exec` in `${WEBSITE_NAMESPACE}` mit
  `pods/exec create` für die Selbst-Checks gegen `deploy/website`. Pod-`get/list` liefert weiterhin die ClusterRole.
- Neue Datei `k3d/website-test-runner-rbac.yaml` in der **k3d-Basis** (von `k3d/kustomization.yaml` referenziert):
  `Role`/`RoleBinding` `website-test-runner-exec` mit `pods/exec create`, Subject
  `ServiceAccount website` in `${WEBSITE_NAMESPACE}`. Der Kustomize-Namespace-Transformer setzt die
  Objekte pro Brand in den richtigen Workspace (`workspace`, `workspace-staging`, `workspace-korczewski`),
  lässt aber `subjects[].namespace` unangetastet — lokal verifiziert mit einem Wegwerf-Overlay
  (Subject `${WEBSITE_NAMESPACE}` bleibt literal, envsubst ersetzt es im Brand-Render; `WEBSITE_NAMESPACE`
  wird dort bereits von mehreren Basis-CronJobs genutzt).
- **Ergebnis:** Website-SA hat exec nur noch im eigenen Website-Namespace und im eigenen Brand-Workspace;
  kein exec mehr in `workspace-dev` (dev-pod), `kube-system`, fremder Brand oder beliebigen Namespaces.
- **Bewusste Verschärfung:** Die Staging-Website führte Tests bisher mangels `NAMESPACE`-Env gegen `workspace`
  (Prod) aus; nach der Änderung darf sie nur in `workspace-staging` execen. Tests mit hartem `-n workspace`
  (`tests/local/admin-actions-schema.bats`) funktionieren aus der Staging-Website nicht mehr — gewollt.
- **korczewski:** `flux-korczewski` und `flux-website-korczewski` sind suspendiert (T002479); die Änderung
  wirkt dort erst bei Reaktivierung. Kein Handlungsbedarf.
- **Restrisiko (dokumentiert):** Eine Kompromittierung der Website erlaubt weiter exec in den eigenen
  Brand-Workspace inkl. `shared-db`. Vollständige Trennung wäre der verworfene Test-Runner-Job-Ansatz.

### 2. factory-tick: HTTP-Wakeup

- Neues Skript `docker/factory-runner/wakeup-listener.mjs` (Node, im Image unter `/opt/factory-runner/`):
  - `GET /healthz` → `200 ok`.
  - `POST /wakeup` → startet `bash "$FACTORY_REPO/scripts/factory/wakeup.sh"` (cwd `$FACTORY_REPO`), streamt
    stdout/stderr chunked in die Antwort **und** auf den Container-stdout, schließt mit einer Trailer-Zeile
    `WAKEUP_EXIT=<code>`.
  - Läuft bereits ein Wakeup, antwortet es `409` mit `WAKEUP_EXIT=busy` (zusätzlich zur flock-Sperre in `wakeup.sh`).
  - Andere Pfade/Methoden → `404`/`405`. Kein Request-Body wird ausgewertet, keine Parameter an `wakeup.sh`.
  - Port über `WAKEUP_LISTEN_PORT` (Default `8787`), Bind `0.0.0.0`.
- `docker/factory-runner/Dockerfile`: `COPY docker/factory-runner/wakeup-listener.mjs /opt/factory-runner/wakeup-listener.mjs`
  (Build-Kontext ist das Repo-Root). `.github/workflows/build-factory-runner.yml`: Pfadfilter auf
  `docker/factory-runner/**` erweitern.
- `k3d/dev-stack/factory-runner.yaml`:
  - Deployment: `command: ["node", "/opt/factory-runner/wakeup-listener.mjs"]` statt `sleep infinity`,
    `containerPort 8787`, `readinessProbe httpGet /healthz`, Pod-Label `component: runner` (Selector unverändert).
  - Neuer `Service` `factory-runner` (ClusterIP, Port 8787, Selector `app: factory-runner, component: runner`).
  - CronJob `factory-tick`: Image `alpine/k8s` (Digest unverändert, bringt `curl` + `sh`), Kommando
    `curl -sS -N --max-time 1500 -X POST http://factory-runner:8787/wakeup`, Ausgabe durchreichen, Exit 0 nur
    bei letzter Zeile `WAKEUP_EXIT=0`; `automountServiceAccountToken: false`; Pod-Label `component: tick`.
  - `Role`/`RoleBinding` `factory-tick-exec` entfallen. Die SA `factory-tick` bleibt (Deployment nutzt sie, ohne Token).
- Neue `k3d/dev-stack/factory-runner-netpol.yaml` (in `k3d/dev-stack/kustomization.yaml`):
  - Egress für Pods `app: factory-runner, component: tick` → Pods `app: factory-runner, component: runner` TCP 8787.
    Nötig, weil `allow-llm-gateway-egress` (podSelector `{}`) in `workspace-dev` Egress ins Pod-Netz nur auf 5432 erlaubt.
  - Ingress für Pods `component: runner`: nur von `component: tick` auf TCP 8787.
- **Log-Semantik:** Der Tick-Output landet wie bisher im Job-Log (gestreamt) und zusätzlich im Runner-Log.
  Der Job-Status folgt dem Exit von `wakeup.sh` (Trailer), `failedJobsHistoryLimit` bleibt aussagekräftig.

### 3. dev-deployer + Audit

- Neues Skript `scripts/security/cluster-admin-audit.sh`: liest ClusterRoleBindings als JSON
  (`kubectl get clusterrolebindings -o json` oder `--file <json>`), listet Bindings auf `cluster-admin`, deren
  Subjects nicht in der Allowlist stehen, Exit 1 bei Treffern. Allowlist (live gemessen):
  `Group:system:masters`, `ServiceAccount:flux-system/kustomize-controller`, `ServiceAccount:flux-system/helm-controller`,
  `ServiceAccount:flux-system/flux-operator`, `ServiceAccount:kube-system/helm-traefik`,
  `ServiceAccount:kube-system/helm-traefik-crd`, `ServiceAccount:longhorn-system/longhorn-support-bundle`.
- Ops-Schritt (Task 5, nur mit erneuter Nutzerbestätigung): Label `kubernetes.io/legacy-token-last-used` erneut
  prüfen; Manifeste der drei Objekte ins Scratchpad sichern (Wiederherstellbarkeit ohne Token-Wert), dann
  `ClusterRoleBinding dev-deployer`, `Secret kube-system/dev-deployer-token`, `ServiceAccount kube-system/dev-deployer`
  löschen; Audit live → Exit 0.

## Rollout-Reihenfolge und Risiken

1. **Website-Änderung ist ein Merge:** Flux rendert Website-Overlay (ClusterRole ohne exec) und Brand-Overlay
   (neue Roles) aus demselben Commit, aber in getrennten Kustomizations → kurzes Fenster, in dem der
   Test-Runner kein exec hat. Unkritisch (manueller Admin-Button).
2. **factory-tick:** Das Image mit Listener muss **vor** dem Manifest existieren, sonst CrashLoop des Runners
   (`node: cannot find module`). Gegenmaßnahme wie in T900108: Branch-Build per `workflow_dispatch` vor dem Merge
   und Nachweis über einen Pull im Cluster.
3. **NetworkPolicy:** Ohne die neue Egress-Regel scheitert der Wakeup mit Timeout → Job rot, Factory tickt nicht.
   Smoke nach Rollout: `kubectl create job --from=cronjob/factory-tick` und Job-Log mit `WAKEUP_EXIT=`.
4. **dev-deployer:** Löschen ist per Neuanlage umkehrbar, ein neues Token wäre aber ein anderes. Nur nach Rückfrage.

## Nicht Teil dieses Changes

T900114 (übrige clusterweite Schreibrechte der Website), T900113 (git-crypt per GPG im dev-shell),
`tests-retention-cronjob.yaml` (exec nur im Website-Namespace, außerhalb Kustomize angewendet).
