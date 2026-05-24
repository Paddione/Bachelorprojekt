---
name: flux-day2-ops
description: Use when reconciling Flux GitOps after a PR merge, debugging Flux suspension/ImageUpdateAutomation, or when manifests are drifting and you need to force a cluster sync without a full workspace:deploy.
---

# flux-day2-ops → consolidated into fleet-ops

Flux GitOps operations have been merged into the **`fleet-ops`** skill under the "Flux GitOps Operations" section.

Invoke `fleet-ops` instead — it covers forced reconcile, suspend/resume, `$$`-escaping, ImageUpdateAutomation, and Flux failure modes alongside the full two-cluster deploy reference.
