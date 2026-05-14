---
ticket_id: T000363
title: OpenClaw Fresh Install Implementation Plan
domains: []
status: active
pr_number: null
---

# OpenClaw Fresh Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wipe the existing `~/.openclaw/` install (preserve as backup), install OpenClaw fresh on the WSL host via npm, and configure it to use the existing Ollama instance on the GPU host as its chat backend.

**Architecture:** A small `openclaw/` config directory in the repo holds the `.env.example` template, README, and a `Taskfile.openclaw.yml` of operational tasks. OpenClaw itself installs globally via npm (`npm install -g openclaw@latest`) into the WSL user's home; its runtime state lives outside the repo at `~/.openclaw/`. No cluster, GPU host, or `llm-router` change.

**Tech Stack:** Node.js ≥ 22.16 (recommended 24), npm, OpenClaw (gateway daemon), systemd `--user`, go-task (Taskfile), BATS for shell tests, existing Ollama at `http://10.10.0.3:11434/v1`.

---

## File Structure

| Path | Purpose | Tracked |
|---|---|---|
| `openclaw/.env.example` | Template for `~/.openclaw/.env`. Holds `OPENAI_BASE_URL`, `OPENAI_MODEL`, placeholder `OPENAI_API_KEY=ollama`. | Yes |
| `openclaw/README.md` | Bootstrap + rollback runbook. | Yes |
| `Taskfile.openclaw.yml` | Tasks: `backup`, `install`, `configure`, `start`, `status`, `logs`, `restore`, `wipe`. | Yes |
| `tests/unit/openclaw-taskfile.bats` | Shell unit test that validates `Taskfile.openclaw.yml` parses and exposes the expected task names. | Yes |
| `Taskfile.yml` | Add `includes: openclaw: Taskfile.openclaw.yml`. | Yes (modify) |
| `.gitignore` | Add `openclaw/.env` and `~/.openclaw.bak.*/` is N/A (outside repo) — only `.env` line needed. | Yes (modify) |

`~/.openclaw/`, `~/.openclaw.bak.20260514/`, and `~/.openclaw/.env` live on the WSL filesystem and are **never** committed.

---

## Task 1: Add `openclaw/.env.example` template

**Files:**
- Create: `openclaw/.env.example`

- [ ] **Step 1: Write the file**

```bash
cat > openclaw/.env.example <<'EOF'
# OpenClaw configuration — copy to ~/.openclaw/.env and edit.
#
# Backend: existing Ollama on the GPU host (wg-mesh peer at 10.10.0.3).
# OpenAI-compatible endpoint at /v1; OpenClaw treats it as an OpenAI provider.

OPENAI_BASE_URL=http://10.10.0.3:11434/v1
OPENAI_API_KEY=ollama
OPENAI_MODEL=qwen2.5:14b-instruct-q4_K_M

# Optional: gateway port (OpenClaw default 18789)
# OPENCLAW_GATEWAY_PORT=18789

# Optional: log level (debug|info|warn|error)
OPENCLAW_LOG_LEVEL=info
EOF
```

- [ ] **Step 2: Commit**

```bash
git add openclaw/.env.example
git commit -m "feat(openclaw): add env template pointing at local Ollama"
```

---

## Task 2: Add `openclaw/README.md` bootstrap docs

**Files:**
- Create: `openclaw/README.md`

- [ ] **Step 1: Write the file**

```bash
cat > openclaw/README.md <<'EOF'
# OpenClaw

Personal AI assistant gateway, running on the WSL host and using the local
Ollama instance on the GPU box (10.10.0.3) as its chat backend.

This directory only holds:

- `.env.example` — template for `~/.openclaw/.env`
- `README.md` — this file
- (no source — OpenClaw installs globally via npm)

The runtime state (`~/.openclaw/`) lives outside the repo and is never
committed.

## Bootstrap

```bash
task openclaw:backup     # mv ~/.openclaw → ~/.openclaw.bak.<date>
task openclaw:install    # npm install -g openclaw@latest
task openclaw:configure  # openclaw onboard --install-daemon + write ~/.openclaw/.env
task openclaw:start      # systemctl --user restart openclaw
task openclaw:status     # daemon health + curl /healthz
```

Open the OpenClaw web canvas in a browser (URL printed by `openclaw:status`)
and send a message. Watch the daemon log:

```bash
task openclaw:logs
```

## Rollback

```bash
task openclaw:restore
```

This stops + uninstalls OpenClaw, removes the fresh `~/.openclaw/`, and
moves the backup back into place.

## Configuration

`~/.openclaw/.env` is loaded by the daemon at startup. Edit + restart:

```bash
$EDITOR ~/.openclaw/.env
task openclaw:start
```

The default config points at Ollama on `10.10.0.3:11434/v1` with model
`qwen2.5:14b-instruct-q4_K_M`. To switch model, change `OPENAI_MODEL` to
any model `ollama list` shows on the GPU host.

## Why a separate Ollama URL (not llm-router)?

`llm-router` (LiteLLM proxy in-cluster) has no Ingress, so OpenClaw on
WSL can't reach it. Ollama on the GPU box is reachable directly via
`wg-mesh`. Using llm-router would require either an Ingress + auth or
running OpenClaw inside the cluster — both deferred to Phase 2.
EOF
```

- [ ] **Step 2: Commit**

```bash
git add openclaw/README.md
git commit -m "docs(openclaw): bootstrap + rollback runbook"
```

---

## Task 3: Add `Taskfile.openclaw.yml` with all operational tasks

**Files:**
- Create: `Taskfile.openclaw.yml`

- [ ] **Step 1: Write the Taskfile**

```bash
cat > Taskfile.openclaw.yml <<'EOF'
version: "3"

vars:
  OPENCLAW_HOME: '{{.OPENCLAW_HOME | default "/home/patrick/.openclaw"}}'
  OPENCLAW_BACKUP_DIR: '{{.OPENCLAW_HOME}}.bak.20260514'
  OPENCLAW_ENV_TEMPLATE: openclaw/.env.example

tasks:
  backup:
    desc: "Move existing ~/.openclaw to a dated backup directory (no-op if absent)"
    cmds:
      - |
        if [[ -d "{{.OPENCLAW_HOME}}" ]]; then
          if [[ -e "{{.OPENCLAW_BACKUP_DIR}}" ]]; then
            echo "Backup already exists at {{.OPENCLAW_BACKUP_DIR}} — refusing to overwrite."
            exit 1
          fi
          mv "{{.OPENCLAW_HOME}}" "{{.OPENCLAW_BACKUP_DIR}}"
          echo "Moved {{.OPENCLAW_HOME}} → {{.OPENCLAW_BACKUP_DIR}}"
        else
          echo "No existing {{.OPENCLAW_HOME}} — nothing to back up."
        fi

  install:
    desc: "npm install -g openclaw@latest (Node ≥ 22.16 required)"
    preconditions:
      - sh: "node --version | awk -F. '{ exit ($1 == \"v24\" || ($1 == \"v22\" && $2 >= 16)) ? 0 : 1 }'"
        msg: "Node 22.16+ or 24 required (got $(node --version 2>/dev/null || echo 'no node'))"
    cmds:
      - npm install -g openclaw@latest
      - openclaw --version

  configure:
    desc: "Run onboard --install-daemon, then write ~/.openclaw/.env from template"
    deps: [install]
    cmds:
      - |
        if [[ ! -d "{{.OPENCLAW_HOME}}" ]]; then
          openclaw onboard --install-daemon --non-interactive || \
            openclaw onboard --install-daemon
        fi
      - |
        if [[ ! -f "{{.OPENCLAW_HOME}}/.env" ]]; then
          cp "{{.OPENCLAW_ENV_TEMPLATE}}" "{{.OPENCLAW_HOME}}/.env"
          chmod 600 "{{.OPENCLAW_HOME}}/.env"
          echo "Wrote {{.OPENCLAW_HOME}}/.env from template — edit if defaults are wrong."
        else
          echo "{{.OPENCLAW_HOME}}/.env already exists — leaving untouched."
        fi
      - task: start

  start:
    desc: "Restart the systemd --user openclaw service"
    cmds:
      - systemctl --user daemon-reload
      - systemctl --user restart openclaw
      - systemctl --user status openclaw --no-pager | head -20

  status:
    desc: "Show daemon status + gateway health probe"
    cmds:
      - systemctl --user is-active openclaw && echo "daemon: active" || echo "daemon: inactive"
      - |
        port="${OPENCLAW_GATEWAY_PORT:-18789}"
        curl -sS --max-time 3 "http://127.0.0.1:${port}/healthz" \
          && echo "" \
          || echo "gateway healthz did not respond on port ${port}"
      - |
        echo ""
        echo "Backend reachability check (Ollama on 10.10.0.3:11434):"
        curl -sS --max-time 3 http://10.10.0.3:11434/v1/models | head -c 400 \
          && echo "" \
          || echo "WARNING: Ollama not reachable from WSL"

  logs:
    desc: "Tail daemon log via journalctl --user"
    cmds:
      - journalctl --user -u openclaw -n 100 --no-pager

  restore:
    desc: "Roll back: stop daemon, uninstall, remove fresh ~/.openclaw, move backup back"
    cmds:
      - systemctl --user disable --now openclaw || true
      - npm uninstall -g openclaw || true
      - rm -rf "{{.OPENCLAW_HOME}}"
      - |
        if [[ -d "{{.OPENCLAW_BACKUP_DIR}}" ]]; then
          mv "{{.OPENCLAW_BACKUP_DIR}}" "{{.OPENCLAW_HOME}}"
          echo "Restored {{.OPENCLAW_BACKUP_DIR}} → {{.OPENCLAW_HOME}}"
        else
          echo "No backup at {{.OPENCLAW_BACKUP_DIR}} — fresh install fully removed."
        fi

  wipe:
    desc: "Destructive: remove fresh ~/.openclaw AND backup. Requires CONFIRM=yes"
    cmds:
      - |
        if [[ "${CONFIRM:-}" != "yes" ]]; then
          echo "Refusing — set CONFIRM=yes to wipe both {{.OPENCLAW_HOME}} and {{.OPENCLAW_BACKUP_DIR}}"
          exit 1
        fi
      - systemctl --user disable --now openclaw || true
      - npm uninstall -g openclaw || true
      - rm -rf "{{.OPENCLAW_HOME}}" "{{.OPENCLAW_BACKUP_DIR}}"
      - echo "Wiped."
EOF
```

- [ ] **Step 2: Commit**

```bash
git add Taskfile.openclaw.yml
git commit -m "feat(openclaw): add operational Taskfile (backup/install/configure/start/status/logs/restore/wipe)"
```

---

## Task 4: Wire `Taskfile.openclaw.yml` into root `Taskfile.yml`

**Files:**
- Modify: `Taskfile.yml` (top of file, in the `includes:` block)

- [ ] **Step 1: Inspect existing includes**

```bash
grep -nA 12 "^includes:" Taskfile.yml | head -20
```

Expected: an `includes:` block at the top listing other `Taskfile.*.yml` files (e.g. `argocd`, `brainstorm`, `llm`).

- [ ] **Step 2: Add the openclaw include**

Use the Edit tool to add `openclaw: Taskfile.openclaw.yml` alphabetically into the existing `includes:` block. Example resulting block (your exact lines may differ):

```yaml
includes:
  argocd: Taskfile.argocd.yml
  brainstorm: Taskfile.brainstorm.yml
  llm: Taskfile.llm.yml
  openclaw: Taskfile.openclaw.yml
```

- [ ] **Step 3: Verify task discovery**

```bash
task --list-all 2>&1 | grep -E '^\* openclaw:'
```

Expected: lines for `openclaw:backup`, `:install`, `:configure`, `:start`, `:status`, `:logs`, `:restore`, `:wipe`.

- [ ] **Step 4: Commit**

```bash
git add Taskfile.yml
git commit -m "chore(taskfile): include openclaw tasks"
```

---

## Task 5: Ignore `openclaw/.env` in git

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Check if already ignored**

```bash
grep -n "^openclaw/" .gitignore || echo "no openclaw/ ignore rules"
```

- [ ] **Step 2: Add the rule**

If no rule exists, append. Use the Edit tool to add a section near similar service-config-ignore blocks (search `.env` for context). The line to add:

```
# OpenClaw — runtime config has secrets; only template is committed
openclaw/.env
```

- [ ] **Step 3: Verify**

```bash
echo "test" > openclaw/.env
git check-ignore openclaw/.env
rm openclaw/.env
```

Expected: `openclaw/.env` is printed by `check-ignore` (means: ignored).

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore(gitignore): exclude openclaw/.env (template stays committed)"
```

---

## Task 6: Add BATS unit test for `Taskfile.openclaw.yml` shape

**Files:**
- Create: `tests/unit/openclaw-taskfile.bats`

- [ ] **Step 1: Write the failing test**

```bash
cat > tests/unit/openclaw-taskfile.bats <<'EOF'
#!/usr/bin/env bats

# Validates Taskfile.openclaw.yml parses and declares the expected task names.

setup() {
  cd "${BATS_TEST_DIRNAME}/../.."
}

@test "Taskfile.openclaw.yml parses as YAML" {
  run python3 -c "import yaml,sys; yaml.safe_load(open('Taskfile.openclaw.yml'))"
  [ "$status" -eq 0 ]
}

@test "Taskfile.openclaw.yml declares all required tasks" {
  for t in backup install configure start status logs restore wipe; do
    run grep -E "^  ${t}:" Taskfile.openclaw.yml
    [ "$status" -eq 0 ] || { echo "missing task: ${t}"; return 1; }
  done
}

@test ".env.example points at the local Ollama URL" {
  grep -qE '^OPENAI_BASE_URL=http://10\.10\.0\.3:11434/v1$' openclaw/.env.example
}

@test ".env.example sets a chat model" {
  grep -qE '^OPENAI_MODEL=qwen2\.5:' openclaw/.env.example
}

@test "Root Taskfile.yml includes openclaw" {
  grep -qE '^\s+openclaw:\s+Taskfile\.openclaw\.yml' Taskfile.yml
}

@test ".gitignore excludes openclaw/.env" {
  grep -qE '^openclaw/\.env$' .gitignore
}
EOF
chmod +x tests/unit/openclaw-taskfile.bats
```

- [ ] **Step 2: Run to verify it passes (all wiring from Tasks 1–5 exists)**

```bash
bats tests/unit/openclaw-taskfile.bats
```

Expected: 6 tests pass. If any fails, fix the underlying file (do **not** weaken the test).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/openclaw-taskfile.bats
git commit -m "test(openclaw): unit-test Taskfile + .env.example shape"
```

---

## Task 7: Local pre-flight verification (no commit — runtime check)

This task **does not modify the repo**. It's a checklist you run on the WSL host before doing the install for real.

- [ ] **Step 1: Node version**

```bash
node --version
```

Expected: `v22.16.x` or higher, OR `v24.x.x`. If older, install via `nvm` first.

- [ ] **Step 2: Ollama reachability**

```bash
curl -sS --max-time 3 http://10.10.0.3:11434/v1/models | head -c 600
```

Expected: a JSON object with a `data:` array including `qwen2.5:14b-instruct-q4_K_M`. If timeout, check `wg-mesh`: `wg show wg-mesh | head` should show the GPU host as a peer. If model missing, run `ssh gpu-host 'ollama pull qwen2.5:14b-instruct-q4_K_M'`.

- [ ] **Step 3: systemctl --user works**

```bash
systemctl --user is-system-running
```

Expected: `running` or `degraded` (both OK). If `offline`, the user instance isn't running — this is an OpenClaw blocker. Run `loginctl enable-linger patrick` and re-login.

- [ ] **Step 4: ~/.openclaw audit**

```bash
ls -la ~/.openclaw/ 2>&1 | head -20
```

Expected: prior install present (agents/, identity/, credentials/, memory/, tasks/). If missing, `task openclaw:backup` becomes a no-op — fine.

If any of these fail, **stop** and resolve before Task 8.

---

## Task 8: Run the bootstrap (no commit — runtime install)

**Files touched:** none in repo. This task installs OpenClaw on the WSL host and creates `~/.openclaw/`.

- [ ] **Step 1: Backup**

```bash
task openclaw:backup
```

Expected: `Moved /home/patrick/.openclaw → /home/patrick/.openclaw.bak.20260514`. If output says "No existing ~/.openclaw — nothing to back up.", fine.

- [ ] **Step 2: Install**

```bash
task openclaw:install
```

Expected: npm download + global install completes; `openclaw --version` prints a version line.

- [ ] **Step 3: Configure (runs onboard + writes .env + restarts daemon)**

```bash
task openclaw:configure
```

Expected (in order):
1. `openclaw onboard --install-daemon` runs — may prompt for a passphrase or pair code; follow prompts.
2. A new `~/.openclaw/.env` is written from `openclaw/.env.example` and chmod 600.
3. Systemd `--user` restart of `openclaw` succeeds; `status` shows `active (running)`.

If onboard hangs on an interactive prompt and you wanted non-interactive, kill with Ctrl-C, run `openclaw onboard` manually (interactive), then `task openclaw:start` after.

- [ ] **Step 4: Status check**

```bash
task openclaw:status
```

Expected: `daemon: active`, gateway healthz returns JSON, Ollama reachability prints model JSON.

- [ ] **Step 5: End-to-end smoke**

In one terminal:
```bash
task openclaw:logs
```

In a browser, open the OpenClaw web canvas (URL/port shown in the daemon log on first start, default `http://127.0.0.1:18789`). Send the message: `Reply with exactly the word "ping" and nothing else.`

Expected: response shows up in the canvas, log shows an outbound HTTP call to `http://10.10.0.3:11434/v1/chat/completions`. Then verify on the GPU host:

```bash
ssh gpu-host journalctl -u ollama --since '2 min ago' | tail -20
```

Expected: a recent entry for the qwen2.5:14b model.

If the smoke fails (no response, timeout, error in log), capture the daemon log + `task openclaw:status` output and bring it back to a debugging session — **do not** fix forward in this plan.

---

## Task 9: Update CLAUDE.md "Local-first LLM pipeline" section pointer

**Files:**
- Modify: `CLAUDE.md` (the existing `### Local-first LLM pipeline` subsection in `## Gotchas & Footguns`)

- [ ] **Step 1: Locate the section**

```bash
grep -n "### Local-first LLM pipeline" CLAUDE.md
```

- [ ] **Step 2: Append a one-line pointer**

Use the Edit tool. Add a new bullet at the **end** of the existing list under that subsection:

```
- **OpenClaw on the WSL host** (`openclaw/`, `Taskfile.openclaw.yml`) talks directly to Ollama on `10.10.0.3:11434/v1`, **not** through `llm-router` — llm-router has no Ingress, and adding one is Phase 2 work. Bootstrap: `task openclaw:install && task openclaw:configure`.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): note OpenClaw uses Ollama direct, not llm-router"
```

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - Backup `~/.openclaw` → Task 8 step 1 (uses task from Task 3)
  - npm install → Task 8 step 2 (uses task from Task 3)
  - `openclaw/` config dir with `.env.example` + README → Tasks 1, 2
  - `Taskfile.openclaw.yml` with backup/install/configure/start/status/logs/restore/wipe → Task 3
  - `.gitignore` excludes `openclaw/.env` → Task 5
  - Pre-flight: Node version + Ollama reachability → Task 7
  - End-to-end smoke (web canvas roundtrip + Ollama log check) → Task 8 step 5
  - Rollback documented → Task 2 (README) + Task 3 (`restore` task body)
  - No cluster/GPU host changes → confirmed (only `openclaw/`, `Taskfile.openclaw.yml`, `Taskfile.yml`, `.gitignore`, `tests/unit/`, `CLAUDE.md` touched)

- [x] **Placeholders:** none found.
- [x] **Type consistency:** task names (`backup/install/configure/start/status/logs/restore/wipe`) match between Task 3 (Taskfile body), Task 6 (BATS test), Task 8 (runtime invocation). `OPENCLAW_HOME` and `OPENCLAW_BACKUP_DIR` Taskfile vars are referenced consistently.

---

## Execution Handoff

This plan is staged for `dev-flow-execute`. The `dev-flow-plan` skill will commit the plan + spec + ticket-id and push the branch, then stop. Run `dev-flow-execute` when ready to implement.
