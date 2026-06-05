---
title: Worktree git-crypt safety + frontmatter-hook repair Implementation Plan
ticket_id: T000426
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
---

# Worktree git-crypt safety + frontmatter-hook repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `git worktree add` survive git-crypt-managed paths (T000426) and make `plan-frontmatter-hook.sh` repair an existing-but-incomplete frontmatter in place instead of skipping it (T000422).

**Architecture:** Two independent shell-script fixes plus skill/doc rewiring. (1) A new `scripts/worktree-create.sh <branch> <path> [base]` wraps `git worktree add --no-checkout` and then either copies the git-crypt key into the new per-worktree gitdir (unlocked → decrypted, fully functional) or neutralizes the git-crypt filters worktree-locally (locked → keyless passthrough), then checks out and inits submodules. (2) `scripts/plan-frontmatter-hook.sh` gains an "incomplete frontmatter" branch that fills `domains` (when `[]`/`null`/missing → re-derive from the body) and `status` (when missing/`null` → `active`), preserving all other fields and any deliberate non-active status. Both fixes are TDD: the failing bats suites already exist on this branch.

**Tech Stack:** Bash, awk, git worktrees, git-crypt, BATS (bats-core), go-task.

**Ticket:** T000426 (with T000422 folded in).

**Pre-existing red tests on this branch (do not rewrite — make them pass):**
- `tests/unit/plan-frontmatter-hook.bats` — 3 red (`domains: []`, missing status, `domains: null`), 4 green guards.
- `tests/unit/worktree-create.bats` — 4 red (helper missing), 1 green (plain `git worktree add` fails on the fake git-crypt filter, proving the simulation is faithful).

---

## File Structure

- **Create** `scripts/worktree-create.sh` — git-crypt-safe worktree creator. One responsibility: produce a usable worktree.
- **Rewrite** `scripts/plan-frontmatter-hook.sh` — add/repair frontmatter. One responsibility: ensure `domains`+`status` are routable.
- **Modify** `Taskfile.yml` — register both bats files under `test:unit` (it is a curated list, not a glob; unregistered files are NOT CI-gated).
- **Modify** `.claude/skills/dev-flow-plan/SKILL.md` — feature + fix worktree blocks call the helper.
- **Modify** `.claude/skills/superpowers/using-git-worktrees/SKILL.md` — helper is the canonical create; drop the now-obsolete secrets-symlink step.
- **Modify (doc, illustrative)** `scripts/factory/pipeline-pattern.md` — reference the helper.

---

## Task 1: Repair `scripts/plan-frontmatter-hook.sh` (T000422)

**Files:**
- Modify: `scripts/plan-frontmatter-hook.sh` (full rewrite)
- Test: `tests/unit/plan-frontmatter-hook.bats` (already present, red)

- [ ] **Step 1: Confirm the tests fail against the current hook**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/plan-frontmatter-hook.bats`
Expected: tests 2, 3, 4 FAIL (`domains:`/`status:` grep failures); tests 1, 5, 6, 7 pass.

- [ ] **Step 2: Replace the script with the repair-capable version**

Overwrite `scripts/plan-frontmatter-hook.sh` with exactly:

```bash
#!/usr/bin/env bash
# Ensure a plan file has COMPLETE YAML frontmatter (domains + status) that
# scripts/plan-context.sh can route on.
#   - No frontmatter           → derive domains, prepend a full block.
#   - Frontmatter, complete     → no-op (idempotent).
#   - Frontmatter, incomplete   → repair IN PLACE: fill domains when []/null/
#                                 missing (re-derived from the body), and set
#                                 status: active when missing/null. All other
#                                 fields (title/ticket_id/pr_number) and any
#                                 deliberate non-active status are preserved.
# Usage: scripts/plan-frontmatter-hook.sh <plan.md>
set -euo pipefail

FILE="${1:?Usage: plan-frontmatter-hook.sh <plan.md>}"

CANON_ROLES="infra website db ops test security"

# Derive canonical role tokens from content on stdin (mirrors CLAUDE.md routing).
_derive_domains() {
    local content; content="$(cat)"
    local domains=()
    grep -qiE 'website/|astro|svelte|component|homepage|kore|brand|css|ui|frontend' <<<"$content" && domains+=(website)
    grep -qiE 'k3d/|prod[-/]|manifest|kustomize|overlay|Taskfile|environments/|deploy.*k8s' <<<"$content" && domains+=(infra)
    grep -qiE 'database|postgresql|psql|schema|query|backup.*db|restore.*db|tickets\.|v_timeline' <<<"$content" && domains+=(db)
    grep -qiE 'pod |logs |kubectl|deployment|crash|CrashLoop|health.*check' <<<"$content" && domains+=(ops)
    grep -qiE 'tests/|\.bats|\.spec\.ts|playwright|runner\.sh|BATS|FA-|SA-|NFA-|AK-' <<<"$content" && domains+=(test)
    grep -qiE 'SealedSecret|Keycloak|OIDC|DSGVO|credentials|rotate|certificate|secret' <<<"$content" && domains+=(security)
    printf '%s\n' "${domains[@]}"
}

# space-separated roles -> "[a, b]"; empty -> "[]"
_domains_to_yaml() {
    local input="$1"
    if [[ -n "${input// }" ]]; then
        echo "[$(echo "$input" | tr ' ' '\n' | grep -v '^$' | sed 's/.*/, &/' | tr -d '\n' | sed 's/^, //')]"
    else
        echo "[]"
    fi
}

# true iff line 1 is exactly --- AND a closing --- exists on a later line
_has_frontmatter() {
    [[ "$(head -1 "$FILE")" == "---" ]] || return 1
    awk 'NR==1{next} /^---$/{found=1; exit} END{exit !found}' "$FILE"
}

# content after the closing frontmatter --- (for derivation); whole file if none
_body() {
    if _has_frontmatter; then
        awk 'BEGIN{n=0} /^---$/{n++; next} n>=2{print}' "$FILE"
    else
        cat "$FILE"
    fi
}

# value of KEY inside the frontmatter block (first pair of ---); empty if absent
_fm_field() {
    awk -v key="$1" '
        BEGIN{f=0}
        /^---$/{f++; next}
        f==1 && $0 ~ "^"key":" { sub("^"key":[ \t]*","",$0); print; exit }
    ' "$FILE" | tr -d '\r'
}

slug="$(basename "$FILE" .md)"
title="$(grep -m1 '^# ' "$FILE" | sed 's/^# //' || true)"
[[ -n "$title" ]] || title="$slug"

# ── Case A: no frontmatter → derive, optional interactive override, prepend ──
if ! _has_frontmatter; then
    derived="$(_body | _derive_domains | tr '\n' ' ' | sed 's/ *$//')"
    domains_input="$derived"
    if [[ -t 0 ]]; then
        echo "Derived domains for $(basename "$FILE"): [${derived:-none}]"
        echo "Press Enter to accept, or type override (space-separated from: $CANON_ROLES):"
        read -r override_input
        [[ -n "$override_input" ]] && domains_input="$override_input"
    fi
    domains_yaml="$(_domains_to_yaml "$domains_input")"
    [[ "$domains_yaml" == "[]" ]] && \
        echo "WARNING: no domain signals found — plan will be invisible to every role until domains are set." >&2
    tmpfile="$(mktemp)"
    {
        printf '%s\n' "---"
        printf 'title: %s\n' "$title"
        printf 'ticket_id: null\n'
        printf 'domains: %s\n' "$domains_yaml"
        printf 'status: active\n'
        printf 'pr_number: null\n'
        printf '%s\n\n' "---"
        cat "$FILE"
    } > "$tmpfile"
    mv "$tmpfile" "$FILE"
    echo "Added frontmatter to $FILE"
    exit 0
fi

# ── Case B/C: frontmatter present → check the routing-critical fields ──
dom_raw="$(_fm_field domains | tr -d ' \t\r')"
st_raw="$(_fm_field status | tr -d ' \t\r')"

needs_domains=0
case "$dom_raw" in ""|"[]"|"null") needs_domains=1 ;; esac
needs_status=0
case "$st_raw" in ""|"null") needs_status=1 ;; esac

if [[ "$needs_domains" -eq 0 && "$needs_status" -eq 0 ]]; then
    echo "Frontmatter already complete in $FILE — nothing to do."
    exit 0
fi

derived="$(_body | _derive_domains | tr '\n' ' ' | sed 's/ *$//')"
derived_yaml="$(_domains_to_yaml "$derived")"
[[ "$needs_domains" -eq 1 && "$derived_yaml" == "[]" ]] && \
    echo "WARNING: domains is empty and no signals found in $FILE — set domains manually." >&2

tmpfile="$(mktemp)"
awk -v derived="$derived_yaml" -v needs_dom="$needs_domains" -v needs_st="$needs_status" '
    BEGIN { infm=0; dom_seen=0; st_seen=0 }
    NR==1 && $0=="---" { print; infm=1; next }
    infm==1 && $0=="---" {
        if (needs_dom==1 && dom_seen==0) print "domains: " derived
        if (needs_st==1  && st_seen==0)  print "status: active"
        print; infm=0; next
    }
    infm==1 && $0 ~ /^domains:/ {
        dom_seen=1
        if (needs_dom==1) { print "domains: " derived } else { print }
        next
    }
    infm==1 && $0 ~ /^status:/ {
        st_seen=1
        if (needs_st==1) { print "status: active" } else { print }
        next
    }
    { print }
' "$FILE" > "$tmpfile"
mv "$tmpfile" "$FILE"
echo "Repaired frontmatter in $FILE (domains=$derived_yaml needs_status=$needs_status)"
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/plan-frontmatter-hook.bats`
Expected: all 7 PASS.

- [ ] **Step 4: Syntax check + smoke against a real placeholder plan**

```bash
bash -n scripts/plan-frontmatter-hook.sh
# smoke: copy one of the repo's orphaned plans and repair it
cp docs/superpowers/plans/2026-05-29-pvc-backup.md /tmp/smoke-plan.md
bash scripts/plan-frontmatter-hook.sh /tmp/smoke-plan.md
grep -E '^(domains|status):' /tmp/smoke-plan.md
rm -f /tmp/smoke-plan.md
```
Expected: exit 0; `domains:` is no longer `[]` (re-derived from the body) and `status: active` present. (If the body genuinely has no signals, expect the WARNING and `domains: []` — acceptable.)

- [ ] **Step 5: Commit**

```bash
git add scripts/plan-frontmatter-hook.sh
git commit -m "fix(plans): repair incomplete frontmatter in place [T000422]"
```

---

## Task 2: Create `scripts/worktree-create.sh` (T000426)

**Files:**
- Create: `scripts/worktree-create.sh`
- Test: `tests/unit/worktree-create.bats` (already present, red)

- [ ] **Step 1: Confirm the tests fail (helper missing)**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/worktree-create.bats`
Expected: test 1 PASS (plain add fails); tests 2–5 FAIL (helper not found / not executable).

- [ ] **Step 2: Write the helper script**

Create `scripts/worktree-create.sh` with exactly:

```bash
#!/usr/bin/env bash
# Create a git worktree that survives git-crypt-managed paths. [T000426]
#
# Why: `git worktree add` runs the git-crypt smudge filter while checking out
# the new worktree, but the new per-worktree gitdir (.git/worktrees/<name>) has
# no git-crypt key, so the checkout fails fatally (exit 128) and the worktree is
# rolled back — even when the MAIN checkout is unlocked. This wrapper creates the
# worktree WITHOUT checkout, then either (a) copies the git-crypt key into the
# worktree gitdir so checkout decrypts normally and ALL later git ops work
# (unlocked repo), or (b) neutralizes the git-crypt filters worktree-locally so
# checkout and later git ops pass encrypted blobs through verbatim, no key needed
# (locked repo). Finally it inits submodules (the BATS runner lives in one).
#
# Usage: scripts/worktree-create.sh <branch> <path> [<base>]
#   <branch>  new branch name, e.g. fix/foo
#   <path>    worktree path, e.g. /tmp/wt-foo
#   <base>    base ref (default: origin/main)
set -euo pipefail

BRANCH="${1:?Usage: worktree-create.sh <branch> <path> [<base>]}"
WT_PATH="${2:?Usage: worktree-create.sh <branch> <path> [<base>]}"
BASE="${3:-origin/main}"

# Absolute path to the SHARED gitdir (.../.git), valid from main or a worktree.
COMMON_DIR="$(cd "$(git rev-parse --git-common-dir)" && pwd)"
KEY_SRC="$COMMON_DIR/git-crypt/keys/default"

# 1) Skeleton without checkout — never runs the smudge filter, so it cannot fail
#    on git-crypt paths.
git worktree add --no-checkout -b "$BRANCH" "$WT_PATH" "$BASE"

WT_GITDIR="$(git -C "$WT_PATH" rev-parse --absolute-git-dir)"

if [ -f "$KEY_SRC" ]; then
    # Unlocked: give the worktree its own copy of the key → real decryption.
    mkdir -p "$WT_GITDIR/git-crypt/keys"
    cp "$KEY_SRC" "$WT_GITDIR/git-crypt/keys/default"
    git -C "$WT_PATH" checkout
else
    # Locked (no key): neutralize git-crypt filters worktree-locally so checkout
    # and all later git ops use cat (passthrough). extensions.worktreeConfig must
    # be enabled before --worktree config entries are honored.
    git -C "$WT_PATH" config extensions.worktreeConfig true
    git -C "$WT_PATH" config --worktree filter.git-crypt.smudge   cat
    git -C "$WT_PATH" config --worktree filter.git-crypt.clean    cat
    git -C "$WT_PATH" config --worktree filter.git-crypt.required false
    git -C "$WT_PATH" checkout
    echo "worktree-create: repo is git-crypt LOCKED — secrets left encrypted-at-rest in $WT_PATH" >&2
fi

# 2) Init submodules (git worktree add does NOT; the BATS runner lives in one).
git -C "$WT_PATH" submodule update --init --recursive --quiet

echo "worktree-create: $WT_PATH ready on branch $BRANCH (base $BASE)"
```

- [ ] **Step 3: Make it executable**

```bash
chmod +x scripts/worktree-create.sh
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/worktree-create.bats`
Expected: all 5 PASS (the `BW01` exit-127 warnings disappear once the helper exists).

- [ ] **Step 5: Syntax check**

Run: `bash -n scripts/worktree-create.sh`
Expected: no output, exit 0. (Also exercised by `scripts.bats`'s "all scripts/*.sh pass bash syntax check".)

- [ ] **Step 6: Commit**

```bash
git add scripts/worktree-create.sh
git commit -m "feat(dev-flow): git-crypt-safe worktree creator [T000426]"
```

---

## Task 3: Register both bats files under `Taskfile.yml` `test:unit`

**Files:**
- Modify: `Taskfile.yml` (parent `test:unit` list ~line 264 + two new internal child tasks ~line 324)

`test:unit` is a curated task list, NOT a directory glob — a new bats file is invisible to `task test:all` / CI until added here.

- [ ] **Step 1: Append the two new child-task references to the parent `test:unit` list**

Find (the tail of the `test:unit:` `cmds:` list, currently ending at `test:unit:website-ci-deploy`):

```yaml
      - task: test:unit:ticket-external-id
      - task: test:unit:website-ci-deploy
```

Replace with:

```yaml
      - task: test:unit:ticket-external-id
      - task: test:unit:website-ci-deploy
      - task: test:unit:plan-frontmatter-hook
      - task: test:unit:worktree-create
```

- [ ] **Step 2: Add the two internal child tasks**

After the `test:unit:ticket-external-id:` block (ends with the `ticket-external-id-sequence.bats` line, ~line 324), insert:

```yaml
  test:unit:plan-frontmatter-hook:
    internal: true
    cmds:
      - ./tests/unit/lib/bats-core/bin/bats tests/unit/plan-frontmatter-hook.bats

  test:unit:worktree-create:
    internal: true
    cmds:
      - ./tests/unit/lib/bats-core/bin/bats tests/unit/worktree-create.bats
```

- [ ] **Step 3: Run the two child tasks via go-task to verify wiring**

Run: `task test:unit:plan-frontmatter-hook && task test:unit:worktree-create`
Expected: both bats suites run and PASS.

- [ ] **Step 4: Validate the Taskfile parses (dry-run)**

Run: `task --list >/dev/null && echo OK`
Expected: `OK` (no YAML/Taskfile parse error).

- [ ] **Step 5: Commit**

```bash
git add Taskfile.yml
git commit -m "test: gate plan-frontmatter-hook + worktree-create bats in test:unit"
```

---

## Task 4: Point the dev-flow skills at the helper + drop the obsolete secrets symlink

**Files:**
- Modify: `.claude/skills/dev-flow-plan/SKILL.md` (feature block ~line 78, fix block ~line 175)
- Modify: `.claude/skills/superpowers/using-git-worktrees/SKILL.md` (post-create checklist + automation note)
- Modify: `scripts/factory/pipeline-pattern.md` (illustrative worktree snippet)

- [ ] **Step 1: dev-flow-plan — Feature path worktree block**

Find:

```bash
git worktree add -b feature/<slug> /tmp/wt-<slug> origin/main
cd /tmp/wt-<slug> && git submodule update --init --recursive
```

Replace with:

```bash
# git-crypt-safe: creates the worktree, handles git-crypt, inits submodules
bash scripts/worktree-create.sh feature/<slug> /tmp/wt-<slug>
cd /tmp/wt-<slug>
```

- [ ] **Step 2: dev-flow-plan — Fix path worktree block**

Find:

```bash
git worktree add -b fix/<slug> /tmp/wt-<slug> origin/main
cd /tmp/wt-<slug> && git submodule update --init --recursive
```

Replace with:

```bash
# git-crypt-safe: creates the worktree, handles git-crypt, inits submodules
bash scripts/worktree-create.sh fix/<slug> /tmp/wt-<slug>
cd /tmp/wt-<slug>
```

- [ ] **Step 3: using-git-worktrees — replace the manual checklist with the helper**

Replace the whole block from the `## Post-Create Checklist (MANDATORY for this repo)` heading (line 34) through the end of the `### Verification` section (line 78) with:

```markdown
## Worktree creation (MANDATORY for this repo)

Always create worktrees with the project helper — it is git-crypt-safe and does
the post-create steps for you:

```bash
bash scripts/worktree-create.sh <branch> <path> [<base>]   # base defaults to origin/main
cd <path>
```

The helper:
1. Runs `git worktree add --no-checkout` (never fails on git-crypt paths).
2. Makes git-crypt work in the new worktree: copies the git-crypt key into the
   worktree gitdir when the repo is unlocked (→ decrypted secrets, all git ops
   work), or neutralizes the git-crypt filters worktree-locally when locked
   (→ keyless passthrough, secrets stay encrypted-at-rest).
3. Runs `git submodule update --init --recursive` (populates the BATS runner under
   `tests/unit/lib/`).

> **Why not a raw `git worktree add`?** Since git-crypt landed (PR #1303),
> `environments/.secrets/**` and `deploy/mcp/claude-code-secrets.yaml` are
> encrypted-managed. A bare `git worktree add` runs the git-crypt smudge filter
> against a key-less worktree gitdir and aborts with
> `smudge filter git-crypt failed` (exit 128). [T000426]

> **No secrets symlink needed.** The old `ln -sfn .../environments/.secrets`
> step (T000383) predates git-crypt, when secrets were gitignored stubs. They are
> now tracked git-crypt blobs that the helper materializes (decrypted when
> unlocked). Do NOT symlink over `environments/.secrets` — that would mask the
> tracked files and make git report them deleted.

### Verification

```bash
# Submodules OK
./tests/unit/lib/bats-core/bin/bats --version

# Secrets present (decrypted when the repo is unlocked)
ls -la environments/.secrets/mentolder.yaml
```
```

- [ ] **Step 4: using-git-worktrees — fix the Automation note**

Replace the `## Automation note` block (lines 96–112) with:

```markdown
## Automation note

`scripts/worktree-create.sh` is the single source of truth for worktree creation:
submodule init AND git-crypt handling happen inside it, for every agent (Claude
Code, Gemini CLI, the Software Factory). There is no PostToolUse dependency — call
the helper explicitly. `dev-flow-plan` (feature + fix paths) and the Software
Factory pipeline all invoke it.
```

- [ ] **Step 5: factory pipeline-pattern.md — point the illustrative snippet at the helper**

Find (≈ line 254):

```
git worktree add -b feature/${args.slug}-${task.id} /tmp/wt-${task.id} origin/main
```

Replace with:

```
bash scripts/worktree-create.sh feature/${args.slug}-${task.id} /tmp/wt-${task.id}
```

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/dev-flow-plan/SKILL.md \
        .claude/skills/superpowers/using-git-worktrees/SKILL.md \
        scripts/factory/pipeline-pattern.md
git commit -m "docs(dev-flow): use worktree-create.sh; drop obsolete secrets symlink [T000426]"
```

---

## Task 5: Full offline verification + test-inventory check

**Files:** none (verification only)

- [ ] **Step 1: Run the full offline test suite**

Run: `task test:all`
Expected: green, including the two new `test:unit:plan-frontmatter-hook` and `test:unit:worktree-create` entries.

- [ ] **Step 2: Confirm the test-inventory does not drift**

`tests/unit/*` is NOT scanned by the inventory generator, so adding these files must NOT change `website/src/data/test-inventory.json`.

```bash
task test:inventory
git diff --exit-code website/src/data/test-inventory.json && echo "inventory unchanged (expected)"
```
Expected: no diff. (If a diff appears, commit the regenerated JSON — CI fails on drift.)

- [ ] **Step 3: Validate manifests are untouched / still valid**

Run: `task workspace:validate`
Expected: passes (no manifest changes in this branch, but CI runs it).

- [ ] **Step 4: Final commit if anything was regenerated**

```bash
git status --short
# only if test-inventory changed in Step 2:
# git add website/src/data/test-inventory.json && git commit -m "chore: regen test-inventory"
```

---

## Self-Review notes

- **Spec coverage:** T000422 → Task 1 (in-place repair: domains []/null/missing, status missing/null, preserve deliberate non-active status, idempotent, no duplicate block). T000426 → Task 2 (helper: key-copy unlocked / neutralize locked / submodule init) + Task 4 (skills call it, obsolete symlink removed). Tests gated → Task 3. Verification → Task 5.
- **Type/name consistency:** helper invoked everywhere as `scripts/worktree-create.sh <branch> <path> [base]`; `test:unit` child tasks named `test:unit:plan-frontmatter-hook` / `test:unit:worktree-create` consistently in both the parent list and the definitions.
- **Out of scope (noted, not done here):** the documented-but-absent `.claude/settings.json` PostToolUse hook is not reintroduced; closing T000422/T000426 happens at PR-merge time via the dev-flow-execute close-out.
