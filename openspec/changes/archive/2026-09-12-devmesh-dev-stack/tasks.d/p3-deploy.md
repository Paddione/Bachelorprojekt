# p3-deploy — Environment, Render, TLS, `task devmesh:deploy`, Live-Inbetriebnahme

Partial von `devmesh-dev-stack` (T900118) · Rolle: impl · depends_on: p1-core.

Prior Art: `taskfiles/Taskfile.sdlc.yml` (`sdlc:deploy`: envsubst-Liste, `$$`-Unwrapping),
`scripts/flux-render-artifact.sh` Z. 108–140 (Variablenliste aus dem Render),
`taskfiles/Taskfile.dev-stack.yml` Z. 248–282 (cert-manager + ipv64-lego-webhook),
`k3d/dev-stack/cert-manager.yaml` + `traefik-tls.yaml`. YAML-Dateien sind S1-frei;
`render-stack.sh` ist neu (≈ 70 Zeilen, Limit 800) und wird aus `Taskfile.devmesh.yml`
referenziert (S4). Domain-Literale nur in `environments/` (außerhalb S3).

Vorbedingung: `taskfiles/Taskfile.devmesh.yml` existiert (SP-2, siehe Index).

### Task 1: `environments/dev.yaml` umziehen + Schema (30 min)

**Files:** Modify `environments/dev.yaml` — Datei vollständig ersetzen (Test-Anker bleiben:
Verweis auf `dev-cluster.yaml`, `LLM_HOST_IP`, `POCKET_ID_FRONTEND_URL`, `POCKET_ID_URL`):

```yaml
# environments/dev.yaml
# Lokale Entwicklungsumgebung auf dem HA-Cluster devmesh (ADR-008, T900118).
# Bis T900118 beschrieb diese Datei den Einzelhost-Cluster k3d-mentolder-dev; sie wurde
# umgezogen statt dupliziert (openspec/changes/devmesh-dev-stack/design.md D2), damit
# ENV=dev nicht auf einen abgebauten Context zeigt. Der fleet-gerenderte Dev-Stack
# (workspace-dev, dev.mentolder.de) laeuft weiter ueber environments/dev-cluster.yaml
# (T002630) — diese Datei steuert ihn nicht.
environment: dev
context: devmesh
domain: devmesh.mentolder.de

env_vars:
  EINVOICE_SIDECAR_ENABLED: "true"
  # Dev uses default_dev from schema.yaml for most values.
  # Override only where the dev default differs from schema:
  BRAND_ID: korczewski
  BRAND_NAME: "KORE"
  WEBSITE_IMAGE: website
  DOCS_IMAGE: korczewski-docs
  WEBSITE_NAMESPACE: workspace
  # devmesh: Profil und Basis-Domain; A-Records zeigen nur auf Tailnet-Adressen (D3).
  DEVMESH_DOMAIN: devmesh.mentolder.de
  DEVMESH_PROFILE: core
  PROD_DOMAIN: devmesh.mentolder.de
  # web.* ist die SDLC-Console (OIDC-Callback), die Website liegt auf site.*.
  WEBSITE_HOST: site.devmesh.mentolder.de
  WEBSITE_SITE_URL: "https://site.devmesh.mentolder.de"
  LLM_ENABLED: "true"
  LLM_RERANK_ENABLED: "true"
  LLM_RERANKER_URL: "http://llm-gateway-rerank.workspace.svc.cluster.local:8081"
  LLM_EMBED_URL: "http://llm-gateway-embed.workspace.svc.cluster.local:8081"
  LLM_EMBED_MODEL: "bge-m3"
  # wg-gpu-Adresse des Windows-Hosts — derselbe GPU-Peer, den die Prod-Envs adressieren.
  # devmesh erreicht die GPU ueber gpu_endpoint in devmesh/inventory.yaml (D7).
  LLM_HOST_IP: "192.168.100.10"
  TURN_OVERLAY_IP: "172.17.0.1"
  TERMINAL_OVERLAY_IP: "172.17.0.1"
  EMAIL_NOTIFICATIONS_ENABLED: "false"

  MEDIAVIEWER_HOST: mediaviewer.localhost
  VIDEOVAULT_DOMAIN: videovault.localhost
  # Pocket ID auf devmesh (D4); der Seed-Job leitet Callbacks aus der Frontend-URL ab.
  POCKET_ID_FRONTEND_URL: "https://auth.devmesh.mentolder.de"
  # FQDN statt Kurzname: components/brett/src/server/auth.ts akzeptiert http nur für
  # localhost/*.svc.cluster.local (T001933).
  POCKET_ID_URL: "http://pocket-id.workspace.svc.cluster.local:1411"
  # fail-closed Fallback auf die fleet-Pocket-ID ueber deren oeffentlichen Host (D4).
  POCKET_ID_FALLBACK_FRONTEND_URL: "https://auth.mentolder.de"
  POCKET_ID_FALLBACK_URL: "https://auth.mentolder.de"
  SDLC_CONSOLE_SITE_URL: "https://web.devmesh.mentolder.de"
  SDLC_CONSOLE_POCKET_ID_FRONTEND_URL: "https://auth.devmesh.mentolder.de"
  SDLC_CONSOLE_POCKET_ID_URL: "http://pocket-id.workspace.svc.cluster.local:1411"
  SDLC_CONSOLE_POCKET_ID_CLIENT_ID: website
  NEXTCLOUD_DB_HOST: nextcloud-db.workspace.svc.cluster.local
  # CORS allowlist origin for the React SPA (dev)
  REACT_APP_ORIGIN: "http://react.localhost"

# Dev secrets: generated from schema defaults at deploy time. devmesh selbst bekommt
# seine Secrets aus environments/sealed-secrets/dev.yaml (task devmesh:deploy).
secrets_mode: plaintext

setup_vars:
  KC_USER1_USERNAME: admin
  KC_USER1_EMAIL: admin@localhost
  KC_USER1_PASSWORD: DevAdmin123!
```

**Files:** Modify `environments/schema.yaml` — direkt vor `  - name: SDLC_CONSOLE_SITE_URL` einfügen
(nicht zwischen `DEV_DOMAIN` und `DEV_NODE`; `dev-env-split.bats` liest diesen Bereich):

```yaml
  # ─────────────────────────────────────────────────────────────────
  # devmesh (ADR-008, T900118) — lokaler HA-Cluster, ENV=dev
  # ─────────────────────────────────────────────────────────────────
  - name: DEVMESH_DOMAIN
    required: false
    default_dev: ""
    validate: "^[a-z0-9.-]*$"
    description: "Base domain of the devmesh development instance, set in environments/dev.yaml. Hosts are <service>.${DEVMESH_DOMAIN}; the public A records point to tailnet addresses only."

  - name: DEVMESH_PROFILE
    required: false
    default_dev: "core"
    validate: "^(core|full)$"
    description: "Overlay rendered by task devmesh:deploy: core (default until SP-5) or full (core + nextcloud, collabora, talk, vaultwarden)."

```

- [ ] **GREEN (Teil):** Test „env-resolve dev liefert ENV_CONTEXT=devmesh" in `dev-local-render.bats`;
  `tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/dev-env-split.bats tests/spec/llm-pipeline.bats tests/spec/pocket-id-migration.bats` grün.

### Task 2: Render-Skript (45 min)

**Files:** Create `scripts/devmesh/render-stack.sh`

```bash
#!/usr/bin/env bash
# scripts/devmesh/render-stack.sh — rendert dev-local/<profil> fuer devmesh [T900118].
# Arbeitskopie -> kustomize -> envsubst (nur gesetzte Variablen) -> stdout.
#
# Aufruf: render-stack.sh [core|full]   Default: DEVMESH_PROFILE aus environments/dev.yaml
# Env:    DEVMESH_INVENTORY (Default devmesh/inventory.yaml) liefert gpu_endpoint
# Exit:   0 Manifest auf stdout, 2 Vorbedingung fehlt (Werkzeug, Profil, Inventar)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
for tool in kubectl yq envsubst python3; do
  command -v "$tool" >/dev/null 2>&1 || { echo "render-stack: $tool fehlt" >&2; exit 2; }
done

# shellcheck source=scripts/env-resolve.sh
source scripts/env-resolve.sh dev
PROFILE="${1:-${DEVMESH_PROFILE:-core}}"
case "$PROFILE" in core|full) : ;; *) echo "render-stack: Profil '$PROFILE' unbekannt (core|full)" >&2; exit 2 ;; esac
[[ -n "${DEVMESH_DOMAIN:-}" ]] || { echo "render-stack: DEVMESH_DOMAIN leer (environments/dev.yaml)" >&2; exit 2; }

INVENTORY="${DEVMESH_INVENTORY:-devmesh/inventory.yaml}"
[[ -f "$INVENTORY" ]] || { echo "render-stack: Inventar $INVENTORY fehlt" >&2; exit 2; }
GPU_ENDPOINT_ADDRESS="$(yq -r '.gpu_endpoint.address // ""' "$INVENTORY")"
GPU_ENDPOINT_PORT="$(yq -r '.gpu_endpoint.port // ""' "$INVENTORY")"
if ! [[ "$GPU_ENDPOINT_ADDRESS" =~ ^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
  echo "render-stack: gpu_endpoint.address '$GPU_ENDPOINT_ADDRESS' liegt nicht in 100.64.0.0/10 ($INVENTORY)" >&2
  exit 2
fi
[[ "$GPU_ENDPOINT_PORT" =~ ^[0-9]+$ ]] || { echo "render-stack: gpu_endpoint.port '$GPU_ENDPOINT_PORT' ist keine Zahl" >&2; exit 2; }

export GPU_ENDPOINT_ADDRESS GPU_ENDPOINT_PORT
export POCKET_ID_DOMAIN="${POCKET_ID_DOMAIN:-auth.${DEVMESH_DOMAIN}}"
export WORKSPACE_NAMESPACE="${WORKSPACE_NAMESPACE:-workspace}"
export COLLABORA_SERVER_NAME="${COLLABORA_SERVER_NAME:-office.${DEVMESH_DOMAIN}}"
export COLLABORA_SSL_TERMINATION="${COLLABORA_SSL_TERMINATION:-true}"
export COLLABORA_ALIASGROUP1="${COLLABORA_ALIASGROUP1:-https://files.${DEVMESH_DOMAIN}:443}"
export COLLABORA_ALIASGROUP2="${COLLABORA_ALIASGROUP2:-https://files.${DEVMESH_DOMAIN}:443}"

rendered="$(kubectl kustomize --load-restrictor=LoadRestrictionsNone "dev-local/$PROFILE")"

# Nur Variablen ersetzen, die gesetzt sind und nicht als $${VAR} (Laufzeit im Container)
# stehen — sonst setzt envsubst Skript-Variablen der Seed-Jobs auf "" (Taskfile.sdlc.yml).
vars=""
for v in $(grep -oE '(^|[^$])\$\{[A-Za-z_][A-Za-z0-9_]*\}' <<<"$rendered" | sed -E 's/.*\$\{//; s/\}$//' | sort -u || true); do
  [[ -n "${!v+x}" ]] && vars+="\$$v "
done
envsubst "$vars" <<<"$rendered" | sed -E 's/\$\$(\{?[A-Za-z_])/$\1/g'
```

- [ ] **GREEN:** `tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/dev-local-render.bats` — 5/5 ok.

### Task 3: TLS-Manifest (20 min)

**Files:** Create `dev-local/cluster/tls.yaml`

```yaml
# devmesh-TLS (T900118, design.md D3). Ausserhalb des Kustomize-Bundles appliziert von
# task devmesh:deploy mit `envsubst '$DEVMESH_DOMAIN'`: cert-manager-CRDs muessen zuerst
# existieren, und der Namespace-Transformer wuerde kube-system umschreiben.
# Muster: k3d/dev-stack/cert-manager.yaml + k3d/dev-stack/traefik-tls.yaml.
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-devmesh
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: noreply-bachelorprojekt@mailbox.org
    privateKeySecretRef:
      name: letsencrypt-devmesh-key
    solvers:
      - dns01:
          webhook:
            groupName: lego.dns-solver
            solverName: lego-solver
            config:
              provider: ipv64
              env:
                IPV64_API_KEY:
                  secretKeyRef:
                    name: ipv64-api-key
                    key: IPV64_API_KEY
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: devmesh-wildcard-tls
  namespace: kube-system
spec:
  secretName: devmesh-wildcard-tls
  issuerRef:
    name: letsencrypt-devmesh
    kind: ClusterIssuer
  dnsNames:
    - "${DEVMESH_DOMAIN}"
    - "*.${DEVMESH_DOMAIN}"
---
apiVersion: traefik.io/v1alpha1
kind: TLSStore
metadata:
  name: default
  namespace: kube-system
spec:
  defaultCertificate:
    secretName: devmesh-wildcard-tls
```

### Task 4: Tasks in `taskfiles/Taskfile.devmesh.yml` (45 min)

**Files:** Modify `taskfiles/Taskfile.devmesh.yml` (SP-2). Unter `tasks:` anfügen:

```yaml
  deploy:
    desc: "devmesh-Stack aus der Arbeitskopie deployen (PROFILE=core|full, Default DEVMESH_PROFILE) [T900118]"
    preconditions:
      - sh: kubectl config get-contexts -o name | grep -qx devmesh
        msg: "Context devmesh fehlt — erst task devmesh:kubeconfig"
      - sh: test -f environments/sealed-secrets/dev.yaml
        msg: "environments/sealed-secrets/dev.yaml fehlt — task env:seal ENV=dev"
    cmds:
      - |
        set -euo pipefail
        CTX=devmesh
        source scripts/env-resolve.sh dev
        PROFILE="{{.PROFILE}}"; PROFILE="${PROFILE:-$DEVMESH_PROFILE}"
        # 1. Stack rendern, bevor irgendetwas appliziert wird (Render-Fehler = kein Teil-Deploy)
        rendered="$(bash scripts/devmesh/render-stack.sh "$PROFILE")"
        # 2. cert-manager + ipv64-lego-webhook (Muster Taskfile.dev-stack.yml, T000363)
        helm repo add jetstack https://charts.jetstack.io --force-update >/dev/null
        helm repo add cert-manager-lego-webhook https://yxwuxuanl.github.io/cert-manager-lego-webhook/ --force-update >/dev/null
        helm repo update >/dev/null
        helm upgrade --install cert-manager jetstack/cert-manager --namespace cert-manager --create-namespace \
          --kube-context "$CTX" --set crds.enabled=true --set podDnsPolicy=Default --wait --timeout=180s
        helm upgrade --install cert-manager-lego-webhook cert-manager-lego-webhook/cert-manager-lego-webhook \
          --namespace cert-manager --kube-context "$CTX" --set certManager.namespace=cert-manager \
          --set certManager.serviceAccountName=cert-manager --wait --timeout=120s
        # 3. Sealed-Secrets-Controller, dann SealedSecrets VOR den Manifesten
        kubectl --context "$CTX" apply -f k3d/sealed-secrets-controller.yaml
        kubectl --context "$CTX" -n sealed-secrets rollout status deploy/sealed-secrets-controller --timeout=180s
        kubectl --context "$CTX" create namespace workspace --dry-run=client -o yaml | kubectl --context "$CTX" apply -f -
        kubectl --context "$CTX" apply -f environments/sealed-secrets/dev.yaml
        for s in workspace/workspace-secrets workspace/website-secrets cert-manager/ipv64-api-key; do
          kubectl --context "$CTX" -n "${s%%/*}" wait --for=create "secret/${s##*/}" --timeout=120s
        done
        kubectl --context "$CTX" -n cert-manager set env deployment/cert-manager-lego-webhook --from=secret/ipv64-api-key
        envsubst '$DEVMESH_DOMAIN' < dev-local/cluster/tls.yaml | kubectl --context "$CTX" apply -f -
        # 4. Stack applizieren und auf jede Deployment-Rollout warten
        kubectl --context "$CTX" wait --for=create crd/ingressroutes.traefik.io --timeout=180s
        printf '%s\n' "$rendered" | kubectl --context "$CTX" apply -f -
        for d in $(printf '%s\n' "$rendered" | yq ea -r '[select(.kind == "Deployment") | .metadata.name] | .[]'); do
          kubectl --context "$CTX" -n workspace rollout status "deployment/$d" --timeout=600s
        done
        echo "devmesh:deploy ok (Profil $PROFILE)"

  migrate:
    desc: "pocket_id + website aus k3d-mentolder-dev nach devmesh kopieren, Zeilenzahlen vergleichen [T900118]"
    cmds:
      - bash scripts/devmesh/migrate-from-k3d.sh {{.CLI_ARGS | default "all"}}

  backup:run:
    desc: "shared-db-Backup auf devmesh sofort ausloesen (CronJob shared-db-backup) [T900118]"
    cmds:
      - kubectl --context devmesh -n workspace create job "shared-db-backup-manual-$(date +%s)" --from=cronjob/shared-db-backup
```

Am bestehenden SP-2-Task `status` die `cmds`-Liste um zwei Einträge verlängern:

```yaml
      - kubectl --context devmesh -n workspace get deploy
      - kubectl --context devmesh -n kube-system get certificate devmesh-wildcard-tls -o jsonpath='{.metadata.name}{" Ready="}{.status.conditions[?(@.type=="Ready")].status}{" notAfter="}{.status.notAfter}{"\n"}'
```

- [ ] **Prüfen:** `task --summary devmesh:deploy devmesh:migrate devmesh:backup:run >/dev/null` (Exit 0).

### Task L1 (Operator/Live): Tailnet-Adressen, Inventar, DNS (45 min)

Vorbedingung: SP-2 abgenommen (`task devmesh:status`: drei `Ready`-Knoten).

```bash
GPU_METAL_TS=$(ssh patrick@10.1.0.101 tailscale ip -4)
GPU_CLUSTER_TS=$(ssh patrick@10.10.10.2 tailscale ip -4)
GPU_CLUSTER2_TS=$(ssh patrick@10.10.10.3 tailscale ip -4)
PK_DESKTOP_TS=$("/mnt/c/Program Files/Tailscale/tailscale.exe" ip -4 | tr -d '\r')
for n in gpu-metal:$GPU_METAL_TS gpu-cluster:$GPU_CLUSTER_TS gpu-cluster2:$GPU_CLUSTER2_TS; do
  yq -i "(.. | select(tag == \"!!map\") | select(.name == \"${n%%:*}\")).tailnet_ip = \"${n##*:}\"" devmesh/inventory.yaml
done
yq -i ".gpu_endpoint = {\"peer\": \"pk-desktop\", \"address\": \"$PK_DESKTOP_TS\", \"port\": 18235}" devmesh/inventory.yaml
kubectl --context devmesh run gpu-probe --rm -i --restart=Never --image=curlimages/curl:8.21.0 -- \
  curl -sS -m 3 -o /dev/null -w '%{http_code}\n' "http://$PK_DESKTOP_TS:18235/livez"   # erwartet 200
```

Antwortet die Probe nicht, lauscht der llm-proxy auf PK-Desktop nur auf Loopback; Befund ins
Ticket, der Stack läuft trotzdem degradiert (D7).

DNS bei ipv64 (Admin-Oberfläche, Zone `mentolder.de`): A-Records `devmesh` und `*.devmesh` auf
die drei Server-Adressen `$GPU_METAL_TS`, `$GPU_CLUSTER_TS`, `$GPU_CLUSTER2_TS`. Nachweis:

```bash
ips=$(dig +short web.devmesh.mentolder.de @1.1.1.1)
echo "Anker: $(grep -c . <<<"$ips") A-Records"                           # erwartet 3
awk -F. '!($1 == 100 && $2 >= 64 && $2 <= 127) {print "NICHT-TAILNET: " $0; bad = 1} END {exit bad}' <<<"$ips"
```

### Task L2 (Operator/Live): Secrets für devmesh versiegeln (45 min)

Vorbedingung: L1 erledigt.

```bash
kubectl --context devmesh apply -f k3d/sealed-secrets-controller.yaml
kubectl --context devmesh -n sealed-secrets rollout status deploy/sealed-secrets-controller --timeout=180s
kubeseal --controller-name=sealed-secrets-controller --controller-namespace=sealed-secrets \
  --context devmesh --fetch-cert > environments/certs/dev.pem
# Pocket-ID-Key der k3d-Quelle uebernehmen, sonst ist die migrierte pocket_id-DB unlesbar
SRC_KEY=$(kubectl --context k3d-mentolder-dev -n workspace get secret workspace-secrets \
  -o jsonpath='{.data.POCKET_ID_ENCRYPTION_KEY}' | base64 -d)
yq -i ".POCKET_ID_ENCRYPTION_KEY = \"$SRC_KEY\"" environments/.secrets/dev.yaml
yq -e '.IPV64_API_KEY and .GITHUB_PAT' environments/.secrets/dev.yaml >/dev/null   # beide gesetzt
task env:seal ENV=dev
yq ea -r 'select(.kind == "SealedSecret") | .metadata.namespace + "/" + .metadata.name' environments/sealed-secrets/dev.yaml
# erwartet u. a.: workspace/workspace-secrets, workspace/website-secrets, cert-manager/ipv64-api-key
```

`env-seal.sh` nutzt das vorhandene `environments/certs/dev.pem` (Z. 327) und holt kein neues.

### Task L3 (Operator/Live): Deploy und Abnahme (1 h)

Vorbedingung: L2 erledigt, Branch-Stand ausgecheckt.

```bash
task devmesh:deploy                     # letzte Zeile: devmesh:deploy ok (Profil core)
task devmesh:status                     # Certificate Ready=True, alle Deployments verfuegbar
# von PK-L-1 ausserhalb des Heimnetzes (Tailnet, keine zusaetzliche CA):
curl -sf https://web.devmesh.mentolder.de/api/health
kubectl --context devmesh -n workspace exec deploy/sdlc-console -- sh -c 'echo BUILD_TARGET=$BUILD_TARGET'   # BUILD_TARGET=sdlc
# Degradierung: PK-Desktop-Proxy stoppen, Console bleibt Running
kubectl --context devmesh -n workspace get pod -l app=sdlc-console -o jsonpath='{.items[0].status.phase}{"\n"}'   # Running
task devmesh:backup:run
kubectl --context devmesh -n workspace wait --for=condition=complete job -l app=shared-db-backup --timeout=600s
```

Ergebnisse mit Befehlen als Ticket-Kommentar an T900118.
