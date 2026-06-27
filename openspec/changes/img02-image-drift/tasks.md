---
title: "G-IMG02: Fremd-Image-Versions-Drift vereinheitlichen (busybox/curl)"
ticket_id: T001159
domains: [infra]
status: active
file_locks: [k3d/pocket-id-client-seed.yaml, prod-korczewski/oauth2-proxy-dev.yaml, tests/spec/image-drift.bats]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Tasks: img02-image-drift (T001159)

- [ ] Task 0: BATS Failing-Test `tests/spec/image-drift.bats` (RED → GREEN verifizieren)
- [ ] Task 1: Hand-Edit `prod-korczewski/oauth2-proxy-dev.yaml:38` — `busybox:1.36` → `busybox:1.37`
- [ ] Task 2: Hand-Edit `k3d/pocket-id-client-seed.yaml:73` — `curlimages/curl:8.11.0` → `curlimages/curl:8.7.1`
- [ ] Task 3: BATS-Spec grün verifizieren (`./tests/unit/lib/bats-core/bin/bats tests/spec/image-drift.bats`)
- [ ] Task 4: `task env:validate:all` Exit 0
- [ ] Task 5: `task workspace:validate` Exit 0
- [ ] Task 6: `task test:changed` Exit 0
- [ ] Task 7: `task freshness:regenerate` + `task freshness:check` Exit 0
- [ ] Task 8: Commit + Push (PR-Titel: `fix(infra): vereinheitliche busybox/curl Image-Versionen [T001159]`)

---

# G-IMG02: Image-Drift — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** Reduziere G-IMG02 Drift-Familien in hand-editierten `k3d/` und `prod*/`-Manifesten von 3 (busybox, curl, k8s-sidecar) auf 0 (nur 1 kanonischer Pin pro Familie). helm-rendered Dateien sind out-of-scope (deterministisch aus Chart-Pin).

**Architecture:** Minimal-invasiver Pin-Bump: 2 Dateien, je 1 Zeile. BATS-Spec misst die Drift-Tag-Counts und Familien-Drift. Kanonische Pins:
- `busybox:1.37` (28 hand-edited refs dominant)
- `curlimages/curl:8.7.1` (7 hand-edited refs dominant + 1 sha256-Pin)

**Tech Stack:** kustomize, helm (für künftiges `monitoring:render`/`loki:render` — out-of-scope hier), BATS (bats-core via tests/unit/lib submodule).

## File Structure

```
tests/spec/image-drift.bats                  ← NEW: 4 BATS-Assertions (RED → GREEN)
k3d/pocket-id-client-seed.yaml               ← MODIFY: line 73 (curl 8.11.0 → 8.7.1)
prod-korczewski/oauth2-proxy-dev.yaml        ← MODIFY: line 38 (busybox 1.36 → 1.37)
openspec/changes/img02-image-drift/          ← NEW: proposal.md + tasks.md + specs/
```

## Task 0 — BATS Failing-Test (RED → GREEN)

`tests/spec/image-drift.bats` mit 4 @test-Cases:
1. busybox Drift-Tag-Counts = 0 (außer 1.37), ausgenommen helm-rendered
2. curl Drift-Tag-Counts = 0 (außer 8.7.1 + 8.7.1@sha256)
3. busybox Drift-Familie ≤ 1 unique Tag
4. curl Drift-Familie ≤ 1 unique Tag

**RED-Step:** Vor den Fixes `./tests/unit/lib/bats-core/bin/bats tests/spec/image-drift.bats` ausführen — die Tests sind so geschrieben, dass sie vor dem Fix **expected: fail** (4× `not ok`). Damit ist der Test-Bestand verifiziert *rot*, und nach Task 1+2 muss er grün werden.

## Task 1 — busybox-Bump

`prod-korczewski/oauth2-proxy-dev.yaml` Zeile 38:
- alt: `image: busybox:1.36`
- neu: `image: busybox:1.37`

**Risiko:** prod-Overlay — Deploy-Trigger nach Merge. Patch-Bump (1.36 → 1.37), keine API-Änderung.

## Task 2 — curl-Bump

`k3d/pocket-id-client-seed.yaml` Zeile 73:
- alt: `image: curlimages/curl:8.11.0`
- neu: `image: curlimages/curl:8.7.1`

**Risiko:** Init-Job, einmalig beim Namespace-Bootstrap. Patch-Bump rückwärts (8.11.0 → 8.7.1), API-kompatibel für `--retry`/`-sS`/`-X POST`.

## Task 3 — BATS grün

Erneut `./tests/unit/lib/bats-core/bin/bats tests/spec/image-drift.bats` — 4× `ok` erwartet.

## Task 4 — env:validate:all

`task env:validate:all` muss Exit 0 zurückgeben (CI-Gate, durch G-CFG01 bereits dokumentiert).

## Task 5 — workspace:validate

`task workspace:validate` (kustomize dry-run, 162 Ressourcen) — Exit 0.

## Task 6 — test:changed

`task test:changed` (smart selection basierend auf `git diff` gegen `origin/main`):
- triggert `tests/spec/image-drift.bats` (geänderter Pfad) + alle S1/S3/S4-Checks
- muss grün sein

## Task 7 — Freshness

`task freshness:regenerate` + `task freshness:check` — Exit 0. Stellt sicher, dass alle generierten Artefakte (`openspec-status.json`, `repo-index.json`, etc.) konsistent sind.

## Task 8 — Commit + Push

```bash
git add tests/spec/image-drift.bats \
        prod-korczewski/oauth2-proxy-dev.yaml \
        k3d/pocket-id-client-seed.yaml
git commit -m "fix(infra): vereinheitliche busybox/curl Image-Versionen [T001159]"
git push -u origin fix/img02-image-drift
```

PR-Titel (gleiche Wording): `fix(infra): vereinheitliche busybox/curl Image-Versionen [T001159]`
