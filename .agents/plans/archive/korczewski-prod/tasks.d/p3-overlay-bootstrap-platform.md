# p3 — Cluster-Bootstrap und Platform-HelmReleases

## Task 1: ClusterIssuer letsencrypt-korczewski-prod

**Files:** `korczewski-prod/cluster-bootstrap/cluster-issuer.yaml`

Neue Datei mit genau einem Dokument: `cert-manager.io/v1` `ClusterIssuer`
`letsencrypt-korczewski-prod`, gebaut nach `dev-local/cluster/tls.yaml` und
`prod-fleet/platform/cluster-issuer.yaml`. `spec.acme.server` ist
`https://acme-v02.api.letsencrypt.org/directory`, `spec.acme.email` ist
`noreply-bachelorprojekt@mailbox.org` — derselbe Kontakt wie devmesh und die
fleet-Platform. Das Env-File aus p1 sieht kein eigenes E-Mail-Feld vor, deshalb
wird der bestehende Kontakt übernommen statt einen zweiten zu erfinden.
`spec.acme.privateKeySecretRef.name` ist `letsencrypt-korczewski-prod-key`. Der
eine Solver ist `dns01.webhook` mit `groupName: lego.dns-solver`,
`solverName: lego-solver`, `config.provider: ipv64` und
`config.env.IPV64_API_KEY.secretKeyRef` auf `name: ipv64-api-key`, `key: IPV64_API_KEY`
(Namespace `cert-manager` kommt aus dem SealedSecret in p1; der Issuer selbst ist
cluster-scoped und trägt kein `metadata.namespace`).

Kopfkommentar: der Issuer liegt im `bootstrap`-Pfad, weil er das erste
cluster-scoped Objekt ist, das die cert-manager-CRDs benutzt; dass diese CRDs beim
allerersten Sync existieren, sichert Vorbedingung 4 des Bootstrap-Runbooks
(cert-manager und lego-webhook vor dem Artefakt-Sync), nicht die `dependsOn`-Kette.

S1: reine YAML-Datei, in `docs/code-quality/gates.yaml` unter `s1.limits` nicht
gelistet und nicht baselined — kein Zeilenbudget für diesen Partial.

Verify: `yq -e '.kind == "ClusterIssuer" and .metadata.name == "letsencrypt-korczewski-prod" and .spec.acme.privateKeySecretRef.name == "letsencrypt-korczewski-prod-key" and .spec.acme.solvers[0].dns01.webhook.solverName == "lego-solver" and .spec.acme.solvers[0].dns01.webhook.config.provider == "ipv64" and .spec.acme.solvers[0].dns01.webhook.config.env.IPV64_API_KEY.secretKeyRef.name == "ipv64-api-key"' korczewski-prod/cluster-bootstrap/cluster-issuer.yaml`

## Task 2: Wildcard-Certificate und Traefik-Default-TLSStore

**Files:** `korczewski-prod/cluster-bootstrap/tls.yaml`

Zwei Dokumente, Muster `dev-local/cluster/tls.yaml`: `cert-manager.io/v1`
`Certificate` `korczewski-prod-wildcard-tls` in `metadata.namespace: kube-system`
mit `spec.secretName: korczewski-prod-wildcard-tls`,
`spec.issuerRef: {name: letsencrypt-korczewski-prod, kind: ClusterIssuer}` und
`spec.dnsNames: [korczewski.de, "*.korczewski.de"]`; danach `traefik.io/v1alpha1`
`TLSStore` `default` in `metadata.namespace: kube-system` mit
`spec.defaultCertificate.secretName: korczewski-prod-wildcard-tls`.

Die Domain steht hier literal, nicht als `${PROD_DOMAIN}` wie im devmesh-Overlay:
dieses Overlay trägt genau eine Brand, und der Renderer (p5) darf keine
Platzhalter offen lassen. Damit das nicht driftet, muss `PROD_DOMAIN` in
`environments/korczewski-prod.yaml` (p1) ebenfalls `korczewski.de` sein.

Kopfkommentar mit Design-Verweis D6: dieser `TLSStore default` ersetzt
`tls-sync`-CronJob und `reflector` aus dem fleet-Overlay
(`prod-fleet/korczewski-auth/patch-tls-reflect.yaml`). Es gibt keine
Secret-Kopie pro Namespace und damit auch keine ClusterRole, die clusterweit
`secrets` liest.

Verify: `[ "$(yq -N '.kind' korczewski-prod/cluster-bootstrap/tls.yaml | tr '\n' ' ')" = "Certificate TLSStore " ] && [ "$(yq ea 'select(.kind == "Certificate") | .metadata.namespace + "/" + .spec.secretName + "/" + .spec.issuerRef.name + "/" + (.spec.dnsNames | join(","))' korczewski-prod/cluster-bootstrap/tls.yaml)" = "kube-system/korczewski-prod-wildcard-tls/letsencrypt-korczewski-prod/korczewski.de,*.korczewski.de" ] && [ "$(yq ea 'select(.kind == "TLSStore") | .metadata.namespace + "/" + .metadata.name + "/" + .spec.defaultCertificate.secretName' korczewski-prod/cluster-bootstrap/tls.yaml)" = "kube-system/default/korczewski-prod-wildcard-tls" ]`

## Task 3: Bootstrap-RBAC mit resourceNames

**Files:** `korczewski-prod/cluster-bootstrap/rbac.yaml`

Drei `ClusterRole`/`ClusterRoleBinding`-Paare, jeweils gleicher Name, Subjekt
immer `ServiceAccount korczewski-prod-bootstrap` in `flux-system`. Das sind genau
die drei Namen, die `flux/clusters/korczewski-prod/tenant-rbac.yaml` (p2) dem
Bootstrap-ServiceAccount per `resourceNames` erlaubt; die Namen sind damit der
Vertrag zwischen p2 und diesem Task und dürfen nicht abweichen:

- `korczewski-prod-bootstrap-tls`: `cert-manager.io`/`clusterissuers` mit
  `resourceNames: [letsencrypt-korczewski-prod]` und `traefik.io`/`tlsstores` mit
  `resourceNames: [default]`, Verben `get,list,watch,create,patch,update`.
- `korczewski-prod-bootstrap-rbac`: `rbac.authorization.k8s.io`/`clusterroles`
  und `clusterrolebindings` mit `resourceNames` auf die drei Namen dieses Tasks,
  Verben `get,list,watch,create,patch,update,delete`.
- `korczewski-prod-bootstrap-crd`: `apiextensions.k8s.io`/`customresourcedefinitions`,
  nur `get,list,watch` und bewusst ohne `resourceNames` — CRD-Namen hängen an der
  Chart-Version; Schreibzugriff auf CRDs bleibt ausgeschlossen, deshalb ist der
  Lesezugriff auf alle CRDs keine Eskalation.

Kein `cluster-admin`, keine leeren oder pauschalen `resourceNames`, kein Subjekt
`korczewski-prod-tenant` oder `korczewski-prod-platform` (die bekommen laut Design
D2 ausschließlich namespaced `Role`/`RoleBinding`). Kopfkommentar: Kubernetes
verhindert RBAC-Eskalation, deshalb muss die Rolle im Bootstrap-Commit (p2)
dieselben Regeln bereits tragen; die Objekte hier sind die deklarative Zweitform,
damit ein Re-Bootstrap ohne Handarbeit grün wird.

Die namespaced Rechte für `Certificate` und das daraus entstehende `Secret` in
`kube-system` gehören nicht in diese Datei: der Bootstrap-ServiceAccount kann sich
seine eigenen Namensraum-Rechte nicht selbst geben. Sie stehen in
`flux/clusters/korczewski-prod/tenant-rbac.yaml` (p2) und sind Vorbedingung für
den ersten Sync dieses Pfads.

Verify: `[ "$(yq -N 'select(.kind | test("^ClusterRole")) | .metadata.name' korczewski-prod/cluster-bootstrap/rbac.yaml | sort -u | wc -l)" -eq 3 ] && [ "$(yq -N 'select(.kind == "ClusterRoleBinding") | .subjects[0].namespace + "/" + .subjects[0].name' korczewski-prod/cluster-bootstrap/rbac.yaml | sort -u)" = "flux-system/korczewski-prod-bootstrap" ] && [ "$(grep -c 'cluster-admin' korczewski-prod/cluster-bootstrap/rbac.yaml)" -eq 0 ]`

## Task 4: Kustomization des Bootstrap-Pfads

**Files:** `korczewski-prod/cluster-bootstrap/kustomization.yaml`

`kustomize.config.k8s.io/v1beta1` `Kustomization` mit `resources:
[cluster-issuer.yaml, tls.yaml, rbac.yaml]` in dieser Reihenfolge und ohne
`namespace:`-Feld. Begründung als Kommentar in der Datei: `ClusterIssuer`,
`ClusterRole` und `ClusterRoleBinding` sind cluster-scoped und dürfen keinen
Namespace-Transformer bekommen; `Certificate` und `TLSStore` tragen
`namespace: kube-system` explizit, ein Transformer würde `kube-system` auf den
Ziel-Namespace der Flux-Kustomization umschreiben und damit das Default-Zertifikat
verlieren.

Der Task schließt zugleich die S4-Orphan-Prüfung für die drei Dateien aus den
Tasks 1–3: jede ist ab jetzt genau einmal referenziert.

`kubeconform` ist im Repo kein CI-Gate (`grep -rn kubeconform .github/workflows/*.yml`
liefert keinen Treffer, `CONTRIBUTING.md` führt es als lokales Optional, und es lädt
seine Schemata aus dem Netz). Die Verifikation läuft deshalb offline über
`kustomize build` plus `yq`; `kubeconform -strict -ignore-missing-schemas` bleibt
der optionale Zusatzcheck aus der Design-Verifikation.

Verify: `[ "$(kustomize build korczewski-prod/cluster-bootstrap --load-restrictor=LoadRestrictionsNone | grep -c '^kind: ')" -eq 9 ] && [ "$(kustomize build korczewski-prod/cluster-bootstrap --load-restrictor=LoadRestrictionsNone | grep -c '^kind: ClusterRoleBinding')" -eq 3 ] && [ "$(kustomize build korczewski-prod/cluster-bootstrap --load-restrictor=LoadRestrictionsNone | grep -c '^  namespace: kube-system')" -eq 2 ]`

## Task 5: HelmRepositories für cert-manager und lego-webhook

**Files:** `korczewski-prod/platform/helm-repositories.yaml`

Zwei `source.toolkit.fluxcd.io/v1` `HelmRepository`, beide in
`metadata.namespace: flux-system` und mit `spec.interval: 1h`. Namen und Quellen
werden aus `dev-local/platform/helm-repositories.yaml` übernommen, nichts neu
erfunden: `jetstack` → `https://charts.jetstack.io` und
`cert-manager-lego-webhook` → `https://yxwuxuanl.github.io/cert-manager-lego-webhook/`.

Der Chart heißt `cert-manager-lego-webhook`; `lego.dns-solver` ist die
Solver-Gruppe, die der ClusterIssuer in Task 1 anspricht, kein Chart- und kein
Repository-Name. Kein `Namespace cert-manager`-Objekt in dieser Datei: der
`platform`-Pfad hat laut Design D1/D2 keine cluster-scoped Rechte, den Namespace
legt der Bootstrap-Commit. Der Grund für `flux-system` als Ablageort ist die
Cross-Namespace-`sourceRef` der HelmReleases (Tasks 6 und 7); deshalb braucht der
Platform-ServiceAccount laut Design zusätzlich Leserechte in `flux-system`.

Verify: `[ "$(yq -N '.metadata.namespace + "/" + .metadata.name + " " + .spec.url' korczewski-prod/platform/helm-repositories.yaml | sort | tr '\n' '|')" = "flux-system/cert-manager-lego-webhook https://yxwuxuanl.github.io/cert-manager-lego-webhook/|flux-system/jetstack https://charts.jetstack.io|" ]`

## Task 6: HelmRelease cert-manager

**Files:** `korczewski-prod/platform/cert-manager-helmrelease.yaml`

`helm.toolkit.fluxcd.io/v2` `HelmRelease` `cert-manager` in
`metadata.namespace: cert-manager`. Werte aus `dev-local/platform/cert-manager-helmrelease.yaml`:
`spec.interval: 1h`, `spec.chart.spec.chart: cert-manager`,
`spec.chart.spec.version: 1.21.2`, `sourceRef: {kind: HelmRepository, name: jetstack,
namespace: flux-system}`, `spec.targetNamespace: cert-manager`,
`spec.serviceAccountName: korczewski-prod-platform`, `install.crds: CreateReplace`
und `upgrade.crds: CreateReplace`.

Abweichend vom Vorbild, weil das Vorbild noch das alte Remediation-Feld nutzt:
`install.strategy.name: RetryOnFailure` und `upgrade.strategy.name: RetryOnFailure`
statt `install.remediation.retries`/`upgrade.remediation.retries`, dazu
`driftDetection.mode: enabled` (Schema-Default ist `disabled`, ohne das Feld
korrigiert Flux keine Handänderung) und `timeout: 5m` als explizit ausgeschriebener
Flux-Default. `RetryOnFailure` ist auch der Grund, warum der Pfad eine bereits
extern installierte, gleichnamige Release aus Vorbedingung 4 übernehmen kann,
statt beim ersten Fehlversuch stehen zu bleiben.

`spec.values` bleibt wie im Vorbild: `crds.enabled: true` und
`podDnsPolicy: Default`.

Verify: `yq -e '.kind == "HelmRelease" and .metadata.namespace == "cert-manager" and .spec.targetNamespace == "cert-manager" and .spec.serviceAccountName == "korczewski-prod-platform" and .spec.chart.spec.version == "1.21.2" and .spec.chart.spec.sourceRef.namespace == "flux-system" and .spec.install.strategy.name == "RetryOnFailure" and .spec.upgrade.strategy.name == "RetryOnFailure" and .spec.driftDetection.mode == "enabled" and .spec.install.remediation == null' korczewski-prod/platform/cert-manager-helmrelease.yaml`

## Task 7: HelmRelease cert-manager-lego-webhook

**Files:** `korczewski-prod/platform/lego-webhook-helmrelease.yaml`

`helm.toolkit.fluxcd.io/v2` `HelmRelease` `cert-manager-lego-webhook` in
`metadata.namespace: cert-manager`, Chart `cert-manager-lego-webhook` in Version
`1.6.2` aus dem HelmRepository `cert-manager-lego-webhook` in `flux-system`
(Werte aus `dev-local/platform/lego-webhook-helmrelease.yaml`). Dazu
`spec.targetNamespace: cert-manager`, `spec.serviceAccountName: korczewski-prod-platform`,
`install.crds: CreateReplace`, `upgrade.crds: CreateReplace`,
`install.strategy.name: RetryOnFailure`, `upgrade.strategy.name: RetryOnFailure`,
`driftDetection.mode: enabled`, `timeout: 5m`.

Zwei Dinge werden bewusst mitgenommen, weil sie im Vorbild wirklich stehen:
`spec.values.certManager` mit `namespace: cert-manager` und
`serviceAccountName: cert-manager`, sowie `spec.valuesFrom` auf das Secret
`ipv64-api-key` mit `valuesKey: IPV64_API_KEY`, `targetPath: webhook.envs.IPV64_API_KEY`
und `optional: false`. Die Secret-Referenz im ClusterIssuer (Task 1) deckt nur den
ACME-Solver ab; der Webhook-Pod braucht den Schlüssel zusätzlich als Umgebungsvariable.
Ohne diese zweite Referenz bliebe der DNS-01-Solver ohne Provider-Zugang. Das Secret
selbst kommt aus dem SealedSecret in p1, nicht aus diesem Task.

Verify: `yq -e '.kind == "HelmRelease" and .metadata.namespace == "cert-manager" and .spec.targetNamespace == "cert-manager" and .spec.chart.spec.chart == "cert-manager-lego-webhook" and .spec.chart.spec.version == "1.6.2" and .spec.chart.spec.sourceRef.namespace == "flux-system" and .spec.install.strategy.name == "RetryOnFailure" and .spec.upgrade.strategy.name == "RetryOnFailure" and .spec.driftDetection.mode == "enabled" and .spec.valuesFrom[0].name == "ipv64-api-key" and .spec.valuesFrom[0].targetPath == "webhook.envs.IPV64_API_KEY" and .spec.valuesFrom[0].optional == false' korczewski-prod/platform/lego-webhook-helmrelease.yaml`

## Task 8: Kustomization des Platform-Pfads

**Files:** `korczewski-prod/platform/kustomization.yaml`

`kustomize.config.k8s.io/v1beta1` `Kustomization` mit `resources:
[helm-repositories.yaml, cert-manager-helmrelease.yaml, lego-webhook-helmrelease.yaml]`
und ohne `namespace:`-Feld. Begründung als Kommentar: die Objekte dieses Pfads
liegen in zwei verschiedenen Namespaces — die HelmRepositories in `flux-system`,
die HelmReleases in `cert-manager` —, ein Namespace-Transformer würde beide
Gruppen auf denselben Wert ziehen und die Cross-Namespace-`sourceRef` brechen.
Jedes Manifest trägt seinen Namespace explizit.

Damit ist auch die S4-Orphan-Prüfung für die Dateien aus Task 5–7 geschlossen, und
der Pfad ist als Ganzes baubar. Zusammen mit Task 4 ergibt das den vollständigen
Satz der acht in p3 verantworteten Dateien.

Verify: `[ "$(kustomize build korczewski-prod/platform --load-restrictor=LoadRestrictionsNone | grep -c '^kind: HelmRelease')" -eq 2 ] && [ "$(kustomize build korczewski-prod/platform --load-restrictor=LoadRestrictionsNone | grep -c '^kind: HelmRepository')" -eq 2 ] && [ "$(kustomize build korczewski-prod/platform --load-restrictor=LoadRestrictionsNone | grep -c '^kind: Namespace')" -eq 0 ]`

Commit: `feat(infra): Bootstrap-Issuer, Wildcard-TLS und Platform-HelmReleases`
