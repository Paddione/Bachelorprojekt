---
title: "oauth2-proxy-hardening — Implementation Plan"
ticket_id: T001579
domains: [auth, infra, security, tests]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# oauth2-proxy-hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden all 11 production oauth2-proxy gates: enable issuer TLS verification, replace wildcard `--email-domain=*` authorization with Pocket-ID group-based authorization (`workspace-users`), remove `--insecure-oidc-allow-unverified-email`, and delete the orphaned `templates/brain/prod-korczewski/` subtree.

**Architecture:** All changes are Kustomize strategic-merge patches in `prod/patch-oauth2-proxy-*.yaml` (consumed by both `prod-fleet/mentolder` and `prod-fleet/korczewski`) plus an idempotent group-provisioning extension of the existing Pocket-ID seed job. Dev base (`k3d/oauth2-proxy-*.yaml`) stays untouched. TDD via new render-based BATS suite `tests/spec/auth-sso.bats`.

**Tech Stack:** Kustomize, oauth2-proxy (OIDC provider mode), Pocket-ID Admin REST API (curl, `X-API-KEY`), BATS.

**Design SSOT:** `docs/superpowers/specs/2026-07-03-oauth2-proxy-hardening-design.md` — decisions there are final (notably: `--skip-oidc-discovery=true` stays; one platform group `workspace-users`; member assignment is a documented admin step; studio/traefik/mailpit keep `--authenticated-emails-file`).

## Global Constraints

- Issuer stays `https://auth.${PROD_DOMAIN}` — never write brand-domain literals (`*.mentolder.de` / `*.korczewski.de`) into manifests, tests, or snippets (S3 gate). All hostname assertions use the raw `${PROD_DOMAIN}` placeholder (kustomize renders it un-substituted; envsubst happens at deploy time).
- Dev base gates (`k3d/oauth2-proxy-*.yaml`, `k3d/dev-stack/*`, `k3d/recovery-browser.yaml`) are out of scope — do not edit.
- No prod deploy inside this plan/CI scope. The prod rollout is gated on the documented staging/token verification (Task 7) and executed by the operator after merge.
- New BATS tests go into `tests/spec/auth-sso.bats` (one file per SSOT spec, template style `tests/spec/software-factory.bats`; render pattern from `tests/spec/brain-quartz-deploy.bats`). Never create ticket-numbered test files.
- After adding tests: regenerate `website/src/data/test-inventory.json` via `task test:inventory` and commit it.
- Baseline must not grow: no new entries in `docs/code-quality/baseline.json`.

## File Structure

```
Create: tests/spec/auth-sso.bats                                (~85 lines; .bats has no S1 extension limit; not baselined)
Modify: prod/patch-oauth2-proxy-brain.yaml                      (41 lines, not baselined, yaml not S1-gated; net -1)
Modify: prod/patch-oauth2-proxy-brett.yaml                      (42 lines, not baselined; net -1)
Modify: prod/patch-oauth2-proxy-comfy.yaml                      (41 lines, not baselined; net -1)
Modify: prod/patch-oauth2-proxy-docs.yaml                       (41 lines, not baselined; net -1)
Modify: prod/patch-oauth2-proxy-downloads.yaml                  (41 lines, not baselined; net -1)
Modify: prod/patch-oauth2-proxy-mediaviewer.yaml                (45 lines, not baselined; net -1)
Modify: prod/patch-oauth2-proxy-rustdesk-web.yaml               (44 lines, not baselined; net -1)
Modify: prod/patch-oauth2-proxy-videovault.yaml                 (43 lines, not baselined; net -1)
Modify: prod/patch-oauth2-proxy-studio.yaml                     (44 lines, not baselined; net -2)
Modify: prod/patch-oauth2-proxy-traefik.yaml                    (42 lines, not baselined; net -2)
Modify: prod/patch-oauth2-proxy-mailpit.yaml                    (43 lines, not baselined; net -2)
Modify: k3d/pocket-id-client-seed.yaml                          (295 lines, not baselined, yaml not S1-gated; ~+25)
Delete: templates/brain/prod-korczewski/                        (entire subtree; sole file: nested templates/brain/kustomization.yaml, 3 lines, referenced nowhere)
Modify: openspec/changes/oauth2-proxy-hardening/specs/auth-sso.md (delta already authored with this plan — Task 6 verifies it against the implementation)
Regenerate: website/src/data/test-inventory.json                 (via task test:inventory)
```

S1 note: none of the touched files appears in `docs/code-quality/baseline.json` (checked 2026-07-03), and `.yaml`/`.bats` carry no S1 extension limit — no ratchet budget risk. S4 note: the new `.bats` file needs no kustomization reference; no new `k3d/*.yaml` or `scripts/*` files are created.

---

### Task 1: Failing BATS suite `tests/spec/auth-sso.bats` (RED)

**Files:**
- Create: `tests/spec/auth-sso.bats`
- Modify: `website/src/data/test-inventory.json` (regenerated)

**Interfaces:**
- Produces: the red→green contract for Tasks 2–5. Assertion values were validated against the current render on 2026-07-03: `kubectl kustomize prod-fleet/mentolder --load-restrictor=LoadRestrictionsNone` currently yields counts 11× `--ssl-insecure-skip-verify=true`, 8× `--email-domain=*`, 11× `--insecure-oidc-allow-unverified-email=true`, 3× `--authenticated-emails-file` — so every negative assertion below is genuinely RED today, and the positive counts (8/3) match the target state exactly.

- [ ] **Step 1: Write the failing test file**

```bash
cat > tests/spec/auth-sso.bats <<'EOF'
#!/usr/bin/env bats
# tests/spec/auth-sso.bats
# SSOT: openspec/specs/auth-sso.md
# T001579: oauth2-proxy gate hardening — render-based manifest assertions.
# Render pattern follows tests/spec/brain-quartz-deploy.bats.
load 'test_helper'

_render_mentolder() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  kubectl kustomize "$REPO_ROOT/prod-fleet/mentolder" --load-restrictor=LoadRestrictionsNone 2>/dev/null
}

_render_korczewski() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  kubectl kustomize "$REPO_ROOT/prod-fleet/korczewski" --load-restrictor=LoadRestrictionsNone 2>/dev/null
}

@test "prod render (mentolder): no --ssl-insecure-skip-verify anywhere" {
  RENDER="$(_render_mentolder)"
  ! grep -q -- '--ssl-insecure-skip-verify' <<< "$RENDER" || { echo "FAIL: ssl-insecure-skip-verify still rendered"; return 1; }
}

@test "prod render (mentolder): no --insecure-oidc-allow-unverified-email anywhere" {
  RENDER="$(_render_mentolder)"
  ! grep -q -- '--insecure-oidc-allow-unverified-email' <<< "$RENDER" || { echo "FAIL: insecure-oidc-allow-unverified-email still rendered"; return 1; }
}

@test "prod render (mentolder): no wildcard --email-domain=* anywhere" {
  RENDER="$(_render_mentolder)"
  ! grep -q -- '--email-domain=\*' <<< "$RENDER" || { echo "FAIL: email-domain=* still rendered"; return 1; }
}

@test "prod render (mentolder): exactly 8 gates carry --allowed-groups=workspace-users" {
  RENDER="$(_render_mentolder)"
  count="$(grep -c -- '--allowed-groups=workspace-users' <<< "$RENDER" || true)"
  [ "$count" -eq 8 ] || { echo "FAIL: expected 8 allowed-groups gates, got ${count}"; return 1; }
}

@test "prod render (mentolder): exactly 8 gates carry --oidc-groups-claim=groups" {
  RENDER="$(_render_mentolder)"
  count="$(grep -c -- '--oidc-groups-claim=groups' <<< "$RENDER" || true)"
  [ "$count" -eq 8 ] || { echo "FAIL: expected 8 oidc-groups-claim gates, got ${count}"; return 1; }
}

@test "prod render (mentolder): exactly 8 gates request the groups scope" {
  RENDER="$(_render_mentolder)"
  count="$(grep -c -- '--scope=openid email profile groups' <<< "$RENDER" || true)"
  [ "$count" -eq 8 ] || { echo "FAIL: expected 8 gates with groups scope, got ${count}"; return 1; }
}

@test "prod render (mentolder): the 3 allowlist gates keep --authenticated-emails-file" {
  RENDER="$(_render_mentolder)"
  count="$(grep -c -- '--authenticated-emails-file' <<< "$RENDER" || true)"
  [ "$count" -eq 3 ] || { echo "FAIL: expected 3 authenticated-emails-file gates, got ${count}"; return 1; }
}

@test "prod render (korczewski): no insecure flags anywhere" {
  RENDER="$(_render_korczewski)"
  ! grep -qE -- '--(ssl-insecure-skip-verify|insecure-oidc-allow-unverified-email)' <<< "$RENDER" || { echo "FAIL: insecure flag rendered on korczewski"; return 1; }
  ! grep -q -- '--email-domain=\*' <<< "$RENDER" || { echo "FAIL: email-domain=* rendered on korczewski"; return 1; }
}

@test "pocket-id seed job provisions the workspace-users group idempotently" {
  grep -q 'workspace-users' k3d/pocket-id-client-seed.yaml || { echo "FAIL: workspace-users group missing in seed job"; return 1; }
  grep -q '/api/user-groups' k3d/pocket-id-client-seed.yaml || { echo "FAIL: user-groups API call missing in seed job"; return 1; }
  grep -q 'ensure_group' k3d/pocket-id-client-seed.yaml || { echo "FAIL: ensure_group helper missing in seed job"; return 1; }
}

@test "orphaned templates/brain/prod-korczewski subtree is gone" {
  [ ! -d templates/brain/prod-korczewski ] || { echo "FAIL: templates/brain/prod-korczewski still exists"; return 1; }
}
EOF
```

- [ ] **Step 2: Run the suite to verify it fails (RED)**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/auth-sso.bats`
expected: FAIL — every render assertion is red (11× ssl-insecure, 11× unverified-email, 8× email-domain=* still present; 0× allowed-groups; seed job has no group provisioning; orphan dir exists). Only the `--authenticated-emails-file == 3` test passes already.

- [ ] **Step 3: Regenerate the test inventory**

Run: `task test:inventory`
Expected: `website/src/data/test-inventory.json` updated with the new suite.

- [ ] **Step 4: Commit**

```bash
git add tests/spec/auth-sso.bats website/src/data/test-inventory.json
git commit -m "test(auth-sso): add RED oauth2-proxy hardening render assertions [T001579]"
```

---

### Task 2: WP1 — remove `--ssl-insecure-skip-verify` from all 11 prod gates

**Files:**
- Modify: `prod/patch-oauth2-proxy-brain.yaml`, `prod/patch-oauth2-proxy-brett.yaml`, `prod/patch-oauth2-proxy-comfy.yaml`, `prod/patch-oauth2-proxy-docs.yaml`, `prod/patch-oauth2-proxy-downloads.yaml`, `prod/patch-oauth2-proxy-mailpit.yaml`, `prod/patch-oauth2-proxy-mediaviewer.yaml`, `prod/patch-oauth2-proxy-rustdesk-web.yaml`, `prod/patch-oauth2-proxy-studio.yaml`, `prod/patch-oauth2-proxy-traefik.yaml`, `prod/patch-oauth2-proxy-videovault.yaml`

**Interfaces:**
- Consumes: RED test `prod render (mentolder): no --ssl-insecure-skip-verify anywhere` from Task 1.
- Produces: TLS-verified issuer connections; `--skip-oidc-discovery=true` and the four explicit endpoint flags (`--login-url`, `--redeem-url`, `--oidc-jwks-url`, `--profile-url`) stay untouched (design decision — do not remove them).

- [ ] **Step 1: Delete the flag line in each of the 11 patch files**

In every `prod/patch-oauth2-proxy-<gate>.yaml`, remove exactly this args entry (it sits directly below `--oidc-issuer-url`):

```yaml
            - "--ssl-insecure-skip-verify=true"
```

Mechanical apply + self-check:

```bash
sed -i '/--ssl-insecure-skip-verify=true/d' prod/patch-oauth2-proxy-*.yaml
grep -rn -- '--ssl-insecure-skip-verify' prod/ && echo "LEFTOVER — fix manually" || echo "clean"
```

- [ ] **Step 2: Validate manifests and run the two TLS tests**

```bash
task workspace:validate
tests/unit/lib/bats-core/bin/bats tests/spec/auth-sso.bats
```

Expected: `workspace:validate` green; in the BATS run, the `no --ssl-insecure-skip-verify` assertions (mentolder + korczewski half) now pass; the group/email/seed/orphan tests still fail (later tasks).

- [ ] **Step 3: Commit**

```bash
git add prod/patch-oauth2-proxy-*.yaml
git commit -m "fix(auth-sso): enable issuer TLS verification on all 11 prod oauth2-proxy gates [T001579]"
```

---

### Task 3: WP2a — seed job provisions the `workspace-users` group

**Files:**
- Modify: `k3d/pocket-id-client-seed.yaml`

**Interfaces:**
- Consumes: the existing seed-job conventions — `AUTH="X-API-KEY: ${POCKET_ID_API_KEY}"`, `CT`, `CURL_RETRY`, the `find_client_id` grep/sed pattern (image ships no jq), `</dev/null` on every curl.
- Produces: the group `workspace-users` that Task 4's `--allowed-groups=workspace-users` and the Task 7 admin step depend on. Group name is the machine-readable `name` (this is the value Pocket-ID emits in the `groups` claim); `friendlyName` is display-only.

- [ ] **Step 1: Add the idempotent group-provisioning block to the seed script**

In `k3d/pocket-id-client-seed.yaml`, insert the following directly before the final `echo "seed complete"` line of the container script (same indentation as the surrounding script lines):

```sh
# ── User-group provisioning (T001579) ─────────────────────────
# Idempotently ensure the platform base group `workspace-users`
# exists. oauth2-proxy gates authorize on it via
# --allowed-groups=workspace-users (groups claim, scope `groups`).
# MEMBERSHIP IS NOT AUTOMATED here — assigning users to the group
# is a documented one-time admin step (see plan Task 7); the seed
# job must never overwrite manually curated membership.
# Same grep/sed-over-JSON approach as find_client_id (no jq in
# this image); same X-API-KEY auth and retry policy.
find_group_id() {
  gname="$1"
  glist=$(curl -fsS $CURL_RETRY -H "$AUTH" "${API}/api/user-groups" </dev/null 2>/dev/null || true)
  echo "$glist" | grep -o "\"id\":\"[^\"]*\",\"name\":\"${gname}\"" | head -1 | sed -E 's/"id":"([^"]*)".*/\1/'
}
ensure_group() {
  gname="$1"; gfriendly="$2"
  gid=$(find_group_id "$gname")
  if [ -n "$gid" ]; then
    echo "group ${gname} exists (id=${gid}), unchanged"
  else
    curl -fsS $CURL_RETRY -X POST -H "$AUTH" -H "$CT" \
      -d "$(printf '{"name":"%s","friendlyName":"%s"}' "$gname" "$gfriendly")" \
      "${API}/api/user-groups" </dev/null >/dev/null
    echo "created group ${gname}"
  fi
}
ensure_group "workspace-users" "Workspace Users"
```

Also extend the Job's header comment (the `Verified against pocket-id:v2.9.0` block) with one line documenting the group endpoints once Step 2 confirms them, e.g. `- admin group list/create: GET|POST /api/user-groups (X-API-KEY)`.

- [ ] **Step 2: Live-verify the user-groups API against the dev Pocket-ID (risk gate)**

Risk note: the `/api/user-groups` endpoint path, the create-body keys (`name`, `friendlyName`), and the `"id":"…","name":"…"` field adjacency the grep relies on are inferred from Pocket-ID ecosystem docs (terraform provider `pocketid_group`: `name` + `friendly_name`; groups claim via scope `groups`) — they are NOT yet verified against our pocket-id version, and list responses may be wrapped (e.g. `{"data":[…]}`, which the `grep -o` tolerates only if `id` directly precedes `name` per object). Verify live BEFORE relying on the snippet, and adjust paths/keys/grep if the API differs:

```bash
API_KEY=$(kubectl --context k3d-mentolder-dev -n workspace get secret workspace-secrets \
  -o jsonpath='{.data.POCKET_ID_API_KEY}' | base64 -d)
kubectl --context k3d-mentolder-dev -n workspace run curl-groups-check --rm -i --restart=Never \
  --image=curlimages/curl:8.7.1 -- \
  curl -sS -w '\nHTTP %{http_code}\n' -H "X-API-KEY: ${API_KEY}" http://pocket-id:1411/api/user-groups
```

Expected: `HTTP 200` and a JSON group list (possibly empty / wrapped). If the endpoint 404s, consult the instance's Swagger (`/swagger/index.html` on the pocket-id service) and correct the path and body keys in Step 1 before proceeding.

- [ ] **Step 3: Validate and run the seed-job test**

```bash
task workspace:validate
tests/unit/lib/bats-core/bin/bats tests/spec/auth-sso.bats
```

Expected: the `pocket-id seed job provisions the workspace-users group idempotently` test now passes; gate-flag tests still fail (Task 4 pending).

- [ ] **Step 4: (Dev smoke, optional but recommended) re-run the seed job twice in the dev cluster**

```bash
kubectl --context k3d-mentolder-dev -n workspace delete job pocket-id-client-seed --ignore-not-found
bash scripts/vda.sh oracle --dry-run 'deploy the workspace to the local dev cluster'
```

Run the resolved deploy task, then repeat the delete+deploy once more; the second run's job log must print `group workspace-users exists (id=…), unchanged` — proving idempotence.

- [ ] **Step 5: Commit**

```bash
git add k3d/pocket-id-client-seed.yaml
git commit -m "feat(auth-sso): seed job idempotently provisions workspace-users group [T001579]"
```

---

### Task 4: WP2b — group-based authorization on 8 gates, drop unverified-email everywhere

**Files:**
- Modify (group gates): `prod/patch-oauth2-proxy-brain.yaml`, `prod/patch-oauth2-proxy-brett.yaml`, `prod/patch-oauth2-proxy-comfy.yaml`, `prod/patch-oauth2-proxy-docs.yaml`, `prod/patch-oauth2-proxy-downloads.yaml`, `prod/patch-oauth2-proxy-mediaviewer.yaml`, `prod/patch-oauth2-proxy-rustdesk-web.yaml`, `prod/patch-oauth2-proxy-videovault.yaml`
- Modify (allowlist gates): `prod/patch-oauth2-proxy-studio.yaml`, `prod/patch-oauth2-proxy-traefik.yaml`, `prod/patch-oauth2-proxy-mailpit.yaml`

**Interfaces:**
- Consumes: the `workspace-users` group from Task 3 (exact spelling `workspace-users` — must match `--allowed-groups=` verbatim, it is the token-claim value).
- Produces: the final args contract asserted by Task 1's tests (8× `--allowed-groups=workspace-users`, 8× `--oidc-groups-claim=groups`, 8× `--scope=openid email profile groups`, 3× `--authenticated-emails-file`, 0 insecure flags).

- [ ] **Step 1: Rewrite the args in the 8 group gates**

In each of the 8 group-gate patches, apply exactly these edits (docs shown as the concrete example; the other 7 are identical except for their per-gate values in unrelated lines):

Remove these two args entries:

```yaml
            - "--email-domain=*"
            - "--insecure-oidc-allow-unverified-email=true"
```

Change the scope entry and add the two group flags directly after it:

```yaml
            - "--scope=openid email profile groups"
            - "--oidc-groups-claim=groups"
            - "--allowed-groups=workspace-users"
```

(Old scope line was `- "--scope=openid email profile"` — it must not survive; the render test counts exactly 8 occurrences of the new scope string.)

- [ ] **Step 2: Remove the unverified-email flag from the 3 allowlist gates**

In `prod/patch-oauth2-proxy-studio.yaml`, `prod/patch-oauth2-proxy-traefik.yaml`, `prod/patch-oauth2-proxy-mailpit.yaml`, remove only:

```yaml
            - "--insecure-oidc-allow-unverified-email=true"
```

`--authenticated-emails-file` and `--scope=openid email profile` (without `groups`) stay as-is in these three files.

Self-check across all 11:

```bash
grep -rn -- '--insecure-oidc-allow-unverified-email\|--email-domain=\*' prod/ && echo "LEFTOVER — fix manually" || echo "clean"
grep -rlc -- '--allowed-groups=workspace-users' prod/patch-oauth2-proxy-*.yaml | wc -l   # expect 8
```

- [ ] **Step 3: Validate and run the full suite (GREEN except cleanup)**

```bash
task workspace:validate
tests/unit/lib/bats-core/bin/bats tests/spec/auth-sso.bats
```

Expected: all render tests pass; only `orphaned templates/brain/prod-korczewski subtree is gone` still fails.

- [ ] **Step 4: Commit**

```bash
git add prod/patch-oauth2-proxy-*.yaml
git commit -m "feat(auth-sso): group-based authorization via workspace-users on 8 prod gates, enforce verified emails on all 11 [T001579]"
```

---

### Task 5: WP3 — delete the orphaned `templates/brain/prod-korczewski/` subtree

**Files:**
- Delete: `templates/brain/prod-korczewski/` (recursively; sole content is the nested 3-line `templates/brain/kustomization.yaml` with `resources: []`, referenced nowhere)

**Interfaces:**
- Consumes: nothing. Guardrail: the parallel branch `fix/brain-site-dockerfile-template` (T001578) edits `templates/brain/site.Dockerfile` — touch NOTHING under `templates/brain/` except the `prod-korczewski` subtree.

- [ ] **Step 1: Remove the subtree and prove nothing references it**

```bash
grep -rn 'prod-korczewski' templates/ --include='*.yaml' --include='*.yml' --include='*.sh' --include='Dockerfile*' | grep -v '^templates/brain/prod-korczewski/' || echo "no external references"
git rm -r templates/brain/prod-korczewski
```

Expected: `no external references`, then a clean `git rm`.

- [ ] **Step 2: Run the suite — fully GREEN**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/auth-sso.bats`
Expected: PASS, all tests.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(auth-sso): remove orphaned templates/brain/prod-korczewski subtree [T001579]"
```

---

### Task 6: SSOT delta verification (auth-sso)

**Files:**
- Verify/adjust: `openspec/changes/oauth2-proxy-hardening/specs/auth-sso.md` (delta named after the parent SSOT slug `auth-sso`, per T001304 convention — archive later merges it into `openspec/specs/auth-sso.md`)

**Interfaces:**
- Consumes: the implemented flag set from Tasks 2–4.

- [ ] **Step 1: Cross-check the delta against the implementation**

The delta (authored together with this plan) states four requirements: issuer TLS verification mandatory, authorization via groups claim (`workspace-users`) or explicit email allowlist, no insecure OIDC flags in prod overlays, idempotent seed-job group provisioning. Read it against the final `prod/patch-oauth2-proxy-*.yaml` and `k3d/pocket-id-client-seed.yaml`; if Task 3 Step 2 forced an API-path change, update the seed-job requirement wording accordingly.

- [ ] **Step 2: Validate the OpenSpec change**

Run: `bash scripts/openspec.sh validate`
Expected: PASS (change `oauth2-proxy-hardening` valid, delta targets parent slug `auth-sso`).

- [ ] **Step 3: Commit (only if Step 1 required edits)**

```bash
git add openspec/changes/oauth2-proxy-hardening/specs/auth-sso.md
git commit -m "docs(auth-sso): align SSOT delta with implemented gate flags [T001579]"
```

---

### Task 7: Rollout gate — staging/token verification and rollback runbook (no prod deploy in CI scope)

**Files:**
- None changed. This task is the documented operator procedure that MUST run after merge and BEFORE any `task workspace:deploy ENV=mentolder|korczewski`. It exists as a plan task so the lockout risk (design spec §WP2) has an executable gate, not an assumption.

**Interfaces:**
- Consumes: merged main with Tasks 1–6; the `workspace-users` group from the seed job.

- [ ] **Step 1: Admin step — assign members to `workspace-users` (one-time, manual)**

In the Pocket-ID admin UI at `https://auth.${PROD_DOMAIN}/settings/admin/user-groups` (per brand): open the group `workspace-users` (created by the seed job on the next deploy — on staging first) and add every workspace user. Without membership, every login at a group gate is denied by `--allowed-groups` — this step is deliberately manual (seed job never touches membership).

- [ ] **Step 2: Staging verification (before prod)**

```bash
task workspace:deploy ENV=staging
kubectl --context fleet -n workspace-staging logs job/pocket-id-client-seed | grep 'workspace-users'
kubectl --context fleet -n workspace-staging logs deploy/oauth2-proxy-docs --tail=50
```

Then, in a browser against the staging docs gate: (a) log in as a user who IS a member of `workspace-users` → expect success (oauth2-proxy log line `Authenticated via OAuth2` and no `email in id_token isn't verified` error — this simultaneously proves Pocket-ID sends `email_verified=true` and the `groups` claim); (b) log in as a user who is NOT a member → expect denial (HTTP 403, log shows the group check rejecting the session). Also confirm one allowlist gate (studio or mailpit) still admits its allowlisted user.

- [ ] **Step 3: Prod rollout + rollback runbook (documented commands)**

Rollout (operator, after Step 2 is green, per brand):

```bash
task workspace:deploy ENV=mentolder
task workspace:deploy ENV=korczewski
```

Rollback (if group-gated logins break in prod — symptom: 403 or `email in id_token isn't verified` in oauth2-proxy logs):

```bash
git revert <merge-commit-sha>   # restores the previous args lists
git push                        # via PR per repo rules; expedite as incident fix
task workspace:deploy ENV=mentolder
task workspace:deploy ENV=korczewski
```

The revert path is safe because all changes are declarative args-list patches; the seed job's group creation is additive and needs no rollback (an unused group is harmless).

---

### Task 8: Final verification (CI gates)

**Files:**
- None new; regenerated artifacts committed if changed.

- [ ] **Step 1: Run the mandatory verification battery**

```bash
task workspace:validate
tests/unit/lib/bats-core/bin/bats tests/spec/auth-sso.bats
task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
bash scripts/openspec.sh validate
```

Expected: all PASS. `freshness:check` includes the S1–S4 ratchet — must be green (no baseline growth, no brand-domain literals, no orphan manifests).

- [ ] **Step 2: Commit regenerated artifacts (if any) and push**

```bash
git add -A ':!environments/.secrets'
git commit -m "chore(auth-sso): regenerate freshness artifacts for oauth2-proxy hardening [T001579]" || echo "nothing to commit"
```

<!-- vitest: kein neuer Test nötig, weil ausschließlich Kubernetes-Manifeste, ein Seed-Job-Shellscript und BATS-Manifest-Tests geändert werden — kein Code unter website/src/. -->
