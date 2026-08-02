---
title: "k3d-dev-drift — Implementation Plan"
ticket_id: T001853
domains: [infra, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# k3d-dev-drift — Implementation Plan

_Ticket: T001853 · Spec: `docs/superpowers/specs/2026-07-15-k3d-dev-drift-design.md`_

Alle betroffenen Dateien sind `.yaml`/`.yml`/`.bats` und damit S1-ungated (keine
Extension-Limits in `docs/code-quality/gates.yaml`) — keine Budget-Constraints.
Die 12 RED-Tests liegen bereits im Stage-Commit (`tests/spec/workspace-deploy.bats`,
Filter `T001853`) und sind auf dem Branch verifiziert rot (12/12 not ok).

## File Structure

```
k3d/website.yaml                        # geändert: nodeAffinity-Block entfernt
k3d/knowledge-ingest-cronjob.yaml       # geändert: nodeAffinity-Blöcke entfernt
k3d/cronjob-systemtest-cleanup.yaml     # geändert: nodeAffinity-Blöcke entfernt (2×)
k3d/cronjob-scheduled-publish.yaml      # geändert: website.${WEBSITE_NAMESPACE}.svc
k3d/notify-unread-cronjob.yaml          # geändert: website.${WEBSITE_NAMESPACE}.svc
k3d/cronjob-dunning-detection.yaml      # geändert: website.${WEBSITE_NAMESPACE}.svc
k3d/error-log-retention-cronjob.yaml    # geändert: website.${WEBSITE_NAMESPACE}.svc
k3d/cronjob-monthly-billing.yaml        # geändert: website.${WEBSITE_NAMESPACE}.svc
k3d/brett.yaml                          # geändert: website.${WEBSITE_NAMESPACE}.svc
k3d/secrets.yaml                        # geändert: +SESSIONS_CRON_TOKEN +STUDIO_DB_URL
k3d/website-dev-secrets.yaml            # geändert: +12 Keys, namespace: ${WEBSITE_NAMESPACE}
k3d/website-content-token-secret.yaml   # geändert: namespace: ${WEBSITE_NAMESPACE}
k3d/network-policies-dev.yaml           # NEU: allow-apiserver-egress-k3d (dev-only)
k3d/kustomization.yaml                  # geändert: + network-policies-dev.yaml
prod/kustomization.yaml                 # geändert: $patch: delete für die dev-Netpol
k3d/studio.yaml                         # geändert: imagePullPolicy IfNotPresent
k3d/pocket-id.yaml                      # geändert: db-init Bootstrap-SQL (User + API-Key)
Taskfile.yml                            # geändert: website:deploy dev-Zweig, studio:build
k3d-config.yaml                         # geändert: kubeAPI.hostPort gepinnt
tests/spec/workspace-deploy.bats        # bereits im Stage-Commit: 12 RED-Tests T001853
```

## Task 1 — RED-Baseline bestätigen

Die im Stage-Commit enthaltenen Tests gegen den unveränderten Stand laufen lassen:

```bash
bats tests/spec/workspace-deploy.bats --filter "T001853"
# expected: FAIL (12/12 not ok — Drift-Zustand reproduziert)
```

Schlägt einer der 12 Tests hier bereits GRÜN an, stoppen und den Test gegen die
Design-Spec prüfen (dann wurde parallel etwas gemergt — Rebase nötig).

## Task 2 — Host-Affinities aus der Basis entfernen

In drei Basis-Manifesten den kompletten `affinity:`-Block (nodeAffinity mit
`kubernetes.io/hostname`-Listen) ersatzlos entfernen:

- `k3d/website.yaml` (Zeile ~209, ein Block)
- `k3d/knowledge-ingest-cronjob.yaml` (alle Vorkommen)
- `k3d/cronjob-systemtest-cleanup.yaml` (zwei Vorkommen, Zeilen ~42–48 und ~106–112)

Kontext: Die Listen enthielten ohnehin alle Prod-/Remote-Nodes (`gekko-hetzner-2/3/4`,
`pk-hetzner-4/6/8`) — auf Prod und Remote-Dev ist die Entfernung funktional äquivalent,
auf k3d macht sie die Pods erstmals schedulbar. Prod-Pinning der Website läuft weiterhin
über den bestehenden `WEBSITE_NODE_AFFINITY`-Patch-Mechanismus in `website:deploy`
(Taskfile ~Zeile 3595) und die `prod-fleet/*`-Overlays; dieser Mechanismus patcht per
`op: replace` auf den Affinity-Pfad und MUSS auf `op: add` mit vollem Affinity-Objekt
umgestellt werden, da der Pfad nach der Entfernung im Basis-Manifest nicht mehr existiert:

```yaml
# Taskfile.yml, website:deploy — WEBSITE_NODE_AFFINITY-Patch (JSON-Patch):
# vorher: op: replace, path: .../nodeSelectorTerms/0/matchExpressions/0/values
# nachher (Pfad existiert in der Basis nicht mehr):
-p "[{\"op\":\"add\",\"path\":\"/spec/template/spec/affinity\",\"value\":{\"nodeAffinity\":{\"requiredDuringSchedulingIgnoredDuringExecution\":{\"nodeSelectorTerms\":[{\"matchExpressions\":[{\"key\":\"kubernetes.io/hostname\",\"operator\":\"In\",\"values\":${WEBSITE_NODE_AFFINITY}}]}]}}}}]"
```

## Task 3 — website.website.svc durch ${WEBSITE_NAMESPACE} ersetzen

In sechs Basis-Manifesten jedes Vorkommen von `website.website.svc` durch
`website.${WEBSITE_NAMESPACE}.svc` ersetzen:

- `k3d/cronjob-scheduled-publish.yaml`
- `k3d/notify-unread-cronjob.yaml`
- `k3d/cronjob-dunning-detection.yaml`
- `k3d/error-log-retention-cronjob.yaml`
- `k3d/cronjob-monthly-billing.yaml`
- `k3d/brett.yaml` (Zeile ~77, env `WEBSITE_URL`-artiger Wert)

`$WEBSITE_NAMESPACE` ist in der envsubst-Liste des kustomize-Pfads von `workspace:deploy`
bereits enthalten (dev- UND prod-Zweig) — keine Taskfile-Änderung nötig. Verhaltens-
änderung dokumentieren: auf prod-korczewski zeigen die CronJobs künftig korrekt auf
`website.website-korczewski.svc` (latenter Bug, bisher liefen sie gegen den mentolder-ns
`website` — Cross-Brand-Fehlzugriff). In die PR-Beschreibung aufnehmen.

## Task 4 — Dev-Secret-Gaps schließen

**`k3d/secrets.yaml`** (workspace-secrets, stringData) — zwei Keys ergänzen:

```yaml
  SESSIONS_CRON_TOKEN: "devsessionscrontoken1234567890"
  STUDIO_DB_URL: "postgresql://website:devwebsitedb@shared-db:5432/website?sslmode=disable"
```

(Passwort-Teil muss dem bestehenden `WEBSITE_DB_PASSWORD`-Dev-Wert in derselben Datei
entsprechen — beim Implementieren gegenprüfen.)

**`k3d/website-dev-secrets.yaml`** — 12 Keys ergänzen (Dev-Platzhalterwerte im Stil der
bestehenden Einträge) und den Namespace parametrisieren:

```yaml
metadata:
  name: website-secrets
  namespace: ${WEBSITE_NAMESPACE}
stringData:
  # … bestehende Keys …
  INTERNAL_API_TOKEN: "devinternalapitoken1234567890"
  ANTHROPIC_API_KEY: "devanthropickey"
  BRETT_OIDC_SECRET: "devbrettoidcsecret123456"
  DEEPSEEK_API_KEY: "devdeepseekkey"
  DEEPSEEK_API_KEY_PK: "devdeepseekkeypk"
  IPV64_API_KEY: "devipv64key"
  LLM_ROUTER_API_KEY: "devllmrouterkey"
  SEPA_CREDITOR_BIC: "DEVBICXXX"
  SEPA_CREDITOR_IBAN: "DE00000000000000000000"
  SEPA_CREDITOR_ID: "DE00ZZZ00000000000"
  VOYAGE_API_KEY: "devvoyagekey"
  SESSIONS_CRON_TOKEN: "devsessionscrontoken1234567890"
```

**`k3d/website-content-token-secret.yaml`** — `namespace: website` ebenfalls durch
`namespace: ${WEBSITE_NAMESPACE}` ersetzen.

**`Taskfile.yml` → `website:deploy` dev-Zweig** (Zeilen ~3601–3606): die beiden
Secret-Applies durch envsubst leiten und `configmap-domains.yaml` in den Website-ns
applizieren (fehlte bisher — `domain-config not found` beim Website-Pod):

```bash
if [ "{{.ENV}}" = "dev" ]; then
  envsubst "\$WEBSITE_NAMESPACE" < k3d/website-dev-secrets.yaml | kubectl ${CTX_ARG} apply -f -
  envsubst "\$WEBSITE_NAMESPACE" < k3d/website-content-token-secret.yaml | kubectl ${CTX_ARG} apply -f -
  kubectl ${CTX_ARG} -n "${WEBSITE_NAMESPACE}" apply -f k3d/configmap-domains.yaml
fi
```

## Task 5 — Dev-only API-Server-Netpol

**Neu `k3d/network-policies-dev.yaml`:**

```yaml
# Dev-only (k3d): erlaubt Pods den Zugriff auf den API-Server-Endpoint im
# Docker-Netz. NetworkPolicies wirken post-DNAT — die Basis-Policy
# allow-apiserver-egress (10.20.0.0/24 fleet-wg + 10.43.0.0/16 Service-CIDR)
# deckt den k3d-Endpoint (172.16.0.0/12) nicht ab. Wird im prod/-Overlay per
# $patch: delete gestrippt (Muster: secrets.yaml).
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-apiserver-egress-k3d
  namespace: workspace
  labels:
    app.kubernetes.io/part-of: workspace-mvp
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
    - ports:
        - port: 6443
          protocol: TCP
      to:
        - ipBlock:
            cidr: 172.16.0.0/12
```

**`k3d/kustomization.yaml`:** `network-policies-dev.yaml` direkt nach
`network-policies.yaml` (Zeile ~107) in `resources:` aufnehmen.

**`prod/kustomization.yaml`:** im bestehenden `patches:`-Block (Muster
`workspace-secrets`-Strip, Zeilen ~35–48) ergänzen:

```yaml
  # Drop the k3d-only apiserver egress policy from prod output — the prod
  # apiserver endpoints live in the fleet-wg range covered by the base policy.
  - patch: |-
      apiVersion: networking.k8s.io/v1
      kind: NetworkPolicy
      metadata:
        name: allow-apiserver-egress-k3d
        namespace: workspace
      $patch: delete
```

Verifikation: `kustomize build prod-fleet/mentolder --load-restrictor=LoadRestrictionsNone`
darf `allow-apiserver-egress-k3d` NICHT enthalten; `kustomize build k3d/` MUSS es enthalten.

## Task 6 — website:deploy dev-Zweig auf current-context

`Taskfile.yml` → `website:deploy` (Zeile ~3508): `CTX_ARG` nur noch für non-dev setzen —
identisches Guard-Muster wie in `workspace:dsgvo-check`/`brett:logs`:

```bash
CTX_ARG=""
[ "{{.ENV}}" != "dev" ] && [ -n "${ENV_CONTEXT:-}" ] && CTX_ARG="--context=${ENV_CONTEXT}"
```

Damit deployt `website:deploy ENV=dev` konsistent zu `workspace:deploy ENV=dev` auf den
aktuellen kubectl-Kontext (verbindliche dev-Semantik laut Design-Spec) statt Manifeste
remote (`gekko-hetzner-2-dev`) und Image lokal zu platzieren.

## Task 7 — studio: Import-Bug und pullPolicy

**`Taskfile.yml` → `studio:build`** (Zeilen ~3860–3868): Shell-Fallback durch die
Taskfile-Template-Variable ersetzen und den Fehler nicht mehr verschlucken:

```yaml
  studio:build:
    desc: "Build studio-server image and (in dev) import into k3d (T001002)"
    cmds:
      - docker build -t ${STUDIO_IMAGE:-studio-server}:latest studio-server/
      - |
          if [ "{{.ENV}}" = "dev" ] || [ "{{.ENV}}" = "" ]; then
            k3d image import ${STUDIO_IMAGE:-studio-server}:latest -c {{.CLUSTER_NAME}}
          fi
      - echo "✓ studio image built"
```

**`k3d/studio.yaml`** (Zeile ~35): `imagePullPolicy: Always` → `imagePullPolicy: IfNotPresent`.
Prod ist unberührt sicher: `prod-fleet/mentolder/studio-patch.yaml` pinnt
`${STUDIO_IMAGE}@${STUDIO_IMAGE_DIGEST}` — Digest-Referenzen sind immutable, `IfNotPresent`
ist dort semantisch identisch zu `Always`.

## Task 8 — Pocket-ID-Bootstrap in pocket-id-db-init

`k3d/pocket-id.yaml` → `pocket-id-db-init`-Job: Nach dem bestehenden DB/Role-Setup ein
idempotentes Bootstrap-SQL ausführen (psql gegen die `pocket_id`-DB, Env-Vars
`POCKET_ID_API_KEY` aus `workspace-secrets` in den Job aufnehmen, falls noch nicht
vorhanden):

```sql
INSERT INTO users (id, created_at, username, email, first_name, last_name, is_admin, display_name, email_verified)
VALUES ('a0000000-0000-4000-8000-000000000001', now(), 'paddione', 'admin@bootstrap.invalid', 'Admin', 'Bootstrap', true, 'Admin (Bootstrap)', true)
ON CONFLICT (username) DO NOTHING;

INSERT INTO api_keys (id, name, key, description, expires_at, created_at, user_id)
VALUES (gen_random_uuid(), 'seed-deploy',
        encode(sha256(convert_to('$POCKET_ID_API_KEY', 'UTF8')), 'hex'),
        'bootstrap key for pocket-id-client-seed (sha256 of workspace-secrets.POCKET_ID_API_KEY)',
        '4051-01-01T00:00:00Z', now(), 'a0000000-0000-4000-8000-000000000001')
ON CONFLICT (key) DO NOTHING;
```

Randbedingungen (aus Live-Verifikation 2026-07-15): Pocket-ID validiert `X-API-KEY` gegen
`sha256(key)` hex in `api_keys.key` und autorisiert nur Keys mit Admin-`user_id`
(NULL-user → 403). `sha256()` ist PG16-builtin. Das SQL läuft erst, NACHDEM die
Pocket-ID-App ihre Migrationen ausgeführt hat — der db-init-Job läuft aber VOR dem
App-Start. Deshalb den Bootstrap als Retry-Schleife implementieren, die auf die Existenz
der Tabelle wartet (`SELECT to_regclass('public.api_keys')`), analog zum bestehenden
wait-for-Muster der Seed-Jobs, mit Timeout ~120s und non-fatal Exit (Bootstrap darf einen
bestehenden Cluster-Deploy nie blockieren; Log-Zeile bei Skip). Auf Prod ist beides no-op
(`ON CONFLICT DO NOTHING`, Rows existieren).

## Task 9 — kubeAPI.hostPort pinnen

`k3d-config.yaml` → `kubeAPI:`-Block ergänzen:

```yaml
kubeAPI:
  host: "127.0.0.1"
  hostIP: "127.0.0.1"
  hostPort: "6445"
```

Wirkt ab der nächsten Cluster-Recreation; beendet den Zufallsport-Drift nach
`k3d cluster start` (kubeconfig bleibt stabil).

## Task 10 — GREEN-Nachweis + finale Verifikation

```bash
# 1. Die 12 T001853-Tests müssen jetzt grün sein:
bats tests/spec/workspace-deploy.bats --filter "T001853"
# erwartet: 12/12 ok

# 2. Gesamte Spec-Datei (keine Regression der 18 Bestandstests):
bats tests/spec/workspace-deploy.bats

# 3. Manifest-Validierung (kustomize build beider Welten):
task workspace:validate

# 4. Mandatory CI-Gates:
task test:changed
task freshness:regenerate
task freshness:check

# 5. Test-Inventar (Tests wurden ergänzt) — Diff committen:
task test:inventory

# 6. OpenSpec-Gate:
task test:openspec
```

Abschließend Live-Konvergenz dokumentieren (nicht CI-blockierend): auf dem laufenden
lokalen Cluster `kubectl config use-context k3d-korczewski-dev && task workspace:deploy ENV=dev`
ausführen und prüfen, dass kein Pod in `CreateContainerConfigError`/`Pending` (außer
`spreed-signaling`, Talk-Stack nicht deployed) zurückfällt.
