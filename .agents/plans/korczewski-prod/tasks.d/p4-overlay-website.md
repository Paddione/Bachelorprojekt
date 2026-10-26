# p4 — Website-Overlay

Dieser Partial baut den Website-Teilbaum von `korczewski-prod/`. Er referenziert die bestehende
Basis (D4) und patcht nur, was für den Prod-Cluster abweicht. Der Auth-Teilbaum liegt in
`p8-overlay-auth.md`; beide Partials hängen an derselben Basis-Kette, teilen sich aber keine Datei.

Alle `Verify`-Kommandos laufen im Repo-Root des Worktrees.
`--load-restrictor=LoadRestrictionsNone` ist Pflicht, weil die Website-Basis nach ADR-015
`../../k3d/website*.yaml` referenziert.

## Task 1: Website-Deployment-Patch (Digest-Image und DB-Secret-Key)

**Files:** `korczewski-prod/website/website-patch.yaml`

Neue Datei, per Strategic Merge am `Deployment website` aus `prod-fleet/website-korczewski`
befestigt. Die Basis selbst bleibt unangetastet (D4).

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: website
spec:
  template:
    spec:
      containers:
        - name: website
          image: ghcr.io/paddione/website@${WEBSITE_IMAGE_DIGEST}
          env:
            - name: WEBSITE_NAMESPACE
              value: ${WEBSITE_NAMESPACE}
            - name: WEBSITE_HOST
              value: ${WEBSITE_HOST}
            - name: BRAND_ID
              value: massage
```

Begründungen:

- **`image` mit `@${WEBSITE_IMAGE_DIGEST}` statt `:${WEBSITE_IMAGE_TAG}`.** `k3d/website.yaml`
  rendert `ghcr.io/paddione/${WEBSITE_IMAGE}:${WEBSITE_IMAGE_TAG}`, also `latest` oder Build-SHA —
  mutabel. Design D7 verlangt Digest-Pinning für jeden Prod-Pfad; `WEBSITE_IMAGE_DIGEST` ist der
  einzige Ort, an dem der Digest gepflegt wird.
- **`WEBSITE_NAMESPACE` als Name, nicht als Literal.** Der Strategic-Merge-Key ist `name`; der
  Wert bleibt `${WEBSITE_NAMESPACE}` und wird vom Renderer (p5) gesetzt, genau wie in der Basis.
- **`BRAND_ID: massage`.** `environments/korczewski.yaml` fährt für die Massagepraxis
  `BRAND_ID: massage`; der Prod-Slot ist dieselbe Marke, nicht `korczewski`.
- **Nur drei Env-Einträge.** Weitere Variablen (`WEBSITE_DB_*`, `POCKET_ID_*`) kommen bereits aus
  `k3d/website.yaml` bzw. `website-seller-config.yaml`; sie hier zu wiederholen, würde bei
  abweichendem Env-Wert zwei Wahrheiten erzeugen.

S1: die Datei ist eine reine Patch-Datei ohne Logik; `.yaml` ist S1-ungated.

Verify: `yq -e '.kind == "Deployment" and .metadata.name == "website" and (.spec.template.spec.containers[0].image | test("^ghcr\\.io/paddione/website@\\$\\{WEBSITE_IMAGE_DIGEST\\}$")) and .spec.template.spec.containers[0].env[2].value == "massage"' korczewski-prod/website/website-patch.yaml`

## Task 2: Website-Ingress für `web.${PROD_DOMAIN}`

**Files:** `korczewski-prod/website/ingress.yaml`

Zwei `Ingress`-Objekte, beide `ingressClassName: traefik`, beide nur auf dem EntryPoint `websecure`
und ohne TLS-Secret-Namen (das Zertifikat liefert der `TLSStore default` aus
`korczewski-prod/cluster-bootstrap/tls.yaml`, p3).

```yaml
# Zwei Ingress-Objekte fuer den Website-Host: / und /_astro/.
# Der Apex-Host ${PROD_DOMAIN} kommt aus der Basis (website-apex.yaml) und wird
# dort gepatcht, nicht hier dupliziert.
# Hosts kommen aus ${PROD_DOMAIN}, damit Ingress-Rule, TLS-Hosts und der
# Apex-Redirect der Basis nicht auseinanderlaufen (WEBSITE_HOST in der
# Env-Datei muss web.${PROD_DOMAIN} entsprechen).
# Kein TLS-Secret-Name: das Zertifikat liefert der Traefik-Default-TLSStore.
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: website-prod
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
    traefik.ingress.kubernetes.io/router.middlewares: >-
      website-korczewski-website-compress@kubernetescrd,website-korczewski-website-security-headers@kubernetescrd
spec:
  ingressClassName: traefik
  tls:
    - hosts:
        - web.${PROD_DOMAIN}
  rules:
    - host: web.${PROD_DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: website
                port:
                  number: 80
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: website-prod-astro
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
    traefik.ingress.kubernetes.io/router.middlewares: >-
      website-korczewski-website-compress@kubernetescrd,website-korczewski-website-static-cache@kubernetescrd
spec:
  ingressClassName: traefik
  tls:
    - hosts:
        - web.${PROD_DOMAIN}
  rules:
    - host: web.${PROD_DOMAIN}
      http:
        paths:
          - path: /_astro/
            pathType: Prefix
            backend:
              service:
                name: website
                port:
                  number: 80
```

Begründungen:

- **Zwei Objekte, nicht eines.** Die Middleware-Kette hängt als Annotation am Router, also am
  ganzen Ingress. `/_astro/` braucht `website-static-cache` (ein Jahr immutable), der Rest
  `website-security-headers`. Ein Objekt mit beiden Pfaden könnte nur eine der beiden Ketten
  tragen. Die Aufteilung spiegelt die gelöschten `website-ingress-web`/`website-ingress-astro`
  aus `prod-fleet/website-korczewski` und die Routen der `IngressRoute website` (dort
  `/_astro/` = compress + static-cache, alles andere = compress).
- **Middleware-Namen mit Namespace-Präfix.** `allowCrossNamespace` ist im Brand-Overlay
  abgeschaltet (Kommentar in `website-security-headers.yaml`), die Middlewares liegen deshalb in
  `website-korczewski`. Der Traefik-Verweis lautet `<namespace>-<name>@kubernetescrd`; die
  Objekte selbst kommen unverändert aus der Basis.
- **Kein Apex hier.** `prod-fleet/website-korczewski/website-apex.yaml` liefert bereits Middleware
  `website-redirect-apex-to-web` plus `Ingress website-ingress-apex`. Er wird in Task 3 gepatcht,
  nicht dupliziert — zwei Ingresses auf denselben Host würden konkurrierende Router erzeugen.
- **Hosts als `${PROD_DOMAIN}`.** Die Basis schreibt den Host der IngressRoute als
  `Host('${WEBSITE_HOST}')` und den Apex als `${PROD_DOMAIN}`. Ein Literal hier würde bei
  abweichendem Env-Wert eine Rule auf einen anderen Host legen als das TLS-`hosts`-Feld im
  selben Objekt. Deshalb Variablen in beiden Feldern und die Vertragsnotiz an p1:
  `WEBSITE_HOST` muss `web.${PROD_DOMAIN}` sein, `PROD_DOMAIN` = `korczewski.de`.
- **Kein `secretName`.** Ohne Secret-Referenz nimmt Traefik das Default-Zertifikat aus dem
  `TLSStore` in `kube-system`. Genau das ersetzt die `korczewski-tls`-Kopien des fleet-Overlays
  (D6).

S4: die Datei ist über `ingress.yaml` in `korczewski-prod/website/kustomization.yaml` (Task 3)
genau einmal referenziert.

Verify: `[ "$(yq -N '.kind' korczewski-prod/website/ingress.yaml | tr '\n' ' ')" = "Ingress Ingress " ] && [ "$(yq -N '.metadata.name + "|" + .spec.rules[0].host + "|" + .spec.rules[0].http.paths[0].path + "|" + .spec.rules[0].http.paths[0].backend.service.name + "|" + .spec.tls[0].hosts[0] + "|" + .metadata.annotations."traefik.ingress.kubernetes.io/router.entrypoints"' korczewski-prod/website/ingress.yaml | sort | tr '\n' ' ')" = 'website-prod-astro|web.${PROD_DOMAIN}|/_astro/|website|web.${PROD_DOMAIN}|websecure website-prod|web.${PROD_DOMAIN}|/|website|web.${PROD_DOMAIN}|websecure ' ] && [ "$(yq -N 'select(.spec.tls[0] | has("secretName")) | .metadata.name' korczewski-prod/website/ingress.yaml | wc -l)" -eq 0 ]`

## Task 3: Website-Kustomization (Basis-Referenz, Löschungen, Apex-Patch)

**Files:** `korczewski-prod/website/kustomization.yaml`

```yaml
# korczewski-prod: Website-Teilbaum (Namespace website-korczewski).
#
# Basis ist das bestehende Brand-Overlay prod-fleet/website-korczewski, das
# seinerseits ../../k3d/website.yaml + ../../k3d/website-seller-config.yaml als
# SSOT referenziert (ADR-015). Plain `kustomize build` scheitert dadurch
# gewollt; jedes Verify in diesem Partial braucht --load-restrictor=LoadRestrictionsNone.
#
# D6: kein ../../prod/wildcard-certificate.yaml und kein ../../prod/reflector.yaml.
# TLS kommt aus dem Traefik-Default-TLSStore in kube-system (cluster-bootstrap).
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: website-korczewski
resources:
  - ../../prod-fleet/website-korczewski
  - ingress.yaml
patches:
  # Eine Routing-Ebene statt zwei: das Ingress gewinnt gegen die IngressRoute
  # (T000251), in prod bleibt nur die Ingress-Ebene.
  - target:
      kind: IngressRoute
      name: website
    patch: |-
      $patch: delete
      apiVersion: traefik.io/v1alpha1
      kind: IngressRoute
      metadata:
        name: website
  - target:
      kind: Ingress
      name: website-ingress-web
    patch: |-
      $patch: delete
      apiVersion: networking.k8s.io/v1
      kind: Ingress
      metadata:
        name: website-ingress-web
  - target:
      kind: Ingress
      name: website-ingress-astro
    patch: |-
      $patch: delete
      apiVersion: networking.k8s.io/v1
      kind: Ingress
      metadata:
        name: website-ingress-astro
  # Cluster-scoped Objekte ausschliesslich im Bootstrap-Pfad (Design §10).
  # Form bewusst ohne target: der Name enthaelt ${WEBSITE_NAMESPACE}; kustomize
  # matcht target.name als verankerten Regex, und das "$" darin trifft nie.
  - patch: |-
      $patch: delete
      apiVersion: rbac.authorization.k8s.io/v1
      kind: ClusterRole
      metadata:
        name: ${WEBSITE_NAMESPACE}-monitoring-reader
  - patch: |-
      $patch: delete
      apiVersion: rbac.authorization.k8s.io/v1
      kind: ClusterRoleBinding
      metadata:
        name: ${WEBSITE_NAMESPACE}-monitoring-reader
  # Apex-Ingress aus der Basis: websecure + Default-TLSStore (kein Secret-Name).
  # spec.tls hat keinen merge key, der Patch ersetzt die Liste — damit faellt
  # secretName: ${TLS_SECRET_NAME} weg.
  - target:
      kind: Ingress
      name: website-ingress-apex
    patch: |-
      apiVersion: networking.k8s.io/v1
      kind: Ingress
      metadata:
        name: website-ingress-apex
        annotations:
          traefik.ingress.kubernetes.io/router.entrypoints: websecure
      spec:
        tls:
          - hosts:
              - ${PROD_DOMAIN}
  - target:
      kind: Deployment
      name: website
    path: website-patch.yaml
```

Warum diese sieben Eingriffe:

- **Basis statt Kopie (D4/ADR-015).** `prod-fleet/website-korczewski` referenziert
  `../../k3d/website.yaml`, `../../k3d/website-seller-config.yaml`,
  `../website-common/domain-config.yaml`, `website-security-headers.yaml`,
  `pocket-id-client-seed-website-rbac.yaml`, `website-ingress-web.yaml` und `website-apex.yaml`.
  Ein einfaches `kustomize build korczewski-prod/website` scheitert deshalb gewollt; der
  Renderer lädt die Basis mit `LoadRestrictionsNone` (Belegstellen:
  `.github/workflows/build-website.yml:227`, `scripts/flux-render-artifact.sh:116`,
  `scripts/devmesh/render-stack.sh:83`, `scripts/pre-deploy-checks-lib.sh:252`).
- **`IngressRoute website` löschen.** Der Kommentar in der Basis (T000251) hält fest, dass das
  Ingress das Routing gegen die IngressRoute gewinnt. Prod behält genau eine Ebene: zwei Router
  auf demselben Host mit unterschiedlichen Mittelwaren wären ein Rate-Spiel. Die Middlewares
  selbst (`website-compress`, `website-static-cache`, `website-security-headers`) bleiben
  Objekte der Basis und werden von `ingress.yaml` und dem Apex weiter benutzt.
- **`website-ingress-web`/`website-ingress-astro` löschen.** Sie tragen `web,websecure` und
  `secretName: korczewski-tls` — beides gilt hier nicht mehr. `ingress.yaml` (Task 2) ersetzt sie
  funktional, inklusive der `/_astro/`-Kette.
- **`ClusterRole`/`ClusterRoleBinding ${WEBSITE_NAMESPACE}-monitoring-reader` löschen.** Die
  Basis liefert beide cluster-scoped mit. Design §10 verlangt, dass `ClusterRole` und
  `ClusterRoleBinding` ausschließlich unter `cluster-bootstrap/` liegen; Q1 schließt Monitoring
  aus. Zusätzlich bliebe der Platzhalter `${WEBSITE_NAMESPACE}` im gerenderten Namen stehen und
  würde das Fail-closed-Gate des Renderers (`\${`-Reste) auslösen. Die Patches stehen bewusst
  ohne `target:`-Block: `target.name` wird als verankerter Regex ausgewertet, das `$` in
  `${WEBSITE_NAMESPACE}` trifft dort nie (mit `\$\{…\}` maskiert greift der Patch — experimentell
  geprüft). Ohne `target:` matcht kustomize über den Namen im Patch selbst; das ist dieselbe Form
  wie die `tls-sync`-Löschungen in `prod-fleet/korczewski-auth/kustomization.yaml`. Nebeneffekt:
  verschwindet das Objekt aus der Basis, bricht der Build laut statt still.
- **Apex-Ingress patchen.** `website-apex.yaml` trägt `web,websecure` und
  `secretName: ${TLS_SECRET_NAME}`. Der Patch setzt `websecure` und ersetzt `spec.tls` durch
  `hosts: [${PROD_DOMAIN}]`. `spec.tls` ist eine Liste ohne Merge-Key, Strategic Merge ersetzt
  sie vollständig — der Secret-Name verschwindet, ohne dass ein `$patch: replace` nötig wäre.
  Das TLS-`hosts`-Feld folgt `${PROD_DOMAIN}` wie die Rule im selben Objekt.
- **`Deployment`-Patch.** Zeigt auf `website-patch.yaml` aus Task 1.
- **`namespace: website-korczewski`.** Notwendig, weil die Basis-Manifeste teils ohne
  `metadata.namespace` kommen (`k3d/website.yaml` nutzt `${WEBSITE_NAMESPACE}`). Der
  `Namespace website-korczewski` selbst kommt aus `k3d/website.yaml:1-…` und bleibt im Artefakt —
  p7 prüft die Parität von erzeugten Namespaces und SealedSecret-Namespaces (C3).

Zwei Beobachtungen, die bewusst nicht geändert werden:

- `k3d/website.yaml` schreibt den DB-Host als
  `shared-db.${WEBSITE_DB_NAMESPACE}.svc.cluster.local`. Damit die Website die Datenbank aus
  Vorbedingung 6 erreicht, müssen `WORKSPACE_NAMESPACE` und `WEBSITE_DB_NAMESPACE` in
  `environments/korczewski-prod.yaml` (p1) beide `workspace-korczewski` sein; die NetworkPolicies
  der Basis selektieren `${WORKSPACE_NAMESPACE}`. `environments/korczewski.yaml:27` hat dort noch
  `workspace` stehen — dieser Wert darf nicht übernommen werden.
- `allow-egress-to-workspace-office` (Port 9980, Namespace `workspace-office`) bleibt stehen. Die
  Policy selektiert einen Namespace, den es in diesem Cluster nicht gibt, also niemanden;
  Collabora ist laut Q1 außerhalb des Scope. Sie zu entfernen wäre eine Verhaltensänderung ohne
  Nutzen.

Der `RoleBinding pocket-id-client-seed-website-rolebinding` aus der Basis behält sein Subjekt
`workspace-korczewski/pocket-id-client-seed`: der Namespace-Transformer schreibt nur Subjekte um,
deren Namespace dem Namespace des Objekts selbst entspricht (experimentell geprüft — im gebauten
Artefakt steht das Subjekt unverändert). Genau deshalb liegt diese Kopie website-seitig und nicht
in `auth/` (siehe p8).

Verify: `O=$(kustomize build korczewski-prod/website --load-restrictor=LoadRestrictionsNone) && [ "$(grep -c '^kind: Ingress$' <<<"$O")" -eq 3 ] && [ "$(grep -cE '^kind: (IngressRoute|ClusterRole)' <<<"$O")" -eq 0 ] && [ "$(grep -c 'secretName' <<<"$O")" -eq 0 ] && [ "$(yq -N 'select(.kind == "Deployment") | .spec.template.spec.containers[0].image' <<<"$O")" = 'ghcr.io/paddione/website@${WEBSITE_IMAGE_DIGEST}' ] && [ "$(yq -N 'select(.metadata.name == "website-ingress-apex") | .spec.tls[0].hosts[0] + "/" + .metadata.annotations."traefik.ingress.kubernetes.io/router.entrypoints"' <<<"$O")" = '${PROD_DOMAIN}/websecure' ] && [ "$(yq -N 'select(.metadata.name == "website-prod") | .metadata.namespace' <<<"$O")" = "website-korczewski" ] && ! kustomize build korczewski-prod/website >/dev/null 2>&1`

## Task 4: Website-Invarianten und Commit

**Files:** `korczewski-prod/website/kustomization.yaml`, `korczewski-prod/website/website-patch.yaml`, `korczewski-prod/website/ingress.yaml`

Der Abschluss prüft die Invarianten des Website-Baums als Ganzes und setzt den Commit.

```bash
W=$(kustomize build korczewski-prod/website --load-restrictor=LoadRestrictionsNone)
```

Erwartung und Begründung:

- **3 Ingresses, 0 IngressRoute, 0 ClusterRole im Website-Baum.** Die drei Ingresses sind
  `website-prod`, `website-prod-astro` und `website-ingress-apex` (aus der Basis). Damit liegt
  keine cluster-scoped Ressource in einem Tenant-Pfad (Design §10,
  `test_cluster_scoped_only_in_bootstrap`).
- **Kein Secret-Name und kein `:latest`.** D6 (Default-TLSStore) und D7 (Digest) sind damit auf
  Manifestebene belegbar; `test_images_are_digest_pinned` greift im gerenderten Baum.
- **Genau ein Namespace im Website-Baum.** `website-korczewski` kommt aus der Basis
  (`k3d/website.yaml`); die Auth-Seite liefert in p8 den zweiten. Zusammen sind es die zwei
  Namespaces, gegen die p7 die SealedSecret-Namespaces prüfen kann (C3).
- **Kein `resources`-Eintrag zeigt in `prod/`.** Das ist die prüfbare Form von D6; die
  Dateinamen selbst stehen nur noch in Kommentaren, die den Verzicht begründen.
- **Beide Bäume bauen, der Plain-Build des Website-Baums nicht.** Der zweite Teil belegt ADR-015
  im neuen Overlay, nicht nur in `prod-fleet/`.

Nicht Teil dieses Tasks: `bash scripts/korczewski-prod/render-stack.sh` (p5) — der Renderer
braucht `environments/korczewski-prod.yaml` (p1) und baut auf den hier erzeugten Bäumen auf.

Zwei Vorbedingungen des Ziel-Clusters, die aus diesen Manifesten folgen und im Bootstrap-Runbook
(p2, `flux/clusters/korczewski-prod/bootstrap/README.md`) stehen müssen:

1. **Traefik-Redirect von `web` auf `websecure`.** Alle Router der Website hängen nur an
   `websecure`; derselbe Redirect trägt auch den Auth-Router aus p8. Repo-weit existiert dafür
   keine Konfiguration (`grep -rn "redirectTo"` liefert keinen Treffer), es ist also statische
   Traefik-Konfiguration (`ports.web.redirectTo=websecure`), kein Manifest. Ohne sie ist
   `http://web.korczewski.de` nicht erreichbar statt umgeleitet.
2. **`ghcr-pull-secret` im Namespace `website-korczewski`.** `k3d/website.yaml:237-238` behält
   `imagePullSecrets: [{name: ghcr-pull-secret}]`; das fleet-Overlay deckte den Namen über den
   `tls-sync`-CronJob mit ab, der mit D6 entfällt. Der Secret muss also beim Bootstrap entstehen
   (oder das Paket öffentlich sein), sonst bleibt der Pod in `ImagePullBackOff`.

Verify: `W=$(kustomize build korczewski-prod/website --load-restrictor=LoadRestrictionsNone) && [ "$(grep -c '^kind: Ingress$' <<<"$W")" -eq 3 ] && [ "$(grep -cE '^kind: (IngressRoute|ClusterRole)' <<<"$W")" -eq 0 ] && [ "$(grep -c 'secretName' <<<"$W")" -eq 0 ] && [ "$(grep -c ':latest' <<<"$W")" -eq 0 ] && ! grep -rqE '^[[:space:]]*-[[:space:]]+\.\./\.\./prod/' korczewski-prod/website/kustomization.yaml && [ "$(grep -c '^kind: Namespace' <<<"$W")" -eq 1 ] && [ "$(yq -N 'select(.kind == "Namespace") | .metadata.name' <<<"$W")" = "website-korczewski" ]`

Commit: `feat(korczewski-prod): Website-Overlay für den Prod-Cluster anlegen`
