## p1 — Taskfiles

Target files: `Taskfile.yml`, `taskfiles/Taskfile.dev-stack.yml`

- [x] **Taskfile.yml — delete the "Cluster Lifecycle" section.** Remove the section header
  comment and all five tasks it introduces, lines 159–207:

  ```yaml
  # ─────────────────────────────────────────────
  # Cluster Lifecycle
  # ─────────────────────────────────────────────
  cluster:create:
    ...
  cluster:delete:
    ...
  cluster:stop:
    ...
  cluster:start:
    ...
  cluster:status:
    ...
  ```

  (`cluster:create` at 162, `cluster:delete` at 176, `cluster:stop` at 183, `cluster:start` at
  188, `cluster:status` at 194 — confirmed against the current file.) `dev:bootstrap` (209) stays
  untouched immediately after.

- [x] **Taskfile.yml — delete `dev:reset` (214–220).** `dev:setup-signing` (222) and
  `workspace:dsgvo-check` (227) stay untouched on both sides:

  ```yaml
  dev:reset:
    desc: "One-Click-Reset des dev-k3d-Clusters (REBUILD=1 baut Images neu, CONFIRM=yes überspringt Prompt)"
    vars:
      REBUILD: '{{.REBUILD | default ""}}'
      CONFIRM: '{{.CONFIRM | default ""}}'
    cmds:
      - REBUILD={{.REBUILD}} CONFIRM={{.CONFIRM}} CLUSTER_NAME={{.CLUSTER_NAME}} bash scripts/dev-reset.sh
  ```

- [x] **Taskfile.yml — rewrite `clean` (373–380).** It currently defends against a k3d cluster
  that no longer exists on any host (`k3d cluster delete ... || true`) and its `desc`/`prompt`
  promise a cluster delete that no longer happens. Minimal fix — drop the k3d line, keep the
  Docker prune, and stop advertising a cluster delete:

  Before:
  ```yaml
  clean:
    desc: Full cleanup — delete cluster, prune Docker images
    prompt: "This will delete everything. Continue?"
    cmds:
      - k3d cluster delete {{.CLUSTER_NAME}} 2>/dev/null || true
      - docker image prune -f
      - docker volume prune -f
      - echo "✓ Cleaned up"
  ```
  After:
  ```yaml
  clean:
    desc: Prune local Docker images and volumes
    prompt: "This will prune all unused Docker images and volumes. Continue?"
    cmds:
      - docker image prune -f
      - docker volume prune -f
      - echo "✓ Cleaned up"
  ```

- [x] **Taskfile.yml — delete `up` and `workspace:up` (1869–1893), delete `down` (1916–1921
  including its trailing blank line).** `workspace:setup` (1894–1914) stays, sitting directly
  under the "Quick Start" header (1866–1868) which stays too — it now describes `workspace:setup`
  only, which is accurate (it is the quick-start entry point on an existing cluster):

  Before (1869–1893, deleted in full):
  ```yaml
  up:
    desc: "Full setup: create cluster → build → deploy"
    cmds:
      - task: cluster:create
      - task: deploy
      - echo ""
      - 'echo "Dev environment is ready!"'
      - 'echo "   App:     http://localhost:8080"'
      - 'echo "   Registry: http://registry.localhost:5000/v2/_catalog"'
      - 'echo "   kubectl:  already configured for cluster ''{{.CLUSTER_NAME}}''"'

  workspace:up:
    desc: "Full automated setup: Cluster -> MVP -> Office -> Post-config"
    cmds:
      - task: cluster:create
      - task: workspace:deploy
      - task: workspace:office:deploy
      - task: workspace:post-setup
      - task: workspace:talk-setup
      - task: workspace:recording-setup
      - task: workspace:transcriber-setup
      - echo ""
      - 'echo "✓ Workspace MVP stack is fully deployed and configured!"'
      - 'echo "  Optional → task workspace:admin-users-setup   (provision SSO admin users in Keycloak)"'
  ```
  Before (1916–1921, deleted in full, including the blank line that followed it):
  ```yaml
  down:
    desc: "Tear down everything"
    cmds:
      - task: cluster:delete"

  ```
  (the blank line at 1915, directly before `down:`, is kept as the single separator before the
  next section header at what is currently 1922)

- [x] **Taskfile.yml — `workspace:transcriber-build` (1925–1930): drop the import line.**

  Before:
  ```yaml
  workspace:transcriber-build:
    desc: Build talk-transcriber image (imports into k3d dev registry)
    cmds:
      - docker build -t ghcr.io/paddione/talk-transcriber:latest k3d/talk-transcriber/
      - k3d image import ghcr.io/paddione/talk-transcriber:latest -c {{.CLUSTER_NAME}} 2>/dev/null || true
      - 'echo "✓ talk-transcriber image built (run ''task workspace:transcriber-push'' to publish to ghcr.io)"'
  ```
  After:
  ```yaml
  workspace:transcriber-build:
    desc: Build talk-transcriber image
    cmds:
      - docker build -t ghcr.io/paddione/talk-transcriber:latest k3d/talk-transcriber/
      - 'echo "✓ talk-transcriber image built (run ''task workspace:transcriber-push'' to publish to ghcr.io)"'
  ```

- [x] **Taskfile.yml — `docs:build:import` (3854–3865): drop the dev-only import block.** This
  task is not named in `design.md`'s file list, but it is the same build-then-`k3d image
  import`-in-dev pattern as `website:build:import`/`brett:build`/`studio:build`, it lives in
  `Taskfile.yml` (already an in-scope file), and the final verification grep for `k3d image
  import` in this partial covers the whole file — leaving it would make that grep fail. No other
  task calls `docs:build:import` (`git grep -n 'docs:build:import' Taskfile.yml taskfiles/*.yml`
  returns only its own definition), so removing the import is safe.

  Before:
  ```yaml
  docs:build:import:
    desc: Build and import docs image into k3d cluster
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - node scripts/build-docs.mjs
      - docker build -t ghcr.io/paddione/workspace-docs:latest -f scripts/docs.Dockerfile .
      - |
        if [ "{{.ENV}}" = "dev" ]; then
          k3d image import ghcr.io/paddione/workspace-docs:latest -c {{.CLUSTER_NAME}}
          echo "✓ docs image imported into k3d cluster"
        fi
  ```
  After:
  ```yaml
  docs:build:import:
    desc: Build the docs image locally
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - node scripts/build-docs.mjs
      - docker build -t ghcr.io/paddione/workspace-docs:latest -f scripts/docs.Dockerfile .
      - echo "✓ docs image built locally"
  ```

- [x] **Taskfile.yml — `workspace:admin-users-setup` precondition (2828–2834): reword the
  message.** Same rewording as `website:deploy` below — point at a reachable kube context /
  devmesh instead of the removed `task cluster:create`:

  Before:
  ```yaml
    preconditions:
      - sh: kubectl cluster-info > /dev/null 2>&1
        msg: "No cluster running. Run 'task cluster:create' first."
  ```
  After:
  ```yaml
    preconditions:
      - sh: kubectl cluster-info > /dev/null 2>&1
        msg: "No cluster running. Point kubectl at a reachable context first (ENV=dev → devmesh, see environments/dev.yaml: context: devmesh)."
  ```

- [x] **Taskfile.yml — delete `website:build:import` (4255–4267) in full.**

  ```yaml
  website:build:import:
    desc: Build and import website image into k3d cluster
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - task: website:build
        vars: { ENV: "{{.ENV}}" }
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        IMAGE="ghcr.io/paddione/${WEBSITE_IMAGE:-workspace-website}"
        k3d image import "${IMAGE}:latest" -c {{.CLUSTER_NAME}}
        echo "✓ Image imported into k3d cluster"
  ```

- [x] **Taskfile.yml — `website:deploy` (4312–4369): reword the precondition, drop the stale
  T001853 comment, drop the `website:build:import` call.** `website:push` (4268) and
  `website:pull-secret` (4282) sit between the deleted task and this one and stay untouched.

  Before (precondition, 4316–4318):
  ```yaml
    preconditions:
      - sh: kubectl cluster-info > /dev/null 2>&1
        msg: "No cluster running. Run 'task cluster:create' first."
  ```
  After:
  ```yaml
    preconditions:
      - sh: kubectl cluster-info > /dev/null 2>&1
        msg: "No cluster running. Point kubectl at a reachable context first (ENV=dev → devmesh, see environments/dev.yaml: context: devmesh)."
  ```

  Before (comment + dev branch, 4324–4343 — only the comment and the `task website:build:import`
  line change, `CTX_ARG`/`WEBSITE_HOST`/`DIGEST` logic is untouched and out of scope here):
  ```yaml
        # T001853: ENV=dev is current-context (same semantics as workspace:deploy
        # and the brett:logs/workspace:dsgvo-check guard pattern) so a local k3d
        # dev cluster deploys the manifest + imports the image locally, instead
        # of dev deploying manifests remotely while the image import target
        # stayed local ({{.CLUSTER_NAME}}) — a mismatch.
        CTX_ARG=""
        [ "{{.ENV}}" != "dev" ] && CTX_ARG="--context=${ENV_CONTEXT}"

        # Run website DB migrations before build/rollout (T001652). Idempotent
        # and tracked — safe even though workspace:deploy also calls this.
        task website:migrate ENV="{{.ENV}}"
        task factory:migrate ENV="{{.ENV}}"

        if [ "{{.ENV}}" = "dev" ]; then
          WEBSITE_HOST="web.localhost"
          WEBSITE_SITE_URL="http://web.localhost"
          KEYCLOAK_FRONTEND_URL="http://auth.localhost"
          REACT_APP_ORIGIN="${REACT_APP_ORIGIN:-http://react.localhost}"
          task website:build:import ENV={{.ENV}}
          DIGEST=""
  ```
  After:
  ```yaml
        # T900310: ENV=dev deploys the image already published to the registry —
        # there is no local k3d import step anymore. It still uses the current
        # kubectl context rather than an explicit --context flag.
        CTX_ARG=""
        [ "{{.ENV}}" != "dev" ] && CTX_ARG="--context=${ENV_CONTEXT}"

        # Run website DB migrations before build/rollout (T001652). Idempotent
        # and tracked — safe even though workspace:deploy also calls this.
        task website:migrate ENV="{{.ENV}}"
        task factory:migrate ENV="{{.ENV}}"

        if [ "{{.ENV}}" = "dev" ]; then
          WEBSITE_HOST="web.localhost"
          WEBSITE_SITE_URL="http://web.localhost"
          KEYCLOAK_FRONTEND_URL="http://auth.localhost"
          REACT_APP_ORIGIN="${REACT_APP_ORIGIN:-http://react.localhost}"
          DIGEST=""
  ```
  (the `else` branch at 4344 onward — prod build + push + digest read — is unchanged)

- [x] **Taskfile.yml — `website:redeploy` (4637–4654): abort the `ENV=dev` branch instead of
  importing.**

  Before (4642–4647):
  ```yaml
      - |
        if [ "{{.ENV}}" = "dev" ]; then
          task website:build:import ENV={{.ENV}}
        else
          task website:push ENV={{.ENV}}
        fi
  ```
  After:
  ```yaml
      - |
        if [ "{{.ENV}}" = "dev" ]; then
          echo "ERROR: local image import removed since T900310 — ENV=dev runs on devmesh, a rebuild here cannot reach it." >&2
          echo "Dev images on devmesh: see docs/runbooks/devmesh-tailnet.md." >&2
          exit 1
        else
          task website:push ENV={{.ENV}}
        fi
  ```
  `website:redeploy:all-prods` (4656) never passes `ENV=dev`, so it is unaffected.

- [x] **Taskfile.yml — `brett:build` (4680–4694): the dev branch no longer imports, it just
  reports the image was built locally.**

  Before:
  ```yaml
  brett:build:
    desc: "Build brett image (and import into k3d in dev)"
    vars:
      ENV: '{{.ENV | default "dev"}}'
    deps:
      - assets:sync
    cmds:
      - docker build -t ghcr.io/paddione/workspace-brett:latest components/brett/
      - |
        if [ "{{.ENV}}" = "dev" ]; then
          k3d image import ghcr.io/paddione/workspace-brett:latest -c {{.CLUSTER_NAME}}
          echo "✓ brett image imported into k3d cluster"
        else
          echo "✓ brett image built (run 'task brett:push ENV={{.ENV}}' to publish)"
        fi
  ```
  After:
  ```yaml
  brett:build:
    desc: "Build brett image locally"
    vars:
      ENV: '{{.ENV | default "dev"}}'
    deps:
      - assets:sync
    cmds:
      - docker build -t ghcr.io/paddione/workspace-brett:latest components/brett/
      - echo "✓ brett image built locally (run 'task brett:push ENV={{.ENV}}' to publish)"
  ```
  `brett:push` (4696), `brett:deploy` (4706, still branches on `ENV={{.ENV}}` to call
  `brett:build` vs `brett:push` — unaffected by this edit) stay untouched.

- [x] **Taskfile.yml — `studio:build` (4775–4783): drop the dev import `if` block.**

  Before:
  ```yaml
  studio:build:
    desc: "Build studio-server image and (in dev) import into k3d (T001002)"
    cmds:
      - docker build -t ${STUDIO_IMAGE:-studio-server}:latest components/studio-server/
      - |
          if [ "{{.ENV}}" = "dev" ] || [ "{{.ENV}}" = "" ]; then
            k3d image import ${STUDIO_IMAGE:-studio-server}:latest -c {{.CLUSTER_NAME}}
          fi
      - echo "✓ studio image built"
  ```
  After:
  ```yaml
  studio:build:
    desc: "Build studio-server image locally (T001002)"
    cmds:
      - docker build -t ${STUDIO_IMAGE:-studio-server}:latest components/studio-server/
      - echo "✓ studio image built"
  ```

- [x] **Taskfile.yml — delete `einvoice-sidecar:import` (5012–5016) in full.**
  `einvoice-sidecar:build` (5007) and `einvoice-sidecar:push` (5018) stay untouched; neither
  depends on `einvoice-sidecar:import`.

  ```yaml
  einvoice-sidecar:import:
    desc: "Import einvoice-sidecar image into k3d cluster"
    deps: [einvoice-sidecar:build]
    cmds:
      - k3d image import einvoice-sidecar:dev -c "{{.K3D_CLUSTER | default "workspace"}}"
  ```

- [x] **Taskfile.yml — drop the test wiring of `tests/unit/scripts/dev-reset.test.sh` (p3 deletes
  the file).** Delete the internal task `test:unit:dev-reset` (line 510–513) in full. In the unit-test
  task around line 398 change

  ```yaml
          TEST_FILES="$TEST_FILES tests/unit/scripts/dev-reset.test.sh tests/spec/mcp-tooling.bats"
  ```

  to

  ```yaml
          TEST_FILES="$TEST_FILES tests/spec/mcp-tooling.bats"
  ```

  Check: `grep -n 'dev-reset' Taskfile.yml` prints nothing.

- [x] **Taskfile.yml — leave `CLUSTER_NAME` (line 99) and every other Taskfile-level var
  untouched (design R2).** After the edits above, nothing in `Taskfile.yml` itself still reads
  `{{.CLUSTER_NAME}}`, but the variable stays defined because `taskfiles/Taskfile.dev-stack.yml`
  (via the `dev-korczewski` include, line 46) and other included taskfiles may still rely on it
  being inheritable. Do not remove or rename it in this partial.

- [x] **taskfiles/Taskfile.dev-stack.yml — delete the legacy block, lines 28–102 (through the
  blank line before `logs:` at 104).** This removes `cluster:create_legacy`, `cluster:delete`,
  `cluster:status` and `cluster:autostart` together, since `cluster:autostart` is the only caller
  of `scripts/dev-cluster-autostart.sh` (deleted by p2). `_node-guard` (19–26) stays — it is used
  only by `cluster:create_legacy` and `cluster:autostart` today, both deleted, but it is not
  itself named for deletion in `design.md`'s file list and nothing else in this partial's scope
  calls for removing it; leave it in place. `build:website`, `build:brett`, `apply`, `deploy`,
  `redeploy:website`, `redeploy:brett`, `db:refresh`, `tunnel`, `firewall:open` (design D6) stay
  byte-for-byte unchanged — confirmed none of them reference `cluster:create_legacy`,
  `cluster:delete`, `cluster:status` or `cluster:autostart` (`git grep -n
  'cluster:create_legacy\|task: cluster:\|task cluster:' taskfiles/Taskfile.dev-stack.yml`
  matches only inside the deleted block itself), so no rewording is needed in the surviving
  tasks.

  Before (28–103, deleted in full):
  ```yaml
    cluster:create_legacy:
      desc: "[dev] (legacy) Create the dev k3d cluster on $DEV_NODE with the right port bindings"
      deps: [_node-guard]
      cmds:
        - |
          ...
          K3D_CREATE() {
            k3d cluster create {{.CLUSTER_NAME}} \
              ...
          }
          ...

    cluster:delete:
      desc: "[dev] Destroy the dev k3d cluster (data lost — refresh from prod with dev:db:refresh)"
      cmds:
        - |
          source scripts/env-resolve.sh "{{.ENV}}"
          if [[ "$(hostname -s 2>/dev/null | tr '[:upper:]' '[:lower:]')" == "${DEV_NODE%%.*}" ]]; then
            k3d cluster delete {{.CLUSTER_NAME}}
          else
            ssh ${DEV_SSH_USER:-root}@$DEV_NODE "k3d cluster delete {{.CLUSTER_NAME}}"
          fi

    cluster:status:
      desc: "[dev] Show pod status on the dev k3d cluster"
      cmds:
        - kubectl --context {{.CTX_DEV}} get pods,svc,ing -n {{.NS_DEV}}

    cluster:autostart:
      desc: "[dev] Install a systemd unit on $DEV_NODE so the k3d cluster restarts on host boot (T000290)"
      deps: [_node-guard]
      cmds:
        - |
          set -euo pipefail
          source scripts/env-resolve.sh "{{.ENV}}"
          if [[ "$(hostname -s 2>/dev/null | tr '[:upper:]' '[:lower:]')" == "${DEV_NODE%%.*}" ]]; then
            CLUSTER_NAME={{.CLUSTER_NAME}} bash scripts/dev-cluster-autostart.sh
          else
            ssh ${DEV_SSH_USER:-root}@$DEV_NODE "CLUSTER_NAME={{.CLUSTER_NAME}} bash -s" < scripts/dev-cluster-autostart.sh
          fi

  ```
  After: nothing — the file continues directly from `_node-guard` (19–26) to `logs:` (104).

- [x] **Verify grep for dangling references in `taskfiles/Taskfile.dev-stack.yml`.** Confirm no
  surviving task in the file still names the four deleted tasks:
  ```bash
  grep -nE 'cluster:create_legacy|cluster:delete|cluster:status|cluster:autostart' taskfiles/Taskfile.dev-stack.yml
  # expected: no output
  ```

- [x] **Verify this partial:**
  ```bash
  task --list-all >/dev/null
  task --dry workspace:setup ENV=dev
  task --dry website:deploy ENV=dev
  grep -nE 'k3d image import|task: cluster:' Taskfile.yml   # expected: no output
  ```
