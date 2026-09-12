# p1-core — Overlay `dev-local/core`, GPU-Endpoint, Backup

Partial von `devmesh-dev-stack` (T900118) · Rolle: impl · depends_on: p5-tests.

Prior Art: `k3d/sdlc-stack/kustomization.yaml` (Einzeldatei-Ressourcen aus `k3d/`),
`k3d/dev-stack/dev-ingress.yaml` (websecure + TLSStore), `prod-fleet/staging/kustomization.yaml`
(Inline-Patches). Alle neuen Dateien sind YAML bzw. ein neues `.sh` (Limit 800) — kein
S1-Budget betroffen. S3: `dev-local/` liegt außerhalb der S3-Scopes; Hosts stehen trotzdem nur
als `${DEVMESH_DOMAIN}` in den Manifesten, der Wert kommt aus `environments/dev.yaml` (p3).
S4: `db-backup.sh` wird aus `dev-local/core/kustomization.yaml` referenziert
(`**/kustomization.yaml` ist Referenzquelle in gates.yaml).

### Task 1: Backup-Skript (20 min)

**Files:** Create `scripts/devmesh/db-backup.sh`

```bash
#!/usr/bin/env bash
# scripts/devmesh/db-backup.sh — taeglicher pg_dumpall der devmesh-shared-db [T900118].
# Laeuft im CronJob shared-db-backup (dev-local/core/shared-db-backup.yaml, per
# configMapGenerator eingebunden) auf dem storage=true-Knoten.
#
# Aufruf: db-backup.sh [--prune-only]
# Env:    BACKUP_DIR (/backup), RETAIN (14), PGHOST/PGUSER/PGPASSWORD fuer pg_dumpall
# Exit:   0 ok; != 0 Dump fehlgeschlagen — dann wird nichts geloescht
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backup}"
RETAIN="${RETAIN:-14}"
PART=""
trap 'if [[ -n "$PART" ]]; then rm -f -- "$PART"; fi' EXIT

if [[ "${1:-}" != "--prune-only" ]]; then
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  PART="$BACKUP_DIR/.shared-db-$stamp.sql.gz.part"
  pg_dumpall --clean --if-exists | gzip > "$PART"
  mv -- "$PART" "$BACKUP_DIR/shared-db-$stamp.sql.gz"
  PART=""
  echo "dump: shared-db-$stamp.sql.gz"
fi

# Dateinamen tragen den UTC-Zeitstempel: lexikalische Sortierung ist chronologisch.
mapfile -t dumps < <(find "$BACKUP_DIR" -maxdepth 1 -name 'shared-db-*.sql.gz' -printf '%f\n' | sort)
excess=$(( ${#dumps[@]} - RETAIN ))
for (( i = 0; i < excess; i++ )); do
  rm -f -- "$BACKUP_DIR/${dumps[$i]}"
  echo "pruned: ${dumps[$i]}"
done
echo "retained: $(find "$BACKUP_DIR" -maxdepth 1 -name 'shared-db-*.sql.gz' | wc -l)"
```

- [ ] **GREEN:** `tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/db-backup-retention.bats` — 3/3 ok.

### Task 2: GPU-Endpoint und Ingress (30 min)

**Files:** Create `dev-local/core/gpu-endpoint.yaml`

```yaml
# llm-gateway-host — GPU-Inferenz auf PK-Desktop ueber dessen Tailnet-Adresse
# (T900118, design.md D7, ADR-008 Nachtrag 1). Selector-los: Adresse und Port stehen als
# gpu_endpoint in devmesh/inventory.yaml, scripts/devmesh/render-stack.sh setzt sie ein.
# Ist PK-Desktop aus, meldet /sdlc/api/llm-proxy/status proxy=unreachable mit dieser
# Adresse; die Console-Probes pruefen /api/health ohne LLM-Abhaengigkeit, der Pod bleibt Running.
apiVersion: v1
kind: Service
metadata:
  name: llm-gateway-host
spec:
  ports:
    - name: http
      port: 80
      protocol: TCP
---
apiVersion: discovery.k8s.io/v1
kind: EndpointSlice
metadata:
  name: llm-gateway-host
  labels:
    kubernetes.io/service-name: llm-gateway-host
addressType: IPv4
ports:
  - name: http
    port: ${GPU_ENDPOINT_PORT}
    protocol: TCP
endpoints:
  - addresses:
      - "${GPU_ENDPOINT_ADDRESS}"
```

**Files:** Create `dev-local/core/ingress.yaml`

```yaml
# Ingress des devmesh-Profils core (T900118). Hosts: <dienst>.${DEVMESH_DOMAIN}. TLS liefert
# der Traefik-Default-TLSStore mit dem Wildcard aus dev-local/cluster/tls.yaml; der tls-Block
# markiert die Hosts fuer websecure (Muster k3d/dev-stack/dev-ingress.yaml).
# web.* ist die Console: der pocket-id-client-seed registriert den Callback als
# web.<suffix>/api/auth/callback. Die Website (BUILD_TARGET unset) liegt auf site.*.
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: devmesh-core
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
spec:
  tls:
    - hosts:
        - "web.${DEVMESH_DOMAIN}"
        - "auth.${DEVMESH_DOMAIN}"
        - "site.${DEVMESH_DOMAIN}"
        - "brett.${DEVMESH_DOMAIN}"
        - "mail.${DEVMESH_DOMAIN}"
  rules:
    - host: "web.${DEVMESH_DOMAIN}"
      http:
        paths:
          - {path: /, pathType: Prefix, backend: {service: {name: sdlc-console, port: {number: 8080}}}}
    - host: "auth.${DEVMESH_DOMAIN}"
      http:
        paths:
          - {path: /, pathType: Prefix, backend: {service: {name: pocket-id, port: {number: 1411}}}}
    - host: "site.${DEVMESH_DOMAIN}"
      http:
        paths:
          - {path: /, pathType: Prefix, backend: {service: {name: website, port: {number: 80}}}}
    - host: "brett.${DEVMESH_DOMAIN}"
      http:
        paths:
          - {path: /, pathType: Prefix, backend: {service: {name: brett, port: {number: 3000}}}}
    - host: "mail.${DEVMESH_DOMAIN}"
      http:
        paths:
          - {path: /, pathType: Prefix, backend: {service: {name: mailpit, port: {number: 8025}}}}
```

### Task 3: Backup-CronJob (20 min)

**Files:** Create `dev-local/core/shared-db-backup.yaml`

```yaml
# Taeglicher pg_dumpall der devmesh-shared-db, 14 Tage Aufbewahrung (T900118).
# local-path-PVC auf dem storage=true-Knoten (gpu-cluster2, SP-2 D4). Das Skript kommt
# aus scripts/devmesh/db-backup.sh (configMapGenerator in kustomization.yaml).
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: shared-db-backup
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 50Gi
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: shared-db-backup
spec:
  schedule: "30 3 * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 1
      template:
        metadata:
          labels:
            app: shared-db-backup
        spec:
          restartPolicy: Never
          nodeSelector:
            storage: "true"
          securityContext:
            runAsNonRoot: true
            runAsUser: 999
            fsGroup: 999
            seccompProfile:
              type: RuntimeDefault
          containers:
            - name: backup
              image: pgvector/pgvector:0.8.5-pg16@sha256:1d533553fefe4f12e5d80c7b80622ba0c382abb5758856f52983d8789179f0fb
              command: ["bash", "/scripts/db-backup.sh"]
              env:
                - {name: PGHOST, value: shared-db}
                - {name: PGUSER, value: postgres}
                - {name: BACKUP_DIR, value: /backup}
                - {name: RETAIN, value: "14"}
                - name: PGPASSWORD
                  valueFrom:
                    secretKeyRef:
                      name: workspace-secrets
                      key: SHARED_DB_PASSWORD
              resources:
                requests: {cpu: 50m, memory: 128Mi}
              volumeMounts:
                - {name: backup, mountPath: /backup}
                - {name: script, mountPath: /scripts, readOnly: true}
          volumes:
            - name: backup
              persistentVolumeClaim:
                claimName: shared-db-backup
            - name: script
              configMap:
                name: shared-db-backup-script
```

### Task 4: Kustomization `dev-local/core` (45 min)

**Files:** Create `dev-local/core/kustomization.yaml`

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
# devmesh-Profil core (T900118, ADR-008). Gerendert von scripts/devmesh/render-stack.sh mit
# --load-restrictor=LoadRestrictionsNone (Ressourcen liegen in k3d/).
# Bewusst nicht enthalten:
#   k3d/namespace.yaml — k3d/website.yaml bringt einen Namespace mit, den der
#     Namespace-Transformer ebenfalls zu `workspace` macht; beide kollidieren.
#   k3d/secrets.yaml, k3d/website-dev-secrets.yaml — Secrets kommen auf devmesh nur aus
#     environments/sealed-secrets/dev.yaml; ein Klartext-Secret gleichen Namens wuerde
#     das entsiegelte ueberschreiben.
namespace: workspace

resources:
  - ../../k3d/configmap-domains.yaml
  - ../../k3d/shared-db.yaml
  - ../../k3d/website-schema.yaml
  - ../../k3d/website.yaml
  - ../../k3d/pocket-id.yaml
  - ../../k3d/pocket-id-db-init-sql.yaml
  - ../../k3d/pocket-id-client-seed.yaml
  - ../../k3d/pocket-id-client-seed-rbac.yaml
  - ../../k3d/pocket-id-client-seed-website-rbac.yaml
  - ../../k3d/llm-gpu.yaml
  - ../../k3d/brett.yaml
  - ../../k3d/mailpit.yaml
  - ../../k3d/sdlc-stack/sdlc-console.yaml
  - ../../k3d/sdlc-stack/sdlc-console-rbac.yaml
  - gpu-endpoint.yaml
  - ingress.yaml
  - shared-db-backup.yaml

configMapGenerator:
  - name: shared-db-backup-script
    files:
      - db-backup.sh=../../scripts/devmesh/db-backup.sh

generatorOptions:
  disableNameSuffixHash: true

patches:
  - target: {kind: ConfigMap, name: domain-config}
    patch: |-
      apiVersion: v1
      kind: ConfigMap
      metadata: {name: domain-config}
      data:
        PROD_DOMAIN: "${DEVMESH_DOMAIN}"
        POCKET_ID_DOMAIN: "auth.${DEVMESH_DOMAIN}"
        WEB_DOMAIN: "web.${DEVMESH_DOMAIN}"
        BRETT_DOMAIN: "brett.${DEVMESH_DOMAIN}"
        MAIL_DOMAIN: "mail.${DEVMESH_DOMAIN}"
        NC_DOMAIN: "files.${DEVMESH_DOMAIN}"
        COLLABORA_DOMAIN: "office.${DEVMESH_DOMAIN}"
        VAULT_DOMAIN: "vault.${DEVMESH_DOMAIN}"
        SIGNALING_DOMAIN: "signaling.${DEVMESH_DOMAIN}"
        TLS_SECRET_NAME: "devmesh-wildcard-tls"
  - target: {kind: ConfigMap, name: sdlc-console-config}
    patch: |-
      apiVersion: v1
      kind: ConfigMap
      metadata: {name: sdlc-console-config}
      data:
        CLUSTER_ENV: "devmesh"
  # GPU ueber llm-gateway-host (gpu-endpoint.yaml) statt leerem LLM_PROXY_URL.
  - target: {kind: Deployment, name: sdlc-console}
    patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata: {name: sdlc-console}
      spec:
        template:
          spec:
            containers:
              - name: sdlc-console
                env:
                  - {name: LLM_PROXY_URL, value: "http://llm-gateway-host"}
                resources:
                  requests: {cpu: 100m, memory: 192Mi}
  # Zustandsbehaftete Workloads auf den storage=true-Knoten (SP-2 D4).
  - target: {kind: Deployment, name: shared-db}
    patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata: {name: shared-db}
      spec:
        template:
          spec:
            nodeSelector: {storage: "true"}
            containers:
              - name: postgres
                resources:
                  requests: {cpu: 100m, memory: 256Mi}
  - target: {kind: Deployment, name: pocket-id}
    patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata: {name: pocket-id}
      spec:
        template:
          spec:
            nodeSelector: {storage: "true"}
            containers:
              - name: pocket-id
                resources:
                  requests: {cpu: 25m, memory: 64Mi}
  # Start-Requests fuer 3 x 16 GB (R1); Messung in Task L1.
  - target: {kind: Deployment, name: website}
    patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata: {name: website}
      spec: {template: {spec: {containers: [{name: website, resources: {requests: {cpu: 50m, memory: 192Mi}}}]}}}
  - target: {kind: Deployment, name: brett}
    patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata: {name: brett}
      spec: {template: {spec: {containers: [{name: brett, resources: {requests: {cpu: 25m, memory: 64Mi}}}]}}}
  - target: {kind: Deployment, name: mailpit}
    patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata: {name: mailpit}
      spec: {template: {spec: {containers: [{name: mailpit, resources: {requests: {cpu: 10m, memory: 32Mi}}}]}}}
  - target: {kind: Deployment, name: "bge-(embed|rerank)"}
    patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata: {name: bge}
      spec: {template: {spec: {containers: [{name: llama-cpp, resources: {requests: {cpu: 250m, memory: 768Mi}}}]}}}
```

- [ ] **Step 2: Build prüfen.**

```bash
kubectl kustomize --load-restrictor=LoadRestrictionsNone dev-local/core > /tmp/claude-core.yaml
yq ea -r '[select(.kind == "Deployment") | .metadata.name] | .[]' /tmp/claude-core.yaml
# erwartet u. a.: shared-db, pocket-id, website, sdlc-console, bge-embed, bge-rerank, brett, mailpit
yq ea -r '[select(.kind == "Namespace") | .metadata.name] | .[]' /tmp/claude-core.yaml | sort | uniq -d
# erwartet: leer (kein doppelter Namespace)
```

Bricht der Build an einem Request-Patch ab, weil eine Basis-`limits`-Angabe kleiner ist als der
neue Request, wird für diesen Container `limits` im selben Patch auf den Request-Wert gesetzt.

### Task L1 (Operator/Live): Ressourcen messen (30 min)

Vorbedingung: SP-2 abgenommen; p3 Task L3 (`task devmesh:deploy`, Profil core) gelaufen.

```bash
kubectl --context devmesh describe nodes | grep -A9 'Allocated resources'
kubectl --context devmesh top nodes
kubectl --context devmesh -n workspace top pods --sort-by=memory
```

Befund mit diesen Befehlen als Ticket-Kommentar an T900118 (Mess-Konvention). Liegen die
Memory-Requests eines Knotens über 80 % seines Allocatable oder zeigt `top pods` einen Pod
dauerhaft über seinem Request, werden die Werte in `dev-local/core/kustomization.yaml` auf den
gemessenen Verbrauch plus 25 % gesetzt und `task devmesh:deploy` erneut ausgeführt.
