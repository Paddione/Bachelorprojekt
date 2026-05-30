# Fleet Stage 2 — Cutover Runbook

Spec: `docs/superpowers/specs/2026-05-30-fleet-stage2-dns-cutover-design.md`
Order: **fleet platform deploy** → **mentolder** (data copy + reversible DNS flip) →
same-day soak → **korczewski** (fresh deploy + DNS cleanup).

> ## Verified topology (2026-05-30) — read before acting
> - The `fleet` cluster (3-CP k3s on pk-hetzner-4/6/8, wg-fleet 10.20.0.0/24) is reached
>   via the tunnelled context `fleet` (server `127.0.0.1:16443`). It runs cert-manager +
>   Traefik but **no brand workloads yet**; namespaces `workspace` and
>   `workspace-korczewski` exist but are EMPTY.
> - **korczewski-standalone has already been torn down.** Fleet's k3s now occupies the pk
>   hosts. The old `korczewski` kubeconfig context (server `204.168.244.104:6443`) is DEAD —
>   it returns x509 because that IP now presents fleet's k3s CA. **Operate the korczewski
>   brand via the `fleet` context, namespace `workspace-korczewski`** — do NOT try to "fix"
>   the `korczewski` context (ticket T000340). korczewski.de currently returns HTTP 404
>   behind the TRAEFIK DEFAULT CERT — down-but-expected until the fleet deploy runs.
> - **mentolder-standalone is still live** on separate gekko hardware, with intact local
>   backups. So mentolder is a reversible DNS flip with a warm fallback; korczewski is a
>   fresh deploy (its data is NOT being restored — see §3).

## 0. Prerequisite gate — deploy the fleet platform (STOP if any fails)

The fleet cluster has no brand workloads yet. These must all be true before any DNS work.

**Operator assets — PREPARED 2026-05-30 (was MISSING):**
- [x] `environments/.secrets/fleet-mentolder.yaml` and `environments/.secrets/fleet-korczewski.yaml`
      assembled from the standalone secrets (gitignored). **fleet-mentolder** = mentolder's
      app/data secrets (so the restored data decrypts — same `BACKUP_PASSPHRASE`/DB passwords)
      with the WG node keys swapped to korczewski's `pk-4/6/8` keys (fleet runs on those hosts);
      `DEV_*` keys kept. **fleet-korczewski** = korczewski's secrets minus `DEV_*` (dev stack is
      Phase 2c). Both pass `env-seal`'s dev-value/duplicate/completeness checks.
- [x] ipv64 ACME DNS-01 API key — **already carried in both standalone `.secrets`**, so
      `env:seal` emitted a `cert-manager/ipv64-api-key` SealedSecret automatically. `task cert:secret`
      is now only an imperative fallback. Verified the key controls BOTH `mentolder.de` and
      `korczewski.de` (see DNS prereqs below).
- [ ] Confirm capacity on pk-4/6/8 for both brands' workloads.

**Bring-up order on the `fleet` context** (mirrors CLAUDE.md fresh-cluster order):
- [x] `task sealed-secrets:install ENV=fleet-mentolder` — controller installed, 1/1 ready
      (NB: the task does not pass `--version`; installed chart ≠ pinned `2.18.6` in versions.yaml).
- [x] `task cert:install ENV=fleet-mentolder` — cert-manager already running (4 pods).
- [x] Install Longhorn on fleet — Helm chart `1.11.2`, all 3 pk nodes schedulable, CSI 3/3.
      Installed with `persistence.defaultClass=false` so **`local-path` stays the sole default**
      (data PVCs name `storageClassName: longhorn` explicitly). The chart's default would have
      created a SECOND default StorageClass — avoid that.
- [x] `env:seal` auto-fetched the fleet sealing cert → `environments/certs/fleet-mentolder.pem`
      and `fleet-korczewski.pem` (per-ENV path; both are the same fleet controller cert — the
      `certs/fleet.pem` name in older notes is wrong).
- [x] `task env:seal ENV=fleet-mentolder` and `task env:seal ENV=fleet-korczewski` →
      wrote `environments/sealed-secrets/fleet-*.yaml` (committed).
- [ ] `task cert:secret -- <ipv64-key> ENV=fleet-mentolder` — optional fallback only; the key
      is already sealed into `cert-manager/ipv64-api-key`.
- [ ] `task fleet:deploy` — runs `fleet:platform` once, then `fleet:deploy:brand` for
      `fleet-mentolder` (ns `workspace`) and `fleet-korczewski` (ns `workspace-korczewski`).
      **This is the next operator action.**
- [ ] Verify: `kubectl --context fleet get pods -n workspace` and `-n workspace-korczewski`
      all Ready.

**DNS + cert prerequisites:**
- [ ] `environments/fleet-mentolder.yaml` TURN/LIVEKIT pin = `204.168.244.104` (pk-4) — DONE.
- [x] `IPV64_API_KEY` on fleet controls BOTH domains — **verified 2026-05-30**: a
      `get_domains` call returned both `mentolder.de` and `korczewski.de` as object keys
      (under `.subdomains`/`.domains`/`.record_info`). **Confirm the JSON path used by
      `capture_rollback_state()` in `scripts/fleet-dns-cutover.sh` matches this real
      response**; adjust the jq filter if the live shape differs, then re-run
      `bats tests/unit/fleet-dns-cutover.bats`.
- [ ] Certs pre-warmed on fleet: `Certificate` for `*.mentolder.de` + `mentolder.de` and
      `*.korczewski.de`; wait `READY=True` (`kubectl --context fleet get certificate -A`).
- [ ] Record current live A-records for both domains by hand (authoritative rollback
      fallback): run `task fleet:dns:cutover ENV=fleet-mentolder` (dry-run) and save the values.

## 1. mentolder cutover (data copy + reversible DNS flip)

1. Post maintenance banner; quiesce writes on mentolder-standalone (scale app to 0 /
   set DB read-only).
2. **Final delta data sync standalone → fleet via direct backup-pvc copy** (Filen is NOT
   used — see Appendix A):
   - Trigger fresh backups on the standalone: `bash scripts/backup-restore.sh trigger
     --context mentolder` and `... pvc-trigger --context mentolder`.
   - Copy the newest DB + PVC timestamp dirs from the standalone `backup-pvc` into the
     fleet `backup-pvc` (helper pod + `kubectl cp`, both ends ns `workspace`) — see
     Appendix A for the exact procedure.
   - Restore into fleet: `bash scripts/backup-restore.sh restore all <ts> --context fleet -y`
     and `... pvc-restore all <pvc-ts> --context fleet -y`. (Fleet's `workspace-secrets`
     must carry the SAME `BACKUP_PASSPHRASE` as the standalone, or the openssl decrypt
     fails — it does, because both seal from the same plaintext inputs.)
   - Verify row counts / file checksums against the standalone before flipping.
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

## 3. korczewski — fresh deploy + DNS cleanup (NO data restore)

> korczewski-standalone is already gone and its data is NOT being restored (operator
> decision 2026-05-30: fresh start). The ingress "handover" of §3 in the old plan has
> already happened de-facto — fleet owns :80/:443 on the pk hosts. What remains:

1. Confirm `fleet-korczewski` deployed clean (§0) with empty/fresh databases; run any
   first-run seed/setup (Keycloak realm, website content, OIDC clients) as for a new env.
2. DNS cleanup: `task fleet:dns:cutover ENV=fleet-korczewski ACTION=cutover`
   (drops stray `14.249.175.67`, ensures pk-4/6/8 on `@`/`*`, livekit/stream/turn pinned).
   mailbox.org / mail records frozen by construction. See ticket T000339 (DNS drift).
3. Verify `web.korczewski.de` serves a real Let's Encrypt cert (not TRAEFIK DEFAULT CERT)
   and returns 200; smoke the brand.

## 4. Rollback reference

- **mentolder:** `task fleet:dns:rollback ENV=fleet-mentolder` (restores recorded state;
  gekko standalone was never torn down — clean warm fallback).
- **korczewski:** NO rollback to standalone is possible — it is gone. Recovery means
  re-deploying `fleet-korczewski` and re-running DNS cleanup. There is no warm fallback.

## Appendix A — direct backup-pvc copy (Filen replacement)

Filen-based restore (`scripts/backup-restore.sh filen-pull`) is **out of service**: the
02:00 db-backup `filen-upload` sidecar fails with `Invalid credentials!`
(`k3d/backup-cronjob.yaml` warns 2FA breaks @filen/cli login permanently). Fix is tracked
separately and is NOT on the migration critical path — mentolder data moves by direct copy,
korczewski starts fresh.

Direct copy (standalone `backup-pvc` → fleet `backup-pvc`, both ns `workspace`):
1. Spawn a reader pod on the standalone mounting `backup-pvc` read-only; `kubectl cp` the
   chosen `<ts>/` (DB) and `pvc-<ts>/` (PVC) dirs to the workstation `/tmp`.
2. Spawn a writer pod on fleet mounting `backup-pvc`; `kubectl cp` the dirs up into
   `/backups/` on the fleet PVC.
3. Both PVCs are Longhorn RWO — schedule the helper pods off the home worker nodes
   (the `restore`/`list` commands already encode the `NotIn[k3s-*,k3w-*]` affinity).
4. Then run the standard `restore` / `pvc-restore` against `--context fleet`.

> Ongoing cloud backups remain broken until Filen creds are rotated/re-sealed
> (FILEN_EMAIL/FILEN_PASSWORD in `workspace-secrets`, default path `/Backup`). Track separately.

## Out of scope (Stage 3)

Decommission mentolder gekko standalone, reclaim hardware, remove old envs /
sealed-secrets, restore Filen cloud backups, final DNS TTL hardening.
