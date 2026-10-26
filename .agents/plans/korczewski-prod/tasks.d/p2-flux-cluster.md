# p2 — Flux-Insel, Kustomizations und Tenant-RBAC

Partial p2, Rolle impl. Grundlage: `../design.md` §1, §2, §3, §9; Vorbild ist `flux/clusters/devmesh/`
(`flux-instance.yaml`, `oci-source.yaml`, `ks-platform.yaml`, `ks-secrets.yaml`, `ks-workspace.yaml`,
`tenant-rbac.yaml`). Alle acht Ziel-Dateien sind neu; `flux/` steht nicht in `scan.code_roots`
(`docs/code-quality/gates.yaml`), also greifen S1/S4 nicht — die Verifikation läuft über
`flux schema validate` (lokal `flux version 2.9.3`) und über Invarianten-Checks, nicht über LOC-Budgets.
Eingehende Abhängigkeit: p1 liefert `environments/korczewski-prod.yaml` mit den Namespace-, CIDR- und
DB-Werten, die Task 8 zitiert. Ausgehende Verträge: p3 legt im Bootstrap-Pfad die drei
ClusterRole/ClusterRoleBinding-Paare `korczewski-prod-bootstrap-{tls,rbac,crd}` an — Task 7 hält deren
Namen und die Vereinigungsmenge ihrer Regeln fest, weil der Bootstrap-SA sie sich nicht selbst geben
kann; p4 darf im Apps-Pfad kein `Namespace`-Objekt rendern, weil die Namespaces in Task 7 liegen
(Begründung jeweils dort).

## Task 1: FluxInstance `flux` mit gepinnter Distribution

**Files:** `flux/clusters/korczewski-prod/flux-instance.yaml`

Neue `FluxInstance` `flux` in `flux-system` nach dem Muster von `flux/clusters/devmesh/flux-instance.yaml`,
mit vier bewusst gesetzten Abweichungen. `spec.distribution.version: "2.9.x"` statt `"2.x"`, weil `2.x`
ein ungetestetes Major-Fenster öffnet und die Verifikation dieses Plans gegen die lokal installierte
CLI 2.9.3 läuft; `registry: "ghcr.io/fluxcd"` bleibt, weil die CRD `distribution.registry` als
Pflichtfeld führt. `spec.components` listet genau `source-controller`, `kustomize-controller`,
`helm-controller`, `notification-controller` (kein `image-reflector-controller`, kein `source-watcher`).
`spec.cluster` setzt `type: kubernetes`, `networkPolicy: true`, `multitenant: true`, `size: small` —
`multitenant: true` ist die Klammer um Task 7: jeder Kind-Pfad muss `serviceAccountName` setzen, sonst
verweigert der Controller das Applizieren. `spec.sync` zeigt als `GitRepository` auf
`https://github.com/Paddione/Bachelorprojekt`, `ref: refs/heads/main`, `path: flux/clusters/korczewski-prod`,
`interval: 10m`; damit ist diese Datei selbst Teil des Synchronisationspfads, genau wie auf devmesh, wo die
vom Operator erzeugte Root-Kustomization `flux-system` denselben Pfad trägt.

`provider:` und `pullSecret:` bleiben weg, mit derselben Begründung als Kommentar wie bei devmesh:
`provider: github` verlangt GitHub-App-Secrets und endet ohne `secretRef` in
`InvalidProviderConfiguration`; das Repository ist öffentlich, also genügt der anonyme generische Fetch.

Verify: `flux schema validate flux/clusters/korczewski-prod/flux-instance.yaml --schema-location default`

```bash
# Erwartung: "Valid: 1, Invalid: 0" — der Katalog prüft die Enums für components, cluster.size und sync.kind.
grep -cE '^[[:space:]]*(provider|pullSecret):' flux/clusters/korczewski-prod/flux-instance.yaml   # Erwartung: 0
```

## Task 2: OCIRepository mit Identitätsanker

**Files:** `flux/clusters/korczewski-prod/oci-source.yaml`

Neue `OCIRepository` `korczewski-prod-manifests` in `flux-system`: `interval: 5m`,
`url: oci://ghcr.io/paddione/korczewski-prod-manifests`, `ref.semver: "v0.*"` (der Workflow taggt
zusätzlich `v0.0.<run>` monoton, wie `render-devmesh-artifact.yml`). `secretRef` fehlt bewusst: das
Artefakt ist öffentlich (Proposal), und ein frisch gebootstrappter Cluster hat kein `ghcr-auth` —
devmesh bezieht es aus `flux/clusters/devmesh/bootstrap/ghcr-auth-sealedsecret.yaml`, das mit dem alten
Cluster-Key versiegelt ist und hier garantiert nicht entsiegelt. Ohne `secretRef` braucht der Pull keine
Credentials, was der Design-Entscheidung „öffentlich, aber identitätsgebunden" entspricht.

`spec.verify` setzt `provider: cosign` (Pflichtfeld der CRD, Enum `cosign`/`notation`) und
`matchOIDCIdentity` mit genau einem Eintrag: Issuer `https://token.actions.githubusercontent.com`,
Subject `^https://github\.com/Paddione/Bachelorprojekt/\.github/workflows/render-korczewski-prod-artifact\.yml@refs/heads/main$`.
Der Subject ist verankert (`^…$`), weil ein unverankerter regulärer Ausdruck jeden Workflow im Repo
akzeptieren würde; damit ist genau ein Workflow auf `main` signaturberechtigt. Kommentar über dem Block
nennt Issuer, Workflow-Datei und die Folge eines Fremd-Signers (Artefakt wird verworfen, `source`
bleibt `False`).

Verify: `flux schema validate flux/clusters/korczewski-prod/oci-source.yaml --schema-location default`

```bash
# Positiv-Anker: der gepinnte Subject-Regex muss die echte Workflow-Identität treffen, sonst ist der Anker zu eng.
python3 -c "import re,yaml; d=yaml.safe_load(open('flux/clusters/korczewski-prod/oci-source.yaml')); m=d['spec']['verify']['matchOIDCIdentity'][0]; s='https://github.com/Paddione/Bachelorprojekt/.github/workflows/render-korczewski-prod-artifact.yml@refs/heads/main'; assert re.fullmatch(m['subject'], s), m['subject']; assert m['issuer']=='https://token.actions.githubusercontent.com'; assert 'secretRef' not in d['spec']; print('identity ok')"
```

## Task 3: Kustomization `korczewski-prod-bootstrap`

**Files:** `flux/clusters/korczewski-prod/ks-bootstrap.yaml`

Neue `Kustomization` `korczewski-prod-bootstrap` in `flux-system`: `interval: 10m`,
`retryInterval: 2m`, `timeout: 10m`, `prune: true`,
`sourceRef: {kind: OCIRepository, name: korczewski-prod-manifests}`, `path: ./cluster-bootstrap`,
`serviceAccountName: korczewski-prod-bootstrap`, `wait: true`.

Kein `dependsOn` — dieser Pfad ist das erste Glied der Kette
`bootstrap → platform → secrets → apps`; eine leere `dependsOn`-Liste wird nicht geschrieben, weil die
CRD `name` pro Eintrag verlangt und ein leeres Feld nur Rauschen wäre. `wait: true` ist hier
berechtigt, weil dieser Pfad als einziger cluster-scoped Objekte anlegt (`ClusterIssuer`,
`Certificate`, `TLSStore`, drei ClusterRole/ClusterRoleBinding-Paare) und ein `False` die Kette
weiterlaufen ließe, bevor `ClusterIssuer` und `TLSStore` existieren. Kommentar über `spec` hält die
Objektmenge fest und verweist auf die Vorbedingungen 3 und 4 (Traefik- und cert-manager-CRDs, Task 8):
`wait` macht eine fehlende Vorbedingung sofort sichtbar statt sie in einen späteren Pfad zu
verschieben.

Verify: `flux schema validate flux/clusters/korczewski-prod/ks-bootstrap.yaml --schema-location default`

```bash
yq -e '.spec.dependsOn == null and .spec.wait == true and .spec.path == "./cluster-bootstrap" and .spec.serviceAccountName == "korczewski-prod-bootstrap" and .spec.prune == true' flux/clusters/korczewski-prod/ks-bootstrap.yaml
```

## Task 4: Kustomization `korczewski-prod-platform`

**Files:** `flux/clusters/korczewski-prod/ks-platform.yaml`

Neue `Kustomization` `korczewski-prod-platform` in `flux-system` mit `interval: 10m`,
`retryInterval: 2m`, `timeout: 10m`, `prune: true`, `path: ./platform`,
`serviceAccountName: korczewski-prod-platform`, `sourceRef` auf `korczewski-prod-manifests`,
`dependsOn: [{name: korczewski-prod-bootstrap}]`, `wait: true`. `wait: true`, weil der Pfad nur
HelmRepositories und HelmReleases trägt und deren Readiness das Gate für alles Folgende ist (CRDs von
cert-manager und lego-webhook).

Der Kommentar hält die Konsequenz der Richtung fest, die aus dem Design stammt: die CRDs müssen laut
Vorbedingung 4 bereits vor dem Bootstrap-Pfad existieren. Fehlt cert-manager trotzdem, bleibt
`korczewski-prod-bootstrap` rot und `korczewski-prod-platform` wartet über `dependsOn` — der Cluster
konvergiert dann nicht von selbst. Deshalb ist Punkt 4 in Task 8 ein hartes Gate mit Prüfbefehl und
nicht bloß eine Notiz; die Wiederherstellung ist „Vorbedingung nachziehen, 2m-Retry abwarten", nicht
„DependsOn lösen".

Verify: `flux schema validate flux/clusters/korczewski-prod/ks-platform.yaml --schema-location default`

```bash
yq -e '.spec.dependsOn[0].name == "korczewski-prod-bootstrap" and .spec.wait == true and .spec.path == "./platform" and .spec.serviceAccountName == "korczewski-prod-platform"' flux/clusters/korczewski-prod/ks-platform.yaml
```

## Task 5: Kustomization `korczewski-prod-secrets` ohne Rollout-Gate

**Files:** `flux/clusters/korczewski-prod/ks-secrets.yaml`

Neue `Kustomization` `korczewski-prod-secrets` in `flux-system` mit `interval: 10m`,
`retryInterval: 2m`, `timeout: 10m`, `sourceRef` auf `korczewski-prod-manifests`,
`dependsOn: [{name: korczewski-prod-platform}]`, `path: ./secrets`,
`serviceAccountName: korczewski-prod-tenant`, `prune: true`, `wait: false`.

`wait: false` ist hier die korrekte Wahl und nicht bloß eine Abkürzung: die CRD
`sealedsecrets.bitnami.com/v1alpha1` (live geprüft) hat weder Status-Subresource noch `status`-Schema,
kstatus kann für dieses Objekt also keine Readiness melden. `wait: true` würde den Pfad bis zum
`timeout: 10m` offen halten und über `dependsOn` auch `korczewski-prod-apps` blockieren, obwohl die
Entsiegelung asynchron durch den sealed-secrets-Controller passiert. Das echte Gate liegt eine Stufe
tiefer: fehlt der Ziel-Secret, scheitert der Pod-Start im Apps-Pfad sichtbar
(`CreateContainerConfigError`), und Vorbedingung 5 in Task 8 pinnt den Schlüsselbezug. Der Kopfkommentar
nennt genau diese Kette und verweist auf den Namespace-Paritätstest aus design §10 (C3-Regression).

Verify: `flux schema validate flux/clusters/korczewski-prod/ks-secrets.yaml --schema-location default`

```bash
yq -e '.spec.wait == false and .spec.dependsOn[0].name == "korczewski-prod-platform" and .spec.serviceAccountName == "korczewski-prod-tenant" and .spec.path == "./secrets"' flux/clusters/korczewski-prod/ks-secrets.yaml
```

## Task 6: Kustomization `korczewski-prod-apps` mit Job-Gate

**Files:** `flux/clusters/korczewski-prod/ks-apps.yaml`

Neue `Kustomization` `korczewski-prod-apps` in `flux-system` mit `interval: 10m`,
`retryInterval: 2m`, `timeout: 10m`, `sourceRef` auf `korczewski-prod-manifests`,
`dependsOn: [{name: korczewski-prod-secrets}]`, `path: ./apps`,
`serviceAccountName: korczewski-prod-tenant`, `prune: true`, `wait: true`, dazu `healthCheckExprs`.

Entscheidung: `wait: true` **ohne** `healthChecks`. Die CRD (`kustomizations.kustomize.toolkit.fluxcd.io/v1`,
live geprüft) sagt zu `spec.wait`: „Wait instructs the controller to check the health of all the reconciled
resources. When enabled, the HealthChecks are ignored." Ein `healthChecks`-Eintrag auf
`pocket-id-db-init` wäre damit wirkungslos, und `wait: false` wiederum würde die Deployments gar nicht
gaten. Also bleibt `wait: true` und die Job-Semantik wird über `healthCheckExprs` gepinnt:

```yaml
healthCheckExprs:
  - apiVersion: batch/v1
    kind: Job
    current: status.conditions.filter(e, e.type == 'Complete').all(e, e.status == 'True')
    failed: status.conditions.filter(e, e.type == 'Failed').all(e, e.status == 'True')
    inProgress: status.conditions.filter(e, e.type == 'Complete').all(e, e.status == 'False')
```

Die CRD schreibt für jeden Eintrag nur `apiVersion` und `current` vor — `name`/`namespace` sind nicht
vorgesehen, der Ausdruck gilt also für **jede** `batch/v1 Job` im Inventar. In `./apps` sind das genau
`pocket-id-db-init` (`k3d/pocket-id.yaml`) und `pocket-id-client-seed` (`k3d/pocket-id-client-seed.yaml`);
beide tragen kein `ttlSecondsAfterFinished`, ein abgeschlossener Job bleibt damit `Complete` und der Pfad
flippt nicht zurück. Der Kopfkommentar hält beides fest, inklusive der Folge, dass ein später
hinzukommender dritter Job automatisch unter dasselbe Gate fällt. `healthCheckExprs` validiert gegen den
Flux-2.9-Katalog, ist also mit Task 1 (`2.9.x`) abgestimmt.

Verify: `flux schema validate flux/clusters/korczewski-prod/ks-apps.yaml --schema-location default`

```bash
yq -e '.spec.wait == true and .spec.healthChecks == null and .spec.healthCheckExprs[0].kind == "Job" and (.spec.healthCheckExprs[0].current | length > 0) and (.spec.healthCheckExprs[0].failed | length > 0)' flux/clusters/korczewski-prod/ks-apps.yaml
```

## Task 7: Namespaces, Tenant-Rollen und Bootstrap-Rechte ohne `cluster-admin`

**Files:** `flux/clusters/korczewski-prod/tenant-rbac.yaml`

Eine Datei, mehrere Dokumente, in dieser Reihenfolge: drei `Namespace`, drei `ServiceAccount`, je
Namespace ein `Role`/`RoleBinding`-Paar für den Tenant, die cluster-scoped Bootstrap-Rechte samt
`kube-system`-Nebenrolle, zuletzt die beiden Platform-Rollen. Kopfkommentar: die Datei liegt im
Synchronisationspfad der vom Operator erzeugten Root-Kustomization `flux-system` und wird mit deren
Identität appliziert; live auf devmesh trägt `flux-system` den Wert
`serviceAccountName: kustomize-controller`, die vier Kind-Pfade tragen ihren Tenant-SA. Genau deshalb
stehen die cluster-scoped Objekte hier und nicht in einem Kind-Pfad: kein Kind-SA bekommt dadurch
clusterweite Rechte, die Namespaces existieren vor dem ersten Kind-Reconcile, und ein Kind-Lauf, der
SA oder Namespace noch nicht sieht, wird nach `retryInterval: 2m` wiederholt.

**Namespaces.** `cert-manager`, `workspace-korczewski`, `website-korczewski`, ohne Labels,
Annotations oder `finalizers`. `sealed-secrets` fehlt bewusst: dort liegt kein SealedSecret, und
Controller samt Namespace gehören zu Vorbedingung 5 (Task 8). `cert-manager` ist im dokumentierten
Ablauf schon durch Vorbedingung 4 vorhanden, das Dokument ist dann ein idempotenter Apply ohne
Wirkung; deklariert wird es trotzdem, weil der Paritätstest aus design §10 die SealedSecret-Namespaces
(drei) gegen die im Artefakt deklarierten Namespaces vergleicht — mit `cert-manager` ist die
Mengengleichheit ohne Ausnahmeliste prüfbar. Kommentar über den Dokumenten hält beides fest.

**ServiceAccounts.** `korczewski-prod-tenant`, `korczewski-prod-bootstrap`,
`korczewski-prod-platform`, alle in `flux-system` und ohne weitere Felder.

**Tenant-Rollen** für `korczewski-prod-tenant`, je Namespace ein `Role` + `RoleBinding` mit
identischem Namen `korczewski-prod-tenant`, Subjekt jeweils SA `korczewski-prod-tenant`/`flux-system`:

- `workspace-korczewski`: `apps` → `deployments`, `statefulsets`; `batch` → `jobs`, `cronjobs`;
  `""` → `services`, `configmaps`, `secrets`, `serviceaccounts`, `persistentvolumeclaims`;
  `networking.k8s.io` → `ingresses`, `networkpolicies`.
- `website-korczewski`: dieselbe Regelmenge **plus** `traefik.io` → `ingressroutes`, `middlewares`.
  Die Traefik-Regeln stehen ausschließlich hier, damit der Auth-Pfad keine IngressRoute-Hoheit
  bekommt — die Namespace-Trennung aus design §3, namespaced statt clusterweit.
- `cert-manager`: ausschließlich `bitnami.com/sealedsecrets`.

Verben überall `get,list,watch,create,patch,update,delete` (nötig für `prune: true`), `secrets` in den
beiden Tenant-Namespaces bewusst ohne `resourceNames`, weil der Apps-Pfad eigene Secrets anlegt
(`pocket-id-client-seed` schreibt `workspace-secrets` fort). Die `cert-manager`-Rolle ist die erste
begründete Abweichung von design §3: der Pfad `./secrets` schreibt `ipv64-api-key` dorthin, ohne eine
Rolle dort scheitert dieser Apply garantiert und zwar erst zur Laufzeit. Sie bleibt namespaced, öffnet
`secrets` nicht und ist damit keine Eskalation.

**Bootstrap-Rechte.** `ClusterRole korczewski-prod-bootstrap` +
`ClusterRoleBinding korczewski-prod-bootstrap-binding`, Subjekt ausschließlich SA
`korczewski-prod-bootstrap`/`flux-system`. Die Regeln sind die Vereinigungsmenge der drei
ClusterRoles, die p3 im Bootstrap-Pfad anlegt:

- `cert-manager.io/clusterissuers`, `resourceNames: [letsencrypt-korczewski-prod]`,
  Verben `get,list,watch,create,patch,update`.
- `traefik.io/tlsstores`, `resourceNames: [default]`, dieselben Verben.
- `rbac.authorization.k8s.io/clusterroles,clusterrolebindings`, Verben
  `get,list,watch,create,patch,update,delete`, dazu `resourceNames` auf genau
  `korczewski-prod-bootstrap-tls`, `korczewski-prod-bootstrap-rbac` und
  `korczewski-prod-bootstrap-crd`.
- `apiextensions.k8s.io/customresourcedefinitions`, nur `get,list,watch` und **ohne**
  `resourceNames` — CRD-Namen hängen an der Chart-Version, Schreibzugriff bleibt ausgeschlossen.

Diese Vereinigung ist Pflicht, nicht Bequemlichkeit: Kubernetes verweigert das Anlegen einer Rolle,
die Rechte verleiht, die der anlegende SA nicht selbst hat. p3 legt die drei ClusterRoles
`korczewski-prod-bootstrap-tls`, `korczewski-prod-bootstrap-rbac` und
`korczewski-prod-bootstrap-crd` an und bindet sie an dieselbe SA; fehlt hier auch nur eine dieser
Regeln, scheitert der erste Bootstrap-Lauf mit `Forbidden` und die ganze Kette bleibt rot. Die drei
Namen sind damit der Vertrag zu p3 und dürfen dort nicht abweichen. Kommentar am Regelblock hält
zusätzlich fest, dass `resourceNames` bei `list`/`watch` wirkungslos ist (API-Server-Semantik): die
Einengung wirkt auf die schreibenden Verben, die Read-Verben bleiben für Inventar und SSA nötig.

Dazu `Role` + `RoleBinding` `korczewski-prod-bootstrap` in `kube-system`: `cert-manager.io/certificates`
mit `get,list,watch,create,patch,update,delete` und lesend auf `""/secrets` mit
`resourceNames: [korczewski-prod-wildcard-tls]`. Diese Rechte können nicht in p3 stehen, weil ein SA
sich seine Namespace-Rechte nicht selbst gibt; p3 verweist dafür ausdrücklich hierher. Sie liegen in
einer namespaced Role statt in der ClusterRole, weil RBAC `create` und `deletecollection` nicht über
`resourceNames` einengen kann: clusterweit wäre `create` auf `certificates` unbegrenzt, in
`kube-system` bleibt es auf einen Namespace beschränkt.

**Platform-Rollen** für `korczewski-prod-platform`: `Role` + `RoleBinding` `korczewski-prod-platform`
in `flux-system` für `helm.toolkit.fluxcd.io/helmreleases` und
`source.toolkit.fluxcd.io/helmrepositories`, sowie `Role` + `RoleBinding` `korczewski-prod-platform`
in `cert-manager` für `helmreleases` plus `""/secrets` mit
`get,list,watch,create,patch,update,delete`. Die Aufteilung folgt den Objekten: die HelmRepositories
liegen in `flux-system`, die HelmReleases in `cert-manager` (p3, Tasks 5–7), ein Namespace-Transformer
darf das nicht verschieben. Die Schreibrechte auf `secrets` sind die zweite begründete Abweichung von
design §3 („Leserechte auf `secrets` in `cert-manager`"): helm-controller legt den Release-Datensatz
als Secret `sh.helm.release.v1.<release>.v<n>` im Ziel-Namespace ab, ohne Schreibrechte scheitert
schon die Erstinstallation mit `Forbidden`; gelesen wird das Secret zusätzlich über `valuesFrom`
(`ipv64-api-key`).

**Abgrenzung und Verträge.** Nirgends `cluster-admin`: der einzige `ClusterRoleBinding` dieser Datei
zeigt auf `korczewski-prod-bootstrap`, sein Subjekt ist ausschließlich die Bootstrap-SA; Tenant- und
Platform-SA erscheinen nur in namespaced `RoleBinding`s. p3 darf die drei Namen nicht ändern und keine
zusätzlichen ClusterRoleBindings auf Tenant-SAs legen. p4 darf im Apps-Pfad kein `Namespace`-Objekt
rendern, auch nicht über `korczewski-prod/auth/namespace.yaml`: der Tenant-SA hat keine cluster-scoped
Rechte, ein Namespace im `./apps`-Artefakt macht den Pfad mit `Forbidden` rot; die Namespaces kommen
aus dieser Datei. Die vier `serviceAccountName`-Werte der Tasks 3–6 müssen exakt den hier deklarierten
SA-Namen entsprechen, der erste Verify-Befehl prüft genau das.

Verify: `for f in flux/clusters/korczewski-prod/ks-{bootstrap,platform,secrets,apps}.yaml; do sa=$(yq -r '.spec.serviceAccountName' "$f"); yq -e "select(.kind == \"ServiceAccount\" and .metadata.name == \"$sa\" and .metadata.namespace == \"flux-system\")" flux/clusters/korczewski-prod/tenant-rbac.yaml >/dev/null && echo "$f -> $sa ok" || { echo "$f -> SA fehlt: $sa"; exit 1; }; done`

```bash
# Erwartung: "Valid: 20, Invalid: 0" plus vier Zeilen "<datei> -> <sa> ok" aus dem Befehl oben.
flux schema validate flux/clusters/korczewski-prod/tenant-rbac.yaml --schema-location default
grep -c 'cluster-admin' flux/clusters/korczewski-prod/tenant-rbac.yaml   # Erwartung: 0
python3 - <<'PY'
import yaml

docs = [d for d in yaml.safe_load_all(open('flux/clusters/korczewski-prod/tenant-rbac.yaml')) if d]
names = {(d['kind'], d['metadata'].get('namespace'), d['metadata']['name']) for d in docs}
ns = {d['metadata']['name'] for d in docs if d['kind'] == 'Namespace'}
assert ns == {'cert-manager', 'workspace-korczewski', 'website-korczewski'}, ns
bootstrap_names = {'korczewski-prod-bootstrap-tls', 'korczewski-prod-bootstrap-rbac', 'korczewski-prod-bootstrap-crd'}
role = {d['metadata']['name']: d for d in docs if d['kind'] == 'ClusterRole'}['korczewski-prod-bootstrap']
rules = {(r['apiGroups'][0], res): r for r in role['rules'] for res in r['resources']}
assert set(rules[('rbac.authorization.k8s.io', 'clusterroles')]['resourceNames']) == bootstrap_names
assert set(rules[('rbac.authorization.k8s.io', 'clusterrolebindings')]['resourceNames']) == bootstrap_names
assert 'resourceNames' not in rules[('apiextensions.k8s.io', 'customresourcedefinitions')]
assert set(rules[('cert-manager.io', 'clusterissuers')]['resourceNames']) == {'letsencrypt-korczewski-prod'}
assert set(rules[('traefik.io', 'tlsstores')]['resourceNames']) == {'default'}
assert not any('namespaces' in r['resources'] for r in role['rules'])
crbs = [d for d in docs if d['kind'] == 'ClusterRoleBinding']
assert crbs and all(s['name'] == 'korczewski-prod-bootstrap' and s['namespace'] == 'flux-system' for c in crbs for s in c['subjects'])
assert not [c for c in crbs if c['roleRef']['name'] == 'cluster-admin']
assert ('Role', 'kube-system', 'korczewski-prod-bootstrap') in names
print('rbac ok')
PY
```

## Task 8: Bootstrap-Runbook als Vorbedingungsliste

**Files:** `flux/clusters/korczewski-prod/bootstrap/README.md`

Neue Markdown-Datei, Aufbau: Zweck-Absatz („was der Cluster haben muss, bevor der erste Sync grün werden
kann, und was das Artefakt selbst liefert"), dann eine nummerierte Liste mit je einem konkreten
Prüfbefehl. Alle Befehle laufen gegen `--context korczewski-prod`; die Sollwerte kommen aus
`environments/korczewski-prod.yaml` (p1), nicht aus dem Text.

1. **k3s-CIDRs.** `yq -r '.env_vars.POD_CIDR, .env_vars.SERVICE_CIDR' environments/korczewski-prod.yaml`
   gegen `kubectl --context korczewski-prod get nodes -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.spec.podCIDR}{"\n"}{end}'`
   und `kubectl --context korczewski-prod get svc kubernetes -o jsonpath='{.spec.clusterIP}{"\n"}'`
   (muss im Service-CIDR liegen). Abweichung = NetworkPolicies greifen ins Leere, deshalb Gate.
2. **StorageClass** für `pocket-id-data`: `kubectl --context korczewski-prod get storageclass longhorn -o wide`
   und `kubectl --context korczewski-prod get storageclass -o jsonpath='{range .items[?(@.metadata.annotations.storageclass\.kubernetes\.io/is-default-class=="true")]}{.metadata.name}{"\n"}{end}'`.
3. **Traefik-CRDs und IngressClass**: `kubectl --context korczewski-prod get crd ingressroutes.traefik.io middlewares.traefik.io tlsstores.traefik.io`
   sowie `kubectl --context korczewski-prod get ingressclass traefik`.
4. **cert-manager + lego-webhook, hartes Gate** (Task 4 hängt daran):
   `kubectl --context korczewski-prod -n cert-manager get crd clusterissuers.cert-manager.io` und
   `kubectl --context korczewski-prod -n cert-manager get svc lego-webhook` plus
   `kubectl --context korczewski-prod -n cert-manager get deploy`.
5. **sealed-secrets-Controller und Schlüsselbezug**: `kubectl --context korczewski-prod -n sealed-secrets get deploy sealed-secrets`
   und `kubectl --context korczewski-prod -n sealed-secrets get svc sealed-secrets`; danach
   `task env:fetch-cert ENV=korczewski-prod` und `task env:seal ENV=korczewski-prod` gegen **diesen**
   Controller (der Ciphertext aus devmesh ist wertlos).
6. **postgres mit Datenbank und Rolle `website_massage`**, erreichbar unter
   `shared-db.workspace-korczewski.svc.cluster.local:5432`:
   `kubectl --context korczewski-prod -n workspace-korczewski get svc shared-db` und ein Wegwerf-Probe
   `kubectl --context korczewski-prod -n workspace-korczewski run pg-probe --rm -i --restart=Never --image=postgres:18.6-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873 -- psql -h shared-db -U website_massage -d website_massage -c 'select current_database(), current_user'`.
   Hinweis im Text: die DB selbst ist nicht Teil des Artefakts (design §6).
7. **FluxInstance per Bootstrap-Commit.** Die Instanz kann sich nicht selbst deployen; sie wird einmalig
   von Hand appliziert, danach übernimmt die vom Operator erzeugte Root-Kustomization
   `flux-system` den Pfad `flux/clusters/korczewski-prod` und damit Source, Kustomizations und RBAC:
   `kubectl --context korczewski-prod apply -f flux/clusters/korczewski-prod/flux-instance.yaml`.
   Prüfung: `flux --context korczewski-prod get kustomizations -A` (vier Pfade, `flux-system` als Root)
   und `flux --context korczewski-prod get sources oci`.
8. **Abschlussprüfung**: `flux --context korczewski-prod get kustomizations -A` muss für alle vier Pfade
   `Ready: True` zeigen, `kubectl --context korczewski-prod get ns` muss `cert-manager`,
   `workspace-korczewski` und `website-korczewski` als `Active` zeigen, und
   `kubectl --context korczewski-prod get sealedsecrets -A` vier Objekte in genau diesen drei
   Namespaces. Textliche Klarstellung: alles Weitere ist Artefakt-Inhalt, kein Hand-Apply.

Kein Objekt dieser Datei wird per `kubectl apply` erzeugt außer der FluxInstance aus Punkt 7; die
Namespaces, ServiceAccounts, Rollen und Bindings kommen aus dem Artefakt über die Root-Kustomization,
die Namespaces speziell aus `flux/clusters/korczewski-prod/tenant-rbac.yaml` (Task 7). Der Namespace
`cert-manager` ist bereits durch Punkt 4 vorhanden, und `sealed-secrets` wird bewusst von keinem
Artefakt angelegt — beide bleiben Vorbedingung, nicht Artefakt-Inhalt.

Verify: `test -s flux/clusters/korczewski-prod/bootstrap/README.md && grep -cE '^[0-9]+\. \*\*' flux/clusters/korczewski-prod/bootstrap/README.md`

```bash
# Erwartung: 8 nummerierte Vorbedingungen; jede mit mindestens einem Prüfbefehl im selben Block.
grep -c 'kubectl --context korczewski-prod' flux/clusters/korczewski-prod/bootstrap/README.md   # Erwartung: >= 8
grep -c 'flux --context korczewski-prod' flux/clusters/korczewski-prod/bootstrap/README.md      # Erwartung: 2
grep -c 'shared-db.workspace-korczewski.svc.cluster.local:5432' flux/clusters/korczewski-prod/bootstrap/README.md   # Erwartung: 1
```

Commit: `feat(flux): add korczewski-prod flux island and tenant rbac`
