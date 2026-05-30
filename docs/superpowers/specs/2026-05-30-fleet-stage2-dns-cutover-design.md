# Fleet Stage 2 — DNS Cutover & Brand Consolidation — Design

**Date:** 2026-05-30
**Branch:** `feature/fleet-stage2-dns-cutover`
**Predecessor:** Phase 2a dual-brand overlays (PR #1185, merged) — `docs/superpowers/specs/2026-05-30-fleet-phase2a-dual-brand-design.md`
**Roadmap parent:** `docs/superpowers/specs/2026-05-30-fleet-unified-cluster-design.md`

## Goal

Move both brands' live public traffic onto the unified `fleet` cluster (k3s v1.36.1 on
pk-hetzner-4/6/8), in **one plan, mentolder-first**, then hold for a same-day soak before
the irreversible korczewski step. Decommissioning the old clusters is **out of scope**
(deferred to Stage 3).

## Topology reality (the constraint that shapes everything)

Confirmed live (`kubectl --context fleet get nodes`) and in `wireguard/wg-mesh-nodes.yaml`:

| Cluster | Physical hosts | Public IPs | Owns `:80/:443` today |
|---|---|---|---|
| korczewski-standalone (k3s v1.32) | pk-hetzner-4/6/8 | 204.168.244.104 / 37.27.251.38 / 62.238.23.79 | **YES** |
| **fleet** (k3s v1.36.1, wg-fleet 10.20.0.0/24) | **same pk-hetzner-4/6/8** | **same IPs** | NO (deployed, not host-bound) |
| mentolder-standalone | gekko (separate Hetzner) | 46.225.125.59 / 178.104.105.59 | YES (own hosts) |

**Consequence — the cutover is asymmetric per brand:**

- **mentolder** → a true, reversible DNS A-record flip (`46.x/178.x` → pk IPs). gekko stays
  up as a warm fallback; rollback = revert A-records (≈60 s ipv64 TTL).
- **korczewski** → **not a DNS change** (`korczewski.de` already resolves to the pk IPs).
  It is an **in-place ingress handover** on the shared hosts: only one k3s can bind
  `:80/:443` per host, so standalone must release the ports before fleet binds them.
  No warm fallback; brief hard outage during the swap (accepted by operator).

## Decisions (from brainstorming)

1. **Scope & order:** both brands, **mentolder-first** (reversible canary) → soak → korczewski.
   One plan. (Option A.)
2. **Data freshness:** short **maintenance freeze + final delta sync** per brand right before
   its flip — banner → quiesce writes on standalone → final `pg_dump` + PVC rsync → verify →
   flip. Planned short window (not a near-zero-downtime target). (Option A.)
3. **DNS mechanism:** a dedicated **`fleet:dns:cutover` / `fleet:dns:rollback`** task pair
   backed by one BATS-tested `scripts/fleet-dns-cutover.sh` that **records current A-records
   first**, then surgically `update_record`s only the cluster A-records via the ipv64 API.
   Mail records are never in the update set. (Option A.)
4. **Soak:** **same-day**, active monitoring, with the go/no-go gate below. (Option A.)
5. **korczewski outage:** brief hard outage during port handover is acceptable.
6. **Runbook:** a `docs/` markdown runbook (not a skill) — one-time operation.

## What moves vs. what is frozen

Legend: ✅ moves to fleet · 🧊 frozen, never touched by the cutover.

| Record | mentolder.de | korczewski.de |
|---|---|---|
| ✅ root `@` A + `*` wildcard | `46.x` → `204/37/62` | cleanup: drop stray `14.249.175.67`, add missing pk-8 `62.238.23.79`, ensure `*` |
| ✅ `livekit` / `stream` / `turn` A | `46.x` → pk-4 `204.168.244.104` | already pk-6 `37.27.251.38` ✓ |
| 🧊 MX / SPF / DKIM / DMARC / mta-sts | tutanota — freeze | mailbox.org — freeze |
| 🧊 `dev`, `brainstorm` (mentolder only) | stay on gekko (not hosted on fleet) | — |

Rationale: only cluster ingress A-records move. Touching mail records (or the ipv64
"Domain Reset" button) would break email for the brand.

## Hard prerequisites (asserted by the plan, not performed by it)

The plan's first task is a **verification gate** that fails loudly if any of these are unmet:

1. **Stage 1 complete** — both brands' workloads live and data restored on fleet (the gated
   tail of Phase 2a: secrets sealed, Longhorn installed, `task fleet:deploy` applied, pods
   Ready in `workspace` and `workspace-korczewski` on the fleet context).
2. **Operator assets wired:**
   - pk-hetzner-4 public IP (`204.168.244.104`) set in `environments/fleet-mentolder.yaml`
     for `TURN_PUBLIC_IP` and `LIVEKIT_PIN_IP` (both currently stale gekko placeholders).
   - ipv64 API key on fleet confirmed to control **both** `mentolder.de` and `korczewski.de`
     (they may be different ipv64 accounts — must be verified, not assumed).
3. **Certs pre-warmed** — `*.mentolder.de` + `mentolder.de` (and `*.korczewski.de`)
   Certificates issued on fleet via DNS-01 **before** any A-record flip (the ACME challenge
   is a `_acme-challenge` TXT record and succeeds while traffic still points at the old
   clusters). Gate on `READY=True`.

## Procedure

### Phase A — mentolder cutover (canary)

1. Post maintenance banner; quiesce writes on mentolder-standalone (scale app deploy to 0
   and/or set DB read-only).
2. Final delta sync standalone→fleet: `pg_dump` of the live DBs + PVC `rsync`; verify by
   row counts / file checksums.
3. `task fleet:dns:cutover ENV=fleet-mentolder` — captures the current A-records to a
   rollback state file, then `update_record`s root `@`, `*`, `livekit`, `stream`, `turn`
   to the fleet IPs (livekit/stream/turn → pk-4). Mail + `dev`/`brainstorm` untouched.
4. Verify DNS resolution, TLS serving (`*.mentolder.de` cert), and run smoke checks.

### Phase B — soak gate (same-day, active monitoring)

All must pass before korczewski; any failure → `task fleet:dns:rollback ENV=fleet-mentolder`,
fix, retry:

- `task health` + `task workspace:verify ENV=fleet-mentolder` green
- `*.mentolder.de` wildcard cert `READY=True` on fleet
- e2e Playwright (mentolder project) green against the flipped domain
- `SA-22` cross-brand isolation still passing
- Manual smoke: Keycloak SSO login, Nextcloud file open, chat message send, LiveKit join
- No 5xx / error-rate spike in fleet Traefik logs over the window
- Mail still flowing (tutanota MX untouched — spot check)

### Phase C — korczewski handover (irreversible)

1. Post maintenance banner; final delta sync standalone→fleet (same as Phase A step 2).
2. **Release `:80/:443` on pk-hetzner-4/6/8**: disable korczewski-standalone ingress
   (its servicelb/Traefik), then enable fleet's ingress hostPort bind on the three hosts.
   Brief hard outage during the swap.
3. DNS cleanup via `task fleet:dns:cutover ENV=fleet-korczewski`: drop stray
   `14.249.175.67`, add pk-8 `62.238.23.79`, ensure `*` wildcard. livekit/stream/turn
   already pk-6; mailbox.org records frozen.
4. Verify + smoke. **Rollback** (documented, heavier): re-enable standalone ingress on the
   hosts, revert DNS cleanup. No warm fallback — this is a recovery, not a flip-back.

## New / changed artifacts

| Action | Path | Responsibility |
|---|---|---|
| Create | `scripts/fleet-dns-cutover.sh` | Surgical ipv64 A-record update + rollback-state capture; shared by cutover/rollback; never includes mail records in the update set |
| Modify | `Taskfile.yml` | `fleet:dns:cutover` + `fleet:dns:rollback` tasks (ENV-routed per brand; source `env-resolve.sh`) |
| Create | `tests/unit/fleet-dns-cutover.bats` | Asserts: mail records never in update set; rollback restores recorded state; correct per-brand IPs & record names; dry-run prints planned changes |
| Modify | `environments/fleet-mentolder.yaml` | Replace stale gekko `TURN_PUBLIC_IP` / `LIVEKIT_PIN_IP` with pk-4 `204.168.244.104` |
| Create | `docs/fleet-stage2-cutover-runbook.md` | Operator runbook: prereq checks → freeze/sync → flip → soak gate → korczewski handover → rollback |

## Error handling & rollback

- **mentolder:** fully reversible — `fleet:dns:rollback ENV=fleet-mentolder` restores the
  recorded gekko A-records; gekko was never torn down.
- **korczewski:** recoverable, not reversible — re-enable standalone ingress on the hosts +
  revert DNS cleanup. Data written to fleet during/after handover does not roll back.
- **Data divergence:** the maintenance freeze + final delta sync is what makes each flip
  loss-free; without quiescing writes first, the `T0→T1` window is lost. Verification of the
  sync (row counts / checksums) is a gate, not a courtesy.

## Out of scope (→ Stage 3)

Decommission standalone clusters; reclaim gekko hardware; remove old envs / sealed-secrets;
final DNS TTL hardening; adding steady-state `ddns-updater` to mentolder (only the one-time
cutover task pair is built here).

## Testing

- **Offline (CI):** `tests/unit/fleet-dns-cutover.bats` (mail-record safety, rollback
  fidelity, per-brand correctness, dry-run). `task test:all` green. `test:inventory`
  regenerated if a new test ID is added.
- **Live (runbook-gated, not CI):** the Phase B soak gate checks; SA-22; e2e Playwright.
