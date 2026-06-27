---
title: antigravity-cli gh sandbox pre-grant fix
ticket_id: T001274
domains: [agy-cli, tooling]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# antigravity-cli-gh-sandbox — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-grant `Bash(gh *)` / `Bash(gh-axi *)` permissions in the antigravity-cli `settings.json` so agents can run `gh` directly without an interactive-but-non-matching permission prompt, and document the behavior.

**Architecture:** The antigravity-cli is a Claude Code instance living under `~/.gemini/antigravity-cli/`. Its sandbox interceptor checks each Bash command against the `permissions.allow` list in `settings.json`. Without a `Bash(gh *)` entry, a direct `gh` call triggers an interactive prompt that does not match the `custom(gh.read(...))` grant the user issues, so the command fails. The fix adds the missing allow-list entries (a host-level config file, not in the repo) and documents the root cause in `CONTRIBUTING.md`. A BATS guard in the repo verifies the config is correct on machines where the CLI is installed.

**Tech Stack:** Bash, BATS, Python 3 (test JSON parsing), JSON config.

## Global Constraints

- The antigravity-cli config file `~/.gemini/antigravity-cli/settings.json` is a **host-level file, NOT tracked in the repo**. It must be edited in place; do not copy it into the repo.
- The BATS test `tests/spec/mcp-tooling.bats` already contains the failing test `antigravity-cli settings.json pre-grants Bash(gh *) permission` — do NOT rewrite it; make it pass.
- The test `skip`s when `~/.gemini/antigravity-cli/settings.json` is absent, so it stays green on CI machines without the CLI and turns green on this host once the fix is applied.
- Editing `settings.json` must be a JSON merge — preserve every existing key; only add/extend `permissions.allow`.

## File Structure

- `~/.gemini/antigravity-cli/settings.json` — host-level antigravity-cli config (NOT in repo). Gains a `permissions.allow` list containing `Bash(gh *)` and `Bash(gh-axi *)`.
- `tests/spec/mcp-tooling.bats` — already holds the failing guard test (lines 42-65). No edit; used to prove red→green.
- `CONTRIBUTING.md` — gains a new `### antigravity-cli Permissions` section after the existing `### MCP-Erweiterung & Tool-Registrierung` section.

---

### Task 1: Confirm the failing guard test (red)

**Files:**
- Test: `tests/spec/mcp-tooling.bats:44-65`

**Interfaces:**
- Consumes: nothing.
- Produces: a documented red state for the guard test that Task 2 turns green.

The guard test already exists in the repo; this task only runs it to confirm it is currently red on this host (where the antigravity-cli is installed but `settings.json` lacks the gh allow-entry).

- [ ] **Step 1: Read the existing guard test**

The test under verification is `tests/spec/mcp-tooling.bats` lines 44-65:

```bash
@test "antigravity-cli settings.json pre-grants Bash(gh *) permission" {
  local settings="$HOME/.gemini/antigravity-cli/settings.json"
  if [ ! -f "$settings" ]; then
    skip "antigravity-cli not installed on this machine (settings.json absent)"
  fi
  # The permissions.allow list must contain an entry matching 'gh'
  python3 - "$settings" <<'PYEOF'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    allows = d.get("permissions", {}).get("allow", [])
    has_gh = any("gh" in entry for entry in allows)
    if not has_gh:
        print("# ERROR: permissions.allow missing Bash(gh *) entry", file=sys.stderr)
        print("# Current allows:", allows, file=sys.stderr)
        sys.exit(1)
    sys.exit(0)
except Exception as e:
    print(f"# ERROR parsing settings.json: {e}", file=sys.stderr)
    sys.exit(1)
PYEOF
}
```

- [ ] **Step 2: Run the guard test to verify it fails**

Run: `npx bats tests/spec/mcp-tooling.bats -f "pre-grants Bash"`
Expected: FAIL — the test reports `permissions.allow missing Bash(gh *) entry` (the settings.json exists on this host but has no gh allow-entry yet). This is the `expected: FAIL` red state.

> If instead the test reports `skip` (antigravity-cli not installed), Task 2's config edit cannot be applied on this machine; record the skip and proceed — the guard then stays green via skip and the CONTRIBUTING change still ships.

---

### Task 2: Add gh pre-grants to antigravity-cli settings.json (green)

**Files:**
- Modify: `~/.gemini/antigravity-cli/settings.json` (host-level, NOT in repo)

**Interfaces:**
- Consumes: the red guard test from Task 1.
- Produces: a `permissions.allow` array in `settings.json` containing `Bash(gh *)` and `Bash(gh-axi *)`, which turns the guard green.

- [ ] **Step 1: Back up the current settings.json**

```bash
cp ~/.gemini/antigravity-cli/settings.json ~/.gemini/antigravity-cli/settings.json.bak
```

- [ ] **Step 2: Merge the gh allow-entries into permissions.allow**

This `jq` merge preserves all existing keys and only adds the two gh entries to `permissions.allow` (creating the path if absent, de-duplicating):

```bash
jq '.permissions = (.permissions // {})
    | .permissions.allow = ((.permissions.allow // []) + ["Bash(gh *)", "Bash(gh-axi *)"] | unique)' \
  ~/.gemini/antigravity-cli/settings.json > ~/.gemini/antigravity-cli/settings.json.new \
  && mv ~/.gemini/antigravity-cli/settings.json.new ~/.gemini/antigravity-cli/settings.json
```

- [ ] **Step 3: Verify the file is valid JSON and contains both entries**

Run: `jq '.permissions.allow' ~/.gemini/antigravity-cli/settings.json`
Expected: an array that includes `"Bash(gh *)"` and `"Bash(gh-axi *)"`.

- [ ] **Step 4: Run the guard test to verify it passes**

Run: `npx bats tests/spec/mcp-tooling.bats -f "pre-grants Bash"`
Expected: PASS (1 test, 0 failures).

- [ ] **Step 5: Remove the backup**

```bash
rm -f ~/.gemini/antigravity-cli/settings.json.bak
```

There is nothing to commit in this task — the edited file lives outside the repo. The repo-side proof of this fix is the now-green guard test (verified in Task 4) plus the CONTRIBUTING section (Task 3).

---

### Task 3: Document the permission behavior in CONTRIBUTING.md

**Files:**
- Modify: `CONTRIBUTING.md` (after the `### MCP-Erweiterung & Tool-Registrierung` section, currently the last section)

**Interfaces:**
- Consumes: the root-cause understanding established by Tasks 1-2.
- Produces: a `### antigravity-cli Permissions` section explaining why direct `gh` fails and how to pre-grant it.

- [ ] **Step 1: Append the new section to CONTRIBUTING.md**

Add this section immediately after the existing `### MCP-Erweiterung & Tool-Registrierung` block (it becomes the new final section):

```markdown
### antigravity-cli Permissions

Die antigravity-cli (eine Claude-Code-Instanz unter `~/.gemini/antigravity-cli/`) prüft jeden Bash-Aufruf gegen die `permissions.allow`-Liste in `~/.gemini/antigravity-cli/settings.json`. Diese Datei liegt **außerhalb des Repos** (host-lokal, nicht getrackt).

**Root Cause eines bekannten Mishaps (T001274):** Fehlt ein `Bash(gh *)`-Eintrag in `permissions.allow`, löst ein direkter `gh`-Aufruf eine interaktive Permission-Anfrage aus. Selbst wenn der User dann `custom(gh.read(...))` gewährt, matcht dieser Grant **nicht** das interne `Bash(gh *)`-Schema des Interceptors — der Befehl schlägt mit „permission denied" fehl.

**Workaround (nicht der Fix):** `bash -c "gh ..."` umgeht das Problem, weil der Interceptor dann `bash` statt `gh` prüft. Das ist ein Notbehelf, kein Ersatz für korrektes Pre-Granting.

**Korrekter Fix:** In `~/.gemini/antigravity-cli/settings.json` einen `permissions.allow`-Block pflegen, der `gh` (und `gh-axi`) vorermächtigt:

\`\`\`json
{
  "permissions": {
    "allow": ["Bash(gh *)", "Bash(gh-axi *)"]
  }
}
\`\`\`

Bei einer JSON-Merge-Bearbeitung bestehende Keys bewahren — nur `permissions.allow` ergänzen. Der BATS-Guard `antigravity-cli settings.json pre-grants Bash(gh *) permission` in `tests/spec/mcp-tooling.bats` verifiziert diese Konfiguration (er `skip`t auf Maschinen ohne installierte antigravity-cli).
```

- [ ] **Step 2: Verify the section renders and sits in the right place**

Run: `grep -n "### antigravity-cli Permissions" CONTRIBUTING.md`
Expected: one match, on a line after the `### MCP-Erweiterung & Tool-Registrierung` heading.

- [ ] **Step 3: Commit the documentation change**

```bash
git add CONTRIBUTING.md
git commit -m "docs(contributing): document antigravity-cli gh pre-grant permissions [T001274]"
```

---

### Task 4: Verify the full suite and freshness gates

**Files:**
- Verify only — no source edits.

**Interfaces:**
- Consumes: the green guard (Task 2) and the documented section (Task 3).
- Produces: a clean test + freshness state ready for PR.

- [ ] **Step 1: Run the full mcp-tooling spec**

Run: `npx bats tests/spec/mcp-tooling.bats`
Expected: PASS — all 3 tests green (the two pre-existing ticket-mcp guards plus the antigravity-cli gh pre-grant guard).

- [ ] **Step 2: Run the changed-file test gate**

Run: `task test:changed`
Expected: PASS — the offline suite for changed files is green.

- [ ] **Step 3: Regenerate freshness artifacts**

Run: `task freshness:regenerate`
Expected: regenerates generated docs/index artifacts; stage any resulting changes.

- [ ] **Step 4: Verify freshness is clean**

Run: `task freshness:check`
Expected: PASS — no stale generated artifacts.

- [ ] **Step 5: Commit any freshness regen output**

```bash
git add -A
git commit -m "chore(freshness): regenerate artifacts for antigravity-cli gh fix [T001274]" || echo "nothing to commit"
```
