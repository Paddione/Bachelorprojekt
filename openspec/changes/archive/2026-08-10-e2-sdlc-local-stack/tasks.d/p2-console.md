# Partial p2 — Console: Deployment + Ingress

> **Agent:** deepseek | **Files:** k3d/sdlc-stack/sdlc-console.yaml, k3d/sdlc-stack/sdlc-ingress.yaml | **Steps:** 4
> **Verify:** `kubectl get deploy sdlc-console -n workspace` Ready; `curl -sS -o /dev/null -w '%{http_code}' http://sdlc.localhost` → 200

## Scope

Das SDLC-Console-Deployment (Image `ghcr.io/paddione/website-sdlc:latest`, `BUILD_TARGET=sdlc`
im Image gebacken) mit lokaler DB-Anbindung (`website`-DB, `tickets`-Schema bootstrappt
selbst), lokalen bge-Gateways und lokaler Pocket ID — plus der Ingress für `sdlc.localhost`
und `auth.localhost`. Modelliert auf `k3d/website.yaml`, aber getrimmt auf den SDLC-Bedarf.

Wichtige Vorgaben aus design.md (D2, D3, D4):

- `namespace: workspace` setzt das Overlay — Datei KEINEN `namespace:`-Block hart tragen, der
  dem widerspricht (namespace-frei lassen oder `workspace`).
- Keine `${VAR}`-Platzhalter in diesen zwei neuen Dateien — lokale Werte hart, der Stack ist
  fixed-topology (envsubst betrifft nur die referenzierten Base-Dateien).
- Plain HTTP (kein TLS): `http://sdlc.localhost`, `http://auth.localhost`.
- Boot-Fail ohne OIDC-Secret (T001593) bleibt aktiv — Secrets kommen per `secretKeyRef` aus
  `website-secrets` (in `k3d/secrets.yaml` enthalten: `POCKET_ID_WEBSITE_SECRET` bzw.
  `WEBSITE_OIDC_SECRET`, `CRON_SECRET`, `WEBSITE_DB_PASSWORD`).

## Task List

### 1. `k3d/sdlc-stack/sdlc-console.yaml` anlegen

- [ ] **1.1** ConfigMap `sdlc-console-config` (namespace-frei, Label `app: sdlc-console`) mit:
      - `BRAND_ID: mentolder`, `BRAND: mentolder`, `CLUSTER_ENV: sdlc-local`,
        `PINO_LOG_LEVEL: info`
      - `SITE_URL: http://sdlc.localhost`
      - `POCKET_ID_FRONTEND_URL: http://auth.localhost`
      - `POCKET_ID_URL: http://pocket-id:1411`
      - Fallback-Issuer (D4): `POCKET_ID_FALLBACK_FRONTEND_URL: https://auth.mentolder.de`,
        `POCKET_ID_FALLBACK_URL: https://auth.mentolder.de`
      - `PORTAL_ADMIN_USERNAME: gekko,paddione,quamain,test-admin,tina-merlin@web.de`
      - bge: `LLM_ENABLED: "true"`, `LLM_RERANK_ENABLED: "true"`,
        `LLM_EMBED_URL: http://llm-gateway-embed:8081`,
        `LLM_RERANKER_URL: http://llm-gateway-rerank:8081`, `LLM_EMBED_MODEL: bge-m3`
- [ ] **1.2** Deployment `sdlc-console`, Replicas 1, Label `app: sdlc-console`:
      - `image: ghcr.io/paddione/website-sdlc:latest`, `imagePullPolicy: IfNotPresent`
      - `imagePullSecrets: [ghcr-pull-secret]` (existiert in `k3d/secrets.yaml`)
      - `envFrom: [configMapRef: sdlc-console-config]`
      - `env`: `SESSIONS_DATABASE_URL:
        postgresql://website:devwebsitedb@shared-db:5432/website` (hart — dev-Passwort, wie
        `k3d/secrets.yaml`), `WEBSITE_DB_PASSWORD` via `secretKeyRef` `website-secrets`,
        `POCKET_ID_WEBSITE_SECRET` via `secretKeyRef` `website-secrets` (Key
        `POCKET_ID_WEBSITE_SECRET`; Fallback-Logik: wenn der Key fehlt, `WEBSITE_OIDC_SECRET`
        — siehe auth.ts), `CRON_SECRET` via `secretKeyRef` `website-secrets`
      - `securityContext` wie `k3d/website.yaml` (runAsNonRoot 1000, drop ALL, seccomp
        RuntimeDefault), `dnsConfig` ndots 3 (Muster aus website.yaml)
      - `ports: [{name: http, containerPort: 8080}]`, `readinessProbe` httpGet `/api/health`
        auf 8080, `resources` requests 256Mi/250m, limits 1Gi/1 (bewusst moderat — der
        lokale RAM ist die knappe Ressource)
- [ ] **1.3** Service `sdlc-console`, Port 8080 → targetPort 8080, Selector `app: sdlc-console`.

### 2. `k3d/sdlc-stack/sdlc-ingress.yaml` anlegen

- [ ] **2.1** Ingress `sdlc-ingress` (networking.k8s.io/v1), rule `sdlc.localhost` → Service
      `sdlc-console` Port 8080, rule `auth.localhost` → Service `pocket-id` Port 1411.
      Traefik-Annotationen minimal (keine TLS-Middlewares — plain HTTP auf `web`; die
      Prod-Middleware-Annotationen bewusst weglassen, wie im dev-stack-Kommentar
      dokumentiert).
- [ ] **2.2** `auth.localhost`-Rule nur wenn das `pocket-id`-Service im Overlay tatsächlich
      `pocket-id` heißt (Base `k3d/pocket-id.yaml` definiert Service `pocket-id` — beim
      Bauen verifizieren; ggf. Host `auth.localhost` → `pocket-id:1411`).

### 3. Overlay-Build prüfen

- [ ] **3.1** `kubectl kustomize --load-restrictor=LoadRestrictionsNone k3d/sdlc-stack` baut
      fehlerfrei und enthält `sdlc-console`, `sdlc-console-config`, `sdlc-ingress`.
- [ ] **3.2** `bash scripts/openspec.sh validate` bleibt grün (keine Manifest-Änderungen an
      bestehenden Base-Dateien).

### 4. Deployment im Cluster verifizieren

- [ ] **4.1** `task sdlc:deploy` (nach p1) — `kubectl rollout status deploy/sdlc-console -n
      workspace --timeout=300s` → Ready.
- [ ] **4.2** `curl -sS -o /dev/null -w '%{http_code}' http://sdlc.localhost` → 200.
- [ ] **4.3** `curl -sS http://sdlc.localhost/api/health` — Response nennt das sdlc-Target
      (BUILD_TARGET-Beleg).
- [ ] **4.4** `kubectl exec -n workspace deploy/shared-db -- psql -U postgres -d website
      -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='tickets'"`
      → > 0 (Schema hat sich selbst bootstrapt).
- [ ] **4.5** `kubectl get ingress -n workspace` zeigt `sdlc-ingress` mit beiden Hosts.

## Verify

```bash
kubectl get deploy sdlc-console -n workspace            # Ready 1/1
curl -sS -o /dev/null -w '%{http_code}' http://sdlc.localhost   # 200
kubectl exec -n workspace deploy/shared-db -- psql -U postgres -d website -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='tickets'"  # > 0
```
