---
title: Talk-Transcriber on Mentolder Implementation Plan
domains: [infra]
status: active
pr_number: null
ticket_id: T000506
---

# Talk-Transcriber on Mentolder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy whisper + talk-transcriber on the mentolder cluster so Talk calls on `files.mentolder.de` get the same automatic transcription as korczewski.

**Architecture:** Copy the korczewski-only `whisper.yaml` and `talk-transcriber.yaml` manifests into `prod-mentolder/`. The `prod-mentolder/kustomization.yaml` carries a global NotIn patch that forces all Deployments onto Hetzner nodes (excluding k3s-1/2/3) — whisper needs 4 GB RAM / 2 CPU, which is tight on the already-loaded Hetzner nodes (43–69% memory). A JSON patch override (applied after the global patch) flips whisper's node affinity to `In: [k3s-1, k3s-2, k3s-3]` (amd64, 8–16 GB, <5% utilisation). The talk-transcriber stays on Hetzner nodes (its 512Mi/250m footprint fits easily). After applying, the idempotent `transcriber-setup` script registers the bot in mentolder Nextcloud Talk. The `TRANSCRIBER_BOT_PASSWORD` and `TRANSCRIBER_SECRET` are already sealed in the mentolder SealedSecret.

**Tech Stack:** Kustomize, `faster-whisper-server` (amd64 pinned digest), `ghcr.io/paddione/talk-transcriber` (already published), JSON strategic-merge patches, go-task

---

### Task 1: Create `prod-mentolder/whisper.yaml`

**Files:**
- Create: `prod-mentolder/whisper.yaml`

- [ ] **Step 1: Create the manifest**

```bash
# In the feature worktree: .claude/worktrees/talk-transcriber-mentolder/
cat > prod-mentolder/whisper.yaml << 'EOF'
# Whisper transcription service — mentolder.
# Copied from prod-korczewski/whisper.yaml; now that mentolder has k3s home
# workers (k3s-1: 8 CPU / 16 GB, k3s-2/3: 4 CPU / 16 GB each at <5% util),
# there is plenty of headroom for whisper's 2 CPU / 4 GB request.
# The prod-mentolder global NotIn patch (kustomization.yaml) would pin this
# to Hetzner CPs (already 43–69% memory) — an explicit JSON patch override in
# kustomization.yaml redirects whisper to In: [k3s-1, k3s-2, k3s-3] instead.
# faster-whisper-server is amd64-only; nodeSelector enforces that.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: whisper
spec:
  replicas: 1
  selector:
    matchLabels:
      app: whisper
  template:
    metadata:
      labels:
        app: whisper
    spec:
      nodeSelector:
        kubernetes.io/arch: amd64
      securityContext:
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: whisper
          image: fedirz/faster-whisper-server@sha256:760e5e43d427dc6cfbbc4731934b908b7de9c7e6d5309c6a1f0c8c923a5b6030
          imagePullPolicy: IfNotPresent
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
          ports:
            - containerPort: 8000
          resources:
            requests:
              memory: "4Gi"
              cpu: "2"
            limits:
              memory: "8Gi"
              cpu: "8"
          # Model download can take a few minutes on first start
          startupProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 30
            periodSeconds: 10
            failureThreshold: 30
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
            periodSeconds: 30
---
apiVersion: v1
kind: Service
metadata:
  name: whisper
spec:
  selector:
    app: whisper
  ports:
    - port: 8000
      targetPort: 8000
EOF
```

- [ ] **Step 2: Verify**

```bash
grep -c "^apiVersion" prod-mentolder/whisper.yaml
```

Expected: `2` (Deployment + Service).

---

### Task 2: Create `prod-mentolder/talk-transcriber.yaml`

**Files:**
- Create: `prod-mentolder/talk-transcriber.yaml`

- [ ] **Step 1: Copy from korczewski, update header comment**

```bash
sed \
  -e 's/# Nextcloud Talk Post-Meeting-Transkription — korczewski only./# Nextcloud Talk Post-Meeting-Transkription — mentolder./' \
  -e 's|# Lives under prod-korczewski/|# Lives under prod-mentolder/|' \
  -e 's|# korczewski-only, calls whisper.|# calls the in-cluster whisper service (also in prod-mentolder/).|' \
  prod-korczewski/talk-transcriber.yaml > prod-mentolder/talk-transcriber.yaml
```

- [ ] **Step 2: Verify image digest unchanged**

```bash
grep "image:" prod-mentolder/talk-transcriber.yaml
```

Expected: `ghcr.io/paddione/talk-transcriber@sha256:8ac351f10e4b8fbc121fb57f21088d5b5359524e7f909760444b283ea3ace55f`

---

### Task 3: Update `prod-mentolder/kustomization.yaml`

**Files:**
- Modify: `prod-mentolder/kustomization.yaml`

- [ ] **Step 1: Add whisper + talk-transcriber to resources section**

After the `- brainstorm-sish.yaml` line, add:

```yaml
  # Whisper + Talk-Transcriber — now also on mentolder.
  # k3s home workers (k3s-1/2/3: amd64, 8–16 GB, <5% util) have headroom.
  # See whisper placement override in patches below.
  - whisper.yaml
  - talk-transcriber.yaml
```

- [ ] **Step 2: Add whisper node-placement override to patches section**

At the end of the `patches:` section (after `- path: patch-livekit.yaml`), add:

```yaml
  # whisper Deployment: override the global NotIn patch so it lands on
  # k3s-1/2/3 (amd64, 8–16 GB, <5% util) not on the already-loaded Hetzner CPs.
  # Path matches what the global strategic-merge patch created.
  - target:
      kind: Deployment
      name: whisper
    patch: |-
      - op: replace
        path: /spec/template/spec/affinity/nodeAffinity/requiredDuringSchedulingIgnoredDuringExecution/nodeSelectorTerms/0/matchExpressions/0
        value:
          key: kubernetes.io/hostname
          operator: In
          values:
            - k3s-1
            - k3s-2
            - k3s-3
```

- [ ] **Step 3: Validate kustomize renders without errors**

```bash
task workspace:validate
```

Expected: exits 0, no error lines.

- [ ] **Step 4: Spot-check whisper affinity in rendered output**

```bash
kubectl kustomize prod-mentolder/ \
  | python3 -c "
import sys, yaml
docs = list(yaml.safe_load_all(sys.stdin))
w = next(d for d in docs if d and d.get('kind')=='Deployment' and d.get('metadata',{}).get('name')=='whisper')
print(yaml.dump(w['spec']['template']['spec'].get('affinity')))
"
```

Expected output contains `operator: In` and `values: [k3s-1, k3s-2, k3s-3]`.

- [ ] **Step 5: Commit**

```bash
# Run from inside .claude/worktrees/talk-transcriber-mentolder/
git add prod-mentolder/whisper.yaml prod-mentolder/talk-transcriber.yaml prod-mentolder/kustomization.yaml
git commit -m "feat(transcriber): add whisper + talk-transcriber to mentolder overlay [T000506]"
git push
```

---

### Task 4: Deploy to mentolder

- [ ] **Step 1: Apply to mentolder only**

```bash
task workspace:deploy ENV=mentolder
```

Expected: `kustomize build prod-mentolder/ | kubectl apply ...` completes without errors. Note: this also fans out `post-setup` — that is idempotent and safe.

- [ ] **Step 2: Confirm whisper lands on a k3s node**

```bash
kubectl --context mentolder -n workspace get pod -l app=whisper -o wide
```

Expected: `NODE` column is `k3s-1`, `k3s-2`, or `k3s-3`. If it shows a Hetzner node, the JSON patch did not apply correctly — re-check Task 3 Step 4.

- [ ] **Step 3: Wait for whisper Ready**

```bash
kubectl --context mentolder -n workspace rollout status deploy/whisper --timeout=600s
```

Expected: `deployment "whisper" successfully rolled out` (model download takes 2–5 min on first start; the startupProbe gives 300s).

- [ ] **Step 4: Wait for talk-transcriber Ready**

```bash
kubectl --context mentolder -n workspace rollout status deploy/talk-transcriber --timeout=120s
```

Expected: `deployment "talk-transcriber" successfully rolled out`.

- [ ] **Step 5: Verify health endpoint**

```bash
kubectl --context mentolder -n workspace exec deploy/talk-transcriber -c transcriber -- \
  curl -s http://localhost:8000/health
```

Expected: `{"status":"ok"}` (or any 200-class JSON response).

---

### Task 5: Register bot in Nextcloud Talk

- [ ] **Step 1: Run the idempotent setup script**

```bash
task workspace:transcriber-setup ENV=mentolder
```

This runs `scripts/transcriber-setup.sh` which creates the `transcriber-bot` NC user, registers the Talk bot at `http://talk-transcriber:8000/webhook`, and sets `call_transcription_enabled=yes`. All steps are idempotent (`|| true`).

Expected final lines:
```
=== Transcriber Setup abgeschlossen ===
  transcriber-bot User ist in Nextcloud registriert.
  Der talk-transcriber-Pod tritt automatisch aktiven Calls bei.
```

- [ ] **Step 2: Verify bot registration**

```bash
kubectl --context mentolder -n workspace exec deploy/nextcloud -c nextcloud -- \
  php occ talk:bot:list
```

Expected: row containing `Live-Transkription` with `http://talk-transcriber:8000/webhook`.

- [ ] **Step 3: Verify spreed setting**

```bash
kubectl --context mentolder -n workspace exec deploy/nextcloud -c nextcloud -- \
  php occ config:app:get spreed call_transcription_enabled
```

Expected: `yes`

---

### Task 6: Smoke test + PR

- [ ] **Step 1: Tail transcriber logs during a test call**

```bash
kubectl --context mentolder -n workspace logs -f deploy/talk-transcriber -c transcriber
```

In a separate terminal: start a Talk call on `https://files.mentolder.de`. Watch for log lines:
- `Joined call room …`
- `Sending audio chunk to whisper …`
- `POST /api/meeting/save-transcript → 200` (or `Transcript saved`)

- [ ] **Step 2: Create PR**

```bash
gh pr create \
  --title "feat(transcriber): add whisper + talk-transcriber to mentolder [T000506]" \
  --body "$(cat <<'EOF'
## Summary
- Copies `whisper.yaml` + `talk-transcriber.yaml` from `prod-korczewski/` into `prod-mentolder/`
- Adds JSON patch in `prod-mentolder/kustomization.yaml` to pin whisper to k3s-1/2/3 (overrides the global NotIn patch; Hetzner CPs already 43–69% memory, whisper needs 4 GB)
- `TRANSCRIBER_BOT_PASSWORD` + `TRANSCRIBER_SECRET` already sealed in mentolder SealedSecret — no secrets rotation needed
- Runs idempotent `transcriber-setup` to register the bot in mentolder Nextcloud Talk

## Test plan
- [ ] `task workspace:validate` passes
- [ ] `kubectl kustomize prod-mentolder/` shows whisper affinity `In: [k3s-1, k3s-2, k3s-3]`
- [ ] Whisper pod lands on a k3s node after deploy
- [ ] Both pods reach `Running`
- [ ] `task workspace:transcriber-setup ENV=mentolder` completes without error
- [ ] `php occ talk:bot:list` shows `Live-Transkription`
- [ ] `php occ config:app:get spreed call_transcription_enabled` returns `yes`
- [ ] Test Talk call produces transcript
EOF
)"
```

- [ ] **Step 3: Auto-merge**

```bash
gh pr merge --squash --delete-branch
git checkout main && git pull --rebase origin main
```
