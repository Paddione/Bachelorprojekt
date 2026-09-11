# p2-full — Profil `dev-local/full` mit Kustomize-Components

Partial von `devmesh-dev-stack` (T900118) · Rolle: impl · depends_on: p1-core.

`full` = `core` + Components (design.md D1). Aktiv wird es erst nach SP-5, wenn `ws-ubuntu-1`
beigetreten ist (R1); dieser Partial liefert das renderbare Overlay. DocuSeal entfällt: im Repo
existiert kein DocuSeal-Workload-Manifest. Nur YAML, kein S1-Budget. `k3d/office-stack/secret.yaml`
und `namespace.yaml` sind bewusst nicht eingebunden: `collabora-secrets` kommt aus
`environments/sealed-secrets/dev.yaml`, und der Namespace `workspace-office` würde vom
Transformer zu `workspace` umgeschrieben.

### Task 1: Component nextcloud (30 min)

**Files:** Create `dev-local/components/nextcloud/kustomization.yaml`

```yaml
apiVersion: kustomize.config.k8s.io/v1alpha1
kind: Component
# Nextcloud fuer das devmesh-Profil full (T900118). Ressourcen und PHP-Konfiguration
# wie k3d/kustomization.yaml.
resources:
  - ../../../k3d/nextcloud.yaml
  - ../../../k3d/nextcloud-redis.yaml
  - ../../../k3d/nextcloud-notification-config-job.yaml
  - ingress.yaml
configMapGenerator:
  - name: nextcloud-oidc-config
    files:
      - oidc.config.php=../../../k3d/nextcloud-oidc-dev.php
  - name: nextcloud-extra-config
    files:
      - zz-extra.config.php=../../../k3d/nextcloud-extra-config.php
generatorOptions:
  disableNameSuffixHash: true
```

**Files:** Create `dev-local/components/nextcloud/ingress.yaml`

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: devmesh-nextcloud
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
spec:
  tls:
    - hosts: ["files.${DEVMESH_DOMAIN}"]
  rules:
    - host: "files.${DEVMESH_DOMAIN}"
      http:
        paths:
          - {path: /, pathType: Prefix, backend: {service: {name: nextcloud, port: {number: 80}}}}
```

### Task 2: Components collabora, talk, vaultwarden (45 min)

**Files:** Create `dev-local/components/collabora/kustomization.yaml`

```yaml
apiVersion: kustomize.config.k8s.io/v1alpha1
kind: Component
resources:
  - ../../../k3d/office-stack/collabora.yaml
  - ingress.yaml
```

**Files:** Create `dev-local/components/collabora/ingress.yaml`

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: devmesh-collabora
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
spec:
  tls:
    - hosts: ["office.${DEVMESH_DOMAIN}"]
  rules:
    - host: "office.${DEVMESH_DOMAIN}"
      http:
        paths:
          - {path: /, pathType: Prefix, backend: {service: {name: collabora, port: {number: 9980}}}}
```

**Files:** Create `dev-local/components/talk/kustomization.yaml`

```yaml
apiVersion: kustomize.config.k8s.io/v1alpha1
kind: Component
# Talk-Signaling (nats + spreed-signaling). coturn/janus (k3d/coturn-stack) bleiben aussen vor:
# TURN braucht eine oeffentliche Adresse, devmesh ist nur im Tailnet erreichbar.
resources:
  - ../../../k3d/talk-hpb.yaml
  - ingress.yaml
```

**Files:** Create `dev-local/components/talk/ingress.yaml`

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: devmesh-talk
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
spec:
  tls:
    - hosts: ["signaling.${DEVMESH_DOMAIN}"]
  rules:
    - host: "signaling.${DEVMESH_DOMAIN}"
      http:
        paths:
          - {path: /, pathType: Prefix, backend: {service: {name: spreed-signaling, port: {number: 8080}}}}
```

**Files:** Create `dev-local/components/vaultwarden/kustomization.yaml`

```yaml
apiVersion: kustomize.config.k8s.io/v1alpha1
kind: Component
resources:
  - ../../../k3d/vaultwarden.yaml
  - ingress.yaml
```

**Files:** Create `dev-local/components/vaultwarden/ingress.yaml`

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: devmesh-vaultwarden
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
spec:
  tls:
    - hosts: ["vault.${DEVMESH_DOMAIN}"]
  rules:
    - host: "vault.${DEVMESH_DOMAIN}"
      http:
        paths:
          - {path: /, pathType: Prefix, backend: {service: {name: vaultwarden, port: {number: 80}}}}
```

### Task 3: Overlay `dev-local/full` (20 min)

**Files:** Create `dev-local/full/kustomization.yaml`

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
# devmesh-Profil full = core + schwere Dienste (T900118, design.md D1). Braucht mehr als
# 48 GB RAM; Default bleibt core bis SP-5. `namespace` steht auch hier, weil die
# Component-Ressourcen erst auf dieser Ebene hinzukommen (collabora.yaml nennt
# workspace-office).
namespace: workspace

resources:
  - ../core

components:
  - ../components/nextcloud
  - ../components/collabora
  - ../components/talk
  - ../components/vaultwarden

patches:
  - target: {kind: Deployment, name: nextcloud}
    patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata: {name: nextcloud}
      spec:
        template:
          spec:
            nodeSelector: {storage: "true"}
            containers:
              - name: nextcloud
                resources:
                  requests: {cpu: 250m, memory: 512Mi}
  - target: {kind: Deployment, name: collabora}
    patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata: {name: collabora}
      spec: {template: {spec: {containers: [{name: collabora, resources: {requests: {cpu: 250m, memory: 512Mi}}}]}}}
  - target: {kind: Deployment, name: vaultwarden}
    patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata: {name: vaultwarden}
      spec:
        template:
          spec:
            nodeSelector: {storage: "true"}
            containers:
              - name: vaultwarden
                resources:
                  requests: {cpu: 25m, memory: 64Mi}
```

### Task 4: Build prüfen (20 min)

```bash
kubectl kustomize --load-restrictor=LoadRestrictionsNone dev-local/full > /tmp/claude-full.yaml
yq ea -r '[select(.kind == "Deployment") | .metadata.name] | .[]' /tmp/claude-full.yaml | sort
# erwartet zusaetzlich zu core: collabora, nats, nextcloud, spreed-signaling, vaultwarden
yq ea -r '[select(.metadata.namespace != null and .metadata.namespace != "workspace") | .kind + "/" + .metadata.name] | .[]' /tmp/claude-full.yaml
# erwartet: leer (alles in workspace)
```

Nach p3 Task 2 zusätzlich: `tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/dev-local-render.bats`
(Test „Profil full enthält …" grün).

Offen für die Aktivierung von `full` in SP-5, hier nicht zu lösen: Talk-Secrets
(`SIGNALING_SECRET`, `TURN_SECRET`, `SESSION_*`) und die `COLLABORA_*`-Werte stehen in den
k3d-Manifesten als Platzhalter; `render-stack.sh` setzt die `COLLABORA_*`-Hosts, die
Talk-Secrets bleiben unaufgelöst. Nextcloud-OIDC nutzt `k3d/nextcloud-oidc-dev.php`.
