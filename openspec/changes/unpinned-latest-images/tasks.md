---
title: "Pin unpinned :latest images"
ticket_id: "T001790"
domains: [infra]
status: staged
---

# unpinned-latest-images — Implementation Plan

## File Structure

| File | Action |
|------|--------|
| `k3d/brett.yaml` | Add `:latest is intentional` comment above image line |
| `k3d/docs.yaml` | Add `:latest is intentional` comment above image line |
| `k3d/configmap-domains.yaml` | Add comment on `STUDIO_IMAGE` explaining dev `:latest` vs prod digest |

## Task 1: Add explicit :latest comment to brett.yaml

Add an inline comment above the `image:` line in `k3d/brett.yaml` explaining why `:latest` is intentional, matching the convention used in `k3d/videovault.yaml:33` and `k3d/mediaviewer-widget.yaml:29`:

```yaml
# :latest is intentional — rebuilt on every release (see gotchas-footguns.md)
image: ghcr.io/paddione/workspace-brett:latest
```

## Task 2: Add explicit :latest comment to docs.yaml

Same pattern for `k3d/docs.yaml`:

```yaml
# :latest is intentional — rebuilt on every release (see gotchas-footguns.md)
image: ghcr.io/paddione/workspace-docs:latest
```

## Task 3: Add comment to studio-server configmap entry

Add a comment in `k3d/configmap-domains.yaml` on the `STUDIO_IMAGE` line explaining that dev uses `:latest` while prod pins to a digest:

```yaml
# :latest for dev; prod overlay pins to digest (see gotchas-footguns.md)
STUDIO_IMAGE: "studio-server:latest"
```

## Task 4: Verify no remaining uncommented :latest references

Run a verification grep to confirm every `:latest` usage in `k3d/` now has an explanatory comment:

```bash
grep -rn ':latest' k3d/ --include='*.yaml' | grep -v 'kube-prometheus-stack-rendered.yaml' | grep -v '# :latest'
```

Expected: zero uncommented lines (all matches should be in comment lines or the kube-prometheus-stack false positives).

## Verify

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
