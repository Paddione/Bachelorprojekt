# Design: git-crypt secret sync into the public repo

**Date:** 2026-06-01
**Status:** approved (ready for implementation plan)
**Domains:** infra, security

## Problem

Sensitive files needed to operate the platform are gitignored and must be copied
between machines by hand (a recurring WSL-bootstrap pain point). We want them
**synced via GitHub** and **properly protected**.

`Paddione/Bachelorprojekt` is a **PUBLIC** repository. Committing any plaintext
credential publishes it to the open internet. Therefore secrets must be
**encrypted at rest in the repo**, while remaining usable as plaintext locally
so existing tooling (`env:seal`, `scripts/env-resolve.sh`, the SSH `Include`)
keeps working unchanged.

The cluster-facing secrets are already git-synced safely as `SealedSecret` YAML
under `environments/sealed-secrets/`. This design covers the **gitignored
plaintext inputs and operator credentials** that are not yet synced.

## Decision summary

| Question | Decision |
|---|---|
| Mechanism | **git-crypt** (transparent filter), encrypted into **this** public repo |
| Key model | Single **symmetric** key (`git-crypt export-key`), transported out-of-band |
| Key store | **Vaultwarden** (canonical) + a secondary offline copy |
| Scope | everything under `environments/.secrets/`, `environments/certs/*.pem`, `deploy/mcp/claude-code-secrets.yaml`, plus the **SealedSecrets controller private key** (DR) |
| Guardrail | pre-commit hook **and** CI check verifying every tracked secret blob is encrypted |

## Architecture & mechanism

`git-crypt` installs `clean`/`smudge`/`diff` filters wired via `.gitattributes`.
Files matching the configured globs are stored **AES-256-CTR encrypted** in git
objects but appear **plaintext in the working tree** once the key is unlocked.

Consequences:

- Tools never change: they read the decrypted working-tree files as before.
- A clone *without* the key shows ciphertext blobs (and cannot meaningfully edit
  them), but **cannot accidentally leak plaintext** — there is no plaintext to
  commit.
- The only real leak vector is the **initial setup** (staging plaintext before
  the filter is active) or a contributor committing without git-crypt
  initialized. The guardrail (below) closes both.

We use a single symmetric key rather than per-recipient GPG keys: this is a
solo/personal sync, and symmetric keeps the new-machine flow to one command. The
key is exported once (`git-crypt export-key`) and **never committed**.

## What gets tracked (un-ignore surgery)

Today `environments/.secrets/` is fully gitignored. We surgically un-ignore the
managed paths so nothing unexpected becomes trackable.

`.gitignore` changes (conceptual — exact lines finalized in the plan):

```gitignore
# Previously fully ignored; now tracked but git-crypt-encrypted.
!environments/.secrets/
# certs/dev.pem and any *.pem now encrypted via .gitattributes rather than ignored
```

`.gitattributes` additions:

```gitattributes
environments/.secrets/**             filter=git-crypt diff=git-crypt
deploy/mcp/claude-code-secrets.yaml  filter=git-crypt diff=git-crypt
```

> **Scope correction (found during implementation):** `environments/certs/*.pem`
> are **public** sealing certificates, committed in plaintext on purpose (anyone
> may *seal* with them; only the controller private key *unseals*). They are
> therefore **excluded** from git-crypt — encrypting a public cert is pointless
> and the committed certs already sync via git. The real "keypair" gap is only
> the controller **private** key, handled below. Placeholder files (`.gitkeep`,
> `.gitignore`, `.gitattributes`) are likewise excluded by the guard.

Inventory covered (26 files today, plus anything later added under the globs):

| Path | Contents |
|---|---|
| `environments/.secrets/<env>.yaml` (5) | plaintext env secrets (inputs to `env:seal`) |
| `environments/.secrets/.ssh/` | SSH config + node private keys |
| `environments/.secrets/wireguard/` | wg-mesh / wg-fleet private keys + configs |
| `deploy/mcp/claude-code-secrets.yaml` | Claude Code MCP secrets |
| `environments/.secrets/sealed-secrets-key.<cluster>.yaml` | SealedSecrets controller private key (DR) — see below |

## SealedSecrets controller key (DR)

Exported per cluster and stored inside the encrypted tree so a wiped cluster can
be restored without re-sealing everything:

```bash
kubectl --context fleet get secret -n kube-system \
  -l sealedsecrets.bitnami.com/sealed-secrets-key -o yaml \
  > environments/.secrets/sealed-secrets-key.fleet.yaml
# repeat for the dev (k3d-mentolder-dev) controller if/when present
```

Matched by the `environments/.secrets/**` glob → encrypted on commit. Restore on
a fresh cluster: `kubectl apply -f` the key **before** installing the controller,
then restart the controller so it adopts the restored keypair.

## Safety guardrail (makes a public repo survivable)

Two independent backstops verify that every tracked secret blob is encrypted. A
git-crypt-encrypted blob begins with the magic header `\x00GITCRYPT\x00`.

1. **Pre-commit hook** — `scripts/git-crypt-guard.sh`, installed via the repo's
   hook path. For every **staged** file matching the encrypted globs, read the
   blob that would be committed and reject the commit if it does not begin with
   the git-crypt magic header. Catches "committed plaintext because the key was
   not unlocked / filter not active."
2. **CI check** — extend the existing secret-scan job in
   `.github/workflows/ci.yml`. For every **tracked** file matching the globs,
   verify the committed blob begins with the magic header. Fails the build if
   plaintext ever lands. This is the net of last resort.

Both reuse the same verification logic (one script, two entry points) to avoid
drift.

## New-machine bootstrap

Documented in `docs/WSL-BOOTSTRAP.md` and wrapped as tasks:

```bash
sudo apt install git-crypt          # or: brew install git-crypt
git-crypt unlock /path/to/bp-secrets.key   # key fetched from Vaultwarden
# environments/.secrets/ is now decrypted and ready
```

Tasks:

- `task secrets:unlock` — wraps `git-crypt unlock` (prompts for the key path)
- `task secrets:status` — `git-crypt status -e` (lists encrypted files)
- `task secrets:lock` — `git-crypt lock` (re-encrypts the working tree)

## Initial setup order (must be exact — prevents plaintext leak)

1. Install git-crypt; `git-crypt init`.
2. Write `.gitattributes` **first**; commit it.
3. `git-crypt export-key bp-secrets.key` → store in Vaultwarden + offline copy;
   delete the local key file afterwards.
4. Edit `.gitignore` to un-ignore the managed paths.
5. `git add` the secret files; verify with `git-crypt status -e` that all are
   staged **as encrypted** *before* the first commit.
6. Add the pre-commit hook and CI guard; commit.

## Testing

- `git-crypt status -e` lists all managed files as encrypted.
- `git show HEAD:environments/.secrets/mentolder.yaml` prints ciphertext
  (proves repo-side encryption).
- Fresh `git clone` into `/tmp`: files are ciphertext; after `git-crypt unlock`
  they are plaintext and `scripts/env-resolve.sh` reads them successfully.
- Guard test: stage a fake plaintext secret under a managed glob → both the
  pre-commit hook and the CI check reject it.

## Out of scope

- Migrating the existing `SealedSecret` workflow (unchanged).
- Per-recipient / multi-user key access (symmetric key is sufficient for now;
  can migrate to git-crypt GPG mode later without re-encrypting history-forward).
- Rotating any currently-stored credential (separate `secret-rotation` flow).

## Non-obvious risks / notes

- **`.gitattributes` must land before any secret is staged**, or the first
  commit stores plaintext. Setup order step 2 enforces this; the guard catches
  regressions.
- git-crypt encrypts **content**, not **filenames** — file paths/names remain
  visible in the public repo. Do not encode secrets into filenames.
- A contributor who clones without running `git-crypt unlock` and then edits a
  secret file would commit plaintext. The pre-commit hook (once installed) and
  the CI guard both block this; the hook must be installed on each clone
  (documented in bootstrap).
