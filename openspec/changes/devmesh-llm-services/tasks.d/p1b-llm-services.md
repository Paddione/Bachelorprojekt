<!-- Partial p1b-llm-services — target_files: dev-local/components/llm-services/kustomization.yaml, dev-local/components/llm-services/deployment.yaml, dev-local/components/llm-services/service.yaml, dev-local/core/kustomization.yaml, environments/schema.yaml, scripts/migrations/2026-09-16-devmesh-llm-proxy-backends.sql, taskfiles/Taskfile.devmesh.yml -->

## Partial P1b: Komponente llm-services und Registry

**Rolle:** impl. **depends_on:** `p1a-gpu-endpoint` (Portliste im Inventar, lauffaehiger Render).

**Ziel:** devmesh bekommt die Komponente `llm-services` (llm-proxy, mcp-postgres, bge-mcp in einem
`mcp-node`-Pod) und die devmesh-`shared-db` eine eigene `tickets.llm_proxy_backends` ohne
Loopback-URL (design.md D3, D4, D5).

**Spec:** `openspec/changes/devmesh-llm-services/specs/local-dev-mesh.md` ("devmesh hosts the
CPU-bound LLM and database services", "The devmesh backend registry contains no loopback URLs")
und `specs/local-llm-proxy.md` → "The proxy serves remote backends only".

### Befunde aus der Planung

Befunde B1–B3 (Inventaradresse, Tailnet-Guard, GPU-Portliste) stehen in `tasks.d/p1a-gpu-endpoint.md`.

- **B4 — `mcp_readonly` hat auf devmesh kein Passwort.** `k3d/shared-db.yaml` legt die Rolle als
  `LOGIN` ohne Passwort an; der Pod verbindet ueber TCP und braucht eines. P1b fuehrt dafuer den
  Schluessel `MCP_READONLY_DB_PASSWORD` ein, `task devmesh:registry:migrate` setzt ihn per
  `ALTER ROLE`. `k3d/**` bleibt unberuehrt.
- **B5 — Repo-Checkout.** `docker/mcp-node/supervisor.sh` startet `node $REPO/scripts/...`, der Pod
  braucht also einen Checkout. Entscheidung: `repo-sync` wie im dev-pod, aber als nativer Sidecar
  (`initContainers` mit `restartPolicy: Always`, k3s v1.36) mit `startupProbe` auf `.git` und einem
  `emptyDir` statt PVC. Begruendung: Der Sidecar gibt den Hauptcontainer erst frei, wenn der Clone
  steht (kein Crash-Loop der Node-Server beim ersten Start). `emptyDir` bindet den Pod an keinen
  `local-path`-Knoten, braucht kein `Recreate` und haengt nicht an den `storage=true`-Knoten. Preis:
  ein flacher Clone je Pod-Start.
- **B6 — `dev-local/full/kustomization.yaml` und `environments/dev.yaml` bleiben unveraendert.**
  `full` bindet `../core` als Ressource ein und erbt die Komponente. `environments/dev.yaml` fuehrt
  keine Secret-Schluessel; die neuen Schluessel stehen im Schema, ihre Werte in
  `environments/.secrets/dev.yaml` (Operator-Schritt, Task P1b.3).
- **B7 — Seal-Befehl.** `bash scripts/vda.sh oracle --dry-run 'seal secrets for dev'` liefert am
  2026-09-16 `NONE`. Der Befehl stammt deshalb aus `Taskfile.yml` (`env:seal`, Zeile 3016):
  `task env:seal ENV=dev` (ruft `bash scripts/env-seal.sh --env dev --env-dir environments`).

### File Structure (dieses Partial)

| Datei | Verantwortung | Ist | Budget |
|---|---|---|---|
| `dev-local/components/llm-services/kustomization.yaml` | Component-Rahmen | 0 (neu) | kein S1-Limit (.yaml) |
| `dev-local/components/llm-services/deployment.yaml` | mcp-node + repo-sync-Sidecar | 0 (neu) | kein S1-Limit (.yaml) |
| `dev-local/components/llm-services/service.yaml` | Service `llm-services` (18235, 13001, 13005) | 0 (neu) | kein S1-Limit (.yaml) |
| `dev-local/core/kustomization.yaml` | Komponente einhaengen | 130 | kein S1-Limit (.yaml) |
| `environments/schema.yaml` | drei neue Secret-Schluessel | 1695 | kein S1-Limit (.yaml) |
| `scripts/migrations/2026-09-16-devmesh-llm-proxy-backends.sql` | Tabelle + devmesh-Seed | 0 (neu) | kein S1-Limit (.sql) |
| `taskfiles/Taskfile.devmesh.yml` | `registry:migrate`, Aufruf aus `deploy` | 117 | kein S1-Limit (.yml) |

**S1:** Keine Datei dieses Partials faellt unter `s1.limits` (`.yaml`, `.yml`, `.sql`); Messbefehl in
`tasks.d/p1a-gpu-endpoint.md`.

**S4:** `scripts/migrations/*.sql` und `scripts/devmesh/*.sh` liegen ausserhalb der S4-Globs
(`scripts/*.sh`, `scripts/*.mjs`). Die Migration ist trotzdem ueber `taskfiles/Taskfile.devmesh.yml`
erreichbar (Task P1b.2). S3 greift nicht: keine der Dateien liegt unter `fleet/`, `prod*/` oder
`components/website/src/`, und kein Snippet nennt eine Brand-Domain.

### Interfaces

- **Consumes (von P2, docker/**):** Der `mcp-node`-Supervisor wertet `MCP_NODE_SERVICES`
  (kommagetrennt: `llm-proxy,postgres,bge-mcp`) aus und startet bge-mcp mit `BGE_MCP_HOST`,
  `BGE_MCP_PORT=3007`, `BGE_MCP_TOKEN`. Fehlt ein Token, startet er den Dienst nicht (D5).
- **Consumes (von P1a):** `devmesh/inventory.yaml` mit `gpu_endpoint.ports` und ein lauffaehiges
  `render-stack.sh core`.
- **Produces fuer P5a (tests/**):**
  - `render-stack.sh core` enthaelt `Deployment/llm-services` und `Service/llm-services` mit den
    Ports 18235, 13001, 13005.
  - Die Migration enthaelt kein `127.0.0.1` und kein `localhost`.
- **Produces fuer P3a/P3b (Clients):** `svc/llm-services` im Namespace `workspace`, Context `devmesh`,
  Ports 18235, 13001, 13005.

---

### Task P1b.1: Komponente `llm-services` und Einhaengen in core

**Files:**
- Create: `dev-local/components/llm-services/kustomization.yaml`
- Create: `dev-local/components/llm-services/deployment.yaml`
- Create: `dev-local/components/llm-services/service.yaml`
- Modify: `dev-local/core/kustomization.yaml`

- [ ] **Schritt 1: `kustomization.yaml`**

```yaml
# dev-local/components/llm-services — llm-proxy, mcp-postgres, bge-mcp auf devmesh [T900191]
# (openspec/changes/devmesh-llm-services/design.md D4). Eingehaengt in dev-local/core.
apiVersion: kustomize.config.k8s.io/v1alpha1
kind: Component
resources:
  - deployment.yaml
  - service.yaml
```

- [ ] **Schritt 2: `deployment.yaml`**

```yaml
# llm-services — mcp-node-Image mit Dienstauswahl (MCP_NODE_SERVICES) [T900191, D4, D5].
# Repo-Checkout: repo-sync als nativer Sidecar mit startupProbe auf .git, damit die
# Node-Server erst nach dem Clone starten; emptyDir statt PVC, damit der Pod an keinen
# local-path-Knoten gebunden ist (Plan-Befund B5). Tokens fail-closed aus workspace-secrets.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-services
  labels: {app: llm-services}
spec:
  replicas: 1
  selector:
    matchLabels: {app: llm-services}
  template:
    metadata:
      labels: {app: llm-services}
    spec:
      imagePullSecrets:
        - name: ghcr-pull-secret
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
        seccompProfile: {type: RuntimeDefault}
      initContainers:
        - name: repo-sync
          image: ghcr.io/paddione/repo-sync:latest
          imagePullPolicy: Always
          restartPolicy: Always
          env:
            - {name: REPO_DIR, value: /workspace/repo}
            - {name: REPO_URL, value: "https://github.com/paddione/Bachelorprojekt.git"}
            - {name: REPO_REF, value: main}
            - {name: SYNC_INTERVAL_SECONDS, value: "300"}
          startupProbe:
            exec:
              command: ["test", "-d", "/workspace/repo/.git"]
            periodSeconds: 5
            failureThreshold: 120
          resources:
            requests: {cpu: 10m, memory: 32Mi}
            limits: {memory: 128Mi}
          securityContext: {allowPrivilegeEscalation: false}
          volumeMounts:
            - {name: repo, mountPath: /workspace/repo}
      containers:
        - name: mcp-node
          image: ghcr.io/paddione/mcp-node:latest
          imagePullPolicy: Always
          env:
            - {name: MCP_NODE_SERVICES, value: "llm-proxy,postgres,bge-mcp"}
            - {name: LLM_PROXY_HOST_BIND, value: "0.0.0.0"}
            - {name: LLM_PROXY_PORT, value: "18235"}
            - {name: LLM_PROXY_REMOTE_ONLY, value: "1"}
            - {name: BGE_MCP_HOST, value: "0.0.0.0"}
            - {name: BGE_MCP_PORT, value: "3007"}
            # bge-mcp spricht den Proxy im selben Pod an (kein Registry-Eintrag).
            - {name: LLM_EMBED_URL, value: "http://127.0.0.1:18235"}
            - {name: LLM_RERANKER_URL, value: "http://127.0.0.1:18235"}
            - {name: DEV_POD_REPO, value: /workspace/repo}
            - name: WEBSITE_DB_PASSWORD
              valueFrom: {secretKeyRef: {name: workspace-secrets, key: WEBSITE_DB_PASSWORD, optional: true}}
            - name: FACTORY_PG_URL
              value: "postgresql://website:$(WEBSITE_DB_PASSWORD)@shared-db.workspace.svc.cluster.local:5432/website"
            - name: MCP_READONLY_DB_PASSWORD
              valueFrom: {secretKeyRef: {name: workspace-secrets, key: MCP_READONLY_DB_PASSWORD, optional: true}}
            - name: DATABASE_URL
              value: "postgresql://mcp_readonly:$(MCP_READONLY_DB_PASSWORD)@shared-db.workspace.svc.cluster.local:5432/website"
            - {name: PGOPTIONS, value: "-c statement_timeout=120000ms"}
            - name: BGE_MCP_TOKEN
              valueFrom: {secretKeyRef: {name: workspace-secrets, key: BGE_MCP_TOKEN, optional: true}}
            - name: MCP_POSTGRES_TOKEN
              valueFrom: {secretKeyRef: {name: workspace-secrets, key: MCP_POSTGRES_TOKEN, optional: true}}
            - name: LLM_PROXY_ADMIN_TOKEN
              valueFrom: {secretKeyRef: {name: workspace-secrets, key: LLM_PROXY_ADMIN_TOKEN, optional: true}}
            - name: DEEPSEEK_API_KEY
              valueFrom: {secretKeyRef: {name: workspace-secrets, key: DEEPSEEK_API_KEY, optional: true}}
          ports:
            - {containerPort: 18235, name: llm-proxy, protocol: TCP}
            - {containerPort: 3001, name: postgres, protocol: TCP}
            - {containerPort: 3007, name: bge-mcp, protocol: TCP}
          readinessProbe:
            # Nur der Proxy: postgres und bge-mcp starten ohne Token nicht (D5) und
            # duerfen den Pod dann nicht dauerhaft NotReady halten.
            tcpSocket: {port: 18235}
            initialDelaySeconds: 10
            periodSeconds: 10
            failureThreshold: 6
          resources:
            requests: {cpu: 100m, memory: 256Mi}
            limits: {cpu: "1", memory: 1Gi}
          securityContext: {allowPrivilegeEscalation: false}
          volumeMounts:
            - {name: repo, mountPath: /workspace/repo, readOnly: true}
            - {name: tmp, mountPath: /tmp}
      volumes:
        - {name: repo, emptyDir: {}}
        - {name: tmp, emptyDir: {}}
```

- [ ] **Schritt 3: `service.yaml`**

```yaml
# llm-services — ClusterIP, erreichbar nur per kubectl port-forward (D6). Kein Ingress:
# mcp-postgres liest die Website-Datenbank.
apiVersion: v1
kind: Service
metadata:
  name: llm-services
  labels: {app: llm-services}
spec:
  type: ClusterIP
  selector: {app: llm-services}
  ports:
    - {name: llm-proxy, port: 18235, targetPort: 18235, protocol: TCP}
    - {name: postgres, port: 13001, targetPort: 3001, protocol: TCP}
    - {name: bge-mcp, port: 13005, targetPort: 3007, protocol: TCP}
```

- [ ] **Schritt 4: In `dev-local/core/kustomization.yaml` einhaengen** (nach `resources:`)

```yaml
# CPU-gebundene LLM- und DB-Dienste (T900191, design.md D4).
components:
  - ../components/llm-services
```

- [ ] **Schritt 5: Pruefen**

```bash
kubectl kustomize --load-restrictor=LoadRestrictionsNone dev-local/core > /tmp/p1b-kustomize.yaml; echo "rc=$?"
bash scripts/devmesh/render-stack.sh core > /tmp/p1b-core.yaml
yq ea -r 'select(.kind == "Service" and .metadata.name == "llm-services") | [.spec.ports[] | (.port|tostring) + ">" + (.targetPort|tostring)] | join(",")' /tmp/p1b-core.yaml
yq ea -r 'select(.kind == "Deployment" and .metadata.name == "llm-services") | .metadata.namespace + " " + (.spec.template.spec.containers[0].env[] | select(.name == "MCP_NODE_SERVICES") | .value)' /tmp/p1b-core.yaml
bash scripts/devmesh/render-stack.sh full | yq ea -r 'select(.kind == "Deployment") | .metadata.name' | grep -cx llm-services
bash scripts/devmesh/render-stack.sh core | kubectl apply --dry-run=client -f - >/dev/null; echo "dry-run rc=$?"
```

Erwartet: `rc=0`; `18235>18235,13001>3001,13005>3007`; `workspace llm-proxy,postgres,bge-mcp`;
`full` enthaelt das Deployment genau einmal (`1`); `dry-run rc=0`.

---

### Task P1b.2: Schema-Schluessel, Registry-Migration und Taskfile

**Files:**
- Modify: `environments/schema.yaml`
- Create: `scripts/migrations/2026-09-16-devmesh-llm-proxy-backends.sql`
- Modify: `taskfiles/Taskfile.devmesh.yml`

- [ ] **Schritt 1: Schema** (im Abschnitt `secrets:`, direkt nach `LLM_PROXY_ADMIN_TOKEN`)

`LLM_PROXY_ADMIN_TOKEN` existiert bereits (`required: false`, `default_dev`) und steht in
`k3d/secrets.yaml`; der Eintrag bleibt unveraendert. Neu:

```yaml
  # ── devmesh llm-services (T900191, design.md D5) ─────────────────────────────
  # Gelesen von dev-local/components/llm-services aus workspace-secrets (Context devmesh).
  # Nicht in k3d/secrets.yaml: devmesh rendert diese Datei nicht (dev-local/core).
  - name: BGE_MCP_TOKEN
    required: false
    generate: true
    length: 48
    dev_absent: true
    dev_absent_reason: "Nur devmesh (sealed-secrets/dev.yaml); k3d/secrets.yaml wird auf devmesh nicht gerendert."
    description: "Bearer-Token des bge-mcp-Servers im devmesh-Pod llm-services (Port 13005)."
  - name: MCP_POSTGRES_TOKEN
    required: false
    generate: true
    length: 48
    dev_absent: true
    dev_absent_reason: "Nur devmesh (sealed-secrets/dev.yaml); k3d/secrets.yaml wird auf devmesh nicht gerendert."
    description: "Bearer-Token des mcp-postgres-Servers im devmesh-Pod llm-services (Port 13001)."
  - name: MCP_READONLY_DB_PASSWORD
    required: false
    generate: true
    length: 32
    dev_absent: true
    dev_absent_reason: "Nur devmesh; task devmesh:registry:migrate setzt es per ALTER ROLE mcp_readonly."
    description: "Passwort der Rolle mcp_readonly in der devmesh-shared-db (DATABASE_URL von mcp-postgres)."
```

`generate: true` mit `length` erzeugt Hex-taugliche Werte ohne URL-Sonderzeichen; die Werte stehen
unmaskiert in `DATABASE_URL`.

- [ ] **Schritt 2: Migration anlegen**

```sql
-- 2026-09-16-devmesh-llm-proxy-backends.sql
-- Backend-Registry des llm-proxys in der devmesh-shared-db [T900191, design.md D3].
-- Schema identisch zu fleet: 2026-07-22-llm-proxy-backends.sql,
-- 2026-07-23-llm-proxy-max-inflight.sql, 2026-08-29-bge-role-registry.sql.
-- Keine Loopback-URL: im Pod erreicht die Loopback-Adresse weder den Arbeitsplatz noch Cluster-Dienste.
--   Windows-GPU  -> llm-gateway-host:<port> (Ports aus devmesh/inventory.yaml gpu_endpoint.ports)
--   bge          -> Cluster-DNS der Services aus k3d/llm-gpu.yaml
-- Nicht geseedet: pk-tablet-rerank (Tablet, Tailnet-ACL erlaubt nur gpu-host),
--   bge-rerank-cpu (zeigte auf den Proxy selbst, Loadout-Mechanik entfernt),
--   opencode-zen (lokaler Port 5099 ist kein GPU-Dienst und kein Repo-Prozess; die ACL oeffnet nur GPU-Ports).
-- Idempotent. Anwenden: task devmesh:registry:migrate
BEGIN;

CREATE SCHEMA IF NOT EXISTS tickets AUTHORIZATION website;

CREATE TABLE IF NOT EXISTS tickets.llm_proxy_backends (
  id            serial PRIMARY KEY,
  name          text UNIQUE NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('llamacpp','lmstudio','openai-remote')),
  base_url      text NOT NULL,
  api_key_env   text,
  enabled       boolean NOT NULL DEFAULT true,
  priority      integer NOT NULL DEFAULT 100,
  fixups        jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_aliases jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tickets.llm_proxy_backends
  ADD COLUMN IF NOT EXISTS max_inflight integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS loadout_slug text;
ALTER TABLE tickets.llm_proxy_backends OWNER TO website;

INSERT INTO tickets.llm_proxy_backends
  (name, kind, base_url, api_key_env, enabled, priority, fixups, model_aliases, max_inflight, roles, loadout_slug)
VALUES
  ('freetoken-qwen36', 'llamacpp',      'http://llm-gateway-host:1919/v1', NULL, true, 1,  '[]'::jsonb, '{"Qwen3.6-35B-A3B-NVFP4": "Qwen3.6-35B-A3B-NVFP4"}'::jsonb, 1, '[]'::jsonb, NULL),
  ('llamacpp-gemma12', 'llamacpp',      'http://llm-gateway-host:8089/v1', NULL, true, 1,  '[]'::jsonb, '{"gemma12-vision": "gemma-4-12B-it-qat-UD-Q4_K_XL.gguf"}'::jsonb, 3, '[]'::jsonb, NULL),
  ('llamacpp-gemma4',  'llamacpp',      'http://llm-gateway-host:8090/v1', NULL, true, 1,  '[]'::jsonb, '{}'::jsonb, 1, '[]'::jsonb, NULL),
  ('llamacpp-qwen38',  'llamacpp',      'http://llm-gateway-host:8094/v1', NULL, true, 1,  '[]'::jsonb, '{"qwen38-220k": "qwen38-220k"}'::jsonb, 1, '[]'::jsonb, NULL),
  ('cluster-embed',    'llamacpp',      'http://llm-gateway-embed.workspace.svc.cluster.local:8081',  NULL, true, 10, '[]'::jsonb, '{}'::jsonb, 1, '["embed"]'::jsonb,  NULL),
  ('cluster-rerank',   'llamacpp',      'http://llm-gateway-rerank.workspace.svc.cluster.local:8081', NULL, true, 10, '[]'::jsonb, '{}'::jsonb, 1, '["rerank"]'::jsonb, NULL),
  ('lmstudio',         'lmstudio',      'http://llm-gateway-host:1234/v1', NULL, true, 20, '[]'::jsonb, '{}'::jsonb, 1, '["embed"]'::jsonb, NULL),
  ('deepseek',         'openai-remote', 'https://api.deepseek.com/v1', 'DEEPSEEK_API_KEY', true, 90, '[]'::jsonb, '{}'::jsonb, 1, '[]'::jsonb, NULL)
ON CONFLICT (name) DO UPDATE
  SET kind          = EXCLUDED.kind,
      base_url      = EXCLUDED.base_url,
      api_key_env   = EXCLUDED.api_key_env,
      enabled       = EXCLUDED.enabled,
      priority      = EXCLUDED.priority,
      model_aliases = EXCLUDED.model_aliases,
      max_inflight  = EXCLUDED.max_inflight,
      roles         = EXCLUDED.roles,
      loadout_slug  = EXCLUDED.loadout_slug,
      updated_at    = now();

-- Altbestand aus migrate-from-k3d (fleet-Zeilen mit Loopback-Zielen): alles abschalten,
-- was dieser Seed nicht fuehrt.
UPDATE tickets.llm_proxy_backends
   SET enabled = false, updated_at = now()
 WHERE enabled
   AND name NOT IN ('freetoken-qwen36','llamacpp-gemma12','llamacpp-gemma4','llamacpp-qwen38',
                    'cluster-embed','cluster-rerank','lmstudio','deepseek');

COMMIT;
```

Die Datei enthaelt weder `127.0.0.1` noch `localhost`, auch nicht in Kommentaren, damit ein
zeilenweiser P5a-Guard (`grep`) ohne Ausnahmen auskommt.

- [ ] **Schritt 3: Seed-Werte ohne Cluster pruefen**

```bash
f=scripts/migrations/2026-09-16-devmesh-llm-proxy-backends.sql
urls="$(grep -oE "'(https?://[^']+)'" "$f" | tr -d "'")"
echo "Anker: urls=$(printf '%s\n' "$urls" | grep -c .)"
grep -cE '127\.0\.0\.1|localhost' "$f" || echo "kein Loopback"
printf '%s\n' "$urls" | sed -nE 's#http://llm-gateway-host:([0-9]+)/v1#\1#p' | sort -u | tr '\n' ' '
yq -r '.gpu_endpoint.ports[].port' devmesh/inventory.yaml | sort -u | tr '\n' ' '
```

Erwartet: `Anker: urls=8`, `0` gefolgt von `kein Loopback`, beide Portzeilen `1234 1919 8089 8090 8094`.

- [ ] **Schritt 4: Taskfile — neuer Task und Aufruf aus `deploy`**

Kopfkommentar um `task devmesh:registry:migrate` ergaenzen. Neuer Task:

```yaml
  registry:migrate:
    desc: "devmesh: llm-proxy-Registry seeden und mcp_readonly-Passwort setzen [T900191]"
    preconditions:
      - sh: kubectl config get-contexts -o name | grep -qx devmesh
        msg: "Context devmesh fehlt — erst task devmesh:kubeconfig"
    cmds:
      - |
        set -euo pipefail
        CTX=devmesh; NS=workspace
        MIG=scripts/migrations/2026-09-16-devmesh-llm-proxy-backends.sql
        kubectl --context "$CTX" -n "$NS" rollout status deployment/shared-db --timeout=300s
        pw="$(kubectl --context "$CTX" -n "$NS" get secret workspace-secrets \
          -o jsonpath='{.data.MCP_READONLY_DB_PASSWORD}' | base64 -d)"
        [ -n "$pw" ] || { echo "MCP_READONLY_DB_PASSWORD fehlt in workspace-secrets (task env:seal ENV=dev)" >&2; exit 2; }
        kubectl --context "$CTX" -n "$NS" exec -i deploy/shared-db -c postgres -- \
          psql -U postgres -d website -v ON_ERROR_STOP=1 -q < "$MIG"
        # Passwort nur ueber stdin, nie als Argument (Prozessliste).
        printf "\\set pw '%s'\nALTER ROLE mcp_readonly PASSWORD :'pw';\n" "$pw" \
          | kubectl --context "$CTX" -n "$NS" exec -i deploy/shared-db -c postgres -- \
              psql -U postgres -d website -v ON_ERROR_STOP=1 -q
        kubectl --context "$CTX" -n "$NS" exec deploy/shared-db -c postgres -- \
          psql -U postgres -d website -Atc "select 'aktiv=' || count(*) filter (where enabled) || ' loopback=' || count(*) filter (where enabled and base_url ~ '127\.0\.0\.1|localhost') from tickets.llm_proxy_backends"
```

Im Task `deploy` nach dem bestehenden mehrzeiligen Kommando als zweiter Eintrag in `cmds:`:

```yaml
      - task: registry:migrate
```

Die Rollout-Schleife in `deploy` wartet damit auch auf `llm-services`; die Readiness haengt nur am
Proxy-Port, der Proxy lauscht auch bei leerer Registry (Poll-Fallback, design.md Fehlerverhalten).

- [ ] **Schritt 5: Pruefen**

```bash
task --list-all 2>/dev/null | grep -F 'devmesh:registry:migrate'
yq -r '.tasks.deploy.cmds[-1].task' taskfiles/Taskfile.devmesh.yml
python3 -c 'import yaml; s=yaml.safe_load(open("environments/schema.yaml")); n={x["name"] for x in s["secrets"]}; print(sorted(k for k in ["BGE_MCP_TOKEN","MCP_POSTGRES_TOKEN","MCP_READONLY_DB_PASSWORD","LLM_PROXY_ADMIN_TOKEN"] if k in n))'
tests/unit/lib/bats-core/bin/bats tests/spec/secrets-deploy-automation/schema-dev-secrets-sync.bats tests/unit/secrets-sync.bats
```

Erwartet: Task gelistet; letzter `deploy`-Eintrag ist `registry:migrate`; alle vier Schluessel
im Schema; beide Secret-Guards gruen (die neuen Schluessel sind `dev_absent`).

---

### Task P1b.3: Operator-Schritte (manuell, ausserhalb dieses Partials)

Kein Agent fuehrt diese Schritte aus. Sie gehoeren ins Runbook (P4) und sind hier festgehalten,
weil die Manifeste ohne sie fail-closed starten.

- [ ] Werte in `environments/.secrets/dev.yaml` eintragen: `BGE_MCP_TOKEN`, `MCP_POSTGRES_TOKEN`,
  `MCP_READONLY_DB_PASSWORD` (z. B. `openssl rand -hex 24`), `LLM_PROXY_ADMIN_TOKEN` und
  `DEEPSEEK_API_KEY` (bestehende Werte der Clients uebernehmen).
- [ ] Siegeln: `task env:fetch-cert ENV=dev`, dann `task env:seal ENV=dev` (Befund B7), Ergebnis
  `environments/sealed-secrets/dev.yaml` in einem eigenen Commit.
- [ ] Tailnet-ACL aus `devmesh/tailnet-policy.hujson` in der Admin-Konsole einspielen (design.md R1).
- [ ] `task devmesh:deploy PROFILE=core`, danach Erreichbarkeit pruefen:
  ```bash
  kubectl --context devmesh -n workspace get secret ghcr-pull-secret -o name
  kubectl --context devmesh -n workspace run p1-probe --rm -i --restart=Never --image=curlimages/curl -- \
    sh -c 'for p in 1234 1919 8089 8090 8094; do printf "%s " $p; curl -s -o /dev/null -m 5 -w "%{http_code}\n" http://llm-gateway-host:$p/v1/models; done'
  ```
  Erwartet: das Pull-Secret existiert; jeder laufende GPU-Dienst antwortet mit `200`, ein
  abgeschalteter mit `000`.

### Task P1b.4: Verifikation dieses Partials

**Files:**
- Verify: alle Dateien aus der File-Structure-Tabelle

- [ ] **Schritt 1: Render und Secret-Guards**

```bash
kubectl kustomize --load-restrictor=LoadRestrictionsNone dev-local/core >/dev/null && echo kustomize-ok
bash scripts/devmesh/render-stack.sh core | grep -cE 'name: (llm-services|llm-gateway-host)$'
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/ \
  tests/spec/secrets-deploy-automation/schema-dev-secrets-sync.bats tests/unit/secrets-sync.bats
```

Erwartet: `kustomize-ok`, Treffer mindestens 4. Im BATS-Lauf ist nur der in P1a B2 genannte
Tailnet-Test rot, bis P5a ihn umstellt.

- [ ] **Schritt 2: Die drei Pflicht-Kommandos**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Erwartet: alle drei Exit 0 bis auf den B2-Test in `task test:changed`, falls P5a noch nicht gemergt
ist. `task freshness:check` meldet `0 blocking`.
