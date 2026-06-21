---
title: "Pocket ID OIDC-Wiring Fix — dev secrets + client seed job (T001087)"
ticket_id: T001087
domains: [infra, security]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Pocket ID OIDC-Wiring Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all 16 OIDC-protected endpoints work again after the Keycloak→Pocket ID migration (PR #2042) by supplying the missing dev secrets, auto-seeding the Pocket ID OIDC clients at deploy time, and fixing two stragglers (Brett client-id, website TS type) — so a single `task workspace:deploy` brings dev and prod back to a working login flow with no manual Pocket ID UI steps.

**Architecture:** Three independent surfaces. (1) Add the absent `POCKET_ID_*` keys to the dev `Secret` manifests so pods stop crashing with `CreateContainerConfigError`. (2) Add a new idempotent Kubernetes `Job` (`pocket-id-client-seed`) that polls Pocket ID health, then GET/POST/PATCHes each of the 16 OIDC clients via the Admin REST API using `Authorization: Bearer $POCKET_ID_API_KEY`. (3) Two one-line repoints: Brett's `BRETT_KC_CLIENT_ID` env value and the website `env.d.ts` type. TDD: BATS guards land red first, then each edit turns its guard green.

**Tech Stack:** Kubernetes (Kustomize base `k3d/`), Bash/`curl` seed job, BATS (`tests/spec/`), Astro/TypeScript (`website/`), `task` (go-task), `scripts/openspec.sh`.

## Global Constraints

- **No brand-domain literals in code/manifests.** Never hardcode `mentolder.de`/`korczewski.de`. Dev placeholders use `.localhost`; prod hosts derive from `${PROD_DOMAIN}` / `${POCKET_ID_FRONTEND_URL}` at deploy time.
- **`k3d/` is the Kustomize base** applied in dev and (via overlays) prod. The seed `Job` lives in the base; no prod patch is needed (it reads secrets that prod fills via SealedSecrets).
- **Dev secret values are placeholders only** — never real credentials. Prod values are sealed in `environments/.secrets/<env>.yaml` → `task env:seal`.
- **The old `*_OIDC_SECRET` keys stay** (Nextcloud + Website use them as fallback during the Welle 1–2 transition). Only ADD `POCKET_ID_*` keys; never delete the legacy ones.
- **New `@test` entries go in `tests/spec/pocket-id-migration.bats`** (the existing per-spec file for this SSOT). Do NOT create ticket-numbered `.bats` files.
- **After any test change:** regenerate `website/src/data/test-inventory.json` via `task test:inventory` and commit it alongside.
- **Pre-commit gate:** `bash scripts/openspec.sh validate` must show this change (`pocket-id-oidc-wiring`) passing. NOTE: the validator runs repo-wide and already reports pre-existing FAILs in *unrelated* change dirs (`cockpit-mobile-view`, `mentolder-react-rebuild`, `test-slug`, `ticket-mcp-go`); those are not introduced by this work and must not be "fixed" here.
- **Frequent commits** — one commit per task (TDD red→green boundary).

### Pre-discovered facts (verified against the branch HEAD)

These were confirmed while writing the plan — do not re-litigate them:

- `environments/schema.yaml` **already declares all 17 `POCKET_ID_*` secrets**, including `POCKET_ID_NEXTCLOUD_SECRET` (≈ line 774). The spec's "Teil 5 / add to schema" is therefore **already satisfied** — Task 7 only adds a guard test, no schema edit.
- `k3d/brett.yaml` has **no ConfigMap**. `BRETT_KC_CLIENT_ID` is a **direct container env value** at lines 69–70 (`value: "brett-app"`). The fix changes that value to `"brett"` (the spec's "ConfigMap" wording is inaccurate; the env value is the real target).
- `k3d/monitoring/grafana-oidc-secret.yaml` defines `POCKET_ID_GRAFANA_SECRET` in the **`monitoring` namespace**, which is **not** part of the `k3d/` base kustomization. A `Job` in the `workspace` namespace cannot `secretKeyRef` a `monitoring`-ns secret. The seed job therefore sources `POCKET_ID_GRAFANA_SECRET` from `workspace-secrets` with `optional: true` and **skips any client whose secret env is empty** — so grafana is gracefully skipped in dev (and seedable in prod only if an operator adds that key to the sealed `workspace-secrets`). No new dev key for grafana is added, honoring the spec.
- `k3d/website.yaml` already wires `POCKET_ID_WEBSITE_SECRET` + `POCKET_ID_API_KEY` from `website-secrets` (lines 255–264); the dev `website-secrets` manifest is what's missing those keys.

---

## File Structure

```
tests/spec/pocket-id-migration.bats        ← MODIFY: +7 guard tests (red first)
k3d/secrets.yaml                           ← MODIFY: +16 POCKET_ID_* keys in workspace-secrets (+1 website mirror in Task 6)
k3d/website-dev-secrets.yaml               ← MODIFY: +POCKET_ID_WEBSITE_SECRET, +POCKET_ID_API_KEY
website/src/env.d.ts                        ← MODIFY: +POCKET_ID_WEBSITE_SECRET type
k3d/brett.yaml                             ← MODIFY: BRETT_KC_CLIENT_ID value "brett-app" → "brett"
k3d/pocket-id-client-seed.yaml             ← NEW: idempotent 16-client OIDC seed Job
k3d/kustomization.yaml                     ← MODIFY: register pocket-id-client-seed.yaml
website/src/data/test-inventory.json       ← REGENERATED: task test:inventory
openspec/changes/pocket-id-oidc-wiring/specs/pocket-id-oidc-wiring.md  ← MODIFY: real spec delta
```

`environments/schema.yaml` is intentionally **absent** from the edit list (already complete — see Pre-discovered facts).

---

## Task 1: Write the 7 failing BATS guards (red phase)

**Files:**
- Modify: `tests/spec/pocket-id-migration.bats` (append after line 469, the final `prod/` build test)

**Interfaces:**
- Consumes: `${K3D}`, `${SCHEMA}`, `${WEBSITE}` path vars already defined at the top of the file (lines 18–24).
- Produces: 7 named `@test` cases that later tasks turn green. Test names are load-bearing — `task test:inventory` records them.

- [ ] **Step 1: Append the 7 guard tests**

Append this block to the end of `tests/spec/pocket-id-migration.bats`:

```bash
# ── T001087: Pocket ID OIDC-wiring fix (dev secrets + client seed job) ──────

@test "pocket-id-wiring: k3d/kustomization.yaml registers pocket-id-client-seed.yaml" {
  grep -E '^\s*-\s*pocket-id-client-seed\.yaml' "${K3D}/kustomization.yaml"
}

@test "pocket-id-wiring: workspace-secrets carries all 14 POCKET_ID_* client/app keys + DB + API key" {
  local missing=()
  for k in \
    POCKET_ID_DB_PASSWORD POCKET_ID_API_KEY \
    POCKET_ID_DOCS_SECRET POCKET_ID_MAIL_SECRET POCKET_ID_BRETT_SECRET \
    POCKET_ID_COMFY_SECRET POCKET_ID_MEDIAVIEWER_SECRET POCKET_ID_VIDEOVAULT_SECRET \
    POCKET_ID_STUDIO_SECRET POCKET_ID_TRAEFIK_SECRET POCKET_ID_RECOVERY_SECRET \
    POCKET_ID_VAULTWARDEN_SECRET POCKET_ID_CLAUDE_CODE_SECRET \
    POCKET_ID_SESSION_HUB_SECRET POCKET_ID_BRAINSTORM_SECRET POCKET_ID_NEXTCLOUD_SECRET
  do
    grep -qE "^\s*${k}:" "${K3D}/secrets.yaml" || missing+=("${k}")
  done
  [ "${#missing[@]}" -eq 0 ] || { echo "missing from k3d/secrets.yaml: ${missing[*]}"; return 1; }
}

@test "pocket-id-wiring: website-secrets carries POCKET_ID_WEBSITE_SECRET + POCKET_ID_API_KEY" {
  grep -qE '^\s*POCKET_ID_WEBSITE_SECRET:' "${K3D}/website-dev-secrets.yaml"
  grep -qE '^\s*POCKET_ID_API_KEY:' "${K3D}/website-dev-secrets.yaml"
}

@test "pocket-id-wiring: website/src/env.d.ts declares POCKET_ID_WEBSITE_SECRET" {
  grep -qE '^\s*readonly POCKET_ID_WEBSITE_SECRET:\s*string' "${WEBSITE}/src/env.d.ts"
}

@test "pocket-id-wiring: k3d/brett.yaml sets BRETT_KC_CLIENT_ID to brett (not brett-app)" {
  grep -qE '^\s*value:\s*"brett"\s*$' "${K3D}/brett.yaml"
  ! grep -qE '^\s*value:\s*"brett-app"\s*$' "${K3D}/brett.yaml" || false
}

@test "pocket-id-wiring: schema declares POCKET_ID_NEXTCLOUD_SECRET" {
  grep -qE '^\s*-\s*name:\s*POCKET_ID_NEXTCLOUD_SECRET\b' "${SCHEMA}"
}

@test "pocket-id-wiring: kustomize build k3d/ emits a Job named pocket-id-client-seed" {
  local out
  out=$(kustomize build "${K3D}" --load-restrictor=LoadRestrictionsNone)
  echo "$out" | awk 'BEGIN{ok=0} /^---$/{if(prev_kind=="Job" && matched){ok=1; exit} prev_kind=""; matched=0; next} {if(/^kind: /) prev_kind=$2; if(/^  name: pocket-id-client-seed$/) matched=1} END{exit ok?0:1}'
}
```

- [ ] **Step 2: Run the new guards and confirm they fail (red)**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-migration.bats -f 'pocket-id-wiring'`
Expected: FAIL on 6 of 7 guards (registration, workspace-secrets keys, website-secrets keys, env.d.ts, brett value, kustomize Job) — run this to verify they fail before proceeding. The `schema declares POCKET_ID_NEXTCLOUD_SECRET` guard passes already (pre-existing schema entry).

- [ ] **Step 3: Commit the red guards**

```bash
git add tests/spec/pocket-id-migration.bats
git commit -m "test(infra): add Pocket ID OIDC-wiring guards (red) [T001087]"
```

---

## Task 2: Add the 16 `POCKET_ID_*` keys to dev `workspace-secrets`

**Files:**
- Modify: `k3d/secrets.yaml` (insert into the `workspace-secrets` `stringData:` block, after `RECOVERY_OIDC_SECRET` at line 73)

**Interfaces:**
- Consumes: nothing.
- Produces: dev placeholder values for the 14 client secrets + DB password + API key, consumed by `pocket-id.yaml` (DB/API), the migrated `oauth2-proxy-*` manifests, and the Task 6 seed job.

- [ ] **Step 1: Insert the keys**

In `k3d/secrets.yaml`, immediately after the line `  RECOVERY_OIDC_SECRET: "devrecoveryoidcsecret12345678901234"` (line 73), insert:

```yaml
  # ── Pocket ID (T001068 migration / T001087 wiring) ──
  # Dev placeholders only. Prod values are sealed in environments/.secrets/<env>.yaml.
  # POCKET_ID_GRAFANA_SECRET intentionally absent here — it lives in the monitoring-ns
  # grafana-oidc Secret; the seed Job sources it optionally and skips if empty.
  POCKET_ID_DB_PASSWORD: "devpocketiddb"
  POCKET_ID_API_KEY: "devpocketidapikey12345678901234"
  POCKET_ID_DOCS_SECRET: "devdocspocketidsecret12345"
  POCKET_ID_MAIL_SECRET: "devmailpocketidsecret12345"
  POCKET_ID_BRETT_SECRET: "devbrettpocketidsecret12345678"
  POCKET_ID_COMFY_SECRET: "devcomfypocketidsecret12345678"
  POCKET_ID_MEDIAVIEWER_SECRET: "devmediaviewerpocketidsecret12"
  POCKET_ID_VIDEOVAULT_SECRET: "devvideovaultpocketidsecret123"
  POCKET_ID_STUDIO_SECRET: "devstudiopocketidsecret1234567"
  POCKET_ID_TRAEFIK_SECRET: "devtraefikpocketidsecret123456"
  POCKET_ID_RECOVERY_SECRET: "devrecoverypocketidsecret12345"
  POCKET_ID_VAULTWARDEN_SECRET: "devvaultwardenpocketidsecret12"
  POCKET_ID_CLAUDE_CODE_SECRET: "devclaudecodepocketidsecret123"
  POCKET_ID_SESSION_HUB_SECRET: "devsessionhubpocketidsecret123"
  POCKET_ID_BRAINSTORM_SECRET: "devbrainstormpocketidsecret123"
  POCKET_ID_NEXTCLOUD_SECRET: "devnextcloudpocketidsecret1234"
```

- [ ] **Step 2: Run the workspace-secrets guard — confirm green**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-migration.bats -f 'workspace-secrets carries all 14'`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add k3d/secrets.yaml
git commit -m "fix(infra): add POCKET_ID_* dev keys to workspace-secrets [T001087]"
```

---

## Task 3: Add `POCKET_ID_*` keys to dev `website-secrets`

**Files:**
- Modify: `k3d/website-dev-secrets.yaml` (append to the `stringData:` block, after line 26)

**Interfaces:**
- Consumes: nothing.
- Produces: `POCKET_ID_WEBSITE_SECRET` + `POCKET_ID_API_KEY` in the `website` namespace, consumed by `k3d/website.yaml` (lines 255–264) and by the Task 6 seed job's `website` client.

- [ ] **Step 1: Insert the keys**

In `k3d/website-dev-secrets.yaml`, after the line `  IPV64_UPDATE_HASH_KORCZEWSKI: ""` (line 26), append:

```yaml
  # ── Pocket ID (T001087) — dev placeholders; prod sealed per-env ──
  POCKET_ID_WEBSITE_SECRET: "devwebsitepocketidsecret123456"
  POCKET_ID_API_KEY: "devpocketidapikey12345678901234"
```

- [ ] **Step 2: Run the website-secrets guard — confirm green**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-migration.bats -f 'website-secrets carries POCKET_ID'`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add k3d/website-dev-secrets.yaml
git commit -m "fix(infra): add POCKET_ID website/API dev keys to website-secrets [T001087]"
```

---

## Task 4: Declare `POCKET_ID_WEBSITE_SECRET` in the website TS env type

**Files:**
- Modify: `website/src/env.d.ts` (lines 19–20, the `WEBSITE_OIDC_SECRET` declaration)

**Interfaces:**
- Consumes: nothing.
- Produces: `ImportMetaEnv.POCKET_ID_WEBSITE_SECRET: string` so `website/src/lib/auth.ts` reads it without a TS error.

- [ ] **Step 1: Add the type line**

In `website/src/env.d.ts`, replace the OIDC-client block (lines 19–20):

```typescript
  // OIDC client
  readonly WEBSITE_OIDC_SECRET: string;
```

with:

```typescript
  // OIDC client
  readonly WEBSITE_OIDC_SECRET: string;
  readonly POCKET_ID_WEBSITE_SECRET: string;
```

- [ ] **Step 2: Run the env.d.ts guard — confirm green**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-migration.bats -f 'env.d.ts declares POCKET_ID_WEBSITE_SECRET'`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add website/src/env.d.ts
git commit -m "fix(website): declare POCKET_ID_WEBSITE_SECRET in env.d.ts [T001087]"
```

---

## Task 5: Repoint Brett's OIDC client-id to `brett`

**Files:**
- Modify: `k3d/brett.yaml` (lines 69–70, the `BRETT_KC_CLIENT_ID` env entry)

**Interfaces:**
- Consumes: nothing.
- Produces: Brett's `auth.ts` (`process.env.BRETT_KC_CLIENT_ID || 'brett-app'`) now resolves to the real Pocket ID client id `brett`, matching `oauth2-proxy-brett.yaml`.

- [ ] **Step 1: Change the value**

In `k3d/brett.yaml`, replace:

```yaml
            - name: BRETT_KC_CLIENT_ID
              value: "brett-app"
```

with:

```yaml
            - name: BRETT_KC_CLIENT_ID
              value: "brett"
```

- [ ] **Step 2: Run the brett guard — confirm green**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-migration.bats -f 'sets BRETT_KC_CLIENT_ID to brett'`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add k3d/brett.yaml
git commit -m "fix(infra): point Brett OIDC client-id at brett (was brett-app) [T001087]"
```

---

## Task 6: Create the Pocket ID client-seed Job + register it

**Files:**
- Create: `k3d/pocket-id-client-seed.yaml`
- Modify: `k3d/secrets.yaml` (one `POCKET_ID_WEBSITE_SECRET` mirror line — see Step 1)
- Modify: `k3d/kustomization.yaml` (add the resource after `- pocket-id.yaml`, line 103)

**Interfaces:**
- Consumes: `workspace-secrets` (`POCKET_ID_API_KEY` + 14 client secrets + optional `POCKET_ID_GRAFANA_SECRET` + mirrored `POCKET_ID_WEBSITE_SECRET`) and `${POCKET_ID_FRONTEND_URL}` (envsubst'd at deploy). The `pocket-id` Service (`http://pocket-id:1411`).
- Produces: `Job/pocket-id-client-seed` that idempotently upserts the 16 OIDC clients. Stateless — re-runnable on every deploy.

**Design notes (read before editing):**
- The `website` client's secret lives in `website-secrets` (ns `website`). A `workspace`-ns Job cannot `secretKeyRef` it cross-ns. **Decision:** mirror `POCKET_ID_WEBSITE_SECRET` into `workspace-secrets` (dev placeholder identical to the `website-secrets` value) so the Job has a single in-ns secret source. Documented inline.
- Grafana: `POCKET_ID_GRAFANA_SECRET` is `optional: true` from `workspace-secrets`; absent in dev ⇒ empty ⇒ the loop skips the grafana client. No new grafana dev key.
- Callback URLs derive from `${POCKET_ID_FRONTEND_URL}`: `SCHEME` = scheme (`http`/`https`), `SUFFIX` = host minus leading `id.` (`localhost` in dev, `${PROD_DOMAIN}` in prod). No brand literal appears in the manifest.

- [ ] **Step 1: Mirror `POCKET_ID_WEBSITE_SECRET` into workspace-secrets (Job's in-ns source)**

In `k3d/secrets.yaml`, inside the Pocket ID block added in Task 2, add one line right after `POCKET_ID_API_KEY`:

```yaml
  # Mirror of website-secrets.POCKET_ID_WEBSITE_SECRET so the in-workspace seed Job
  # can register the `website` client without a cross-namespace secretKeyRef.
  POCKET_ID_WEBSITE_SECRET: "devwebsitepocketidsecret123456"
```

- [ ] **Step 2: Create `k3d/pocket-id-client-seed.yaml`**

```yaml
# ═══════════════════════════════════════════════════════════════════
# Pocket ID OIDC client seed Job (T001087).
# Idempotently registers/updates the 16 OIDC clients in Pocket ID via its
# Admin REST API. Runs on every `task workspace:deploy` (Job name is stable,
# disableNameSuffixHash keeps it overwritable). Stateless — safe to re-run.
#
# Callback URLs are derived from ${POCKET_ID_FRONTEND_URL} at deploy time:
#   dev : http://id.localhost       -> SCHEME=http  SUFFIX=localhost
#   prod: https://id.${PROD_DOMAIN}  -> SCHEME=https SUFFIX=${PROD_DOMAIN}
# No brand-domain literal appears in this manifest.
# ═══════════════════════════════════════════════════════════════════
apiVersion: batch/v1
kind: Job
metadata:
  name: pocket-id-client-seed
  labels:
    app: pocket-id
spec:
  backoffLimit: 5
  template:
    metadata:
      labels:
        app: pocket-id
    spec:
      restartPolicy: OnFailure
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        seccompProfile:
          type: RuntimeDefault
      initContainers:
        - name: wait-for-pocket-id
          image: busybox:1.37
          command:
            - sh
            - -ec
            - |
              i=0
              until wget -q -O- "http://pocket-id:1411/api/health" >/dev/null 2>&1; do
                i=$((i+1))
                if [ "$i" -ge 60 ]; then
                  echo "pocket-id not healthy after 120s"; exit 1
                fi
                echo "waiting for pocket-id health ($i/60)..."; sleep 2
              done
              echo "pocket-id is healthy"
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            runAsUser: 65534
            capabilities:
              drop: [ALL]
            seccompProfile:
              type: RuntimeDefault
          resources:
            requests: { cpu: "10m", memory: "16Mi" }
            limits:   { cpu: "100m", memory: "64Mi" }
      containers:
        - name: seed
          image: curlimages/curl:8.11.0
          imagePullPolicy: IfNotPresent
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            runAsUser: 65534
            capabilities:
              drop: [ALL]
            seccompProfile:
              type: RuntimeDefault
          env:
            - name: POCKET_ID_FRONTEND_URL
              value: "${POCKET_ID_FRONTEND_URL}"
            - name: API
              value: "http://pocket-id:1411"
            - name: POCKET_ID_API_KEY
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_API_KEY } }
            - name: SECRET_docs
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_DOCS_SECRET, optional: true } }
            - name: SECRET_mail
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_MAIL_SECRET, optional: true } }
            - name: SECRET_brett
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_BRETT_SECRET, optional: true } }
            - name: SECRET_comfy
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_COMFY_SECRET, optional: true } }
            - name: SECRET_mediaviewer
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_MEDIAVIEWER_SECRET, optional: true } }
            - name: SECRET_videovault
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_VIDEOVAULT_SECRET, optional: true } }
            - name: SECRET_studio
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_STUDIO_SECRET, optional: true } }
            - name: SECRET_traefik
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_TRAEFIK_SECRET, optional: true } }
            - name: SECRET_recovery
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_RECOVERY_SECRET, optional: true } }
            - name: SECRET_sessionhub
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_SESSION_HUB_SECRET, optional: true } }
            - name: SECRET_brainstorm
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_BRAINSTORM_SECRET, optional: true } }
            - name: SECRET_claudecode
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_CLAUDE_CODE_SECRET, optional: true } }
            - name: SECRET_vaultwarden
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_VAULTWARDEN_SECRET, optional: true } }
            - name: SECRET_nextcloud
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_NEXTCLOUD_SECRET, optional: true } }
            - name: SECRET_grafana
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_GRAFANA_SECRET, optional: true } }
            - name: SECRET_website
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_WEBSITE_SECRET, optional: true } }
          command:
            - /bin/sh
            - -ec
            - |
              # Derive scheme + host suffix from the public frontend URL.
              SCHEME="${POCKET_ID_FRONTEND_URL%%://*}"
              HOST="${POCKET_ID_FRONTEND_URL#*://}"
              SUFFIX="${HOST#id.}"   # localhost (dev) | ${PROD_DOMAIN} (prod)

              AUTH="Authorization: Bearer ${POCKET_ID_API_KEY}"
              CT="Content-Type: application/json"

              # client rows: id|secretEnv|callbackUrl
              # Callback hosts mirror each service's --redirect-url / OIDC redirect.
              ROWS="
              docs|SECRET_docs|${SCHEME}://docs.${SUFFIX}/oauth2/callback
              mailpit-admin|SECRET_mail|${SCHEME}://mail.${SUFFIX}/oauth2/callback
              brett|SECRET_brett|${SCHEME}://brett.${SUFFIX}/oauth2/callback
              comfy|SECRET_comfy|${SCHEME}://comfy.${SUFFIX}/oauth2/callback
              mediaviewer-widget|SECRET_mediaviewer|${SCHEME}://mediaviewer.${SUFFIX}/oauth2/callback
              videovault|SECRET_videovault|${SCHEME}://videovault.${SUFFIX}/oauth2/callback
              studio|SECRET_studio|${SCHEME}://studio.${SUFFIX}/oauth2/callback
              traefik-dashboard|SECRET_traefik|${SCHEME}://traefik.${SUFFIX}/oauth2/callback
              recovery|SECRET_recovery|${SCHEME}://recover.${SUFFIX}/oauth2/callback
              session-hub|SECRET_sessionhub|${SCHEME}://session-hub.${SUFFIX}/oauth2/callback
              brainstorm|SECRET_brainstorm|${SCHEME}://brainstorm.${SUFFIX}/oauth2/callback
              claude-code-mcp-monolith|SECRET_claudecode|${SCHEME}://mcp.${SUFFIX}/oauth2/callback
              vaultwarden|SECRET_vaultwarden|${SCHEME}://vault.${SUFFIX}/identity/connect/oidc-signin
              nextcloud|SECRET_nextcloud|${SCHEME}://cloud.${SUFFIX}/apps/oidc_login/oidc
              grafana|SECRET_grafana|${SCHEME}://grafana.${SUFFIX}/login/generic_oauth
              website|SECRET_website|${SCHEME}://web.${SUFFIX}/api/auth/callback
              "

              upsert() {
                cid="$1"; secret="$2"; cb="$3"
                if [ -z "$secret" ]; then
                  echo "skip ${cid} (no secret provided)"; return 0
                fi
                # Look up the client id in the search response.
                existing=$(curl -fsS -H "$AUTH" "${API}/api/oidc-clients?search=${cid}" \
                  | grep -o "\"id\":\"${cid}\"" || true)
                if [ -n "$existing" ]; then
                  curl -fsS -X PATCH -H "$AUTH" -H "$CT" \
                    -d "$(printf '{"name":"%s","callbackURLs":["%s"]}' "$cid" "$cb")" \
                    "${API}/api/oidc-clients/${cid}" >/dev/null
                  curl -fsS -X POST -H "$AUTH" -H "$CT" \
                    -d "$(printf '{"clientSecret":"%s"}' "$secret")" \
                    "${API}/api/oidc-clients/${cid}/secret" >/dev/null
                  echo "upserted ${cid} (patched)"
                else
                  curl -fsS -X POST -H "$AUTH" -H "$CT" \
                    -d "$(printf '{"id":"%s","name":"%s","callbackURLs":["%s"],"clientSecret":"%s","isPublic":false}' "$cid" "$cid" "$cb" "$secret")" \
                    "${API}/api/oidc-clients" >/dev/null
                  echo "upserted ${cid} (created)"
                fi
              }

              echo "$ROWS" | while IFS='|' read -r cid env cb; do
                [ -z "$cid" ] && continue
                secret=$(eval "printf '%s' \"\$$env\"")
                upsert "$cid" "$secret" "$cb"
              done
              echo "seed complete"
          resources:
            requests: { cpu: "10m", memory: "32Mi" }
            limits:   { cpu: "200m", memory: "128Mi" }
```

> **Implementer note:** the exact Pocket ID Admin API shapes (`callbackURLs` field casing, the secret-rotation endpoint path `/api/oidc-clients/<id>/secret`, the search response field) MUST be confirmed against the running `ghcr.io/pocket-id/pocket-id:v2.9.0` OpenAPI (e.g. `curl http://pocket-id:1411/api/...` from a debug pod, or the upstream docs). If a field name differs, adjust the `payload`/`existing` parsing — the Job structure (init health-poll, per-row upsert, skip-on-empty) stays the same. This is the one place where a live-API check during execution is expected.

- [ ] **Step 3: Register the Job in the kustomization base**

In `k3d/kustomization.yaml`, after line 103 (`  - pocket-id.yaml`) add:

```yaml
  # OIDC client seed Job (T001087) — idempotently registers the 16 clients
  - pocket-id-client-seed.yaml
```

- [ ] **Step 4: Run the registration + kustomize-Job guards — confirm green**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-migration.bats -f 'pocket-id-client-seed'`
Expected: both `registers pocket-id-client-seed.yaml` and `kustomize build k3d/ emits a Job named pocket-id-client-seed` PASS.

- [ ] **Step 5: Sanity-build the base**

Run: `kustomize build k3d/ --load-restrictor=LoadRestrictionsNone >/dev/null && echo OK`
Expected: `OK` (no broken refs)

- [ ] **Step 6: Commit**

```bash
git add k3d/pocket-id-client-seed.yaml k3d/kustomization.yaml k3d/secrets.yaml
git commit -m "feat(infra): add Pocket ID OIDC client-seed Job [T001087]"
```

---

## Task 7: Fill the OpenSpec delta + regenerate inventory + final verification

**Files:**
- Modify: `openspec/changes/pocket-id-oidc-wiring/specs/pocket-id-oidc-wiring.md` (replace the placeholder skeleton with the real spec delta)
- Regenerate: `website/src/data/test-inventory.json`

**Interfaces:**
- Consumes: all prior tasks complete.
- Produces: a validating OpenSpec change + green test inventory + green freshness artifacts.

- [ ] **Step 1: Replace the spec delta skeleton**

Overwrite `openspec/changes/pocket-id-oidc-wiring/specs/pocket-id-oidc-wiring.md` with:

```markdown
## ADDED Requirements

### Requirement: Pocket ID OIDC clients are deploy-seeded

The system SHALL register and reconcile all OIDC clients in Pocket ID
automatically during `task workspace:deploy`, without manual UI steps, so that
every OIDC-protected endpoint authenticates after a single deploy.

#### Scenario: Seed Job upserts every client with a non-empty secret

- **GIVEN** Pocket ID is running and `workspace-secrets`/`website-secrets`
  contain the `POCKET_ID_*_SECRET` values
- **WHEN** the `pocket-id-client-seed` Job runs after a deploy
- **THEN** each client whose secret env is set is created (or PATCHed if it
  already exists) in Pocket ID, and clients with an empty/absent secret are
  skipped without failing the Job.

### Requirement: Dev secret manifests carry the Pocket ID keys

The dev `workspace-secrets` and `website-secrets` manifests SHALL declare the
`POCKET_ID_*` keys so no OIDC-dependent pod enters `CreateContainerConfigError`.

#### Scenario: Pods start in a fresh k3d cluster

- **GIVEN** a fresh k3d cluster deployed from the `k3d/` base
- **WHEN** the OIDC-dependent pods (oauth2-proxy-*, website, brett, pocket-id) start
- **THEN** all required `POCKET_ID_*` secret keys resolve and the pods reach Ready.
```

- [ ] **Step 2: Validate this change passes**

Run: `bash scripts/openspec.sh validate 2>&1 | grep -iE 'pocket-id-oidc-wiring|openspec validate: OK' || true`
Expected: `pocket-id-oidc-wiring` appears in **no** `FAIL:` line. (Pre-existing unrelated FAILs for other slugs are acceptable per Global Constraints — confirm by eye that none name this slug.)

- [ ] **Step 3: Run the full spec file — confirm all non-skipped tests green**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-migration.bats`
Expected: all PASS (the Welle 3 test remains `skip`); the 7 new guards PASS.

- [ ] **Step 4: Regenerate + commit the test inventory**

Run: `task test:inventory`
Then:

```bash
git add website/src/data/test-inventory.json
git commit -m "chore(test): regenerate test inventory for Pocket ID wiring guards [T001087]"
```

- [ ] **Step 5: Run the changed-scope test gate**

Run: `task test:changed`
Expected: PASS (no failures introduced by this change).

- [ ] **Step 6: Regenerate freshness artifacts and verify**

Run: `task freshness:regenerate`
Then: `task freshness:check`
Expected: `freshness:check` reports clean (no stale artifacts).

- [ ] **Step 7: Commit the spec delta + any freshness regen**

```bash
git add openspec/changes/pocket-id-oidc-wiring/specs/pocket-id-oidc-wiring.md
git add docs/generated docs/code-quality 2>/dev/null || true
git commit -m "docs(openspec): pocket-id-oidc-wiring spec delta + freshness regen [T001087]"
```

> If `task freshness:regenerate` touched `docs/generated/**` or `k3d/docs-content-built/architecture/index.html`, include them in this commit. They are conflict magnets on rebase — resolve with `git checkout --ours <file>` if a conflict appears (see CLAUDE.md "Generated artifacts").

---

## Self-Review (completed during plan authoring)

- **Spec coverage:** Teil 1 (dev secrets) → Tasks 2+3; Teil 2 (seed Job) → Task 6; Teil 3 (Brett) → Task 5; Teil 4 (TS type) → Task 4; Teil 5 (schema) → already satisfied, guarded in Tasks 1/7; Testbarkeit (+7 BATS) → Task 1; final verification (`task test:changed`, `freshness:regenerate`, `freshness:check`, `test:inventory`) → Task 7.
- **Intentional, documented deviations from spec:** (a) `environments/schema.yaml` needs no edit — `POCKET_ID_NEXTCLOUD_SECRET` already exists (≈ line 774). (b) Brett fix is a direct env value, not a ConfigMap. (c) Grafana's secret is monitoring-ns and cross-ns-unreachable, so the seed Job sources it `optional` and skips when empty; `POCKET_ID_WEBSITE_SECRET` is mirrored into `workspace-secrets` so the Job has a single in-ns secret source.
- **Type/name consistency:** secret env var names in the Job (`SECRET_<x>`) and their `secretKeyRef` keys match the keys added in Tasks 2/3/6; client ids match `oauth2-proxy-*` manifests and the spec's client matrix.
- **Open execution check:** exact Pocket ID Admin API field names (`callbackURLs`, `/secret` rotation endpoint, search response shape) must be verified against the live `pocket-id:1411` OpenAPI during Task 6 — flagged inline.
