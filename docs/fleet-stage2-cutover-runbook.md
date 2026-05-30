# Fleet Stage 2 — DNS Cutover Runbook

Spec: `docs/superpowers/specs/2026-05-30-fleet-stage2-dns-cutover-design.md`
Order: **mentolder** (reversible canary) → same-day soak → **korczewski** (irreversible).

> Topology reality: the `fleet` cluster runs on the SAME physical hosts as
> korczewski-standalone (pk-hetzner-4/6/8). mentolder-standalone is on separate
> gekko hardware. So mentolder is a reversible DNS flip; korczewski is an in-place
> ingress handover (no warm fallback).

## 0. Prerequisite gate (STOP if any fails)

- [ ] Stage 1 complete: `kubectl --context fleet get pods -n workspace` and
      `-n workspace-korczewski` all Ready.
- [ ] `environments/fleet-mentolder.yaml` TURN/LIVEKIT pin = `204.168.244.104` (pk-4).
- [ ] `IPV64_API_KEY` on fleet controls BOTH domains — verify:
      `curl -fsS "https://ipv64.net/api?get_domains" -H "Authorization: Bearer $IPV64_API_KEY" | jq '.subdomains // .record_info'`
      Confirm both `mentolder.de` and `korczewski.de` appear. **Confirm the JSON path
      used by `capture_rollback_state()` in `scripts/fleet-dns-cutover.sh` matches this
      real response**; adjust the jq filter if the live shape differs, then re-run
      `bats tests/unit/fleet-dns-cutover.bats`.
- [ ] Certs pre-warmed on fleet: apply `Certificate` for `*.mentolder.de` +
      `mentolder.de` and `*.korczewski.de`; wait `READY=True`
      (`kubectl --context fleet get certificate -A`). DNS-01 works before the flip.
- [ ] Record current live A-records for both domains by hand (authoritative rollback
      fallback): run `task fleet:dns:cutover ENV=fleet-mentolder` (dry-run) and save
      the dashboard values.

## 1. mentolder cutover (canary)

1. Post maintenance banner; quiesce writes on mentolder-standalone (scale app to 0 /
   set DB read-only).
2. Final delta sync standalone → fleet: `pg_dump` of live DBs + PVC `rsync`; verify
   row counts / file checksums.
3. Dry-run and review: `task fleet:dns:cutover ENV=fleet-mentolder` (prints `CHANGE:` lines).
4. Apply: `task fleet:dns:cutover ENV=fleet-mentolder ACTION=cutover`.
5. Verify: `dig +short mentolder.de` returns the pk IPs; TLS serves; smoke checks.

## 2. Soak gate (same-day, active monitoring) — ALL must pass before korczewski

- [ ] `task health` + `task workspace:verify ENV=fleet-mentolder` green
- [ ] `*.mentolder.de` cert `READY=True` on fleet
- [ ] e2e Playwright (mentolder project) green vs the flipped domain
- [ ] `FLEET_CONTEXT=fleet bash tests/local/SA-22.sh` passes
- [ ] Manual smoke: Keycloak SSO, Nextcloud file open, chat send, LiveKit join
- [ ] No 5xx spike in fleet Traefik logs
- [ ] Mail spot-check (tutanota MX untouched)
- FAIL → `task fleet:dns:rollback ENV=fleet-mentolder`, fix, retry.

## 3. korczewski handover (irreversible — brief outage accepted)

1. Post maintenance banner; final delta sync standalone → fleet (as §1.2).
2. Release `:80/:443` on pk-hetzner-4/6/8: disable korczewski-standalone ingress
   (servicelb/Traefik), then enable fleet's ingress hostPort bind on the three hosts.
   Brief hard outage during the swap.
   > Requires working `korczewski` kubeconfig access — see ticket T000341 (x509 from
   > the WSL workstation); refresh before this step.
3. DNS cleanup: `task fleet:dns:cutover ENV=fleet-korczewski ACTION=cutover`
   (drops stray `14.249.175.67`, adds pk-8 `62.238.23.79`, ensures `*` wildcard).
   livekit/stream/turn already pk-6; mailbox.org records frozen. See ticket T000340.
4. Verify + smoke.

## 4. Rollback reference

- **mentolder:** `task fleet:dns:rollback ENV=fleet-mentolder` (restores recorded
  state; gekko was never torn down — clean).
- **korczewski:** re-enable standalone ingress on the hosts +
  `task fleet:dns:rollback ENV=fleet-korczewski`. Recovery, not a flip-back; data
  written to fleet during/after handover does not roll back.

## Out of scope (Stage 3)

Decommission standalone clusters, reclaim gekko hardware, remove old envs /
sealed-secrets, final DNS TTL hardening.
