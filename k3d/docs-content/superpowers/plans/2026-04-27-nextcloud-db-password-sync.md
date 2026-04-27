# Nextcloud DB Password Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mount a `zz-db.config.php` ConfigMap into the Nextcloud containers so `dbpassword` always comes from `POSTGRES_PASSWORD` env var, surviving any secret rotation.

**Architecture:** Single ConfigMap added to `k3d/nextcloud.yaml` with one PHP file. Mounted read-only into both the `nextcloud` and `nextcloud-cron` containers. Nextcloud's config-loading order (alphabetical, `zz-` wins) ensures it overrides whatever stale value is in `config.php` on the PVC. Change propagates to mentolder and korczewski through the `k3d → prod → prod-mentolder / prod-korczewski` Kustomize hierarchy with no overlay edits required.

**Tech Stack:** Kubernetes, Kustomize, PHP (Nextcloud config format)

---

### Task 1: Add ConfigMap + volume + volumeMounts to nextcloud.yaml

**Files:**
- Modify: `k3d/nextcloud.yaml`

- [ ] **Step 1: Add the ConfigMap at the bottom of `k3d/nextcloud.yaml`** (after the existing `nextcloud-signaling-proxy` ConfigMap, before the Service — or append at end of file after the Service)

  Add this block at the end of the file (after the Service):

  ```yaml
  ---
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: nextcloud-db-config
  data:
    zz-db.config.php: |
      <?php
      $CONFIG = ['dbpassword' => getenv('POSTGRES_PASSWORD')];
  ```

- [ ] **Step 2: Add the volume entry to the Deployment's `volumes:` list**

  In the `volumes:` section of the Deployment (around line 271), add after the existing `php-conf-d` emptyDir entry:

  ```yaml
        - name: db-config
          configMap:
            name: nextcloud-db-config
  ```

- [ ] **Step 3: Add volumeMount to the `nextcloud` container**

  In the `nextcloud` container's `volumeMounts:` list, add alongside the existing `extra-config` mount:

  ```yaml
            - name: db-config
              mountPath: /var/www/html/config/zz-db.config.php
              subPath: zz-db.config.php
              readOnly: true
  ```

- [ ] **Step 4: Add the same volumeMount to the `nextcloud-cron` container**

  In the `nextcloud-cron` container's `volumeMounts:` list, add the same entry:

  ```yaml
            - name: db-config
              mountPath: /var/www/html/config/zz-db.config.php
              subPath: zz-db.config.php
              readOnly: true
  ```

- [ ] **Step 5: Validate manifests**

  ```bash
  task workspace:validate
  ```

  Expected: no errors. If `kustomize build` or `kubeconform` fails, fix the YAML indentation/structure before continuing.

- [ ] **Step 6: Commit**

  ```bash
  git add k3d/nextcloud.yaml k3d/docs-content/superpowers/specs/2026-04-27-nextcloud-db-password-sync-design.md k3d/docs-content/superpowers/plans/2026-04-27-nextcloud-db-password-sync.md
  git commit -m "fix(nextcloud): sync dbpassword from POSTGRES_PASSWORD env via zz-db.config.php"
  ```

---

### Task 2: Deploy and verify on mentolder

**Files:** (no file changes — deploy only)

- [ ] **Step 1: Deploy to mentolder**

  ```bash
  task workspace:deploy ENV=mentolder
  ```

- [ ] **Step 2: Wait for rollout**

  ```bash
  kubectl rollout status deploy/nextcloud -n workspace --context mentolder --timeout=180s
  ```

  Expected: `deployment "nextcloud" successfully rolled out`

- [ ] **Step 3: Confirm config is active**

  ```bash
  kubectl exec -n workspace --context mentolder deploy/nextcloud -c nextcloud -- php /var/www/html/occ config:system:get dbpassword
  ```

  Expected: prints the production DB password (should match `kubectl get secret workspace-secrets -n workspace --context mentolder -o jsonpath='{.data.NEXTCLOUD_DB_PASSWORD}' | base64 -d`).

- [ ] **Step 4: Confirm status.php is healthy**

  ```bash
  kubectl exec -n workspace --context mentolder deploy/nextcloud -c nextcloud -- curl -s http://localhost/status.php
  ```

  Expected: JSON with `"installed":true,"maintenance":false`.

---

### Task 3: Deploy and verify on korczewski

**Files:** (no file changes — deploy only)

- [ ] **Step 1: Deploy to korczewski**

  ```bash
  task workspace:deploy ENV=korczewski
  ```

- [ ] **Step 2: Wait for rollout**

  ```bash
  kubectl rollout status deploy/nextcloud -n workspace --context korczewski --timeout=180s
  ```

  Expected: `deployment "nextcloud" successfully rolled out`

- [ ] **Step 3: Confirm config is active**

  ```bash
  kubectl exec -n workspace --context korczewski deploy/nextcloud -c nextcloud -- php /var/www/html/occ config:system:get dbpassword
  ```

  Expected: prints the korczewski production DB password.

- [ ] **Step 4: Confirm status.php is healthy**

  ```bash
  kubectl exec -n workspace --context korczewski deploy/nextcloud -c nextcloud -- curl -s http://localhost/status.php
  ```

  Expected: JSON with `"installed":true,"maintenance":false`.

---

### Task 4: Open and merge PR

- [ ] **Step 1: Push branch and open PR**

  ```bash
  git push -u origin HEAD
  gh pr create --title "fix(nextcloud): sync dbpassword from secret via zz-db.config.php" --body "$(cat <<'EOF'
  ## Summary
  - Adds `nextcloud-db-config` ConfigMap with a `zz-db.config.php` that sets `dbpassword = getenv('POSTGRES_PASSWORD')`
  - Mounts it read-only into both `nextcloud` and `nextcloud-cron` containers
  - Prevents crash-loops after secret rotation (root cause of 2026-04-27 mentolder outage)
  - Propagates to mentolder and korczewski via Kustomize inheritance — no overlay changes needed

  ## Test plan
  - [ ] `task workspace:validate` passes (CI)
  - [ ] Deployed and verified on mentolder: occ dbpassword matches secret, status.php 200
  - [ ] Deployed and verified on korczewski: same checks

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```

- [ ] **Step 2: Merge PR**

  ```bash
  gh pr merge --squash --auto
  ```
