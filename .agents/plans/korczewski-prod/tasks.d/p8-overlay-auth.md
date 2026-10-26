# p8 — Auth-Overlay

Dieser Partial baut den Auth-Teilbaum von `korczewski-prod/`: Pocket ID im Namespace
`workspace-korczewski`, direkt aus der `k3d/`-SSOT (D4). Der Website-Teilbaum liegt in
`p4-overlay-website.md`; beide Partials hängen an derselben Basis-Kette, teilen sich aber keine
Datei.

Alle `Verify`-Kommandos laufen im Repo-Root des Worktrees.
`--load-restrictor=LoadRestrictionsNone` ist Pflicht, weil `korczewski-prod/auth` über
`../../k3d/pocket-id*.yaml` aus dem Basis-Baum lädt (ADR-015-Muster).

## Task 1: Namespace `workspace-korczewski`

**Files:** `korczewski-prod/auth/namespace.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: workspace-korczewski
  labels:
    app.kubernetes.io/part-of: workspace-mvp
    pod-security.kubernetes.io/enforce: baseline
    pod-security.kubernetes.io/warn: restricted
```

Das Manifest ist explizit, weil SealedSecrets keinen Namespace erzeugen — der Audit-Befund C3
bestand genau darin, dass vier SealedSecrets für drei nicht existierende Namespaces ausgeliefert
wurden. p7 pinnt die Parität von erzeugten Namespaces und SealedSecret-Namespaces; dieser
Namespace ist die Auth-Seite dieser Gleichung, `website-korczewski` kommt aus der Website-Basis
(p4). Labels und PSS-Stufen sind aus `prod-fleet/korczewski-auth/namespace.yaml` übernommen
(`enforce: baseline`, `warn: restricted`), nicht neu gewählt.

Verify: `yq -e '.kind == "Namespace" and .metadata.name == "workspace-korczewski" and .metadata.labels."app.kubernetes.io/part-of" == "workspace-mvp" and .metadata.labels."pod-security.kubernetes.io/enforce" == "baseline" and .metadata.labels."pod-security.kubernetes.io/warn" == "restricted"' korczewski-prod/auth/namespace.yaml`

## Task 2: Pocket-ID-Deployment-Patch (Dev-Toleration entfernen)

**Files:** `korczewski-prod/auth/patch-pocket-id.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pocket-id
spec:
  template:
    spec:
      # k3d-Basis toleriert den Taint role=dev:NoSchedule (Notbremse fuer das
      # local-path-PVC auf dem Dev-Node). Auf dem Prod-Cluster gibt es diesen
      # Taint nicht; null entfernt die Toleranz.
      tolerations: null
```

`k3d/pocket-id.yaml:199-212` dokumentiert die Toleranz selbst als Notbremse: das PVC
`pocket-id-data` lag als `local-path`-Volume an einen als `dev` deklarierten Node gebunden, und
ohne die Toleranz blieb der Pod nach dem Taint dauerhaft `Pending`. Genau diese Bindung löst
Task 3 (StorageClass `longhorn`); die Toleranz wäre danach eine Aussage über einen Taint, den der
Ziel-Cluster nicht hat. `tolerations: null` entfernt das Feld im Strategic Merge.

Bewusst nicht enthalten: ein `nodeSelector` oder `affinity`-Block. Belegt ist nur die
StorageClass-Vorbedingung (Design §9.2) und die damit entfallende Node-Bindung; ein Node-Label zu
erfinden, das der Bootstrap nicht setzt, wäre eine stille Annahme. Die Secret-Referenzen
(`workspace-secrets`) und der Rest des Pod-Templates bleiben unverändert.

Verify: `yq -e '.kind == "Deployment" and .metadata.name == "pocket-id" and .spec.template.spec.tolerations == null and (.spec.template.spec | has("nodeSelector") | not) and (.spec.template.spec | has("affinity") | not)' korczewski-prod/auth/patch-pocket-id.yaml`

## Task 3: Auth-Kustomization (k3d-Basis, Longhorn, websecure)

**Files:** `korczewski-prod/auth/kustomization.yaml`

```yaml
# korczewski-prod: Auth-Teilbaum (Pocket ID, Namespace workspace-korczewski).
#
# Basis sind die k3d-SSOT-Manifeste; prod/wildcard-certificate.yaml und
# prod/reflector.yaml bleiben draussen (Design §5, D6) — TLS kommt aus dem
# Traefik-Default-TLSStore in kube-system.
#
# k3d/pocket-id-client-seed-website-rbac.yaml wird hier bewusst NICHT
# referenziert: der Namespace-Transformer wuerde Role/RoleBinding in
# workspace-korczewski ablegen (kustomize v5.8.1), wo sie niemandem helfen.
# Die website-seitige Kopie liefert prod-fleet/website-korczewski.
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: workspace-korczewski
resources:
  - ../../k3d/pocket-id.yaml
  - ../../k3d/pocket-id-db-init-sql.yaml
  - ../../k3d/pocket-id-client-seed.yaml
  - ../../k3d/pocket-id-client-seed-rbac.yaml
  - namespace.yaml
configMapGenerator:
  - name: domain-config
    options:
      disableNameSuffixHash: true
    literals:
      - POCKET_ID_DOMAIN=${POCKET_ID_DOMAIN}
patches:
  - target:
      kind: Deployment
      name: pocket-id
    path: patch-pocket-id.yaml
  # Vorbedingung 2 des Bootstrap-Runbooks: longhorn statt local-path.
  - target:
      kind: PersistentVolumeClaim
      name: pocket-id-data
    patch: |-
      apiVersion: v1
      kind: PersistentVolumeClaim
      metadata:
        name: pocket-id-data
      spec:
        storageClassName: longhorn
  # Kein Secret-Name: der Traefik-Default-TLSStore deckt auth.${POCKET_ID_DOMAIN} ab.
  - target:
      kind: IngressRoute
      name: pocket-id
    patch: |-
      - op: replace
        path: /spec/entryPoints
        value: [websecure]
      - op: add
        path: /spec/tls
        value: {}
```

Begründungen und Abgrenzungen:

- **Fünf Basis-Dateien, keine Kopie.** `k3d/pocket-id.yaml` liefert Job `pocket-id-db-init`,
  `Deployment pocket-id`, `PersistentVolumeClaim pocket-id-data`, `Service pocket-id` und
  `IngressRoute pocket-id`; `k3d/pocket-id-db-init-sql.yaml` die SQL-ConfigMap;
  `k3d/pocket-id-client-seed.yaml` und `k3d/pocket-id-client-seed-rbac.yaml` den Seed-Job samt
  ServiceAccount/Role/RoleBinding.
- **Keine `prod/`-Basis (D6).** `prod-fleet/korczewski-auth/kustomization.yaml` zieht
  `../../prod/wildcard-certificate.yaml` und `../../prod/reflector.yaml` mit. Beides entfällt:
  das Wildcard liegt als `TLSStore default` in `kube-system` (p3), es gibt keine Secret-Kopie pro
  Namespace und damit auch keinen `reflector`-Controller.
- **`pocket-id-db-init` bleibt.** Das fleet-Overlay löscht den Job (`$patch: delete` auf
  `Job/pocket-id-db-init`), weil dort p1 die Rollen zentral verwaltet. Design §6 sagt für diesen
  Pfad das Gegenteil: Pocket ID initialisiert seine Rolle selbst, der Job gehört zum Auth-Pfad.
  Der Job arbeitet gegen `shared-db` im selben Namespace — das passt zu Vorbedingung 6
  (`shared-db.workspace-korczewski.svc.cluster.local:5432`), ohne dass ein Hostname gepatcht
  werden muss.
- **`pocket-id-client-seed-website-rbac.yaml` bewusst nicht referenziert.** Die Datei sagt selbst,
  dass sie per `envsubst` außerhalb von kustomize appliziert wird, „so kustomize's namespace
  transformer doesn't force it into the workspace ns". `prod-fleet/website-korczewski` liefert
  die konkrete Kopie (`Role`/`RoleBinding` in `website-korczewski`, Subjekt
  `workspace-korczewski/pocket-id-client-seed`) bereits mit — p4 Task 3 zeigt, dass das Subjekt
  beim Bauen erhalten bleibt. Ein zweiter Eintrag hier würde dieselben Objektnamen ein zweites Mal
  ins Artefakt legen und die Rolle in `workspace-korczewski` platzieren, wo sie nichts berechtigt.
- **`domain-config` als Generator.** `k3d/pocket-id.yaml` liest `POCKET_ID_DOMAIN` per
  `configMapKeyRef` aus `domain-config`. Der Generator liefert genau diesen Schlüssel;
  `disableNameSuffixHash: true` hält den Namen stabil, weil die Referenz ihn namentlich nennt.
  Das Muster stammt aus `prod-fleet/korczewski-auth/kustomization.yaml`.
- **PVC auf `longhorn`.** Die k3d-Basis nutzt `local-path` (Single-Node-Dev). Vorbedingung 2 des
  Bootstrap-Runbooks fordert eine echte StorageClass für `pocket-id-data`; `longhorn` ist die im
  Design genannte. Ohne den Patch bliebe das PVC an eine Klasse gebunden, die der Ziel-Cluster
  nicht hat — der Pod wäre dauerhaft `Pending`.
- **IngressRoute auf `websecure` mit `tls: {}`.** Der Dev-Router hört auf `web` ohne TLS
  (`k3d/pocket-id.yaml:392-411`). `tls: {}` aktiviert TLS ohne Secret-Namen, also mit dem
  Default-Zertifikat; der Host bleibt `Host('${POCKET_ID_DOMAIN}')` aus der Basis. `POCKET_ID_DOMAIN`
  muss in `environments/korczewski-prod.yaml` (p1) `auth.korczewski.de` sein (Design §7), passend
  zu `POCKET_ID_FRONTEND_URL: https://auth.korczewski.de`.
- **Kein `WEBSITE_EXTRA_CALLBACK`-Patch.** `dev-local/core/kustomization.yaml:94-97` setzt die
  Variable, weil der Dev-Pfad aus `http://auth.localhost` den Callback
  `http://web.localhost/api/auth/callback` ableitet und die https-Variante ergänzt. Hier leitet
  der Seed aus `https://auth.korczewski.de` bereits exakt
  `https://web.korczewski.de/api/auth/callback` ab (`k3d/pocket-id-client-seed.yaml:180-186`) —
  ein zusätzlicher Eintrag wäre derselbe Wert ein zweites Mal in `callbackURLs`.
- **`namespace: workspace-korczewski`.** `k3d/pocket-id-client-seed-rbac.yaml` trägt
  `namespace: workspace` in `metadata.namespace` und im Subjekt. Der Transformer zieht beides auf
  den Ziel-Namespace um (experimentell geprüft: gebaut steht `workspace-korczewski` in Role,
  RoleBinding und Subjekt), deshalb genügt die Referenz ohne eigenen Patch.

Offener Punkt, außerhalb von p8: `k3d/pocket-id.yaml` bringt keine NetworkPolicy mit, der
Namespace `workspace-korczewski` hat also (anders als `website-korczewski`) kein Default-Deny. Das
ist eine Folgeänderung (eigene Policies plus Freigabe des Website-Egress), keine Lücke dieses
Teilbaums.

Verify: `A=$(kustomize build korczewski-prod/auth --load-restrictor=LoadRestrictionsNone) && [ "$(grep -c '^kind: ConfigMap' <<<"$A")" -eq 2 ] && [ "$(grep -c '^kind: Job' <<<"$A")" -eq 2 ] && [ "$(yq -N 'select(.kind != "Namespace") | .metadata.namespace' <<<"$A" | sort -u)" = "workspace-korczewski" ] && [ "$(yq -N 'select(.kind == "PersistentVolumeClaim") | .spec.storageClassName' <<<"$A")" = "longhorn" ] && [ "$(yq -N 'select(.kind == "IngressRoute") | .spec.entryPoints | join(",")' <<<"$A")" = "websecure" ] && [ "$(yq -N 'select(.kind == "Deployment") | .spec.template.spec.tolerations' <<<"$A")" = "null" ] && [ "$(grep -c 'local-path' <<<"$A")" -eq 0 ] && [ "$(yq -N 'select(.metadata.name == "domain-config") | .data.POCKET_ID_DOMAIN' <<<"$A")" = '${POCKET_ID_DOMAIN}' ]`

## Task 4: Auth-Invarianten und Commit

**Files:** `korczewski-prod/auth/kustomization.yaml`, `korczewski-prod/auth/namespace.yaml`, `korczewski-prod/auth/patch-pocket-id.yaml`

Der Abschluss prüft die Invarianten des Auth-Baums als Ganzes und setzt den Commit.

```bash
A=$(kustomize build korczewski-prod/auth --load-restrictor=LoadRestrictionsNone)
```

Erwartung und Begründung:

- **Kein Secret-Name, kein `:latest`, keine `prod/`-Referenz.** D6 (Default-TLSStore) und D7
  (Digest) gelten für beide Teilbäume; `k3d/pocket-id.yaml` pinnt seine Images bereits mit
  `@sha256:`, der Guard aus p5 prüft es im Gesamtbaum.
- **Genau ein Namespace im Auth-Baum.** `workspace-korczewski` (Task 1) — zusammen mit
  `website-korczewski` aus p4 sind es die zwei Namespaces, gegen die p7 die
  SealedSecret-Namespaces prüft (C3).
- **Keine cluster-scoped Ressource.** Der Auth-Baum enthält nur `Namespace`, `ConfigMap`, `Job`,
  `Deployment`, `Service`, `PersistentVolumeClaim`, `IngressRoute`, `ServiceAccount`, `Role`,
  `RoleBinding` (Design §10, `test_cluster_scoped_only_in_bootstrap`).
- **Alle Objekte außer dem Namespace liegen in `workspace-korczewski`.** Das ist die prüfbare
  Form von D2 (namespaced RBAC) und die Voraussetzung dafür, dass die Flux-Kustomization
  `korczewski-prod-apps` mit der eng gefassten Tenant-Rolle auskommt.

Nicht Teil dieses Tasks: `bash scripts/korczewski-prod/render-stack.sh` (p5) — der Renderer
braucht `environments/korczewski-prod.yaml` (p1) und baut auf den hier erzeugten Bäumen auf.

Aus p4 geerbte Cluster-Vorbedingung, die auch diesen Baum trägt: der Traefik-Redirect
`ports.web.redirectTo=websecure`. Der Auth-Router hängt wie die Website-Router nur an `websecure`;
ohne den Redirect ist `http://auth.korczewski.de` nicht erreichbar statt umgeleitet.

Verify: `A=$(kustomize build korczewski-prod/auth --load-restrictor=LoadRestrictionsNone) && [ "$(grep -c 'secretName' <<<"$A")" -eq 0 ] && [ "$(grep -c ':latest' <<<"$A")" -eq 0 ] && ! grep -rqE '^[[:space:]]*-[[:space:]]+\.\./\.\./prod/' korczewski-prod/auth/kustomization.yaml && [ "$(grep -c '^kind: Namespace' <<<"$A")" -eq 1 ] && [ "$(yq -N 'select(.kind == "Namespace") | .metadata.name' <<<"$A")" = "workspace-korczewski" ] && [ "$(yq -N 'select(.kind | IN("ClusterRole","ClusterRoleBinding","ClusterIssuer","TLSStore","CustomResourceDefinition")) | .kind' <<<"$A" | wc -l)" -eq 0 ] && [ "$(grep -c '^kind: ' <<<"$A")" -ge 8 ]`

Commit: `feat(infra): Auth-Overlay für den Prod-Cluster anlegen`
