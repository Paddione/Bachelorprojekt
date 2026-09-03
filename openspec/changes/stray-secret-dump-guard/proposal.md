# Proposal: stray-secret-dump-guard

## Why

Security incident T900027 (major): a complete Kubernetes `Secret` manifest — 128
keys, including `ANTHROPIC_API_KEY`, OIDC client secrets and admin passwords —
lay untracked in the repo root under a broken Windows-path filename
(`C` `U+F03A` `Users…AppDataLocalTempws-secret.json`). The filename arose from a
Git-Bash shell redirection where the drive-colon of a Windows output path was
mangled into U+F03A instead of being treated as a path separator.

Two existing safeguards failed to protect against this class of stray dump:

- **`.gitignore` / `git check-ignore`**: the mangled name cannot even be
  resolved (`git check-ignore` reports "outside repository"), so no ignore
  pattern is a reliable defence.
- **gitleaks guard (pre-commit)**: it is **fail-open** when the `gitleaks`
  binary is absent (warns, exits 0 — T002506/T002554), and the binary is not
  installed on the workstation where this incident occurred. Protection relied
  solely on agent discipline plus the explicit-pathspec convention.

A stray `kubectl get secret … -o json > <path>` dump is therefore not caught
locally until a human notices it. This change adds a dedicated, **fail-closed**
guard that catches stray secret-dump files regardless of the gitleaks binary
presence, and documents the deletion + rotation gates for the exposed file.

## What

1. **New fail-closed guard `scripts/stray-secret-dump-guard.sh`** that scans a
   target directory (default: the invoking repo root) for stray Kubernetes
   secret-dump JSON files by filename pattern (`*ws-secret*.json`, `*-secrets*.json`
   dump artefacts) and exits non-zero when one is present, regardless of gitleaks
   availability.
2. **Wire the guard into the pre-commit hook** (`.githooks/pre-commit`) so it runs
   even when `gitleaks` is not installed, and into the CI `security-scan` job so it
   is fail-closed in CI.
3. **RED → GREEN BATS test** under `tests/spec/security/` proving the guard
   fails on a stray dump and passes on a clean tree (positive anchor).
4. **Manual operational gates** (not automated): deletion of the untracked file
   and rotation of the exposed credentials, both requiring explicit user
   confirmation during execution.

_Ticket: T900027_
