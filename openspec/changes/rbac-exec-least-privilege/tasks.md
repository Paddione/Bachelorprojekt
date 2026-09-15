---
title: "rbac-exec-least-privilege — Implementation Plan"
ticket_id: T900110
domains: [infra, security, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# rbac-exec-least-privilege — Implementation Plan

_Ticket: T900110 · Design: `openspec/changes/rbac-exec-least-privilege/design.md` · Deltas: `specs/security.md` (ADDED), `specs/software-factory.md` (MODIFIED) · blockiert T900113_

## File Structure

```
k3d/website.yaml                                   AEND ClusterRole ohne pods/exec; Role+RoleBinding website-self-exec
k3d/website-test-runner-rbac.yaml                  NEU  Role+RoleBinding website-test-runner-exec (k3d-Basis, Brand-Workspace)
k3d/kustomization.yaml                             AEND website-test-runner-rbac.yaml in resources
docker/factory-runner/wakeup-listener.mjs          NEU  HTTP-Wakeup (GET /healthz, POST /wakeup, 409 bei laufendem Tick)
docker/factory-runner/Dockerfile                   AEND COPY des Listeners nach /opt/factory-runner/
.github/workflows/build-factory-runner.yml         AEND Pfadfilter docker/factory-runner/**
k3d/dev-stack/factory-runner.yaml                  AEND Runner-Command/Port/Probe/Label, Service, CronJob per curl, Role factory-tick-exec entfernt
k3d/dev-stack/factory-runner-netpol.yaml           NEU  Egress tick->runner:8787, Ingress runner nur von tick
k3d/dev-stack/kustomization.yaml                   AEND factory-runner-netpol.yaml in resources
scripts/security/cluster-admin-audit.sh            NEU  Allowlist-Audit fuer cluster-admin-Bindings
tests/spec/security/workload-exec-rbac.bats        NEU  Guards Website-RBAC
tests/spec/security/cluster-admin-audit.bats       NEU  Audit gegen Fixtures
tests/spec/security/fixtures/crb-allowlisted.json  NEU  Fixture
tests/spec/security/fixtures/crb-dev-deployer.json NEU  Fixture
tests/spec/software-factory/tick-http-wakeup.bats  NEU  Manifest-Guards + Listener-Laufzeittest
components/website/src/data/test-inventory.json    AEND regeneriert
```

**S1:** Keine Datei ist in `docs/code-quality/baseline.json` gebaselined. `.yaml`/`.yml`/`.bats`/`.json`/`Dockerfile`
haben in `docs/code-quality/gates.yaml` → `s1.limits` kein Limit. `wakeup-listener.mjs` (Limit `.mjs` 800) bleibt
unter 120 Zeilen, `cluster-admin-audit.sh` (Limit `.sh` 800) unter 100 Zeilen. Kein Split nötig.
**S3:** keine Brand-Domain-Literale; der Wakeup nutzt den Service-Kurznamen `factory-runner`.
**S4:** Listener wird vom Dockerfile referenziert, Audit-Skript von BATS und `design.md`, neue Manifeste von den
jeweiligen `kustomization.yaml`.

## Partials

Ein Partial (Single-Plan): die drei Teile sind klein, teilen die Guard-Verzeichnisse und werden gemeinsam gegen
denselben Rollout verifiziert.

---

### Task 1: Guards schreiben (RED)

**Dateien:** `tests/spec/security/workload-exec-rbac.bats`, `tests/spec/security/cluster-admin-audit.bats`,
`tests/spec/security/fixtures/*.json`, `tests/spec/software-factory/tick-http-wakeup.bats`

Prüfmodus im Header jeder Datei dokumentieren: Parser-Output über Manifeste (node + `yaml`, Helper wie in
`tests/spec/dev-pod-mcp-bundle/dev-pod.bats`, inkl. `cygpath -m` unter MSYS), Laufzeitverhalten für Listener und
Audit. Node-Ausdrücke in Bash immer vollständig in einfachen Anführungszeichen übergeben oder in eine Datei
schreiben — unquotierte `>`/`<` erzeugen sonst Streudateien per Umleitung. Jede Negativ-Aussage mit Positiv-Anker.

- [ ] **1.1** `tests/spec/security/workload-exec-rbac.bats`:
  1. `website ClusterRole keeps read access but grants no pods/exec` — Dokument `kind: ClusterRole`,
     `metadata.name` endet auf `-monitoring-reader`: Anker = eine Regel mit `pods` und Verb `list`; dann
     `rules.filter(r => (r.resources||[]).includes('pods/exec')).length === 0`.
  2. `website-self-exec Role grants exec in the website namespace only` — in `k3d/website.yaml` existiert
     `Role` und `RoleBinding` `website-self-exec`, `metadata.namespace === '${WEBSITE_NAMESPACE}'`, Regel
     `pods/exec` + `create`, Subject `ServiceAccount/website` in `${WEBSITE_NAMESPACE}`.
  3. `website-test-runner-exec is a namespaced Role bound to the website SA` — `k3d/website-test-runner-rbac.yaml`
     enthält `Role` + `RoleBinding` `website-test-runner-exec` ohne `metadata.namespace` (Namespace kommt aus der
     Basis), Regel `pods/exec create`, Subject `ServiceAccount website` mit `namespace: ${WEBSITE_NAMESPACE}`.
  4. `k3d base references the test-runner RBAC` — `resources` in `k3d/kustomization.yaml` enthält
     `website-test-runner-rbac.yaml`.
  5. `no ClusterRoleBinding in k3d binds a ClusterRole that grants pods/exec to the website SA` — über alle
     `k3d/*.yaml`: Menge der ClusterRoles mit `pods/exec` (Anker: die Datei-Liste ist nicht leer) geschnitten mit
     ClusterRoleBindings, deren Subject `website` ist → leer.
  6. `rendered base keeps the subject namespace` — `command -v kubectl >/dev/null || skip "kubectl binary not installed"`;
     `kubectl kustomize k3d` rendern (Ausgabe in `$BATS_TEST_TMPDIR`), die RoleBinding `website-test-runner-exec`
     hat `metadata.namespace: workspace` und Subject-Namespace `${WEBSITE_NAMESPACE}`. Vorher mit
     `grep -rn 'kubectl kustomize\|kustomize build' .github/workflows/` prüfen, ob CI kubectl bereitstellt; das Ergebnis
     im Test-Header notieren (T002820).

- [ ] **1.2** Fixtures: `crb-allowlisted.json` (`{"items":[...]}` mit den sieben Allowlist-Subjects auf
  `cluster-admin` plus eine Bindung auf eine andere ClusterRole, die nicht zählen darf) und `crb-dev-deployer.json`
  (Allowlist plus `dev-deployer` → `ServiceAccount kube-system/dev-deployer`). Aufbau der Einträge wie
  `kubectl get clusterrolebindings -o json` (`metadata.name`, `roleRef.kind/name`, `subjects[].kind/name/namespace`).

- [ ] **1.3** `tests/spec/security/cluster-admin-audit.bats` (Laufzeit, führt das Skript aus):
  1. `audit passes on allowlisted bindings` — `run bash scripts/security/cluster-admin-audit.sh --file fixtures/crb-allowlisted.json`
     → `status 0`, Ausgabe nennt die Zahl geprüfter cluster-admin-Bindings (`7`).
  2. `audit reports an unmanaged cluster-admin ServiceAccount` — mit `crb-dev-deployer.json` → `status 1`, Ausgabe
     enthält `dev-deployer` und `kube-system/dev-deployer`.
  3. `audit rejects missing input` — `--file` auf nicht existierende Datei → `status 2`.

- [ ] **1.4** `tests/spec/software-factory/tick-http-wakeup.bats`:
  Manifest-Guards gegen `k3d/dev-stack/factory-runner.yaml`:
  1. `no Role grants pods/exec for factory-tick` — Anker: das Dokument `ServiceAccount factory-tick` existiert;
     dann keine `Role`/`ClusterRole` mit `pods/exec` in der Datei und keine Bindung mit Subject `factory-tick` auf eine solche.
  2. `CronJob triggers the tick via HTTP without token or kubectl` — CronJob `factory-tick`: Pod-Spec
     `automountServiceAccountToken === false`; `command`+`args` enthalten `http://factory-runner:8787/wakeup` und
     nicht `kubectl`; Pod-Label `component: tick`.
  3. `runner serves the wakeup listener` — Deployment `factory-runner`: `command` enthält
     `/opt/factory-runner/wakeup-listener.mjs`, `containerPort 8787`, `readinessProbe.httpGet.path === '/healthz'`,
     Template-Label `component: runner`, `selector.matchLabels` unverändert `{app: factory-runner}`.
  4. `Service and NetworkPolicy connect only tick to runner` — Service `factory-runner` Port 8787, Selector mit
     `component: runner`; `k3d/dev-stack/factory-runner-netpol.yaml` ist in `k3d/dev-stack/kustomization.yaml`
     referenziert, erlaubt Egress von `component: tick` zu `component: runner` Port 8787 und Ingress auf `component: runner`
     nur von `component: tick`.
  5. `image ships the listener` — `docker/factory-runner/Dockerfile` enthält eine `COPY`-Zeile mit
     `wakeup-listener.mjs` nach `/opt/factory-runner/`; `.github/workflows/build-factory-runner.yml` (geparst) hat im
     `push`-Pfadfilter `docker/factory-runner/**`.
  Laufzeittests gegen den Listener (`command -v node >/dev/null || skip "node binary not installed"`,
  `command -v curl >/dev/null || skip "curl binary not installed"`): temporäres `FACTORY_REPO` in
  `$BATS_TEST_TMPDIR` mit `scripts/factory/wakeup.sh`-Stub, freier Port per `node -e` (Server auf Port 0, Port ausgeben,
  schließen), Listener mit `WAKEUP_LISTEN_PORT` im Hintergrund starten, auf `GET /healthz` pollen (max. 5 s), in
  `teardown` den Prozess beenden:
  6. `healthz answers ok` → HTTP 200.
  7. `wakeup streams output and reports exit 0` — Stub `echo tick-ran; exit 0` → Antwort enthält `tick-ran`, letzte Zeile `WAKEUP_EXIT=0`.
  8. `wakeup reports a failing tick` — Stub `exit 3` → letzte Zeile `WAKEUP_EXIT=3`.
  9. `parallel wakeup is rejected with 409` — Stub schreibt eine Markerzeile in eine Datei und `sleep 3`; ersten
     Request im Hintergrund starten, nach Erscheinen der Markerdatei zweiten Request → HTTP 409; danach enthält die
     Markerdatei genau eine Zeile.
  10. `other methods are refused` — `GET /wakeup` → 405, `POST /other` → 404.

- [ ] **1.5** RED-Lauf:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/security/workload-exec-rbac.bats tests/spec/security/cluster-admin-audit.bats tests/spec/software-factory/tick-http-wakeup.bats
# expected: FAIL (ClusterRole haelt noch pods/exec, Listener/Audit/Netpol existieren nicht)
```

  Ein bereits grüner neuer Test ist ein Befund am Test (tests/CLAUDE.md, Spielart 3) — vor Task 2 korrigieren.
  Ausnahme, die grün sein darf und das begründet: Test 1.1/6 prüft nur die Transformer-Semantik, sobald die Datei existiert.

- [ ] **1.6** Commit: `test(security): Guards fuer exec-Least-Privilege (RED) [T900110]`

### Task 2: Website-RBAC namespacen

**Dateien:** `k3d/website.yaml`, `k3d/website-test-runner-rbac.yaml`, `k3d/kustomization.yaml`

- [ ] **2.1** `k3d/website.yaml`: in der ClusterRole `${WEBSITE_NAMESPACE}-monitoring-reader` die Regel
  `{apiGroups: [""], resources: ["pods/exec"], verbs: ["create"]}` entfernen. Kommentar über der ClusterRole:
  exec ist namespaced (T900110), übrige Schreibrechte folgen in T900114.
- [ ] **2.2** `k3d/website.yaml` direkt nach der ClusterRoleBinding:

```yaml
# exec nur im eigenen Namespace (Selbst-Checks gegen deploy/website aus tests/local) [T900110]
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: website-self-exec
  namespace: ${WEBSITE_NAMESPACE}
  labels:
    app: website
rules:
  - apiGroups: [""]
    resources: ["pods/exec"]
    verbs: ["create"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: website-self-exec
  namespace: ${WEBSITE_NAMESPACE}
  labels:
    app: website
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: website-self-exec
subjects:
  - kind: ServiceAccount
    name: website
    namespace: ${WEBSITE_NAMESPACE}
---
```

- [ ] **2.3** `k3d/website-test-runner-rbac.yaml` (ohne `metadata.namespace`, Kopfkommentar mit Begründung, Messbefehl
  aus `design.md` und Hinweis, dass der Kustomize-Namespace-Transformer `subjects[].namespace` nicht umschreibt):
  `Role website-test-runner-exec` (`pods/exec create`) und `RoleBinding website-test-runner-exec` mit Subject
  `ServiceAccount website`, `namespace: ${WEBSITE_NAMESPACE}`, Labels `app: website`.
- [ ] **2.4** `k3d/kustomization.yaml`: `website-test-runner-rbac.yaml` in `resources` neben `network-policies.yaml` aufnehmen.
- [ ] **2.5** Envsubst-Allowlist prüfen: `tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats -f 'T001994'` und
  `grep -n 'WEBSITE_NAMESPACE' scripts/flux-render-artifact.sh environments/schema.yaml` — `WEBSITE_NAMESPACE` muss im
  Brand-Render ersetzt werden (wird bereits von Basis-CronJobs genutzt).
- [ ] **2.6** Render-Nachweis:

```bash
kubectl kustomize prod-fleet/mentolder | grep -n -A12 'name: website-test-runner-exec' | grep -E 'kind:|namespace:'
kubectl kustomize prod-fleet/staging   | grep -n -A12 'name: website-test-runner-exec' | grep -E 'kind:|namespace:'
kubectl kustomize prod-fleet/website-mentolder | grep -n -B2 -A4 'pods/exec'
task workspace:validate
```

  Erwartung: RoleBinding in `workspace` bzw. `workspace-staging`, Subject-Namespace `${WEBSITE_NAMESPACE}`;
  im Website-Render `pods/exec` nur noch in `Role website-self-exec`.
- [ ] **2.7** Commit: `fix(security): Website-exec namespaced statt clusterweit [T900110]`

### Task 3: factory-tick per HTTP-Wakeup

**Dateien:** `docker/factory-runner/wakeup-listener.mjs`, `docker/factory-runner/Dockerfile`,
`.github/workflows/build-factory-runner.yml`, `k3d/dev-stack/factory-runner.yaml`,
`k3d/dev-stack/factory-runner-netpol.yaml`, `k3d/dev-stack/kustomization.yaml`

- [ ] **3.1** `docker/factory-runner/wakeup-listener.mjs` (ESM, nur `node:http` und `node:child_process`):
  - `const PORT = Number(process.env.WAKEUP_LISTEN_PORT || 8787)`, `const REPO = process.env.FACTORY_REPO || '/workspace'`.
  - `GET /healthz` → 200 `ok\n`.
  - `POST /wakeup`: läuft bereits ein Kind → 409 mit Body `WAKEUP_EXIT=busy\n`. Sonst Status 200 mit
    `Content-Type: text/plain; charset=utf-8`, `spawn('bash', [`${REPO}/scripts/factory/wakeup.sh`], { cwd: REPO, env: process.env })`,
    stdout/stderr jeweils in die Antwort schreiben und nach `process.stdout`/`process.stderr` spiegeln; bei `close` →
    `WAKEUP_EXIT=${code ?? 'signal'}\n`, `res.end()`, Busy-Flag zurücksetzen; bei `error` → `WAKEUP_EXIT=spawn-error\n`.
    Bricht der Client ab, läuft der Tick weiter (kein Kill).
  - `/wakeup` mit anderer Methode → 405, andere Pfade → 404.
  - `SIGTERM` → Server schließen; ein laufendes Kind erhält `SIGTERM` weitergereicht.
  - Kopfkommentar: Zweck, T900110, dass keine Request-Daten an `wakeup.sh` gehen.
- [ ] **3.2** `docker/factory-runner/Dockerfile`: vor `USER runner` einfügen
  `COPY docker/factory-runner/wakeup-listener.mjs /opt/factory-runner/wakeup-listener.mjs` (Build-Kontext ist das
  Repo-Root, siehe `context: .` im Workflow).
- [ ] **3.3** `.github/workflows/build-factory-runner.yml`: beide `paths`-Filter von `docker/factory-runner/Dockerfile`
  auf `docker/factory-runner/**` erweitern.
- [ ] **3.4** `k3d/dev-stack/factory-runner.yaml`:
  - Role und RoleBinding `factory-tick-exec` samt Kommentarblock entfernen; Kommentar an der SA `factory-tick`:
    „keine RBAC-Rechte; Deployment läuft ohne Token, CronJob ruft den Wakeup per HTTP (T900110)“.
  - Deployment-Template-Labels um `component: runner` ergänzen (Selector unverändert lassen).
  - Container `runner`: `command: ["node", "/opt/factory-runner/wakeup-listener.mjs"]`, `ports: [{containerPort: 8787, name: wakeup}]`,
    `readinessProbe: {httpGet: {path: /healthz, port: wakeup}, periodSeconds: 20}`.
  - Neuer `Service` `factory-runner` (Labels `app: factory-runner`, Selector `app: factory-runner` + `component: runner`,
    Port 8787 → `wakeup`).
  - CronJob `factory-tick`: Pod-Label `component: tick`, `automountServiceAccountToken: false`,
    `serviceAccountName: factory-tick` bleibt, Container `tick` behält Image-Digest, Kommando:

```yaml
              command: ["sh", "-c"]
              args:
                - |
                  out="$(mktemp)"
                  curl -sS -N --max-time 1500 -X POST http://factory-runner:8787/wakeup | tee "$out"
                  tail -n 1 "$out" | grep -qx 'WAKEUP_EXIT=0'
```

- [ ] **3.5** `k3d/dev-stack/factory-runner-netpol.yaml`: zwei NetworkPolicies
  `factory-tick-to-runner-egress` (podSelector `app: factory-runner, component: tick`, `policyTypes: [Egress]`, Ziel
  `podSelector app: factory-runner, component: runner`, TCP 8787) und `factory-runner-wakeup-ingress`
  (podSelector `component: runner` + `app: factory-runner`, `policyTypes: [Ingress]`, nur von `component: tick`, TCP 8787).
  Kopfkommentar: `allow-llm-gateway-egress` (podSelector `{}`) lässt Egress ins Pod-Netz nur auf 5432 zu.
  In `k3d/dev-stack/kustomization.yaml` unter `resources` nach `factory-runner.yaml` eintragen.
  Vorher prüfen, dass DNS-Egress für den CronJob-Pod bereits erlaubt ist:
  `kubectl kustomize prod-fleet/dev | grep -n -B3 -A20 'name: allow-llm-gateway-egress' | grep -n 'port: 53'`.
- [ ] **3.6** GREEN-Lauf und Render:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/tick-http-wakeup.bats tests/spec/security/workload-exec-rbac.bats
kubectl kustomize prod-fleet/dev > /dev/null
task workspace:validate
```

- [ ] **3.7** Commit: `fix(factory): Tick-Anstoss per HTTP-Wakeup statt pods/exec [T900110]`

### Task 4: cluster-admin-Audit

**Dateien:** `scripts/security/cluster-admin-audit.sh`

- [ ] **4.1** Skript (`set -euo pipefail`, `jq` Pflicht mit `command -v jq || { echo "jq fehlt" >&2; exit 2; }`):
  - Eingabe: `--file <json>` oder `--context <ctx>` (dann `kubectl --context <ctx> get clusterrolebindings -o json`);
    ohne Argument `--help`-Text, Exit 2; fehlende Datei → Exit 2.
  - Allowlist als Bash-Array exakt wie in `design.md` §3 (Form `Kind:namespace/name`, `Group:system:masters`).
  - Ausgabe: `cluster-admin-audit: <n> cluster-admin binding(s) checked`; je Verstoß
    `UNEXPECTED <binding> -> <Kind>:<ns>/<name>`; Exit 1 bei mindestens einem Verstoß, sonst 0.
- [ ] **4.2** `tests/unit/lib/bats-core/bin/bats tests/spec/security/cluster-admin-audit.bats` grün.
- [ ] **4.3** Commit: `feat(security): Audit fuer cluster-admin-Bindings mit Allowlist [T900110]`

### Task 5: Verifikation vor dem PR

- [ ] **5.1** Alle drei Guard-Dateien plus die berührten Bestands-Suiten seriell:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/security/ tests/spec/software-factory/tick-http-wakeup.bats tests/spec/website-core.bats
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats -f 'T001994'
```

- [ ] **5.2** Test-Inventar: `task test:inventory` und `components/website/src/data/test-inventory.json` committen.

### Task 6: Image vor dem Merge und Rollout-Nachweis

`k3d/dev-stack/factory-runner.yaml` startet den Listener aus dem Image; fehlt er, crasht der Runner (design.md §Rollout).

- [ ] **6.1** Branch pushen, Image vom Branch bauen:

```bash
gh workflow run build-factory-runner.yml --ref "$(git branch --show-current)"
gh run list --workflow build-factory-runner.yml --limit 1 --json databaseId -q '.[0].databaseId' | xargs gh run watch --exit-status
```

- [ ] **6.2** Nachweis ohne Deployment-Änderung: temporären Pod `factory-runner-smoke-t900110` in `workspace-dev` mit dem
  frisch gebauten Image, Toleration/Affinity `role=dev` wie das Deployment, `command: ["node","/opt/factory-runner/wakeup-listener.mjs"]`
  und `FACTORY_REPO=/tmp/repo` starten; per `kubectl exec` einen `scripts/factory/wakeup.sh`-Stub unter `/tmp/repo` anlegen und
  `curl -sS -X POST http://127.0.0.1:8787/wakeup` im Pod ausführen → letzte Zeile `WAKEUP_EXIT=0`. Pod danach IMMER löschen.
- [ ] **6.3** PR-Body: Merge erst nach 6.1/6.2; Post-Merge-Schritte aus Task 7 als offene Checkboxen.

### Task 7: Post-Merge (Live)

- [ ] **7.1** Website-RBAC live:

```bash
kubectl --context fleet auth can-i create pods --subresource=exec --as=system:serviceaccount:website:website -n workspace-dev   # no
kubectl --context fleet auth can-i create pods --subresource=exec --as=system:serviceaccount:website:website -n kube-system     # no
kubectl --context fleet auth can-i create pods --subresource=exec --as=system:serviceaccount:website:website -n workspace       # yes
kubectl --context fleet auth can-i create pods --subresource=exec --as=system:serviceaccount:website:website -n website         # yes
kubectl --context fleet auth can-i create pods --subresource=exec --as=system:serviceaccount:website-staging:website -n workspace         # no
kubectl --context fleet auth can-i create pods --subresource=exec --as=system:serviceaccount:website-staging:website -n workspace-staging # yes
```

- [ ] **7.2** factory-tick live: `kubectl --context fleet -n workspace-dev rollout status deploy/factory-runner`;
  `kubectl --context fleet -n workspace-dev create job factory-tick-smoke-t900110 --from=cronjob/factory-tick`, Job-Log endet mit
  `WAKEUP_EXIT=0` (bei `FACTORY_DRY_RUN`/Kill-Switch ist ein leerer Tick mit Exit 0 korrekt); Job danach löschen;
  `kubectl --context fleet auth can-i create pods --subresource=exec --as=system:serviceaccount:workspace-dev:factory-tick -n workspace-dev` → `no`.
- [ ] **7.3** dev-deployer — **erst nach ausdrücklicher Nutzerbestätigung in der Session**:

```bash
kubectl --context fleet -n kube-system get secret dev-deployer-token -o jsonpath='{.metadata.labels.kubernetes\.io/legacy-token-last-used}'
kubectl --context fleet get clusterrolebinding dev-deployer -o yaml > "$SCRATCHPAD/dev-deployer-crb.yaml"
kubectl --context fleet -n kube-system get sa dev-deployer -o yaml > "$SCRATCHPAD/dev-deployer-sa.yaml"
kubectl --context fleet delete clusterrolebinding dev-deployer
kubectl --context fleet -n kube-system delete secret dev-deployer-token
kubectl --context fleet -n kube-system delete sa dev-deployer
bash scripts/security/cluster-admin-audit.sh --context fleet
```

  Die Secret-YAML wird nicht gesichert (enthält den Token). Erwartung Audit: Exit 0. Ergebnis als Kommentar an T900110;
  T900113 entblocken.

### Task 8: Final Verification

- [ ] **8.1** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
