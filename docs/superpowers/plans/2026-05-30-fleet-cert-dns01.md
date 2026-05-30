---
title: fix: fleet wildcard cert won't issue via DNS-01 — Implementation Plan
ticket_id: T000351
domains: [website, infra, ops, test, security]
status: active
pr_number: null
---

# fix: fleet wildcard cert won't issue via DNS-01 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Certificate workspace-wildcard` (`*.fleet-m.korczewski.de` + apex) issue
automatically on the `fleet` cluster, and keep it reproducible across fresh bring-ups —
unblocking HTTPS for the mentolder-on-fleet test stack and the `coturn` pod (which mounts
`workspace-wildcard-tls`).

**Ticket:** T000351 · **Branch:** `fix/fleet-cert-dns01` · relates **T000338** (Fleet Stage 2 Phase 2b)

## Root causes (verified live 2026-05-30)

1. **GitOps wiring gap (codified fix).** `task cert:install` installs the lego DNS-01 webhook
   (helm `cert-manager-lego-webhook`) and patches only its `nodeAffinity`. It never injects
   `IPV64_API_KEY`. That env var is set *solely* by the imperative `cert:secret` step. On fleet
   the key was sealed (`cert-manager/ipv64-api-key`) and `cert:secret` was skipped as
   "optional", so the webhook landed without the var and every DNS-01 challenge failed
   pre-flight: `failed to create provider: ipv64: some credentials information are missing:
   IPV64_API_KEY`. **Fixed LIVE** via `kubectl set env deployment/cert-manager-lego-webhook -n
   cert-manager --from=secret/ipv64-api-key` (matches the working mentolder webhook), but that
   is not in the repo — a webhook redeploy loses it.

2. **lego ipv64 provider mis-handles the nested host (design fix).** For `*.fleet-m.korczewski.de`
   under the 2-label registrable domain `korczewski.de`, lego does not persist the
   `_acme-challenge.fleet-m` TXT and its cleanup returns `403 Forbidden: del_record`. This is
   **not** a key/API limitation — direct API calls from a probe pod (key in env, never printed)
   succeed: `add_record`=201, `del_record`=202 at `domain=korczewski.de
   praefix=_acme-challenge.fleet-m`, and a hand-planted TXT validated the challenge instantly.
   mentolder works because `*.mentolder.de` is itself a registrable ipv64 domain → single-level
   `_acme-challenge` praefix. The fleet test hosts are sub-subdomains of `korczewski.de`, so the
   praefix is 2-level (`_acme-challenge.fleet-m`), which lego's provider does not handle.

`ipv64 get_domains` models managed zones under a `"subdomains"` key and the account currently
holds only `korczewski.de`. Registering the fleet test hosts as their own ipv64 subdomains
makes lego compute a single-level praefix, matching the proven-working mentolder pattern.

---

## Task 1 — Codify `IPV64_API_KEY` wiring in `cert:install` (TDD, offline)

- [x] Failing test already staged: `tests/unit/fleet-phase2b.bats` →
      *"cert:install wires IPV64_API_KEY into the lego webhook (not just cert:secret)"* (red).
- [x] In `Taskfile.yml` `cert:install`, after the lego webhook helm install + nodeAffinity
      patch (~line 3252), add a conditional that injects the key from the existing secret:
      ```bash
      if kubectl --context "$ENV_CONTEXT" get secret ipv64-api-key -n cert-manager >/dev/null 2>&1; then
        kubectl --context "$ENV_CONTEXT" set env deployment/cert-manager-lego-webhook \
          -n cert-manager --from=secret/ipv64-api-key
      fi
      ```
      (Idempotent; no-op when the sealed/imperative key is absent — `cert:secret` still wires it later.)
- [x] Make the test green: `tests/unit/lib/bats-core/bin/bats tests/unit/fleet-phase2b.bats`
- [x] `task test:all` green.

## Task 2 — Confirm lego's exact failure on the nested host (live diagnostic)

- [ ] Open the fleet tunnel (`ssh -i ~/.ssh/id_ed25519 -fNL 16443:127.0.0.1:6443
      patrick@204.168.244.104`). Bump `cert-manager-lego-webhook` log verbosity (chart values or
      `set env LEGO_DEBUG`/`-v=4`) and trigger one challenge; capture the exact `domain`/`praefix`
      lego sends to the ipv64 API. Confirm the 2-label-praefix / registrable-domain hypothesis
      (and check the chart/provider version `yxwuxuanl/cert-manager-lego-webhook`).
- [ ] Record findings on T000351 / the `project_fleet_stage2_cutover` memory.

## Task 3 — Fix the nested-domain issuance (chosen: register ipv64 subdomains)

- [x] Register `fleet-m.korczewski.de` and `fleet.korczewski.de` as their own ipv64
      subdomains/zones (ipv64 UI, or API `add_domain` from a probe pod with the key in env —
      never printed). Verify via `get_domains` they appear as managed zones.
- [ ] Ensure the wildcard A records resolve for `*.fleet-m.korczewski.de` /
      `*.fleet.korczewski.de` (existing `*.korczewski.de` wildcard already covers them; confirm).
- [ ] Delete + recreate the `workspace-wildcard` CertificateRequest on fleet so lego now writes a
      single-level `_acme-challenge` praefix in the new zone.
- **Alternatives if registration is unsupported/undesired (do NOT do both):**
  - [x] Switch the fleet test hostnames in `environments/fleet-mentolder.yaml` /
        `fleet-korczewski.yaml` to registrable single-label-under-registrable-domain hosts; OR
  - [ ] Pin/replace the lego ipv64 provider config to handle multi-level praefixes (upstream fix).

## Task 4 — Verify end-to-end on fleet

- [x] `kubectl --context fleet get certificate workspace-wildcard -n workspace` → READY=True.
- [ ] Trigger the already-deployed copy job: `kubectl --context fleet create job --from=cronjob/tls-sync
      tls-sync-manual -n workspace`; confirm `workspace-wildcard-tls` appears in ns `coturn`.
- [ ] `kubectl --context fleet get pods -n coturn` → `coturn` Running (was ContainerCreating).
- [ ] `curl -sI https://files.fleet-m.korczewski.de` (or apex) returns a valid Let's Encrypt
      cert (not the Traefik default).

## Notes / out of scope

- The live `set env` from root cause #1 is already applied on fleet; Task 1 only codifies it so
  it survives a webhook redeploy. No live rollback needed.
- This plan does NOT deploy the korczewski brand or run the DNS cutover — those remain Phase-2b
  items under T000338.
