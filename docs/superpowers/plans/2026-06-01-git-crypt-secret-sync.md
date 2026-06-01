---
title: git-crypt Secret Sync Implementation Plan
ticket_id: null
domains: [website, infra, ops, test, security]
status: active
pr_number: null
---

# git-crypt Secret Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync the platform's gitignored operator secrets across machines by storing them git-crypt-encrypted in the public `Paddione/Bachelorprojekt` repo, with pre-commit + CI guardrails that make plaintext leakage impossible.

**Architecture:** `git-crypt` installs a transparent `clean`/`smudge` filter wired through `.gitattributes`; managed files are AES-256 in git objects but plaintext in the working tree. A single symmetric key (`git-crypt export-key`) is stored in Vaultwarden and transported out-of-band. Two backstops — a pre-commit hook and a CI step — verify every tracked secret blob begins with the git-crypt magic header (`\x00GITCRYPT\x00`).

**Tech Stack:** git-crypt, bash, BATS (bats-core), GitHub Actions, go-task (Taskfile.yml).

---

## File Structure

- Create: `scripts/git-crypt-guard.sh` — single source of truth that checks whether the committed/tracked blobs for the managed globs are encrypted. Used by both the hook and CI.
- Create: `.githooks/pre-commit` — calls the guard against staged files.
- Create: `tests/unit/git-crypt-guard.bats` — BATS tests for the guard logic.
- Modify: `.gitattributes` — add git-crypt filter globs.
- Modify: `.gitignore` — un-ignore the managed secret paths.
- Modify: `.github/workflows/ci.yml` — add an "Verify secrets are git-crypt-encrypted" step in the existing `security-scan` job (around line 132).
- Modify: `Taskfile.yml` — add `secrets:unlock`, `secrets:status`, `secrets:lock` (near existing `secrets:sync` ~line 819).
- Modify: `docs/WSL-BOOTSTRAP.md` — new-machine unlock instructions.

**Glob set (the single source of truth for "what is a managed secret"):**
```
environments/.secrets/**
environments/certs/*.pem
deploy/mcp/claude-code-secrets.yaml
```

---

## Task 1: The guard script + its tests

The guard answers one question for a given file path: *"is the blob git-crypt-encrypted?"* A git-crypt blob begins with the 10 bytes `\x00GITCRYPT\x00`. The script takes a mode (`staged` or `tracked`) and exits non-zero if any managed file's blob is NOT encrypted.

**Files:**
- Create: `scripts/git-crypt-guard.sh`
- Test: `tests/unit/git-crypt-guard.bats`

- [ ] **Step 1: Write the failing test**

```bash
# tests/unit/git-crypt-guard.bats
setup() {
  GUARD="$BATS_TEST_DIRNAME/../../scripts/git-crypt-guard.sh"
  TMP="$(mktemp -d)"
  # 10-byte git-crypt magic header + payload
  printf '\000GITCRYPT\000ciphertextpayload' > "$TMP/encrypted.bin"
  printf 'PASSWORD: hunter2\n'                > "$TMP/plaintext.yaml"
}

teardown() { rm -rf "$TMP"; }

@test "is_encrypted_blob: true for git-crypt header" {
  run bash "$GUARD" is-encrypted "$TMP/encrypted.bin"
  [ "$status" -eq 0 ]
}

@test "is_encrypted_blob: false for plaintext" {
  run bash "$GUARD" is-encrypted "$TMP/plaintext.yaml"
  [ "$status" -ne 0 ]
}

@test "is_encrypted_blob: false for empty/missing file" {
  run bash "$GUARD" is-encrypted "$TMP/does-not-exist"
  [ "$status" -ne 0 ]
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bats tests/unit/git-crypt-guard.bats`
Expected: FAIL — `scripts/git-crypt-guard.sh` does not exist.

- [ ] **Step 3: Write the guard script**

```bash
#!/usr/bin/env bash
# git-crypt-guard.sh — verify managed secret blobs are git-crypt-encrypted.
# Usage:
#   git-crypt-guard.sh is-encrypted <file>      # exit 0 if blob is git-crypt-encrypted
#   git-crypt-guard.sh check-staged             # scan staged managed files
#   git-crypt-guard.sh check-tracked            # scan all tracked managed files (CI)
set -euo pipefail

# git-crypt magic header: NUL G I T C R Y P T NUL  (10 bytes)
MAGIC=$'\x00GITCRYPT\x00'

# Managed-secret path globs (keep in sync with .gitattributes).
GLOBS=(
  'environments/.secrets/'
  'environments/certs/'        # filtered to *.pem below
  'deploy/mcp/claude-code-secrets.yaml'
)

is_managed() {
  local f="$1"
  case "$f" in
    environments/.secrets/*)            return 0 ;;
    environments/certs/*.pem)           return 0 ;;
    deploy/mcp/claude-code-secrets.yaml) return 0 ;;
    *) return 1 ;;
  esac
}

# Reads first 10 bytes of a file and compares to the magic header.
is_encrypted_file() {
  local f="$1"
  [ -f "$f" ] || return 1
  local head
  head="$(head -c 10 "$f" 2>/dev/null | od -An -tx1 | tr -d ' \n')"
  [ "$head" = "0047495443525950540" ] 2>/dev/null || \
    [ "$(head -c 10 "$f" | od -An -c | tr -s ' ')" = " \0 G I T C R Y P T \0" ]
}

# Encryption check against a literal blob already on disk (used by tests).
is_encrypted_blob_path() {
  local f="$1"
  [ -f "$f" ] || return 1
  # Compare exact 10-byte prefix.
  local prefix
  prefix="$(dd if="$f" bs=1 count=10 2>/dev/null)"
  [ "$prefix" = "$MAGIC" ]
}

fail=0
case "${1:-}" in
  is-encrypted)
    is_encrypted_blob_path "$2"
    exit $?
    ;;
  check-staged)
    while IFS= read -r f; do
      is_managed "$f" || continue
      # Read the blob that would be committed (post-filter) from the index.
      if ! git show ":$f" 2>/dev/null | head -c 10 | grep -qa $'\x00GITCRYPT\x00'; then
        echo "PLAINTEXT in staged secret: $f" >&2
        fail=1
      fi
    done < <(git diff --cached --name-only --diff-filter=ACM)
    exit $fail
    ;;
  check-tracked)
    while IFS= read -r f; do
      is_managed "$f" || continue
      if ! git show "HEAD:$f" 2>/dev/null | head -c 10 | grep -qa $'\x00GITCRYPT\x00'; then
        echo "PLAINTEXT in tracked secret: $f" >&2
        fail=1
      fi
    done < <(git ls-files)
    exit $fail
    ;;
  *)
    echo "usage: $0 {is-encrypted <file>|check-staged|check-tracked}" >&2
    exit 2
    ;;
esac
```

Note: the `is-encrypted` subcommand uses `is_encrypted_blob_path` (exact 10-byte prefix compare via `dd`), which is what the BATS tests exercise. The `check-staged`/`check-tracked` paths use `git show` + `grep -qa` so they read the **blob git would store/stored** rather than the working-tree file.

- [ ] **Step 4: Make it executable and run the tests**

Run: `chmod +x scripts/git-crypt-guard.sh && bats tests/unit/git-crypt-guard.bats`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/git-crypt-guard.sh tests/unit/git-crypt-guard.bats
git commit -m "feat(secrets): add git-crypt encryption guard + tests"
```

---

## Task 2: Pre-commit hook wired to the guard

**Files:**
- Create: `.githooks/pre-commit`
- Modify: `Taskfile.yml` (add `secrets:install-hooks` near ~line 819)

- [ ] **Step 1: Write the hook**

```bash
#!/usr/bin/env bash
# Reject commits that would store any managed secret in plaintext.
set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"
if ! bash "$repo_root/scripts/git-crypt-guard.sh" check-staged; then
  echo "ERROR: refusing commit — a managed secret is staged unencrypted." >&2
  echo "Did you run 'git-crypt unlock'? See docs/WSL-BOOTSTRAP.md." >&2
  exit 1
fi
```

- [ ] **Step 2: Add a Taskfile target to install the hook path**

In `Taskfile.yml`, add:
```yaml
  secrets:install-hooks:
    desc: Point git at the repo's tracked hooks (.githooks)
    cmds:
      - git config core.hooksPath .githooks
      - chmod +x .githooks/pre-commit
      - echo "hooksPath set to .githooks"
```

- [ ] **Step 3: Install and smoke-test the hook**

Run:
```bash
chmod +x .githooks/pre-commit
task secrets:install-hooks
git config --get core.hooksPath   # expect: .githooks
```
Expected: prints `.githooks`.

- [ ] **Step 4: Manual guard test (will be repeated end-to-end in Task 9)**

Run:
```bash
printf 'API_KEY: leak\n' > environments/.secrets/_guardtest.yaml
git add -f environments/.secrets/_guardtest.yaml
git commit -m "should fail" || echo "BLOCKED as expected"
git restore --staged environments/.secrets/_guardtest.yaml
rm environments/.secrets/_guardtest.yaml
```
Expected: commit is BLOCKED (this runs **before** git-crypt is initialized, so the staged blob is plaintext — exactly what the guard must catch).

- [ ] **Step 5: Commit**

```bash
git add .githooks/pre-commit Taskfile.yml
git commit -m "feat(secrets): pre-commit hook blocking plaintext secrets"
```

---

## Task 3: CI guard in the security-scan job

**Files:**
- Modify: `.github/workflows/ci.yml` (in `security-scan`, after the "Check for secrets in code" step ~line 140)

- [ ] **Step 1: Add the CI step**

```yaml
      - name: Verify secrets are git-crypt-encrypted
        run: |
          if ! bash scripts/git-crypt-guard.sh check-tracked; then
            echo "ERROR: a tracked secret is stored in plaintext (must be git-crypt-encrypted)"
            exit 1
          fi
          echo "All managed secret files are git-crypt-encrypted"
```

- [ ] **Step 2: Validate the workflow locally (syntax)**

Run: `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo OK`
Expected: `OK`.

- [ ] **Step 3: Confirm check-tracked passes NOW (no managed files tracked yet → vacuously green)**

Run: `bash scripts/git-crypt-guard.sh check-tracked && echo "PASS (nothing tracked yet)"`
Expected: PASS — no managed files are tracked until Task 6, so the loop finds nothing to reject.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(secrets): fail build on plaintext tracked secrets"
```

---

## Task 4: Initialize git-crypt and commit `.gitattributes` FIRST

This task must land **before** any secret file is staged (Task 6). `.gitattributes` must exist and be committed so the filter is active when files are added.

**Files:**
- Modify: `.gitattributes`

- [ ] **Step 1: Install git-crypt**

Run: `sudo apt-get update && sudo apt-get install -y git-crypt && git-crypt --version`
Expected: prints a version (e.g. `git-crypt 0.7.x`). (macOS: `brew install git-crypt`.)

- [ ] **Step 2: Initialize git-crypt in the repo**

Run: `git-crypt init`
Expected: `Generating key... done.` Creates `.git/git-crypt/keys/default` (local, not committed).

- [ ] **Step 3: Add filter globs to `.gitattributes`**

Append:
```gitattributes
# git-crypt-managed secrets (encrypted at rest in this PUBLIC repo).
environments/.secrets/**            filter=git-crypt diff=git-crypt
environments/certs/*.pem            filter=git-crypt diff=git-crypt
deploy/mcp/claude-code-secrets.yaml filter=git-crypt diff=git-crypt
```

- [ ] **Step 4: Commit `.gitattributes` before anything else**

```bash
git add .gitattributes
git commit -m "feat(secrets): register git-crypt filter globs"
```
Expected: commit succeeds (the guard's `check-staged` finds no managed files staged here).

---

## Task 5: Export the symmetric key to Vaultwarden

**Files:** none (operational).

- [ ] **Step 1: Export the key**

Run: `git-crypt export-key /tmp/bp-secrets.key && ls -l /tmp/bp-secrets.key`
Expected: a small binary key file exists.

- [ ] **Step 2: Store it out-of-band**

- Upload `/tmp/bp-secrets.key` to **Vaultwarden** as a secure attachment on a new item named `git-crypt: Bachelorprojekt secrets key`.
- Keep one offline copy (USB / password manager export).
- **Verify the upload, then shred the local copy:**

Run: `shred -u /tmp/bp-secrets.key 2>/dev/null || rm -f /tmp/bp-secrets.key; ls /tmp/bp-secrets.key 2>&1 | grep -q 'No such' && echo "local key removed"`
Expected: `local key removed`.

> ⚠️ Do NOT commit the key. It is never tracked by git. Losing it (with no Vaultwarden/offline copy) makes the encrypted files unrecoverable.

---

## Task 6: Un-ignore the secret paths and add them (encrypted)

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Un-ignore the managed paths**

Edit `.gitignore`. Replace the broad ignore of `environments/.secrets/` and the explicit `environments/certs/dev.pem` ignore with negations so the managed paths are trackable (now safe — they encrypt via `.gitattributes`):
```gitignore
# git-crypt-encrypted secrets are now TRACKED (see .gitattributes).
!environments/.secrets/
!environments/.secrets/.ssh/
!environments/.secrets/wireguard/
# certs/*.pem encrypted via .gitattributes (was: environments/certs/dev.pem ignored)
!environments/certs/dev.pem
```
Leave `deploy/mcp/claude-code-secrets.yaml` un-ignored too (remove its `.gitignore` entry).

- [ ] **Step 2: Verify git now sees the files as ENCRYPTED before committing**

Run:
```bash
git add environments/.secrets environments/certs/*.pem deploy/mcp/claude-code-secrets.yaml
git-crypt status -e
```
Expected: every managed file is listed as `encrypted`. If any shows `not encrypted`, STOP — `.gitattributes` glob is wrong; fix before committing.

- [ ] **Step 3: Run the guard against the staged set (belt-and-braces)**

Run: `bash scripts/git-crypt-guard.sh check-staged && echo "all staged secrets encrypted"`
Expected: `all staged secrets encrypted`.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(secrets): track operator secrets git-crypt-encrypted"
```
Expected: the pre-commit hook passes (blobs are encrypted).

- [ ] **Step 5: Prove repo-side ciphertext**

Run: `git show HEAD:environments/.secrets/mentolder.yaml | head -c 20 | od -c | head -1`
Expected: starts with `\0 G I T C R Y P T \0` — i.e. ciphertext, not your plaintext YAML.

---

## Task 7: Back up the SealedSecrets controller key (DR)

**Files:**
- Create: `environments/.secrets/sealed-secrets-key.fleet.yaml` (encrypted on commit)

- [ ] **Step 1: Export the controller keypair from the fleet cluster**

Run:
```bash
kubectl --context fleet get secret -n kube-system \
  -l sealedsecrets.bitnami.com/sealed-secrets-key -o yaml \
  > environments/.secrets/sealed-secrets-key.fleet.yaml
test -s environments/.secrets/sealed-secrets-key.fleet.yaml && echo "exported"
```
Expected: `exported` (file is non-empty). If the cluster is unreachable, defer this task and note it; the rest of the system works without it.

- [ ] **Step 2: Stage, verify encryption, commit**

```bash
git add environments/.secrets/sealed-secrets-key.fleet.yaml
git-crypt status -e | grep sealed-secrets-key.fleet.yaml   # expect: encrypted
bash scripts/git-crypt-guard.sh check-staged && \
  git commit -m "feat(secrets): back up fleet SealedSecrets controller key (DR)"
```
Expected: file shown encrypted; commit succeeds.

---

## Task 8: Taskfile helpers (unlock / status / lock)

**Files:**
- Modify: `Taskfile.yml` (near `secrets:sync` ~line 819)

- [ ] **Step 1: Add the tasks**

```yaml
  secrets:unlock:
    desc: Decrypt git-crypt secrets on a new machine (KEY=/path/to/bp-secrets.key)
    requires:
      vars: [KEY]
    cmds:
      - git-crypt unlock {{.KEY}}
      - git-crypt status -e | tail -n +1
      - echo "secrets unlocked"

  secrets:status:
    desc: List git-crypt-encrypted files and their state
    cmds:
      - git-crypt status -e

  secrets:lock:
    desc: Re-encrypt the working tree (removes plaintext locally)
    cmds:
      - git-crypt lock
      - echo "working tree re-locked"
```

- [ ] **Step 2: Verify the tasks parse and run**

Run: `task secrets:status`
Expected: lists managed files as `encrypted` (working tree is currently unlocked, so this reflects attribute state).

- [ ] **Step 3: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(secrets): add secrets:unlock/status/lock tasks"
```

---

## Task 9: Bootstrap docs + full end-to-end verification

**Files:**
- Modify: `docs/WSL-BOOTSTRAP.md`

- [ ] **Step 1: Document the new-machine flow**

Add a "Syncing secrets (git-crypt)" section:
```markdown
## Syncing secrets (git-crypt)

Operator secrets under `environments/.secrets/`, `environments/certs/*.pem`, and
`deploy/mcp/claude-code-secrets.yaml` are stored git-crypt-encrypted in this repo.

On a fresh clone:
1. Install git-crypt: `sudo apt-get install -y git-crypt` (or `brew install git-crypt`).
2. Fetch the key `git-crypt: Bachelorprojekt secrets key` from Vaultwarden → save locally.
3. `task secrets:unlock KEY=/path/to/bp-secrets.key`
4. Install the guard hook: `task secrets:install-hooks`
5. Shred the key file: `shred -u /path/to/bp-secrets.key`

Files are now plaintext locally; tools (`env:seal`, `env-resolve.sh`, SSH Include) work as before.
Never commit without the key unlocked — the pre-commit hook and CI block plaintext.
```

- [ ] **Step 2: Full clean-room verification**

Run:
```bash
TMP="$(mktemp -d)"; git clone "$(git rev-parse --show-toplevel)" "$TMP/clone"
# In the clone, secrets are ciphertext:
head -c 20 "$TMP/clone/environments/.secrets/mentolder.yaml" | od -c | head -1   # expect GITCRYPT header
# Unlock with the exported key (re-export from primary if needed) and confirm plaintext:
# (cd "$TMP/clone" && git-crypt unlock /path/to/bp-secrets.key && head -1 environments/.secrets/mentolder.yaml)
rm -rf "$TMP"
```
Expected: cloned secret is ciphertext; after unlock it is plaintext.

- [ ] **Step 3: Guard regression test (the leak we must prevent)**

Run:
```bash
git-crypt lock 2>/dev/null || true   # simulate "key not unlocked"
printf 'SECRET: leak\n' > environments/.secrets/_leaktest.yaml
git add environments/.secrets/_leaktest.yaml
git commit -m "must be blocked" && echo "FAIL: leak got through" || echo "PASS: blocked"
git restore --staged environments/.secrets/_leaktest.yaml; rm -f environments/.secrets/_leaktest.yaml
git-crypt unlock 2>/dev/null || true
```
Expected: `PASS: blocked`.

- [ ] **Step 4: Commit**

```bash
git add docs/WSL-BOOTSTRAP.md
git commit -m "docs(secrets): git-crypt new-machine bootstrap"
```

---

## Self-Review

**Spec coverage:**
- Mechanism (git-crypt, this public repo) → Task 4. ✓
- Symmetric key + Vaultwarden → Task 5. ✓
- Scope/inventory (.secrets/**, certs/*.pem, claude-code-secrets, controller key) → Tasks 6 & 7. ✓
- Un-ignore surgery → Task 6. ✓
- Pre-commit guard → Task 2; CI guard → Task 3; shared logic → Task 1. ✓
- New-machine bootstrap + tasks → Tasks 8 & 9. ✓
- Initial setup order (.gitattributes before staging) → enforced by Task 4 preceding Task 6. ✓
- Testing (status -e, ciphertext proof, clean-room clone, guard regression) → Tasks 6/9. ✓

**Placeholder scan:** No TBD/TODO; every step has concrete commands/code. ✓

**Type/name consistency:** guard subcommands `is-encrypted` / `check-staged` / `check-tracked` used identically across script, hook, CI, and tasks; glob set identical in `.gitattributes`, the guard `is_managed`, and docs. ✓

**Known dependency:** Task 7 needs `kubectl --context fleet` reachability; if down, defer that one task — it does not block the rest.
