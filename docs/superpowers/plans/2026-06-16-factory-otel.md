---
title: Factory-OTel-Observability Implementation Plan
ticket_id: T000883
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Factory-OTel-Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OTLP-Telemetrie pro Factory-Pipeline-Phase und pro Dispatcher-Tick zu einem on-prem OTel-Collector exportieren (in Prometheus persistiert) und in einem eigenen Admin-Dashboard `/admin/factory-observability` sichtbar machen.

**Architecture:** Vier entkoppelte Stages. (A) On-prem OTel-Collector im `monitoring`-ns + Bearer-/TLS-gesicherte Traefik-IngressRoute `otel.<domain>`, gescraped via ServiceMonitor. (B) Native Claude-Code-Telemetrie via `OTEL_*`-Env in `autopilot.env`. (C) Factory-eigene Spans/Metriken über ein pures `otel-emit.cjs`-Modul (fetch-basiert, OTLP/HTTP-JSON) + `otel-emit.sh`-Zwilling, minimal-invasiv in `pipeline.js`/`dispatcher.js`/`wakeup.sh` verdrahtet. (D) Website-Admin-Dashboard, das Prometheus serverseitig proxied (neue allow-egress-NetworkPolicy website→monitoring) und die bestehende Ticket-Phasen-Timeline (Postgres) wiederverwendet.

**Tech Stack:** OpenTelemetry Collector (contrib), Prometheus (kube-prometheus-stack, vorhanden), Traefik IngressRoute/Middleware, SealedSecrets, Kustomize, Node.js (`node:test`, CJS, `fetch`), Bash + BATS, Astro + Svelte + TypeScript (Vitest).

---

## Vorbemerkungen (verbindlich für alle Stages)

**Worktree:** Arbeite ausschließlich in `/tmp/wt-factory-otel` (Branch `feature/factory-otel`, base `origin/main`). Alle Pfade unten sind relativ dazu.

**S1-Zeilenbudgets (ermittelt via `wc -l` + `jq … baseline.json`, Stand dieser Planung):**

| Datei | Ist (`wc -l`) | Baseline | Limit (Ext) | Wirksame Schwelle | Budget | Konsequenz |
|---|---|---|---|---|---|
| `scripts/factory/pipeline.js` | 603 | nicht-baselined, **aber in `gates.yaml s1.ignore`** | 600 (.js) | **ignoriert** (sanktionierte Ausnahme, FA-SF-20 schützt Struktur) | n/a | Trotzdem **nur EINE Zeile** in `phaseEvent()` ergänzen (Spec §6); keine Logik in der Datei. |
| `scripts/factory/dispatcher.js` | 199 | nicht-baselined | 600 (.js) | 600 | ~401 | Reichlich Reserve; Emission trotzdem via `agent()`-Bash (kann kein `execFileSync`, Spec §3c). |
| `scripts/factory/wakeup.sh` | 130 | nicht-baselined | 500 (.sh) | 500 | ~370 | Reserve; Tick-Start/-Ende + Queue-Tiefe via `otel-emit.sh`. |
| `k3d/configmap-domains.yaml` | (ConfigMap, kein Code-Gate) | — | — | — | — | Eine Daten-Zeile `OTEL_DOMAIN`. |
| `environments/schema.yaml` | (YAML, kein S1-Gate) | — | — | — | — | Neue `env_vars`-Einträge. |

**Neue Dateien — Budget gegen statisches Limit (alle nicht-baselined):**

| Neue Datei | Ext-Limit | Zielgröße (Reserve) |
|---|---|---|
| `scripts/factory/otel-emit.cjs` | 200 (.cjs) | **< 160** — pure Funktionen, fetch-basiert. Bei drohendem Überlauf KEINE kosmetische Verdichtung, sondern `factory.phase`/`factory.tick`-Helper bleiben so knapp wie möglich; Doku-Kommentare minimal. |
| `scripts/factory/otel-emit.test.cjs` | 200 (.cjs) | < 180 — falls mehr Cases nötig, in `tests/unit/factory/` als `.test.cjs` weiterführen (siehe Task C). |
| `scripts/factory/otel-emit.sh` | 500 (.sh) | < 120 |
| `website/src/lib/factory-observability.ts` | 600 (.ts) | < 300 |
| `website/src/pages/api/factory-observability.ts` | 600 (.ts) | < 150 |
| `website/src/pages/admin/factory-observability.astro` | 400 (.astro) | < 40 (nur Layout-Wrapper, Muster `factory-budget.astro`) |
| `website/src/components/factory/FactoryObservability.svelte` | 500 (.svelte) | < 400 — bei Überlauf Charts in Sub-Komponenten unter `website/src/components/factory/` auslagern (echter Split, kein Verdichten). |

**S2/S3/S4-Hygiene (durchgängig):**
- **S3 (keine Brand-Literale):** Niemals `*.mentolder.de`/`*.korczewski.de` in `k3d/`, `prod*/`, `website/src/`. Hostnamen über `OTEL_DOMAIN` aus `configmap-domains.yaml` / `${OTEL_DOMAIN}`-envsubst; im JS/TS nur `process.env.OTEL_EXPORTER_OTLP_ENDPOINT` bzw. cluster-internes `prometheus-operated.monitoring.svc.cluster.local` (kein Brand-Literal).
- **S2 (keine Import-Zyklen):** `otel-emit.cjs` ist ein **pures** Modul — `require` nur von Node-Builtins (`fetch` ist global ab Node 18); **kein** Import auf `pipeline-decompose.cjs`/DB/API. `factory-observability.ts` importiert nur `./website-db` (wie `factory-metrics.ts`) + Builtins, nie umgekehrt.
- **S4 (keine Orphans):** Jedes neue `k3d/*.yaml` in einer `kustomization.yaml`; jedes neue Skript von Taskfile/anderem Skript/CI/Doku erreichbar. Konkret verdrahtet in den jeweiligen Tasks.

**Reihenfolge & Abhängigkeiten:** A (Backend) zuerst, weil B/C/D ohne Collector-Endpoint nur No-op testbar sind. B und C sind nach A unabhängig parallelisierbar. D hängt von der **D-NetworkPolicy vor dem D-Test** ab (Egress-Gate). Deploy ist push-based (kein GitOps) — Manifeste fließen über `prod/monitoring` → `prod-fleet/*` in **beide** Brands.

---

## Stage A — Backend / OTel-Collector (on-prem)

**Ziel:** Ein OTel-Collector im `monitoring`-ns, der OTLP (http :4318, grpc :4317) annimmt, via `prometheus`-Exporter `/metrics` exponiert, von Prometheus per ServiceMonitor gescraped wird, und von außen (WSL-Host) über eine Bearer-/TLS-gesicherte Traefik-IngressRoute `otel.<domain>` erreichbar ist.

### Task A1: Env-Vars + Hostname registrieren

**Files:**
- Modify: `k3d/configmap-domains.yaml` (eine `data:`-Zeile)
- Modify: `environments/schema.yaml` (neue `env_vars`/`secrets`)
- Modify: `Taskfile.yml` (envsubst-Listen der Collector-/Ingress-bauenden Tasks)

- [ ] **Step 1: Hostname-Key in die Domain-ConfigMap (dev-Default, kein Brand-Literal)**

In `k3d/configmap-domains.yaml` unter `data:` einfügen (alphabetisch nahe `AI_DOMAIN`):

```yaml
  OTEL_DOMAIN: "otel.localhost"
```

- [ ] **Step 2: Env-Vars + Secret in `environments/schema.yaml` deklarieren**

Unter `env_vars:` ergänzen:

```yaml
  - name: OTEL_DOMAIN
    description: "Public hostname of the OTel collector OTLP ingress (otel.<domain>)"
    required: true
    default_dev: "otel.localhost"
    validate: "^[a-z0-9.-]+$"
```

Unter dem `secrets:`-Abschnitt (analog zu vorhandenen Token-Secrets) ergänzen:

```yaml
  - name: FACTORY_OTLP_TOKEN
    description: "Bearer token the autopilot presents to the OTel collector ingress"
    required: true
```

Prüfe vorher mit `grep -n 'secrets:' environments/schema.yaml`, dass der `secrets:`-Block existiert; falls Secrets unter `env_vars` als `secret: true` geführt werden, demselben dort etablierten Muster folgen.

- [ ] **Step 3: envsubst-Listen ergänzen**

`grep -n "envsubst" Taskfile.yml` ausführen. In **jeder** Task, die das Collector-Manifest oder die IngressRoute baut/appliziert (Collector liegt in `k3d/monitoring/` → wird über `workspace:deploy`-Monitoring-Pfad bzw. den Monitoring-Apply gerendert), `OTEL_DOMAIN` zur Variablenliste hinzufügen. Mindestens beim prod-`workspace:deploy` (dynamisch via `ENVSUBST_VARS`) `OTEL_DOMAIN` anhängen. `FACTORY_OTLP_TOKEN` NICHT envsubst-en (kommt aus SealedSecret, nicht aus Manifest-Substitution).

- [ ] **Step 4: Per-Env-Werte setzen**

In `environments/mentolder.yaml` und `environments/korczewski.yaml` unter `env_vars:` jeweils setzen (Wert über `PROD_DOMAIN` ableiten — als Literal-Hostname je Brand, das ist die env-registry, KEIN Code/Manifest, daher S3-konform):

```yaml
  OTEL_DOMAIN: "otel.${PROD_DOMAIN}"
```

Falls die env-yaml keine Variablen-Interpolation kann (prüfen, wie `WEB_DOMAIN` o.ä. dort steht): den vollständigen Hostnamen je Brand eintragen — die env-registry-Datei ist von S3 ausgenommen, aber bevorzugt die `${PROD_DOMAIN}`-Form, wenn `env-resolve.sh` sie auflöst.

- [ ] **Step 5: Validieren**

Run: `task env:validate`
Expected: PASS (keine „undeclared variable"/„missing value"-Fehler).

- [ ] **Step 6: Commit**

```bash
git add k3d/configmap-domains.yaml environments/schema.yaml environments/mentolder.yaml environments/korczewski.yaml Taskfile.yml
git commit -m "feat(otel): register OTEL_DOMAIN + FACTORY_OTLP_TOKEN in env registry"
```

### Task A2: SealedSecret für das Bearer-Token

**Files:**
- Modify (nur lokal, gitignored, git-crypt): `environments/.secrets/mentolder.yaml`, `environments/.secrets/korczewski.yaml`
- Generiert/committed: `environments/sealed-secrets/*.yaml`
- Test: `task env:validate` + Inspektion des gerenderten Secrets

- [ ] **Step 1: Token-Wert in die plaintext-Secrets eintragen**

In `environments/.secrets/mentolder.yaml` UND `environments/.secrets/korczewski.yaml` (git-crypt-entsperrt; bei locked tree zuerst `task secrets:unlock`) einen Eintrag `FACTORY_OTLP_TOKEN` mit je einem **eigenen** zufälligen Token ergänzen (z.B. `openssl rand -hex 32`). NICHT denselben Token für beide Brands (Brand-Isolation).

> Hinweis: `environments/.secrets/*.yaml` sind sensibel — Wert nicht im Klartext loggen/echoen.

- [ ] **Step 2: Sealen**

Run:
```bash
task env:seal ENV=mentolder
task env:seal ENV=korczewski
```
Expected: `environments/sealed-secrets/{fleet-,}mentolder.yaml` / `…korczewski.yaml` enthalten nun einen verschlüsselten `FACTORY_OTLP_TOKEN`-Eintrag (Diff zeigt geänderte Sealed-Daten).

- [ ] **Step 3: Verifizieren, dass der Key im Workspace-Secret landet**

Der Token muss als Key `FACTORY_OTLP_TOKEN` im SealedSecret stehen, das in `monitoring`-ns (für den Collector-Auth) und/oder als Traefik-Middleware-Secret nutzbar ist. Prüfe in welchem Namespace das SealedSecret materialisiert (vorhandene Sealed-Secrets sind i.d.R. `workspace`-ns) — der Collector liegt aber in `monitoring`-ns. **Entscheidung:** Token-Verifikation erfolgt durch Traefik-Middleware (Task A4), die im selben ns wie die IngressRoute liegt. Lege das Bearer-Token daher zusätzlich als kleines, eigenständiges SealedSecret im `monitoring`-ns ab — siehe Task A4 Step 2.

- [ ] **Step 4: Commit**

```bash
git add environments/sealed-secrets/
git commit -m "feat(otel): seal FACTORY_OTLP_TOKEN for both brands"
```

### Task A3: Collector-Manifest + ServiceMonitor

**Files:**
- Create: `k3d/monitoring/otel-collector.yaml` (ConfigMap + Deployment + Service)
- Create: `k3d/monitoring/servicemonitor-otel-collector.yaml`
- Modify: `k3d/monitoring/kustomization.yaml` (resources +2)
- Test: `task workspace:validate` (kustomize-Build)

- [ ] **Step 1: Collector-Manifest schreiben**

Erstelle `k3d/monitoring/otel-collector.yaml`. Drei Dokumente. Image gepinnt (kein `:latest` — CI-Security-Scan). Collector-Config als ConfigMap, Pipeline: receiver `otlp` (http 4318 + grpc 4317) → processors `memory_limiter`, `batch`, `resource` (`service.namespace=factory`) → exporter `prometheus` (auf :8889) + `debug` für Traces.

```yaml
# k3d/monitoring/otel-collector.yaml
# On-prem OpenTelemetry Collector for the headless Software Factory autopilot.
# Receives OTLP (native Claude-Code telemetry + custom factory spans) and exposes
# a Prometheus /metrics endpoint scraped by the kube-prometheus-stack (ServiceMonitor).
apiVersion: v1
kind: ConfigMap
metadata:
  name: otel-collector-config
  namespace: monitoring
  labels:
    app: otel-collector
data:
  config.yaml: |
    receivers:
      otlp:
        protocols:
          http:
            endpoint: 0.0.0.0:4318
          grpc:
            endpoint: 0.0.0.0:4317
    processors:
      memory_limiter:
        check_interval: 5s
        limit_percentage: 80
        spike_limit_percentage: 25
      batch:
        timeout: 5s
      resource:
        attributes:
          - key: service.namespace
            value: factory
            action: upsert
    exporters:
      prometheus:
        endpoint: 0.0.0.0:8889
        resource_to_telemetry_conversion:
          enabled: true
      debug:
        verbosity: basic
    service:
      pipelines:
        metrics:
          receivers: [otlp]
          processors: [memory_limiter, batch, resource]
          exporters: [prometheus]
        logs:
          receivers: [otlp]
          processors: [memory_limiter, batch, resource]
          exporters: [debug]
        traces:
          receivers: [otlp]
          processors: [memory_limiter, batch, resource]
          exporters: [debug]
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: otel-collector
  namespace: monitoring
  labels:
    app: otel-collector
spec:
  replicas: 1
  selector:
    matchLabels:
      app: otel-collector
  template:
    metadata:
      labels:
        app: otel-collector
    spec:
      containers:
        - name: otel-collector
          image: otel/opentelemetry-collector-contrib:0.110.0
          args: ["--config=/etc/otel/config.yaml"]
          ports:
            - name: otlp-http
              containerPort: 4318
            - name: otlp-grpc
              containerPort: 4317
            - name: prom-metrics
              containerPort: 8889
          volumeMounts:
            - name: config
              mountPath: /etc/otel
          resources:
            requests:
              cpu: 50m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            runAsUser: 10001
            capabilities:
              drop: ["ALL"]
      volumes:
        - name: config
          configMap:
            name: otel-collector-config
---
apiVersion: v1
kind: Service
metadata:
  name: otel-collector
  namespace: monitoring
  labels:
    app: otel-collector
spec:
  selector:
    app: otel-collector
  ports:
    - name: otlp-http
      port: 4318
      targetPort: 4318
    - name: otlp-grpc
      port: 4317
      targetPort: 4317
    - name: prom-metrics
      port: 8889
      targetPort: 8889
```

> Image-Tag `0.110.0` ist ein Beispiel-Pin — beim Implementieren den aktuellsten stabilen `opentelemetry-collector-contrib`-Tag wählen und als Digest/Tag pinnen (NICHT `:latest`). Verifiziere die Existenz vor dem Commit.

- [ ] **Step 2: ServiceMonitor schreiben (Muster: `servicemonitor-traefik.yaml`)**

```bash
cat k3d/monitoring/servicemonitor-traefik.yaml
```
Daran orientiert `k3d/monitoring/servicemonitor-otel-collector.yaml`:

```yaml
# k3d/monitoring/servicemonitor-otel-collector.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: otel-collector
  namespace: monitoring
  labels:
    app: otel-collector
    release: kube-prometheus-stack
spec:
  selector:
    matchLabels:
      app: otel-collector
  endpoints:
    - port: prom-metrics
      interval: 30s
      path: /metrics
```

> Das `release: kube-prometheus-stack`-Label am ServiceMonitor MUSS dem `serviceMonitorSelector` der gerenderten Prometheus-Instanz entsprechen. Verifiziere mit `grep -n 'serviceMonitorSelector' k3d/monitoring/kube-prometheus-stack-rendered.yaml` bzw. wie `servicemonitor-traefik.yaml` gelabelt ist — übernimm dasselbe Label.

- [ ] **Step 3: In Kustomization einhängen (S4)**

In `k3d/monitoring/kustomization.yaml` unter `resources:` ergänzen:

```yaml
  - otel-collector.yaml
  - servicemonitor-otel-collector.yaml
```

- [ ] **Step 4: Kustomize-Build validieren**

Run: `task workspace:validate`
Expected: PASS — `k3d/monitoring` und die `prod-fleet/*`-Overlays bauen ohne Fehler; die neuen Ressourcen erscheinen im Build.

Zusatz-Check:
```bash
kubectl kustomize prod/monitoring | grep -c 'kind: Deployment'   # sollte den Collector enthalten
kubectl kustomize prod-fleet/mentolder | grep -A2 'name: otel-collector' | head
```

- [ ] **Step 5: Commit**

```bash
git add k3d/monitoring/otel-collector.yaml k3d/monitoring/servicemonitor-otel-collector.yaml k3d/monitoring/kustomization.yaml
git commit -m "feat(otel): on-prem collector deployment + ServiceMonitor in monitoring ns"
```

### Task A4: Traefik-IngressRoute `otel.<domain>` mit Bearer-Auth + TLS

**Files:**
- Create: `k3d/monitoring/otel-ingressroute.yaml` (Middleware + IngressRoute + monitoring-ns SealedSecret-Referenz)
- Modify: `k3d/monitoring/kustomization.yaml` (resources +1)
- Test: `task workspace:validate`

- [ ] **Step 1: IngressRoute + Bearer-Middleware schreiben (kein Brand-Literal — S3)**

Traefik hat keine native „bearer token equals X"-Middleware ohne Plugin. Zwei dokumentierte Wege (Spec §3a): (a) Traefik-ForwardAuth gegen einen winzigen Token-Checker, oder (b) Collector-`bearertokenauth`-Extension. **Gewählt: Variante (b)** — Auth im Collector selbst, weil sie keinen zusätzlichen Pod braucht und der Token ohnehin im `monitoring`-ns liegt. Die IngressRoute terminiert nur TLS und routet die OTLP-Pfade; die Bearer-Prüfung macht der Collector.

Ergänze die Collector-Config (Task A3, `k3d/monitoring/otel-collector.yaml` ConfigMap) um die `bearertokenauth`-Extension und hänge sie am `otlp`-Receiver ein. Diff zur ConfigMap aus A3:

```yaml
    extensions:
      bearertokenauth:
        scheme: Bearer
        token: ${env:FACTORY_OTLP_TOKEN}
    receivers:
      otlp:
        protocols:
          http:
            endpoint: 0.0.0.0:4318
            auth:
              authenticator: bearertokenauth
          grpc:
            endpoint: 0.0.0.0:4317
            auth:
              authenticator: bearertokenauth
    service:
      extensions: [bearertokenauth]
      pipelines:
        ...
```

Und im Deployment (A3) den Token als Env aus dem monitoring-ns-SealedSecret injizieren:

```yaml
          env:
            - name: FACTORY_OTLP_TOKEN
              valueFrom:
                secretKeyRef:
                  name: otel-collector-auth
                  key: FACTORY_OTLP_TOKEN
```

> Verifiziere beim Implementieren, dass die genutzte Collector-Version `${env:…}`-Expansion in der Config unterstützt (contrib-Distro: ja, via `--config`-Env-Resolver). Falls nicht, Token via `--set`/separate Config-Resolver-Syntax einbinden — den dann gültigen Mechanismus dokumentieren.

- [ ] **Step 2: monitoring-ns SealedSecret für den Token**

Der Token aus Task A2 muss als Secret `otel-collector-auth` im `monitoring`-ns existieren. Erzeuge ein per-Brand SealedSecret. Da `task env:seal` brandspezifisch in den Workspace-ns sealt, lege hier ein dediziertes Sealed-Secret an: erstelle `k3d/monitoring/otel-collector-auth-sealed.yaml` analog zu `k3d/monitoring/alertmanager-pushover-secret.yaml` (vorhandenes Muster eines monitoring-ns-Secrets ansehen):

```bash
cat k3d/monitoring/alertmanager-pushover-secret.yaml
```

Folge exakt diesem Seal-Mechanismus (gleiches Controller-Cert, gleiche ns-Annotation), nur mit `name: otel-collector-auth`, key `FACTORY_OTLP_TOKEN`. Falls dieses Pushover-Secret ein **Plaintext**-Secret ist (dev), für prod denselben SealedSecret-Weg wie der Rest nutzen und in `prod/monitoring` patchen. Den real existierenden Mechanismus übernehmen — nicht erfinden.

- [ ] **Step 3: IngressRoute (TLS, OTLP-Pfade) schreiben**

`k3d/monitoring/otel-ingressroute.yaml`, Hostname über `${OTEL_DOMAIN}` (envsubst beim Deploy; im base dev-Default `otel.localhost` aus configmap-domains — verifiziere, wie andere IngressRoutes den Host beziehen, z.B. `grep -rn 'Host(' k3d/grafana-ingress.yaml k3d/monitoring/grafana-ingress.yaml`):

```yaml
# k3d/monitoring/otel-ingressroute.yaml
# TLS-terminating ingress for the OTel collector OTLP endpoint. Bearer-token auth
# is enforced by the collector itself (bearertokenauth extension). Hostname comes
# from ${OTEL_DOMAIN} (configmap-domains / envsubst) — never a brand literal (S3).
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: otel-collector
  namespace: monitoring
  labels:
    app: otel-collector
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`${OTEL_DOMAIN}`)
      kind: Rule
      services:
        - name: otel-collector
          port: 4318
  tls:
    secretName: ${TLS_SECRET_NAME}
```

> Verifiziere `entryPoints` (`websecure` vs. `web`) und das `tls.secretName`-Muster gegen eine vorhandene prod-IngressRoute (z.B. wie `grafana-ingress.yaml` im prod-Overlay TLS bezieht). `${TLS_SECRET_NAME}` ist bereits in `configmap-domains.yaml` registriert. Wenn die Wildcard im `monitoring`-ns nicht vorliegt, denselben cert-Bezug nutzen wie die vorhandene Grafana-IngressRoute (die schon TLS im monitoring-ns hat) — daran orientieren, nicht neu erfinden.

- [ ] **Step 4: envsubst-Variablen registrieren**

`OTEL_DOMAIN` und `TLS_SECRET_NAME` müssen in der envsubst-Liste der Task stehen, die `k3d/monitoring` rendert. (A1 Step 3 hat `OTEL_DOMAIN` schon ergänzt; `TLS_SECRET_NAME` ist vorhanden.) Verifiziere mit `grep -n 'OTEL_DOMAIN' Taskfile.yml`.

- [ ] **Step 5: In Kustomization einhängen (S4) + validieren**

`k3d/monitoring/kustomization.yaml` `resources:` +`otel-ingressroute.yaml` +`otel-collector-auth-sealed.yaml`.

Run: `task workspace:validate`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add k3d/monitoring/otel-collector.yaml k3d/monitoring/otel-ingressroute.yaml k3d/monitoring/otel-collector-auth-sealed.yaml k3d/monitoring/kustomization.yaml
git commit -m "feat(otel): bearer-auth + TLS IngressRoute for collector OTLP endpoint"
```

### Task A5: Stage-A-Verifikation (manifest-level)

- [ ] **Step 1: Beide Brand-Overlays bauen + Collector erscheint**

```bash
task workspace:validate
kubectl kustomize prod-fleet/mentolder | grep -c 'name: otel-collector'   # >= 1
kubectl kustomize prod-fleet/korczewski | grep -c 'name: otel-collector'  # >= 1
```
Expected: beide Overlays enthalten Collector + ServiceMonitor + IngressRoute; keine literalen `${…}`-Platzhalter im prod-Build (envsubst aufgelöst beim Deploy, im rohen kustomize-Build sind sie zulässig — prüfe nur, dass keine S3-Brand-Literale eingebaut sind).

- [ ] **Step 2: S3-Lint lokal**

```bash
grep -rnE 'mentolder\.de|korczewski\.de' k3d/monitoring/ || echo "S3 clean"
```
Expected: `S3 clean`.

---

## Stage B — Layer 1: Native Claude-Code-Telemetrie

**Ziel:** `autopilot.env` exportiert die nativen `OTEL_*`-Variablen, sodass der headless `claude -p`-Tick Token/Kosten/Commits/PRs an den Collector schickt. Committet wird nur das Template `autopilot.env.example` (die echte `autopilot.env` ist host-seitig/gitignored).

### Task B1: Committetes Template + Doku

**Files:**
- Create: `scripts/factory/autopilot.env.example`
- Modify: `scripts/factory/README.md` (Doku, macht das Skript S4-erreichbar)
- Test: `bash -n` Smoke + grep-Assertions

- [ ] **Step 1: Template schreiben (kein Brand-Literal — Platzhalter)**

`scripts/factory/autopilot.env.example`:

```bash
# scripts/factory/autopilot.env.example — TEMPLATE for ~/.config/factory/autopilot.env
# Copy to ~/.config/factory/autopilot.env on the WSL host and fill in real values.
# Sourced by wakeup.sh with `set -a` (exports everything). NEVER commit the real file.

# ── existing autopilot config (provider/creds/dry-run) lives here too ──────────
# (see README.md — this template only documents the NEW OTel block)

# ── OpenTelemetry: native Claude-Code telemetry → on-prem collector ────────────
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
# Endpoint: https://<OTEL_DOMAIN> for the brand the autopilot is currently driving.
# Use the brand's real otel.<domain> host — NO literal here, fill on the host.
export OTEL_EXPORTER_OTLP_ENDPOINT="https://otel.example.invalid"
# Bearer token from environments/.secrets/<brand>.yaml (FACTORY_OTLP_TOKEN).
export FACTORY_OTLP_TOKEN="REPLACE_ME"
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer ${FACTORY_OTLP_TOKEN}"
# CRITICAL: default 60000ms never flushes a short claude -p tick. Force 10s.
export OTEL_METRIC_EXPORT_INTERVAL=10000
export OTEL_LOGS_EXPORT_INTERVAL=5000
export OTEL_RESOURCE_ATTRIBUTES="service.name=software-factory-autopilot,brand=${BRAND:-mentolder},git.sha=${GIT_SHA:-unknown}"

# ── optional: distributed traces (enhanced beta — needs Tempo, out of scope) ──
# export CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1
# export OTEL_TRACES_EXPORTER=otlp
```

> `otel.example.invalid` ist ein bewusster Nicht-Brand-Platzhalter (RFC 6761 `.invalid`) — kein S3-Verstoß, klar als „REPLACE" markiert.

- [ ] **Step 2: Doku in README.md**

In `scripts/factory/README.md` einen Abschnitt „OpenTelemetry / Observability" ergänzen: (a) `cp scripts/factory/autopilot.env.example ~/.config/factory/autopilot.env`, (b) `OTEL_EXPORTER_OTLP_ENDPOINT` + `FACTORY_OTLP_TOKEN` je Brand setzen, (c) Hinweis auf `OTEL_METRIC_EXPORT_INTERVAL=10000` (kurzer Tick), (d) Verweis auf `/admin/factory-observability`. Das macht `otel-emit.cjs`/`.sh` und das Template dokumentiert-erreichbar (S4).

- [ ] **Step 3: Smoke-Test**

```bash
bash -n scripts/factory/autopilot.env.example
grep -q 'OTEL_METRIC_EXPORT_INTERVAL=10000' scripts/factory/autopilot.env.example && echo OK
grep -qE 'mentolder\.de|korczewski\.de' scripts/factory/autopilot.env.example && echo "S3-FAIL" || echo "S3-clean"
```
Expected: keine Syntaxfehler; `OK`; `S3-clean`.

- [ ] **Step 4: Commit**

```bash
git add scripts/factory/autopilot.env.example scripts/factory/README.md
git commit -m "feat(otel): autopilot.env.example template + native telemetry docs"
```

---

## Stage C — Layer 2: Factory-Spans/-Metriken

**Ziel:** Ein pures `otel-emit.cjs` (fetch-basiert, OTLP/HTTP-JSON, No-op ohne Endpoint) + `otel-emit.sh`-Zwilling, mit Unit-Tests, minimal-invasiv in `pipeline.js`/`dispatcher.js`/`wakeup.sh` verdrahtet.

### Task C1: `otel-emit.cjs` (pures Modul) + node:test

**Files:**
- Create: `scripts/factory/otel-emit.cjs`
- Create: `scripts/factory/otel-emit.test.cjs`
- Test: `node --test scripts/factory/otel-emit.test.cjs`

- [ ] **Step 1: Failing test schreiben**

`scripts/factory/otel-emit.test.cjs`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const otel = require('./otel-emit.cjs');

test('no-op when endpoint unset', async () => {
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const r = await otel.emitMetric('factory.tick.count', 1, { brand: 'mentolder' });
  assert.strictEqual(r.skipped, true);
});

test('no-op when OTEL_SDK_DISABLED=true', async () => {
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otel.example.invalid';
  process.env.OTEL_SDK_DISABLED = 'true';
  const r = await otel.emitMetric('factory.tick.count', 1, {});
  assert.strictEqual(r.skipped, true);
  delete process.env.OTEL_SDK_DISABLED;
});

test('emitPhase posts an OTLP metrics payload to /v1/metrics', async () => {
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otel.example.invalid';
  delete process.env.OTEL_SDK_DISABLED;
  let captured = null;
  global.fetch = async (url, opts) => {
    captured = { url, body: JSON.parse(opts.body), headers: opts.headers };
    return { ok: true, status: 200 };
  };
  const r = await otel.emitPhase('Implement', 'done', { brand: 'mentolder', ticket_id: 'T000883', durationMs: 1234 });
  assert.strictEqual(r.skipped, false);
  assert.match(captured.url, /\/v1\/metrics$/);
  // ticket_id must NOT be a metric label (cardinality) — only resource/attr level
  const metricNames = captured.body.resourceMetrics[0].scopeMetrics[0].metrics.map(m => m.name);
  assert.ok(metricNames.includes('factory.phase.transition'));
});

test('emit never throws on fetch failure (fire-and-forget)', async () => {
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'https://otel.example.invalid';
  global.fetch = async () => { throw new Error('network down'); };
  const r = await otel.emitMetric('factory.tick.count', 1, {});
  assert.strictEqual(r.ok, false); // returns, does not throw
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `node --test scripts/factory/otel-emit.test.cjs`
Expected: FAIL (`Cannot find module './otel-emit.cjs'`).

- [ ] **Step 3: `otel-emit.cjs` implementieren (pur, fetch-basiert, < 160 Zeilen)**

`scripts/factory/otel-emit.cjs`:

```js
// scripts/factory/otel-emit.cjs — pure, require-able OTLP/HTTP-JSON emitter for the
// Software Factory. fetch-based (Node >= 18 global). No-op when the OTLP endpoint is
// unset or OTEL_SDK_DISABLED=true. NEVER throws (fire-and-forget). No DB/API imports (S2).

function endpoint() {
  if (process.env.OTEL_SDK_DISABLED === 'true') return null;
  const e = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  return e ? e.replace(/\/+$/, '') : null;
}

function authHeaders() {
  const h = { 'content-type': 'application/json' };
  const raw = process.env.OTEL_EXPORTER_OTLP_HEADERS || '';
  const m = /Authorization=([^,]+)/i.exec(raw);
  if (m) h['authorization'] = m[1];
  return h;
}

function nowNanos() { return String(Date.now() * 1e6); }

function kvAttrs(attrs) {
  return Object.entries(attrs || {})
    .filter(([, v]) => v != null)
    .map(([key, v]) => ({ key, value: { stringValue: String(v) } }));
}

// Build one OTLP metrics request. `metrics` = [{ name, kind:'sum'|'gauge', value, attrs }].
// ticket_id is intentionally placed on RESOURCE attributes (exemplar/log level), never
// as a per-datapoint metric label, to keep series cardinality bounded.
function buildPayload(metrics, resourceAttrs) {
  const t = nowNanos();
  return {
    resourceMetrics: [{
      resource: { attributes: kvAttrs({ 'service.name': 'software-factory', ...resourceAttrs }) },
      scopeMetrics: [{
        scope: { name: 'factory.otel-emit' },
        metrics: metrics.map((mm) => ({
          name: mm.name,
          [mm.kind === 'gauge' ? 'gauge' : 'sum']: {
            ...(mm.kind === 'gauge' ? {} : { aggregationTemporality: 2, isMonotonic: true }),
            dataPoints: [{
              asDouble: Number(mm.value),
              timeUnixNano: t,
              startTimeUnixNano: t,
              attributes: kvAttrs(mm.attrs),
            }],
          },
        })),
      }],
    }],
  };
}

async function post(payload) {
  const base = endpoint();
  if (!base) return { skipped: true };
  try {
    const res = await fetch(`${base}/v1/metrics`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    return { skipped: false, ok: !!(res && res.ok), status: res && res.status };
  } catch {
    return { skipped: false, ok: false };
  }
}

// Generic single counter/gauge.
async function emitMetric(name, value, attrs, opts) {
  if (!endpoint()) return { skipped: true };
  const kind = (opts && opts.kind) || 'sum';
  const { ticket_id, ...labels } = attrs || {};
  return post(buildPayload([{ name, kind, value, attrs: labels }], { ticket_id, brand: labels.brand }));
}

// Phase transition + duration. state: entered|done|blocked. duration optional.
async function emitPhase(phase, state, ctx) {
  if (!endpoint()) return { skipped: true };
  const labels = { phase, state, brand: (ctx && ctx.brand) || 'unknown' };
  const metrics = [{ name: 'factory.phase.transition', kind: 'sum', value: 1, attrs: labels }];
  if (ctx && typeof ctx.durationMs === 'number') {
    metrics.push({ name: 'factory.phase.duration', kind: 'gauge', value: ctx.durationMs, attrs: labels });
  }
  return post(buildPayload(metrics, { ticket_id: ctx && ctx.ticket_id, brand: labels.brand }));
}

module.exports = { emitMetric, emitPhase, buildPayload, _endpoint: endpoint };
```

- [ ] **Step 4: Test ausführen — muss bestehen**

Run: `node --test scripts/factory/otel-emit.test.cjs`
Expected: PASS (4 Tests).

- [ ] **Step 5: S1-Größencheck**

Run: `wc -l scripts/factory/otel-emit.cjs`
Expected: < 200 (Ziel < 160). Falls > 180: `buildPayload` knapper fassen oder Phase-/Metric-Helper zusammenführen — KEIN Verdichten zum Limit-Drücken.

- [ ] **Step 6: Commit**

```bash
git add scripts/factory/otel-emit.cjs scripts/factory/otel-emit.test.cjs
git commit -m "feat(otel): pure fetch-based otel-emit.cjs + node:test"
```

### Task C2: `otel-emit.sh` (curl-Zwilling) + BATS

**Files:**
- Create: `scripts/factory/otel-emit.sh`
- Create/Modify: BATS-Test (vorhandenes Factory-BATS-Verzeichnis suchen, sonst neu)
- Test: BATS

- [ ] **Step 1: Vorhandenes Factory-BATS-Verzeichnis finden**

```bash
grep -rln 'otel\|@test' tests/unit/factory/ tests/ 2>/dev/null | head
ls tests/unit/ 2>/dev/null; ls tests/unit/factory/ 2>/dev/null
```
Lege den neuen Test bevorzugt **neben** vorhandene Factory-BATS-Dateien an (z.B. `tests/unit/factory/otel-emit.bats`). BATS-Temp/Fixtures außerhalb des Trees (`$BATS_TMPDIR`/`mktemp -d`) + teardown-Cleanup.

- [ ] **Step 2: Failing BATS schreiben**

`tests/unit/factory/otel-emit.bats`:

```bash
#!/usr/bin/env bats

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  EMIT="${REPO}/scripts/factory/otel-emit.sh"
  TMP="$(mktemp -d)"
}
teardown() { rm -rf "${TMP}"; }

@test "no-op exits 0 when OTEL endpoint unset" {
  unset OTEL_EXPORTER_OTLP_ENDPOINT
  run bash "${EMIT}" metric factory.tick.count 1 brand=mentolder
  [ "$status" -eq 0 ]
}

@test "no-op when OTEL_SDK_DISABLED=true" {
  OTEL_EXPORTER_OTLP_ENDPOINT="https://otel.example.invalid" OTEL_SDK_DISABLED=true \
    run bash "${EMIT}" metric factory.tick.count 1
  [ "$status" -eq 0 ]
}

@test "posts via curl when endpoint set (stubbed curl)" {
  # Stub curl on PATH to capture the call instead of doing real network I/O.
  cat > "${TMP}/curl" <<'EOF'
#!/usr/bin/env bash
echo "$@" >> "${OTEL_BATS_CAPTURE}"
exit 0
EOF
  chmod +x "${TMP}/curl"
  OTEL_BATS_CAPTURE="${TMP}/cap" PATH="${TMP}:${PATH}" \
    OTEL_EXPORTER_OTLP_ENDPOINT="https://otel.example.invalid" \
    run bash "${EMIT}" metric factory.tick.count 1 brand=mentolder
  [ "$status" -eq 0 ]
  grep -q '/v1/metrics' "${TMP}/cap"
}

@test "curl failure never propagates non-zero (fire-and-forget)" {
  cat > "${TMP}/curl" <<'EOF'
#!/usr/bin/env bash
exit 7
EOF
  chmod +x "${TMP}/curl"
  PATH="${TMP}:${PATH}" OTEL_EXPORTER_OTLP_ENDPOINT="https://otel.example.invalid" \
    run bash "${EMIT}" metric factory.tick.count 1
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 3: BATS ausführen — muss fehlschlagen**

Run: `bats tests/unit/factory/otel-emit.bats`
Expected: FAIL (Skript fehlt).

- [ ] **Step 4: `otel-emit.sh` implementieren (< 120 Zeilen, fire-and-forget)**

`scripts/factory/otel-emit.sh`:

```bash
#!/usr/bin/env bash
# scripts/factory/otel-emit.sh — curl twin of otel-emit.cjs. Emits one OTLP/HTTP-JSON
# metric to ${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics. No-op when endpoint unset or
# OTEL_SDK_DISABLED=true. NEVER fails the caller (fire-and-forget; always exits 0).
#
# Usage: otel-emit.sh metric <name> <value> [k=v ...]
#        otel-emit.sh phase  <phase> <state> [k=v ...] [ticket_id=...] [durationMs=...]
set -uo pipefail

_endpoint() {
  [[ "${OTEL_SDK_DISABLED:-}" == "true" ]] && return 1
  [[ -n "${OTEL_EXPORTER_OTLP_ENDPOINT:-}" ]] || return 1
  printf '%s' "${OTEL_EXPORTER_OTLP_ENDPOINT%%/}"
}

_auth_header() {
  local raw="${OTEL_EXPORTER_OTLP_HEADERS:-}"
  [[ "$raw" =~ Authorization=([^,]+) ]] && printf 'Authorization: %s' "${BASH_REMATCH[1]}"
}

# Build OTLP attributes JSON array from k=v args.
_attrs_json() {
  local out="" first=1 kv k v
  for kv in "$@"; do
    [[ "$kv" == *=* ]] || continue
    k="${kv%%=*}"; v="${kv#*=}"
    [[ $first -eq 0 ]] && out+=","
    out+="{\"key\":\"${k}\",\"value\":{\"stringValue\":\"${v}\"}}"
    first=0
  done
  printf '%s' "$out"
}

emit_metric() {
  local name="$1" value="$2"; shift 2
  local base; base="$(_endpoint)" || return 0
  local t; t="$(( $(date +%s) * 1000000000 ))"
  local attrs; attrs="$(_attrs_json "$@")"
  local body
  body="$(cat <<JSON
{"resourceMetrics":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"software-factory"}}]},
"scopeMetrics":[{"scope":{"name":"factory.otel-emit.sh"},"metrics":[{"name":"${name}",
"sum":{"aggregationTemporality":2,"isMonotonic":true,"dataPoints":[{"asDouble":${value},
"timeUnixNano":"${t}","startTimeUnixNano":"${t}","attributes":[${attrs}]}]}}]}]}]}
JSON
)"
  local auth; auth="$(_auth_header)"
  curl -sS -m 5 -X POST "${base}/v1/metrics" \
    -H 'Content-Type: application/json' \
    ${auth:+-H "$auth"} \
    --data "${body}" >/dev/null 2>&1 || true
  return 0
}

main() {
  local cmd="${1:-}"; shift || true
  case "$cmd" in
    metric) emit_metric "$@" ;;
    phase)
      # phase <phase> <state> [k=v...] → factory.phase.transition counter
      local phase="${1:-}" state="${2:-}"; shift 2 || true
      emit_metric "factory.phase.transition" 1 "phase=${phase}" "state=${state}" "$@"
      ;;
    *) : ;;  # unknown verb: no-op, never fail
  esac
  return 0
}
main "$@"
```

- [ ] **Step 5: BATS ausführen — muss bestehen**

Run: `bats tests/unit/factory/otel-emit.bats`
Expected: PASS (4 Tests).

- [ ] **Step 6: Ausführbar machen + Commit**

```bash
chmod +x scripts/factory/otel-emit.sh
git add scripts/factory/otel-emit.sh tests/unit/factory/otel-emit.bats
git commit -m "feat(otel): curl-twin otel-emit.sh + BATS"
```

### Task C3: Wiring in pipeline.js (EINE Zeile), dispatcher.js, wakeup.sh

**Files:**
- Modify: `scripts/factory/pipeline.js:60-67` (eine Zeile in `phaseEvent()`)
- Modify: `scripts/factory/dispatcher.js` (Tick-Grenzen via `agent()`-Bash)
- Modify: `scripts/factory/wakeup.sh` (Tick-Start/-Ende + Queue-Tiefe via `otel-emit.sh`)
- Test: `node --check` + `bash -n` + FA-SF-20

- [ ] **Step 1: pipeline.js — eine fire-and-forget-Zeile in `phaseEvent()`**

In `scripts/factory/pipeline.js`, in der bestehenden `phaseEvent(ph, state, detail)` (Z.60-67), direkt nach dem `try { … execFileSync(ticket.sh phase) … }`-Block EINE Zeile ergänzen (eigener try/catch, fire-and-forget, kein neuer Import oben — `require` inline, da pipeline.js top-level-imports verbietet):

```js
  try { require('./otel-emit.cjs').emitPhase(ph, state, { brand, ticket_id: A.ticket_id }); } catch {}
```

Diese Zeile steht **innerhalb** `phaseEvent`, nach dem vorhandenen `} catch {}`. Netto **+1 Zeile** in der (S1-ignorierten) Datei.

> `brand` und `A` sind in `main()`-Scope (Z.54-60) bereits definiert und `phaseEvent` ist darin geschachtelt — verifiziere beim Editieren, dass `phaseEvent` Zugriff auf `brand`/`A` hat (laut Z.60-67: ja).

- [ ] **Step 2: pipeline.js offline-Check**

Run: `node --check scripts/factory/pipeline.js`
Expected: PASS (kein Syntaxfehler).

- [ ] **Step 3: dispatcher.js — Tick-Grenzen via agent()-Bash**

dispatcher.js kann kein `execFileSync` (Spec §3c). Ergänze die Emission in den vorhandenen `agent()`-Prompts an den Phasengrenzen — **ohne** neue JS-Logik, indem die Bash-Schritte in den bestehenden Metrics-`agent()`-Call (Z.190-197) eine Zeile aufnehmen. Erweitere den Metrics-Prompt um:

```
     Then emit factory tick metrics (best-effort, never fail the tick):
       bash ${REPO}/scripts/factory/otel-emit.sh metric factory.tick.count 1 brand=mentolder
       bash ${REPO}/scripts/factory/otel-emit.sh metric factory.tick.count 1 brand=korczewski
       bash ${REPO}/scripts/factory/otel-emit.sh metric factory.tick.launches ${launches.length} 
```

Und im Escalation-Zweig (Z.161-184) eine Zeile, die `factory.tick.escalations` mit `escalations.length` emittiert. Verwende Template-Literale, die die JS-Variablen (`launches.length`, `escalations.length`) interpolieren. **Nur Prompt-Text-Erweiterung**, keine neue Kontrollfluss-Logik → minimaler S1-Footprint (dispatcher.js hat ohnehin ~401 Zeilen Reserve).

Zusätzlich `factory.feature.outcome` + `factory.deploy.canary`: diese werden besser in `pipeline.js` Deploy-Phase emittiert. Falls die Deploy-Phase in pipeline.js bereits ein Canary-Ergebnis kennt, dort über die schon vorhandene `emitPhase`-Zeile hinaus EINE `emitMetric('factory.deploy.canary', 1, {status, brand})`-Zeile ergänzen (gleicher fire-and-forget try/catch). Wenn das eine zweite Zeile in pipeline.js wäre und du Netto-Wachstum vermeiden willst: emittiere `factory.deploy.canary`/`factory.feature.outcome` stattdessen aus dem dispatcher-Metrics-`agent()`-Bash basierend auf dem `results`-Array. **Bevorzugt: dispatcher-Bash** (hält pipeline.js bei +1).

- [ ] **Step 4: dispatcher.js offline-Check**

Run: `node --check scripts/factory/dispatcher.js`
Expected: PASS.

- [ ] **Step 5: wakeup.sh — Tick-Start/-Ende + Queue-Tiefe**

In `scripts/factory/wakeup.sh`: am Tick-Anfang (nach Z.96 `echo "wakeup.sh: starting tick…"`) und nach dem Tick (nach Z.106 `TICK_EXIT=$?`) je eine fire-and-forget-Emission, und die schon berechnete Queue-Tiefe `TOTAL` (Z.120) als Gauge:

```bash
  bash "${REPO}/scripts/factory/otel-emit.sh" metric factory.tick.count 1 || true
```

nach Tick-Start, und nach `TOTAL=…` (Z.120):

```bash
  bash "${REPO}/scripts/factory/otel-emit.sh" metric factory.tick.queue_depth "${TOTAL}" || true
```

`set -euo pipefail` ist aktiv → `|| true` ist Pflicht. Die `OTEL_*`-Env ist schon gesourct (autopilot.env, Z.33-37), bei ungesetztem Endpoint ist die Emission ohnehin No-op. Netto ~+2 Zeilen in einer 130/500-Datei.

- [ ] **Step 6: wakeup.sh offline-Check**

Run: `bash -n scripts/factory/wakeup.sh`
Expected: PASS.

- [ ] **Step 7: FA-SF-20-Strukturvertrag (pipeline.js) grün**

```bash
grep -rn 'FA-SF-20' tests/ scripts/factory/ | head
```
Den FA-SF-20-Test ausführen (Pfad aus dem grep). Expected: PASS — die eine zusätzliche Zeile verletzt keine Strukturinvariante (kein top-level-import, kein dynamic `import()`).

- [ ] **Step 8: Commit**

```bash
git add scripts/factory/pipeline.js scripts/factory/dispatcher.js scripts/factory/wakeup.sh
git commit -m "feat(otel): wire factory spans into pipeline/dispatcher/wakeup (fire-and-forget)"
```

---

## Stage D — Layer 3: Eigenes Dashboard

**Ziel:** `/admin/factory-observability` (isAdmin-gated) zeigt KPI-Leiste + Kosten/Token-Trend + Phasen-Breakdown + Tick-Timeline, gespeist aus (a) Prometheus HTTP-API (serverseitig proxied, neue allow-egress-NetworkPolicy website→monitoring) und (b) der bestehenden Ticket-Phasen-Timeline (Postgres).

> **Abhängigkeit:** Task D1 (NetworkPolicy) MUSS vor dem Live-Test der API-Route (D3) deployt sein, sonst blockt der website-ns default-deny-egress die Prometheus-Query.

### Task D1: allow-egress NetworkPolicy website → monitoring

**Files:**
- Create: `k3d/website-allow-egress-monitoring.yaml`
- Modify: die Kustomization, die die website-NetworkPolicies trägt (verifizieren: `k3d/website.yaml` ist via `k3d/kustomization.yaml` referenziert)
- Test: `task workspace:validate` + S3-grep

- [ ] **Step 1: Vorhandenes Muster ansehen**

```bash
sed -n '565,584p' k3d/website.yaml   # allow-egress-to-workspace NetworkPolicy
```
Das neue Manifest folgt exakt dieser Form, nur Ziel `monitoring`-ns + Port :9090.

- [ ] **Step 2: NetworkPolicy schreiben (envsubst-Namespace, kein Literal)**

`k3d/website-allow-egress-monitoring.yaml`:

```yaml
# k3d/website-allow-egress-monitoring.yaml
# Website-ns is default-deny-egress (see reference_website_egress_default_deny).
# The /admin/factory-observability API route server-side-proxies Prometheus in the
# monitoring ns. This policy opens egress website-ns → monitoring-ns Prometheus :9090.
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-egress-to-monitoring
  namespace: ${WEBSITE_NAMESPACE}
  labels:
    app: website
spec:
  podSelector: {}
  policyTypes:
    - Egress
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: monitoring
      ports:
        - port: 9090
          protocol: TCP
```

> Verifiziere den Prometheus-Service-Port + Service-DNS-Namen: `grep -n 'port: 9090\|prometheus-operated\|kube-prometheus-stack-prometheus' k3d/monitoring/kube-prometheus-stack-rendered.yaml | head`. Der API-Route-Client (D2) nutzt diesen Service-DNS (cluster-intern, kein Brand-Literal).

- [ ] **Step 3: In Kustomization einhängen (S4)**

Verifiziere, wie `website.yaml` referenziert wird, und füge `website-allow-egress-monitoring.yaml` in dieselbe `resources:`-Liste ein:

```bash
grep -n 'website.yaml\|website-schema.yaml' k3d/kustomization.yaml
```
Dann in `k3d/kustomization.yaml` `resources:` `- website-allow-egress-monitoring.yaml` ergänzen (neben `website.yaml`). `${WEBSITE_NAMESPACE}` ist bereits eine etablierte envsubst-Variable (in website.yaml genutzt) — keine neue Registrierung nötig; verifiziere, dass die website-rendernde Task sie schon kennt.

- [ ] **Step 4: Validieren**

Run: `task workspace:validate`
Expected: PASS. Zusatz:
```bash
grep -rnE 'mentolder\.de|korczewski\.de' k3d/website-allow-egress-monitoring.yaml || echo "S3 clean"
```

- [ ] **Step 5: Commit**

```bash
git add k3d/website-allow-egress-monitoring.yaml k3d/kustomization.yaml
git commit -m "feat(otel): allow-egress NetworkPolicy website -> monitoring Prometheus"
```

### Task D2: lib + API-Route (Prometheus-Proxy + Phasen-Timeline)

**Files:**
- Create: `website/src/lib/factory-observability.ts`
- Create: `website/src/pages/api/factory-observability.ts`
- Test: `website/src/lib/factory-observability.test.ts` (Vitest — vorhandenes Muster suchen)

- [ ] **Step 1: Vorhandene lib/test-Muster ansehen**

```bash
sed -n '1,40p' website/src/lib/factory-metrics.ts
ls website/src/lib/*.test.ts | head
grep -rln 'PROMETHEUS\|prometheus' website/src/lib/ website/src/pages/api/ 2>/dev/null
```
Falls eine vorhandene `*.test.ts`-Datei nah verwandt ist, dort erweitern; sonst neue `factory-observability.test.ts`.

- [ ] **Step 2: Failing Vitest schreiben**

`website/src/lib/factory-observability.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { queryRange, buildPromQL } from './factory-observability';

afterEach(() => vi.restoreAllMocks());

describe('buildPromQL', () => {
  it('builds a cost-per-day query without brand literals', () => {
    const q = buildPromQL('cost', 'mentolder');
    expect(q).toContain('claude_code_cost_usage');
    expect(q).not.toMatch(/mentolder\.de|korczewski\.de/);
  });
});

describe('queryRange', () => {
  it('proxies Prometheus /api/v1/query_range and returns matrix data', async () => {
    const fakeResp = { status: 'success', data: { resultType: 'matrix', result: [{ metric: {}, values: [[1, '5']] }] } };
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => fakeResp })) as any;
    const r = await queryRange('up', Date.now() / 1000 - 3600, Date.now() / 1000, 60);
    expect(r.data.result.length).toBe(1);
    expect((global.fetch as any).mock.calls[0][0]).toContain('/api/v1/query_range');
  });

  it('throws a typed error when Prometheus is unreachable', async () => {
    global.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as any;
    await expect(queryRange('up', 0, 1, 60)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Vitest ausführen — muss fehlschlagen**

Run: `cd website && pnpm vitest run src/lib/factory-observability.test.ts`
Expected: FAIL (Modul fehlt).

- [ ] **Step 4: `factory-observability.ts` implementieren (< 300 Zeilen, S2: nur ./website-db + Builtins)**

`website/src/lib/factory-observability.ts`. Prometheus-Base-URL aus Env (`process.env.PROMETHEUS_URL`), Fallback auf den cluster-internen Service-DNS (KEIN Brand-Literal). Reuse der bestehenden Phasen-Timeline über `pool` aus `./website-db` (Muster `factory-metrics.ts`):

```ts
// website/src/lib/factory-observability.ts
// Read helpers for the Factory Observability dashboard. Two sources:
//  1) Prometheus HTTP API (server-side proxy) for OTel token/cost/phase metrics.
//  2) The existing ticket phase timeline in Postgres (reused, no new table).
// S2: imports only ./website-db + Node builtins — no API-layer back-imports.
import { pool } from './website-db';

const PROM_BASE =
  process.env.PROMETHEUS_URL ||
  // cluster-internal Prometheus service DNS (monitoring ns) — never a brand literal.
  'http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090';

export interface PromMatrix {
  status: string;
  data: { resultType: string; result: Array<{ metric: Record<string, string>; values: [number, string][] }> };
}

// Curated PromQL per panel. metric keys map to native Claude-Code + factory series.
export function buildPromQL(panel: string, brand: string): string {
  const b = `brand="${brand.replace(/[^a-z0-9_-]/gi, '')}"`;
  switch (panel) {
    case 'cost':   return `sum by (phase) (increase(claude_code_cost_usage{${b}}[1d]))`;
    case 'tokens': return `sum by (phase) (increase(claude_code_token_usage{${b}}[1d]))`;
    case 'commits':return `sum(increase(claude_code_commit_count{${b}}[1d]))`;
    case 'phase_duration': return `avg by (phase) (factory_phase_duration{${b}})`;
    case 'phase_blocked':  return `sum by (phase) (factory_phase_transition{${b},state="blocked"})`;
    default: return `up`;
  }
}

export async function queryRange(
  query: string, start: number, end: number, step: number,
): Promise<PromMatrix> {
  const u = new URL(`${PROM_BASE}/api/v1/query_range`);
  u.searchParams.set('query', query);
  u.searchParams.set('start', String(start));
  u.searchParams.set('end', String(end));
  u.searchParams.set('step', String(step));
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`prometheus ${res.status}`);
  return (await res.json()) as PromMatrix;
}

export interface PhaseTimelineRow {
  external_id: string; phase: string; state: string; at: string; brand: string;
}

// Reuse the existing phase-event timeline written by ticket.sh phase (no new table).
// Verify the real table/view name during implementation (see Step 5).
export async function listPhaseTimeline(limit = 200): Promise<PhaseTimelineRow[]> {
  const { rows } = await pool.query(
    `SELECT external_id, phase, state, created_at AS at, brand
       FROM tickets.ticket_phase_events
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows as PhaseTimelineRow[];
}
```

- [ ] **Step 5: Reale Phasen-Tabelle/-View verifizieren**

```bash
grep -rn 'phase' scripts/ticket.sh | grep -i 'insert\|table\|phase_event' | head
```
Den tatsächlichen Tabellen-/View-Namen (den `ticket.sh phase` schreibt und `/dev-status` bzw. cockpit liest) ermitteln und in `listPhaseTimeline` einsetzen. Falls es eine fertige View gibt (z.B. analog `v_factory_metrics`), diese bevorzugen. KEINE neue Tabelle anlegen.

- [ ] **Step 6: PromQL-Metriknamen verifizieren**

Native Claude-Code-Metriknamen können in Prometheus mit `_`-Normalisierung erscheinen (`claude_code.cost.usage` → `claude_code_cost_usage`). Verifiziere die exakten Namen nach einem ersten Collector-Deploy via `/api/v1/label/__name__/values` oder Doku; passe `buildPromQL` an. (Im Test ist nur das Substring `claude_code_cost_usage` asserted.)

- [ ] **Step 7: API-Route schreiben (isAdmin-gated, Muster factory-metrics.ts)**

`website/src/pages/api/factory-observability.ts` (< 150 Zeilen):

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../lib/auth';
import { queryRange, buildPromQL, listPhaseTimeline } from '../../lib/factory-observability';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }
  const brand = (process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder').toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const start = now - 7 * 24 * 3600;
  const step = 3600;
  try {
    const [cost, tokens, phaseDuration, timeline] = await Promise.all([
      queryRange(buildPromQL('cost', brand), start, now, step).catch(() => null),
      queryRange(buildPromQL('tokens', brand), start, now, step).catch(() => null),
      queryRange(buildPromQL('phase_duration', brand), start, now, step).catch(() => null),
      listPhaseTimeline(200).catch(() => []),
    ]);
    return new Response(
      JSON.stringify({ brand, cost, tokens, phaseDuration, timeline, fetchedAt: new Date().toISOString() }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  } catch (err) {
    console.error('[api/factory-observability]', err);
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
};
```

- [ ] **Step 8: Vitest ausführen — muss bestehen**

Run: `cd website && pnpm vitest run src/lib/factory-observability.test.ts`
Expected: PASS.

- [ ] **Step 9: S2-Zyklencheck + S1-Größe**

```bash
wc -l website/src/lib/factory-observability.ts website/src/pages/api/factory-observability.ts
cd website && pnpm exec madge --circular --extensions ts src/lib/factory-observability.ts 2>/dev/null || true
```
Expected: lib < 600, api < 600; keine neuen Zyklen. (Der finale S2-Check läuft ohnehin in `freshness:check`.)

- [ ] **Step 10: Commit**

```bash
git add website/src/lib/factory-observability.ts website/src/lib/factory-observability.test.ts website/src/pages/api/factory-observability.ts
git commit -m "feat(otel): factory-observability lib + isAdmin-gated API proxy"
```

### Task D3: Astro-Seite + Svelte-Dashboard

**Files:**
- Create: `website/src/pages/admin/factory-observability.astro`
- Create: `website/src/components/factory/FactoryObservability.svelte`
- Test: Vitest-Komponententest (falls Svelte-Tests etabliert) + Build

- [ ] **Step 1: Astro-Wrapper (Muster factory-budget.astro)**

`website/src/pages/admin/factory-observability.astro` (< 40 Zeilen):

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import FactoryObservability from '../../components/factory/FactoryObservability.svelte';
import { getSession, isAdmin, getLoginUrl } from '../../lib/auth';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');
---

<AdminLayout title="Factory Observability">
  <section class="bg-dark min-h-screen">
    <FactoryObservability client:load />
  </section>
</AdminLayout>
```

- [ ] **Step 2: Svelte-Dashboard (< 400 Zeilen; bei Überlauf Sub-Komponenten)**

`website/src/components/factory/FactoryObservability.svelte` — `onMount` fetcht `/api/factory-observability`, rendert: (1) KPI-Leiste (Token/Tag, Kosten/Tag USD, Commits/Tag, PRs/Tag, Ø-Zyklus, aktive Slots — je Karte mit Sparkline), (2) Kosten/Token-Trend (gestapelte Fläche nach Phase), (3) Phasen-Dauer-Breakdown (horizontale Balken + Blocked-Rate), (4) Tick-Timeline (letzte Ticks: Zeit, Brand, Launches, Escalations, Kosten, Canary grün/rot), (5) Pro-Feature-Tabelle (Ticket, Brand, Phase-Stepper, Token, Kosten, Outcome-Badge). Dark theme (`bg-dark`, Tailwind), kompakte Karten — Look wie `FactoryBudgetPage.svelte`/cockpit.

Wiederverwende vorhandene Factory-Svelte-Bausteine wo möglich (`FactoryKpiCard.svelte`, `FactoryKpiGrid.svelte`, `PhaseStepper.svelte`, `RecentRunsList.svelte`, `factory-chart-colors.ts`) statt neu zu bauen — das hält die Datei klein und konsistent. Wenn der SVG-Chart-Code aus dem Claude-Design-Prompt (Spec §7) importiert wird: nur `currentColor`-SVGs ohne Root-width/height/Hex-Brandfarben (Memory `reference_claude_design_handoff`). Bei drohendem > 400-Zeilen-Überlauf die Charts in `FactoryObsTrendChart.svelte` / `FactoryObsPhaseBars.svelte` auslagern (echter Split).

> Struktur-Skeleton (vom Implementierer auszufüllen — KEINE Platzhalter im Endprodukt):
> - `<script lang="ts">`: `let data = null; let error = null;` + `onMount` fetch + Loading/Error-States.
> - Reuse `import FactoryKpiGrid from './FactoryKpiGrid.svelte'` etc.
> - Map `data.cost.data.result` → gestapelte Flächen; `data.phaseDuration` → Balken; `data.timeline` → Tabelle.

- [ ] **Step 3: Navigation/Verlinkung (S4: Seite erreichbar machen)**

Verlinke `/admin/factory-observability` aus dem Admin-Nav / der bestehenden Factory-Sektion (suche, wie `/admin/factory-budget` und `/admin/cockpit` verlinkt sind):

```bash
grep -rn 'factory-budget\|/admin/cockpit' website/src --include='*.astro' --include='*.svelte' | head
```
Denselben Nav-Eintragsmechanismus nutzen.

- [ ] **Step 4: Build / Typecheck**

Run:
```bash
cd website && pnpm build 2>&1 | tail -20
```
Expected: Build grün (Astro fängt undefined-Identifier in der Komponente — siehe Memory `reference_e2e_tests_live_prod`/ContactForm-Lektion: alle im Markup referenzierten Bindings müssen im `<script>` definiert sein).

- [ ] **Step 5: S1-Größencheck**

```bash
wc -l website/src/pages/admin/factory-observability.astro website/src/components/factory/FactoryObservability.svelte
```
Expected: .astro < 400, .svelte < 500 (Ziel < 400; bei Überschreitung Split aus Step 2 anwenden).

- [ ] **Step 6: Commit**

```bash
git add website/src/pages/admin/factory-observability.astro website/src/components/factory/FactoryObservability.svelte
# plus ggf. die Nav-Datei + ausgelagerte Sub-Komponenten
git commit -m "feat(otel): /admin/factory-observability dashboard page + Svelte component"
```

---

## Stage E — Finaler Verifikations-Task (CI-Äquivalent, Pflicht)

**Ziel:** Das vollständige CI-Gate-Set lokal grün, inkl. S1–S4-Ratchet, Test-Inventar und Freshness-Artefakte. KEIN Schritt darf übersprungen werden (Lektion `reference_reproduce_full_ci_locally`, `reference_s1_gate_local_verify_gap`).

### Task E1: Gezielte Tests + Freshness + Ratchet

- [ ] **Step 1: Gezielte Tests für geänderte Domains**

Run: `task test:changed`
Expected: PASS — vitest `--changed` (website lib + API), BATS-Selection (`otel-emit.bats`), node:test, quality-Selection grün.

- [ ] **Step 2: Test-Inventar regenerieren + committen (neue Tests hinzugefügt)**

Run:
```bash
task test:inventory
git add website/src/data/test-inventory.json
```
Expected: `test-inventory.json` enthält die neuen `otel-emit`-Tests (node:test/BATS) + Vitest. Diff committen (CI failt sonst beim Inventar-Vergleich).

- [ ] **Step 3: Freshness-Artefakte regenerieren**

Run: `task freshness:regenerate`
Expected: `docs/generated/**`, `repo-index.json` etc. aktualisiert. Diff inspizieren; generierte Artefakte committen.

- [ ] **Step 4: CI-Äquivalent (S1–S4-Ratchet + Baseline-Assertion)**

Run: `task freshness:check`
Expected: PASS — insbesondere `quality:check` (S1 Zeilen-Ratchet: keine neue/baselinete Datei über Schwelle; alle neuen Dateien unter Limit; pipeline.js bleibt durch `s1.ignore` ausgenommen), S2 (keine Zyklen), S3 (keine Brand-Literale), S4 (keine Orphan-Manifeste/-Skripte), Baseline-Key-Count unverändert (keine neuen Baseline-Einträge).

> Falls S1 rot wird (eine website-Datei über Limit): die in D2-Step 9 / D3-Step 5 geplanten Splits anwenden — NICHT die Baseline erweitern und NICHT kosmetisch verdichten.

- [ ] **Step 5: Manifest-Validierung + relevante Runner-Tests**

Run:
```bash
task workspace:validate
grep -rln 'monitoring\|website.*egress\|networkpolicy' tests/ | head   # passende TEST-ID finden
./tests/runner.sh local <TEST-ID>   # für geänderte Manifest-Bereiche (monitoring/website-netpol)
```
Expected: PASS.

- [ ] **Step 6: Vollständiges Offline-Set (Sicherheit vor PR)**

Run: `task test:all`
Expected: PASS (BATS-Unit inkl. `test:factory`, kustomize-Struktur, Taskfile-Dry-Run, Security-Scan: kein `:latest` auf dem neuen Collector-Image, keine hardcodierten Secrets in `k3d/*.yaml`).

- [ ] **Step 7: Finaler Commit der generierten Artefakte**

```bash
git add docs/generated docs/code-quality website/src/data/test-inventory.json
git commit -m "chore(otel): regenerate freshness artifacts + test inventory"
```

---

## Stage F — Deploy-Hinweise (post-merge, push-based)

> Diese Stage ist **kein** Teil des PR-Diffs — sie dokumentiert den manuellen Deploy nach Merge (kein GitOps-Reconciler auf fleet).

- Collector + ServiceMonitor + IngressRoute fließen über `k3d/monitoring` → `prod/monitoring` → `prod-fleet/<brand>` in **beide** Brands. Nach Merge:
  ```bash
  task workspace:deploy ENV=mentolder    # bzw. der Monitoring-Apply-Pfad
  task workspace:deploy ENV=korczewski
  ```
- SealedSecret `otel-collector-auth` muss im `monitoring`-ns existieren (vor Collector-Rollout) — `task sealed-secrets`/`env:seal`-Pfad gemäß Task A2/A4.
- DNS: `otel.<domain>` je Brand auf den fleet-Ingress zeigen (analog zu vorhandenen Subdomains).
- `~/.config/factory/autopilot.env` auf dem WSL-Host aus dem Template befüllen (Endpoint + Token je aktiver Brand).
- **Akzeptanz-Smoke (AK Spec §9):** ein dry-run-Tick laufen lassen → in Prometheus `claude_code_token_usage`/`claude_code_cost_usage`/`factory_phase_transition` als Serien verifizieren; Collector-Target `up` in Prometheus; `/admin/factory-observability` zeigt KPI + Trend + Phasen-Breakdown + Tick-Timeline.

---

## Self-Review (Plan vs. Spec)

- **§3a Collector + ServiceMonitor + IngressRoute (Bearer+TLS), Kustomization, configmap-domains-Host, SealedSecret, schema/envsubst:** Stage A (A1–A5). ✅
- **§3b native OTEL_* + Template + CLAUDE_CODE_ENABLE_TELEMETRY=1 + OTEL_METRIC_EXPORT_INTERVAL=10000 + Doku:** Stage B (B1). ✅
- **§3c otel-emit.cjs (pur, fetch, no-op, node:test) + otel-emit.sh (curl, BATS) + Wiring pipeline(1 Zeile)/dispatcher(agent-bash)/wakeup(sh); Metriken phase/tick/feature/canary; ticket_id nur Exemplar:** Stage C (C1–C3). ✅
- **§3d Astro + Svelte + lib + API (isAdmin) + Prometheus-Proxy + neue website→monitoring-Netpol + Phasen-Timeline-Reuse:** Stage D (D1–D3). ✅
- **§5 Env/Secrets/Host/envsubst:** A1, A2, A4. ✅
- **§6 Gotchas (10s-Intervall, fetch-statt-execFileSync, egress, Kardinalität, S3, pipeline.js-S1, headless-env):** adressiert in B1/C1/C3/D1 + S1-Budget-Tabelle. ✅
- **§9 Akzeptanzkriterien:** AK1 (A5+F), AK2 (B+F), AK3 (C), AK4 (D), AK5 (durchgängige S3/S4/schema-Tasks), AK6 (Stage E). ✅
- **§7 Claude-Design-Prompt:** als Planungs-Artefakt in Spec; in D3-Step 2 referenziert (Import-Pfad). ✅ (Design-Generierung selbst ist User-Handoff, out-of-build.)
- **§8 Stretch (Traces/Tempo/Alerts/Backfill):** bewusst NICHT eingeplant (out-of-scope). ✅
