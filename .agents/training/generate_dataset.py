#!/usr/bin/env python3
"""
Dataset generator for fine-tuning Qwen3.5-4B-MTP on the Bachelorprojekt workspace.

Replaces the stale Qwen2.5-7B generator (prefix-inflated ~180 pairs). Design per
DATASET_PLAN.md:

  T1  deterministic fact-base x hand-written question stems (offline, stdlib-only)
  T2  optional teacher scale-up via the local Qwen3.8-27B rail on :1919
  Dedup: normalized exact + 3-gram shingle Jaccard (>= 0.60 drop) + answer cap
  Output: dataset.jsonl (+ train/val split 95/5) + dataset_stats.json

Usage:
  python3 .agents/training/generate_dataset.py                 # T1 only
  python3 .agents/training/generate_dataset.py --slice-2b       # T900978 2B pilot slice
  python3 .agents/training/generate_dataset.py --teacher --target 1100
  python3 .agents/training/generate_dataset.py --teacher-url http://127.0.0.1:1919
"""

import argparse
import hashlib
import json
import random
import re
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent

SYSTEM_PROMPT = (
    "You are the Bachelorprojekt assistant. You provide direct, accurate technical answers, "
    "terminal commands, and architecture guidance with minimal filler and zero hallucinations."
)

# Jaccard threshold for near-dup questions (3-gram shingles)
NEAR_DUP_JACCARD = 0.60
# max entries sharing the same normalized answer per domain
ANSWER_CAP_PER_DOMAIN = 4
MIN_NORMALIZED_LEN = 12
VAL_FRACTION = 0.05
SEED = 3407

# P1 (T900978) 2B pilot slice: operational domains with exact anchors
# (command, path/overlay, context). Dependent partials (P2 train, P3 eval)
# build on the slice outputs dataset_2b_*.jsonl.
SLICE_2B_DOMAINS = {"cli", "gotchas", "workflow", "runbooks", "ci", "llmstack"}
# P1 (T900979) 0.8B minimal slice: mechanical tasks (renames, lockfile bumps, doc-syncs, CLI basics)
SLICE_08B_DOMAINS = {"cli", "gotchas", "boilerplate"}
# Anchor: executable command OR repo path/overlay OR task target in the answer.
ANCHOR_RE = (
    r"(?:```|\b(?:task|bash|git|curl|kubectl|systemctl|python3?|node|nvidia-smi)\s+\S"
    r"|[a-zA-Z0-9_./-]+\.(?:md|yaml|yml|json|jsonc|mjs|sh|py)"
    r"|ENV=|fleet|devmesh|:8080|:1919)")

REPO = HERE.parent.parent  # repo root (script lives in .agents/training/)

# Role boundary (DATASET_PLAN.md §0): this is an INSTRUCT worker — execution only.
# Planner/orchestrator/reviewer trajectories train a different (27B/cloud) model.
EXECUTION_ROLES = {"code-worker"}

# System-prompt mix: robustness against harness prompt drift
SYSTEM_MIX = [
    (0.70, SYSTEM_PROMPT),
    (0.10, None),  # no system message at all
    (0.10, "You are the Bachelorprojekt worker. Execute the given packet directly; "
           "verify against repo facts; answer concisely."),
    (0.10, "Du bist der Bachelorprojekt-Assistent. Antworte direkt, präzise und ohne "
           "Geschwafel mit korrekten Befehlen und Architektur-Fakten."),
]

TEACHER_TOPICS = [
    "cli-oracle", "deploy-mentolder", "korczewski-freeze", "ticket-lifecycle",
    "dev-flow-plan-execute", "agent-locking", "mcp-registry", "ci-gates",
    "llm-rail-8080", "llm-rail-1919", "gpu-lock-and-vram", "gotchas-env-resolve",
    "gotchas-postgres", "gotchas-worktrees", "runbook-credentials", "sealed-secrets",
    "package-managers", "worktree-workflow", "plan-runner", "release-notes",
]

TEACHER_SYSTEM = (
    "You generate fine-tuning data for the Bachelorprojekt workspace assistant. "
    "The workspace is a Kubernetes-based self-hosted collaboration platform (bachelor thesis). "
    "Output ONLY a JSON array of objects with keys 'question' and 'answer'. "
    "Rules: questions are realistic agent/user queries (1 sentence, varied phrasing); answers are "
    "1-6 sentences, may include one executable code block, must be verifiable against the given "
    "context, never invent ports, ticket IDs or credentials, never include secret values. "
    "No markdown headers, no commentary outside the JSON array. "
    "Workspace anchors you may rely on: Task Oracle `bash scripts/vda.sh oracle '<goal>'` "
    "(never guess commands); production deploy `task workspace:deploy ENV=mentolder` "
    "(korczewski frozen since 2026-07-23, never deploy there); only contexts `fleet` and "
    "`devmesh`; primary 27B rail :1919 (Qwen3.8-27B IQ3_XXS-mtp), worker pool :8080 "
    "(Qwen3.5-4B-MTP, 3 slots, 98304 shared KV, Windows-native); branch prefixes "
    "feature/fix/chore/docs with squash-merge only; agents bp-build/bp-run/bp-ship; "
    "CI gates: task test:changed, task freshness:check, task workspace:validate. "
    "If a question needs facts beyond these anchors, answer conservatively and point to "
    "the owning doc instead of inventing details."
)


def F(domain, stems, answer):
    """Fact tuple: domain, list of question stems, canonical answer."""
    return (domain, stems, answer)


# ---------------------------------------------------------------------------
# FACT BASE — curated from AGENTS.md, docs/agent-guide, runbooks, agent-models
# and the 2026-10 LLM-stack measurements. Every stem is a genuine rephrasing.
# ---------------------------------------------------------------------------
FACTS = [
    # ================= cli =================
    F("cli", [
        "How do I find the right command without guessing Taskfile targets?",
        "What is the rule for looking up task commands in this repo?",
        "I need a command for a goal but don't know the Taskfile syntax — what do I use?",
        "Which tool resolves a plain-English goal into the correct repo command?",
    ], "Use the Task Oracle — never guess or hardcode commands:\n\n```bash\nbash scripts/vda.sh oracle '<goal in plain English>'\n```\n\nFlags: `--dry-run`/`-n` to preview, `--json` for structured output, `--quiet`/`-q` for scripts."),
    F("cli", [
        "How can I preview what the Task Oracle would run without executing it?",
        "Is there a dry-run mode for vda.sh oracle?",
    ], "Yes, pass `--dry-run` (or `-n`):\n\n```bash\nbash scripts/vda.sh oracle --dry-run 'deploy the workspace'\n```\nIt prints the resolved command without executing it."),
    F("cli", [
        "How do I get machine-readable output from the Task Oracle for scripts?",
        "Can vda.sh oracle emit JSON?",
    ], "Add `--json` for structured output or `--quiet`/`-q` for silent execution in scripts:\n\n```bash\nbash scripts/vda.sh oracle --json 'validate manifests'\n```"),
    F("cli", [
        "What is the command to deploy the workspace to production?",
        "How do I deploy to the live mentolder brand?",
        "Push the current manifests to prod — what do I run?",
    ], "Deploy the mentolder brand (the only live brand):\n\n```bash\ntask workspace:deploy ENV=mentolder\n```\n\n`korczewski` is frozen (T002479) and must never be deployed to."),
    F("cli", [
        "How do I validate Kubernetes manifests and Kustomize overlays locally?",
        "Which task dry-runs the workspace manifests?",
        "Command for a kustomize dry-run before committing manifests?",
    ], "Run the workspace validation (kustomize dry-run):\n\n```bash\ntask workspace:validate\n```\nIt is part of the mandatory pre-PR gate."),
    F("cli", [
        "How do I run tests only for the files I changed before committing?",
        "What is the smart test selection command?",
        "Which task serves as the pre-commit test gate?",
    ], "Smart test selection:\n\n```bash\ntask test:changed\n```\nThis is the pre-commit gate; run it before every push."),
    F("cli", [
        "How is the change failure rate measured in this repo?",
        "Which command measures CFR and what is the target?",
    ], "Measure CFR with:\n\n```bash\nbash scripts/vda.sh cfr\n```\nTarget: ≤ 15% over an 8-week rolling window. Every post-merge bug must be filed as a `type=bug` ticket (G-DORA03)."),
    F("cli", [
        "How do I validate the frontmatter of a staged plan file?",
        "After creating a plan, what validator do I run on it?",
    ], "Run the frontmatter validator right after plan creation:\n\n```bash\nbash scripts/vda.sh frontmatter <plan-file>\n```"),
    F("cli", [
        "How do I generate release notes?",
        "Which command produces release notes and where can they be published?",
    ], "Generate and publish:\n\n```bash\nbash scripts/vda.sh release-notes generate\n```\nPublish via `publish-github` or `publish-changelog`."),
    F("cli", [
        "How do I regenerate the MCP configuration files from the registry?",
        "Which task syncs .mcp.json and opencode config from mcp.yaml?",
    ], "The registry SSOT is `docs/agent-guide/registry/mcp.yaml`. Regenerate with:\n\n```bash\ntask mcp:sync\n```\nIt rewrites `.mcp.json`, `.opencode/opencode.jsonc` and `mcp_config.json`."),
    F("cli", [
        "How do I check the MCP configuration for drift without changing anything?",
        "Is there a read-only check for MCP config sync?",
    ], "Yes:\n\n```bash\ntask mcp:check\n```\nIt fails if the generated configs drifted from `docs/agent-guide/registry/mcp.yaml`."),
    F("cli", [
        "What are the three gates I must run before opening a PR?",
        "Which commands form the mandatory CI pre-PR gate?",
        "List the pre-PR verification steps in order.",
    ], "The mandatory three-step gate:\n\n```bash\ntask test:changed\ntask freshness:check\ntask workspace:validate\n```"),
    F("cli", [
        "What does task freshness:check verify?",
        "Why does freshness:check complain about generated artifacts?",
    ], "It verifies that generated artifacts (e.g. `docs/code-quality/repo-index.json`, agent-guide maps, `config-overview.md`) match what their generators would emit. If it fails, regenerate the named file and include it in your commit."),
    F("cli", [
        "How do I list all worktrees?",
        "Which script shows active worktrees, optionally as JSON?",
    ], "List worktrees with:\n\n```bash\nbash scripts/worktree-list.sh\nbash scripts/worktree-list.sh --json\n```\nWorktrees live under `.worktrees/<slug>`."),
    F("cli", [
        "How do I create an isolated worktree for a ticket?",
        "Which script sets up a new worktree with a branch?",
    ], "Create one per ticket/branch:\n\n```bash\nbash scripts/worktree-create.sh <branch-name> <slug>\n```\nWorktrees are required because pre-commit blocks parallel work on the main checkout."),
    F("cli", [
        "How do I claim an agent lock on a ticket?",
        "What is the agent-lock claim command?",
    ], "Claim at session start:\n\n```bash\nbash scripts/agent-lock.sh claim ticket <id> --branch <b> --worktree <wt> --label <skill>\n```"),
    F("cli", [
        "How do I release an agent lock when done?",
        "Command to free a ticket lock?",
    ], "Release when the work is finished:\n\n```bash\nbash scripts/agent-lock.sh release ticket <id>\n```"),
    F("cli", [
        "How do I clean up stale agent locks at the start of a session?",
        "Locks from dead sessions block me — what do I run?",
    ], "Reap stale locks:\n\n```bash\nbash scripts/agent-lock.sh reap\n```\nRun this at session start; it removes locks whose owning session is gone."),
    F("cli", [
        "How does an agent read unread session messages?",
        "Which command shows unread inter-agent messages?",
    ], "Check coordination messages:\n\n```bash\nbash scripts/agent-msg.sh read --unread\n```"),
    F("cli", [
        "How do I escalate when a subagent is stuck?",
        "What is the escalation command when an agent is blocked?",
    ], "Escalate with context:\n\n```bash\nbash scripts/agent-escalate.sh --agent \"bp-<role>\" --reason \"<what>\" --tried \"<attempt>\" --needs \"<unblock>\"\n```"),
    F("cli", [
        "How do I create a bug ticket after a merged PR showed a defect?",
        "What is the ticket command under the CFR rule?",
        "Command to file a post-merge bug?",
    ], "Every post-merge bug becomes a `type=bug` ticket (CFR-Gate G-DORA03) — no silent `fix()` commits:\n\n```bash\nbash scripts/ticket.sh create --type bug --title \"...\" --description \"...\"\n```"),
    F("cli", [
        "How do I list open tickets from the CLI?",
        "Which command lists tickets with status?",
    ], "List tickets (JSON output):\n\n```bash\nbash scripts/ticket.sh list\n```\nFilter by status/pattern for triage. Never `SELECT *` from `tickets.ticket_plans` in psql."),
    F("cli", [
        "Where do I run a specific local test by TEST-ID after changing manifests?",
        "Which runner executes one named local test?",
    ], "After modifying manifests run the named test, then validate:\n\n```bash\n./tests/runner.sh local <TEST-ID>\ntask workspace:validate\n```"),
    F("cli", [
        "How do I inject active plan context before dispatching a domain agent?",
        "What must be prepended to a dispatch prompt for plan context and toolset?",
    ], "Before dispatching `bp-*` agents, inject plan context and curated tools:\n\n```bash\ncontext=$(bash scripts/plan-context.sh <full-role-name>)\ntools=$(bash scripts/toolset-context.sh <full-role-name>)\n```\nWrap as `<active-plans>`/`<toolset>` blocks. `<role>` must be a full role name (`bp-*`/`orchestrator`); the toolset script is fail-closed on invalid roles."),
    F("cli", [
        "Which task namespace manages the local LLM stack?",
        "How do I check the status of local LLM tasks?",
    ], "Use the `llm:` namespace, e.g. `task llm:status`. The GPU rails themselves run as systemd user units (`qwen38-gsq-iq3xxs` on :1919) and the Windows-native 4B pool on :8080."),
    F("cli", [
        "How does the GPU lock work before benchmark runs?",
        "Why must I acquire the GPU lock before benching?",
    ], "`scripts/gpu-lock.sh` serializes GPU-heavy jobs: the bench acquires it (stopping production orchestrators), runs, and releases it on exit — even on abort. The agent-bench restore hook always releases it."),
    F("cli", [
        "What is the status footer format agents must emit?",
        "Show the mandatory end-of-thread status block.",
    ], "Once at the end of a finished thread:\n\n```\nSTATUS: <what happened>\nRUNNING: <background work or \"none\">\nBLOCKED: <blockers or \"none\">\nNEXT: <next concrete action or \"none\">\n```"),

    # ================= arch =================
    F("arch", [
        "What is the status of the korczewski brand?",
        "Can we bring the korczewski cluster back?",
        "Explain the korczewski freeze.",
    ], "`korczewski` is FROZEN since 2026-07-23 (T002479): the standalone cluster was torn down, its hosts joined `fleet`, `ks-korczewski.yaml` has `suspend: true` and brand namespaces are scaled to 0. Never deploy to or scale it up."),
    F("arch", [
        "Which Kubernetes contexts are valid in this repo?",
        "What contexts exist after Fleet Stage 3?",
    ], "Exactly two: `fleet` (production, mentolder.de routes here) and `devmesh` (local mesh, ADR-008). Dead contexts — `mentolder`, `korczewski`, `k3s-1`, `hetzner`, `k3d-*` — must never be used."),
    F("arch", [
        "Where does mentolder.de point?",
        "Which cluster serves mentolder.de?",
    ], "`mentolder.de` routes to the **`fleet`** cluster. Deploys target `ENV=mentolder` (alias `fleet-mentolder`), context `fleet`, namespace `workspace`."),
    F("arch", [
        "Is k3d still needed?",
        "Do I have to install k3d for local development?",
    ], "No — the `k3d` binary is no longer needed or used (T900120). Local development uses the `devmesh` mesh."),
    F("arch", [
        "Which database does mcp-postgres connect to?",
        "What does the postgres MCP at :13001 serve?",
    ], "Since T900191, `mcp-postgres` (localhost:13001) connects to the **devmesh** DB with mentolder brand data. Ticket reads go through `ticket-mcp` with a `brand` parameter."),
    F("arch", [
        "Where does mcp-kubernetes run?",
        "What is the kubernetes MCP endpoint and what is it allowed to do?",
    ], "`mcp-kubernetes` runs at `localhost:18080` (Claude-Code-only SSE server) and is restricted to **status checks** — use it for read-only cluster questions, not mutations."),
    F("arch", [
        "What network do fleet nodes use for pod traffic?",
        "How is inter-node networking set up in the fleet cluster?",
    ], "Fleet nodes communicate over the WireGuard mesh `wg-fleet` (10.20.0.x) with flannel bound via `--flannel-iface=wg-fleet`."),
    F("arch", [
        "Which Kustomize overlay do I apply for production?",
        "Why is applying the base prod/ overlay dangerous?",
    ], "Apply `prod-fleet/mentolder/` — never the base `prod/` directly: it contains `$patch: delete` on `workspace-secrets`, so applying it directly deletes credentials."),
    F("arch", [
        "What is the devmesh context for?",
        "Which ADR introduced the local mesh?",
    ], "`devmesh` is the local development mesh introduced by ADR-008; it hosts the dev database and the devmesh-forward service (llm-proxy :18235, mcp-postgres :13001, bge-mcp :13005)."),
    F("arch", [
        "Which namespace do workspace services deploy into?",
        "Where do the brand workloads live in the cluster?",
    ], "Brand workloads deploy into the `workspace` namespace (context `fleet`, overlay `prod-fleet/mentolder/`)."),
    F("arch", [
        "What does ENV=mentolder alias to?",
        "Is there an environment alias for the fleet deploy?",
    ], "`ENV=mentolder` (alias `fleet-mentolder`) selects the production overlay in context `fleet`. `korczewski` (alias frozen) must not be deployed."),
    F("arch", [
        "Which MCP server is the SSOT for reachability?",
        "Where are MCP endpoints registered?",
    ], "`docs/agent-guide/registry/mcp.yaml` is the SSOT for reachability; `task mcp:sync` regenerates `.mcp.json`, `.opencode/opencode.jsonc` and `mcp_config.json` from it. Selection guidance lives in `capabilities.yaml`."),

    # ================= gotchas =================
    F("gotchas", [
        "How must scripts/env-resolve.sh be used?",
        "I ran `bash scripts/env-resolve.sh` and nothing got exported — why?",
        "Can I execute env-resolve.sh directly?",
    ], "It must be **sourced, never executed** — executing runs it in a subshell and the exports are lost:\n\n```bash\nsource scripts/env-resolve.sh\n```"),
    F("gotchas", [
        "Can I run SELECT * from tickets.ticket_plans?",
        "Why did my psql session freeze after querying ticket_plans?",
        "How do I safely inspect the ticket_plans table?",
    ], "Never `SELECT *` from `tickets.ticket_plans` — the plan bodies are huge and bloat memory. Select explicit columns:\n\n```sql\nSELECT ticket_id, status, updated_at FROM tickets.ticket_plans;\n```"),
    F("gotchas", [
        "Which package manager is required in components/website?",
        "What happens if I run npm install in components/website?",
    ], "`components/website/` is strictly **pnpm** — never `npm install` there; it breaks lockfiles. Repo root and `components/brett/` use `npm`."),
    F("gotchas", [
        "How do I unlock git-crypt under WSL without a keyfile?",
        "git-crypt unlock fails under WSL — what now?",
    ], "Point git at the Windows GPG binary via `gpg.program`:\n\n```bash\ngit config --local gpg.program \"/mnt/c/Program Files (x86)/GnuPG/bin/gpg.exe\"\n```\nSee `docs/runbooks/git-crypt-key-distribution.md`."),
    F("gotchas", [
        "A required credential is missing — what is the protocol?",
        "How do I handle missing secrets?",
    ], "Follow `docs/runbooks/credentials-finden.md` in its fixed lookup order. Never print or invent secret values; if nothing is found, stop and escalate instead of improvising."),
    F("gotchas", [
        "The security-guidance plugin fired an asyncRewake after my commit — should I reset?",
        "Can I git restore after a security rewake?",
    ], "**Never** run `git restore`, `git checkout --` or `git reset` in that situation — the commit already succeeded and reverting discards committed work. Acknowledge the finding or file a follow-up ticket and fix in a new commit."),
    F("gotchas", [
        "Why does `gh pr checks --json` fail?",
        "How do I get machine-readable CI check status from gh?",
    ], "`gh pr checks` has no `--json`. For parsing/polling use:\n\n```bash\ngh pr view <PR> --json statusCheckRollup\n```\nPer the gh-axi convention, use plain `gh` for machine reads and mutations; `gh-axi` only for display."),
    F("gotchas", [
        "Can I start kubectl port-forward manually?",
        "Why did manual port-forwards cause restart loops?",
    ], "Never start `kubectl port-forward` manually on this host — tunnels are exclusively managed by the `mcp-gateway.service` systemd unit; manual ones collide and cause restart loops. Check health with `bash scripts/mcp-gateway/probe.sh`."),
    F("gotchas", [
        "Do Taskfile deps run sequentially?",
        "Why did my Taskfile deps race each other?",
    ], "`deps:` run **in parallel** in Taskfile. If order matters, call the tasks as sequential entries under `cmds:` instead."),
    F("gotchas", [
        "Can I embed a Grafana dashboard in an iframe?",
        "Why does the Grafana iframe stay blank behind oauth?",
    ], "No — open Grafana in a new tab (`target=\"_blank\"`). Iframe embedding fails due to oauth2-proxy same-origin/auth headers."),
    F("gotchas", [
        "Why does task docs:sync fail with a read-only file system error?",
        "How do I deploy documentation updates?",
    ], "The static docs server runs with a read-only rootfs; `docs:sync` cannot write. Deploy docs with:\n\n```bash\ntask docs:deploy\n```"),
    F("gotchas", [
        "Pre-commit blocks checkout of main complaining about a lock — why?",
        "Why must agents work in worktrees?",
    ], "Pre-commit blocks `main` checkout while another agent holds a lock. Agents work in isolated worktrees under `.worktrees/<slug>`; reap dead locks with `bash scripts/agent-lock.sh reap`."),
    F("gotchas", [
        "Which branch names are allowed?",
        "Can I push directly to main in an emergency?",
    ], "Branches must be `feature/*`, `fix/*`, `chore/*` or `docs/*`; direct pushes to `main` are blocked (`preflight-pr-scope.sh` enforces worktrees). PRs go in via squash-merge."),
    F("gotchas", [
        "Why did auto-merge succeed even though the E2E PR check failed?",
        "Does a failing E2E check block merging?",
    ], "Per T000722 the `E2E PR` check is informative and does not block auto-merge. Merge requires: Offline Tests, Security Scan, Brett TypeScript, Vitest (website) and Conventional Commits."),
    F("gotchas", [
        "How do I resolve git conflicts in generated files?",
        "repo-index.json conflicts on every rebase — what to do?",
    ], "Auto-generated artifacts (`docs/generated/**`, `docs/code-quality/repo-index.json`) are conflict magnets. Resolve with `git checkout --ours <file> && git add <file>`, then regenerate the artifact after checkout."),
    F("gotchas", [
        "What is the pull-first routine before starting work?",
        "How do I rebase with a dirty working tree?",
    ], "Always rebase from `main` before starting:\n\n```bash\ngit pull --rebase origin main\n# dirty tree:\ngit stash && git pull --rebase origin main && git stash pop\n```"),
    F("gotchas", [
        "What are the PowerShell script rules in this repo?",
        "Why did my .ps1 fail the parser check?",
    ], "Per T002495-M7: `.ps1` files must be ASCII (no BOM), pass a parser check before commit, and generated `.conf` files must be written with `-Encoding ASCII`. See `scripts/llm/CLAUDE.md`."),
    F("gotchas", [
        "Which images are exempt from :latest digest pinning?",
        "Do I need to pin digests for the website image?",
    ], "Exempt from `:latest` digest-pinning: Website, Brett, Videovault, Mediaviewer-Widget, Mentolder-Web, Downloads, Brain, Studio, Talk-Transcriber, SDLC-Console, MCP-Node, Repo-Sync, Dev-Shell. Everything else must be digest-pinned."),
    F("gotchas", [
        "How do I record a measurement in a ticket?",
        "What must accompany a measurement used as a decision basis?",
    ], "Per T002717: note the exact executable command with its search pattern and the commit stand (`PRE=<sha>`) in a code block inside the ticket."),
    F("gotchas", [
        "How does llm-proxy respond when it is reachable but not authorized?",
        "What does an auth error from :18235 mean?",
    ], "An auth error body from llm-proxy (`devmesh` forward, :18235) proves reachability but not usable access — it is the expected state without credentials, not an outage."),
    F("gotchas", [
        "What is the WSL silent spill problem on the 5070 Ti?",
        "Why do contexts above ~15.9 GB cause silent slowdowns?",
    ], "Above ~15.9 GiB VRAM the 5070 Ti silently spills CUDA memory into system RAM (no OOM, just massive slowdown). Keep KV+weights below the ceiling — the agent-bench enforces this via `checkSpill` with a 15,900 MiB threshold."),

    # ================= workflow =================
    F("workflow", [
        "When does a ticket close?",
        "Does prod deployment change ticket status?",
    ], "Per T001092 a ticket closes when its PR is green and auto-merged to `main` (`done · resolution=shipped`). Prod deploy is decoupled push-based and does NOT change ticket status."),
    F("workflow", [
        "What must I check before manually closing an epic?",
        "How do I verify deliverables exist on origin/main?",
    ], "Deliverable-Check (M10, T002506): before manual done/shipped, verify every deliverable file exists on `origin/main`:\n\n```bash\ngit ls-tree -r --name-only origin/main | grep -qxF <path>\n```"),
    F("workflow", [
        "What is the difference between dev-flow-plan and dev-flow-chore?",
        "When do I use dev-flow-chore?",
    ], "`dev-flow-plan` for behavior changes (spec → staged plan → `dev-flow-execute`); `dev-flow-chore` for no-behavior-change maintenance (docs, deps, renames) that merges inline in one pass."),
    F("workflow", [
        "Where do staged plans live and what happens after merge?",
        "Why can't I find the plan files of a merged ticket?",
    ], "Plans live in `.agents/plans/<slug>/` (`tasks.md` + `tasks.d/` partials) and are **deleted after merge** — the record survives in `tickets.ticket_plans`."),
    F("workflow", [
        "What is the purpose statement language for plans?",
        "How are plan tasks formatted?",
    ], "Plan purpose is written in German; tasks are checklists with gates. Every task partial references the ticket and is staged by `dev-flow-plan`."),
    F("workflow", [
        "How are PRs merged into main?",
        "Why squash-merge?",
    ], "All PRs are squash-merged into `main`; direct pushes are blocked. The squash commit carries the ticket reference (e.g. `[T900927]`)."),
    F("workflow", [
        "What does preflight-pr-scope.sh enforce?",
        "Why must feature PRs come from a worktree?",
    ], "It enforces that PR branches are not `main` and that `feature/*`/`fix/*` PRs are created from isolated worktrees under `.worktrees/` (chore/docs branches may run from the main checkout)."),
    F("workflow", [
        "What does the Merge = Abschluss principle mean?",
        "Who closes the ticket after merge?",
    ], "Merge is the completion event: on green auto-merge to `main` the ticket is closed automatically as `done · resolution=shipped` — no manual close needed for single-PR tickets."),
    F("workflow", [
        "Which commit message convention is enforced?",
        "Why did the Conventional Commits check fail?",
    ], "CI requires Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:` …) plus the ticket reference in brackets, e.g. `chore(agents): route worker rails ... [T900927]`."),
    F("workflow", [
        "What should agents do with the assigned task per the interaction contract?",
        "When is an agent allowed to stop?",
    ], "Run the assignment to its own logical end (verify, commit, PR where covered). Stop only on: destructive/irreversible actions, genuine design forks, blocked (creds/service), or cost above threshold."),
    F("workflow", [
        "How should finite-answer questions be asked?",
        "What is the one-keystroke rule?",
    ], "Ask through `AskUserQuestion` (Claude Code) or `question` (opencode) with numbered options — recommendation first — never free prose."),
    F("workflow", [
        "Where do agents record long-term lessons?",
        "What memory files exist for agents?",
    ], "Per-agent memory lives in the harness memory directory; cross-agent doctrine in `AGENTS.md` and `docs/agent-guide/`. Session state: `.reflect`-style notes inside training projects (`memory.md`, `gaslamp.md`)."),
    F("workflow", [
        "What is the bring-up order after a cluster reset for sealed secrets?",
        "Steps to restore sealed secrets and redeploy?",
    ], "Order:\n\n```bash\ntask sealed-secrets:install ENV=<env>\ntask env:fetch-cert ENV=<env>\ntask env:seal ENV=<env>\ntask cert:install ENV=<env>\ntask cert:secret -- <key> ENV=<env>\ntask workspace:deploy ENV=<env>\n```"),
    F("workflow", [
        "How do website changes reach production?",
        "Why do backend services not deploy automatically?",
    ], "Website deploys are continuous via GitHub Actions (`build-website*.yml`); Kubernetes services deploy explicitly push-based via `task workspace:deploy ENV=mentolder`."),
    F("workflow", [
        "What does wip-finish.sh do by default?",
        "Is wip-finish allowed to commit on its own?",
    ], "Default run is **PLAN ONLY** — nothing is touched. The worker rail (:8080) only triages and recommends an action (`ACT=<aktion>|REASON=<kurz>`); it never writes repo content, commits or pushes."),

    # ================= agents =================
    F("agents", [
        "Which agent handles Kubernetes manifests and deploys?",
        "Who owns SealedSecrets and Kustomize overlays?",
    ], "**`bp-build`** — signals: `fleet/`, `prod*/`, manifests, Kustomize overlays, Taskfile, `ENV=`, deploy, SealedSecret, OIDC clients, DSGVO, credentials, certificates, secrets."),
    F("agents", [
        "Which agent investigates pod crashes and database issues?",
        "Who handles logs, health and postgres queries?",
    ], "**`bp-run`** — signals: pod, logs, status, restart, crash, health, kubectl, 'what's wrong', PostgreSQL, psql, schema, timeline, GPU, Ollama, model questions."),
    F("agents", [
        "Which agent owns frontend work?",
        "Who handles Astro, Svelte and CSS?",
    ], "**`bp-ship`** — signals: BATS/Playwright, `FA-*`, Astro, Svelte, components, homepage, kore, mentolder brand, CSS, UI, frontend, design."),
    F("agents", [
        "Which models do the domain agents run on?",
        "What is the session model for bp-run and bp-build?",
    ], "Main loop: user's default model. `bp-run`/`bp-build`/`bp-ship` routing per `.opencode/agent-models.jsonc` SSOT (sonnet/opus tiers in Claude Code terms); ad-hoc subagents get an explicit model per the provisioning reference."),
    F("agents", [
        "Which skill maps to which domain agent?",
        "Where does dev-flow-e2e get dispatched?",
    ], "Claude Code map: `dev-flow-e2e`→ship, `incident-response`→run, `infra-ops`→build, `database-specialist`→run, `security-specialist`→build, `website-specialist`/`web-audit`→ship. Skills with `agent:` run as background agents; others inline."),
    F("agents", [
        "What is sdlc-autopilot?",
        "Which harness runs sdlc-autopilot?",
    ], "`sdlc-autopilot` is opencode-only: ticket-triage → `dev-flow-plan` → `dev-flow-execute`. Claude Code does not dispatch it; `ticket-ops` stays the compatible router."),
    F("agents", [
        "What is gh-axi and when do I use plain gh?",
        "Should I parse gh output with gh-axi?",
    ], "Prefer `gh-axi` for display. For machine parsing (`--json`, `-q`, `--jq`), polling (`pr checks`) and mutations (`pr merge`, `gh api`) always use plain `gh` (T004612)."),
    F("agents", [
        "Where is the machine-readable entry index of the repo?",
        "How does an agent discover repo guidance on demand?",
    ], "`llms.txt` at repo root is the machine-readable entry index; `docs/agent-guide/reference.md` is the on-demand reference (quality gates, services, manifests); runtimes in `docs/agent-guide/registry/runtimes.md`. Reference sections of AGENTS.md are read on demand, not frontloaded."),
    F("agents", [
        "How is code discovery routed?",
        "Should I grep first for symbol lookups?",
    ], "Route recall by query type (docs/brain/recall-routing.md): known symbol → K3 graph; semantic question → K1 embeddings; doctrine/process → authored `docs/`. Fallback K1 → K3 → K4; grep/glob only for literals, errors, config values."),
    F("agents", [
        "Which agent handles an ongoing incident with pods?",
        "Where does the incident-response skill run?",
    ], "`incident-response` dispatches to **`bp-run`** (Claude Code skill→agent map). For k8s status it uses `mcp-kubernetes` (status-only)."),
    F("agents", [
        "What context budget rules apply to subagents?",
        "How are bulk reads handled in the main loop?",
    ], "Bulk reads go to a condensing subagent; on compact, preserve objective/plan/files/tests/decisions/blockers/next action. Ad-hoc subagents need an explicit model (subagent-provisioning reference)."),

    # ================= ci =================
    F("ci", [
        "Which CI system runs on PRs?",
        "Where is the pipeline defined?",
    ], "GitHub Actions (`.github/workflows/ci.yml`) runs on PRs. Tests verify **command output** (T002448-M4); the test runner is `bash scripts/pytest-run.sh` (pytest)."),
    F("ci", [
        "What does task test:inventory do?",
        "Why must the test inventory be re-run after adding tests?",
    ], "The CI inventory check re-runs `task test:inventory` — every spec file must be registered. After adding/moving tests, regenerate the inventory and include it (it is a freshness-checked artifact)."),
    F("ci", [
        "Which checks block auto-merge?",
        "What is the required check set for a PR?",
    ], "Blocking: Offline Tests, Security Scan, Brett TypeScript, Vitest (website), Conventional Commits. `E2E PR` is informative (T000722)."),
    F("ci", [
        "How are website tests run?",
        "Which test framework covers the website component?",
    ], "The website component (Astro/Svelte) is tested with Vitest (`Vitest (website)` required check); Brett has a TypeScript check. End-to-end browser flows use Playwright under `bp-ship`."),
    F("ci", [
        "What happens when freshness artifacts are stale in CI?",
        "Do generated files need to be committed?",
    ], "Yes — generated artifacts must be committed (`freshness:check` fails on unstaged regenerations). If a generator changed output, run it and include the result, e.g. `docs/code-quality/repo-index.json` via `scripts/code-quality/emit-index.mjs`."),

    # ================= llmstack =================
    F("llmstack", [
        "What runs on port 1919?",
        "Which model serves the primary local rail?",
        "What are the specs of the 27B rail?",
    ], ":1919 = **Qwen3.8-27B GSQ-RCO IQ3_XXS-mtp** (unit `qwen38-gsq-iq3xxs.service`), the strong/primary local rail: ~153,600 tokens served KV, draft-MTP speculative decoding, ~98–106 t/s decode on the RTX 5070 Ti."),
    F("llmstack", [
        "What runs on port 8080?",
        "What serves the worker rail?",
        "Tell me about the 4B pool configuration.",
    ], ":8080 = **Qwen3.5-4B-MTP** UD-Q4_K_XL worker pool, Windows-native llama.cpp on the RTX 3060 Ti (model id `Qwen3.5-4B-MTP`): 3 slots sharing a provisional 98304 KV allocation, direct (non-thinking) default with per-request thinking via `chat_template_kwargs enable_thinking` (see `docs/runbooks/qwen35-worker-modes.md`). Replaced the Qwen3-4B-2507 pool on 2026-10-03. Autostart: `scripts/llm/register-qwen35-4b-autostart.ps1`, service script `F:\\tools\\llama.cpp\\start-qwen35-4b-service.ps1`."),
    F("llmstack", [
        "What happened to the old Qwen2.5-7B worker?",
        "Where did port 1920 go?",
    ], "The Qwen2.5-7B-BP fine-tune worker (32k max window, insufficient for the 33.6k buffer + tool overhead) and the Qwen3.5-9B rail on :1920 were retired on 2026-10-03; the short-lived Qwen3-4B-2507 pool on :8080 was then replaced by **Qwen3.5-4B-MTP**. `qwen35-mtp.service` and `qwen25-7b-worker.service` were removed."),
    F("llmstack", [
        "What sampling parameters does the Qwen3.5-4B need?",
        "Why do repetitions appear in 4B output?",
    ], "Qwen3.5-4B-MTP defaults: temperature 0.8, top_k 40, top_p 0.95, min_p 0.05, repeat_penalty 1.0. Reasoning is per-request via `chat_template_kwargs: {enable_thinking: false}` (direct default, no reasoning trace) or `true` (thinking mode, `reasoning_content` in response) — see `docs/runbooks/qwen35-worker-modes.md`."),
    F("llmstack", [
        "Does the Qwen3.5-4B-MTP worker support MTP speculative decoding?",
    ], "TO-VERIFY: the model name carries an MTP suffix, but draft-model decoding on the :8080 pool was never measured — do not claim it works or is absent. The verified MTP speedup exists only on the 27B IQ3_XXS-mtp rail (:1919)."),
    F("llmstack", [
        "What is the max context of the worker pool?",
        "What are the key specs of the Qwen3.5-4B-MTP model?",
    ], "Model id `Qwen3.5-4B-MTP`: n_embd 2560, n_vocab 248320, ~4.33B params, native train context (n_ctx_train) 262144. The :8080 pool serves n_ctx 98304 shared over 3 slots (provisional sizing — long-load/3-stream stress pending). Layer/head counts and per-token KV sizing were never measured for this model (TO-VERIFY) — never quote 2507-era figures (36 layers, 40.5 KiB/token)."),
    F("llmstack", [
        "What is the WSL spill ceiling of the 5070 Ti?",
        "How much VRAM can I safely allocate on the primary card?",
    ], "~15.9 GiB (15,899 MiB) of the 16,303 MiB physical — above that CUDA silently spills to system RAM. Measured in `scripts/llm/measurements/2026-10-03-qwen38-iq2s-vs-iq3xxs.md`; agent-bench enforces 15,900 MiB."),
    F("llmstack", [
        "What is the difference between the iq2s and iq3xxs 27B services?",
        "Which 27B quant should I run?",
    ], "`qwen38-gsq-iq2s.service` (IQ2_S, 196k context) vs `qwen38-gsq-iq3xxs.service` (IQ3_XXS, 153.6k context, max quality: +2.3% LCB v6, 15/15 orchestration). Default is IQ3_XXS; IQ2_S only when >150k context is required. Switch:\n\n```bash\nsystemctl --user stop qwen38-gsq-iq3xxs && systemctl --user start qwen38-gsq-iq2s\n```"),
    F("llmstack", [
        "Which MCP or services run on which ports?",
        "List the local LLM/infra ports.",
    ], ":1919 27B primary · :8080 Qwen3.5-4B-MTP pool · :8094 27B UD-IQ4_XS (start-qwen-server.ps1, dual-GPU split) · :1234 LM Studio · :13001 mcp-postgres · :13005 bge-mcp · :13007 glimmer-worker-mcp · :18235 llm-proxy (devmesh-forward)."),
    F("llmstack", [
        "Where is the llama.cpp binary used by the services?",
        "Which build serves the local models?",
    ], "`~/opt/llama-current/bin/llama-server` (tracked build, e.g. e85e15c). The Windows-native :8080 pool uses the Windows llama.cpp under `F:\\tools\\llama.cpp\\` via `start-qwen35-4b-service.ps1`."),
    F("llmstack", [
        "How does the agent-bench handle GPU conflicts with production?",
        "Will a bench run kill my 27B rail?",
    ], "The bench acquires `scripts/gpu-lock.sh`, stops conflicting production units, runs candidates (e.g. vLLM NVFP4), and restores production + releases the lock on exit — including aborts, via `installRestoreHooks`."),
    F("llmstack", [
        "What KV cache quantization does the 27B rail use?",
        "Why is flash attention required for quantized V cache?",
    ], "Both rails run `-ctk q4_0 -ctv q4_0 -fa on`. Quantized V cache requires the FlashAttention build (`GGML_CUDA_FA_ALL_QUANTS`); K-only quantization works without it."),
    F("llmstack", [
        "What does the compaction trigger mean for the 4B pool?",
        "When does opencode compact on the worker rail?",
    ], "The 4B pool serves 98304 shared KV; opencode compacts at limit.input minus reserve — exact trigger TO-VERIFY (never measured for the 98304 window; the old 56512 trigger belonged to the retired 90112 window). Sizing rule: buffer 33600 + tool overhead must fit below the window (the reason the 32k Qwen2.5-7B-BP was unusable)."),
    F("llmstack", [
        "Where do local model measurements go?",
        "Which folder holds benchmark reports?",
    ], "`scripts/llm/measurements/` (e.g. `2026-10-03-qwen38-iq2s-vs-iq3xxs.md`, bench JSONs). Measure with the checked-in harness (`scripts/llm/bench_qwen38_comparison.py`, agent-bench) and cite command + `PRE=<sha>` per T002717."),

    # ================= components =================
    F("components", [
        "Which package manager does the repo root use?",
        "npm or pnpm outside components/website?",
    ], "Repo root and `components/brett/`: **npm**. `components/website/`: strictly **pnpm** (never `npm install` there — it breaks the lockfile)."),
    F("components", [
        "What is the website built with?",
        "Which framework stack runs the website component?",
    ], "`components/website/` is Astro + Svelte, tested with Vitest, deployed continuously by GitHub Actions. UI work dispatches to `bp-ship`."),
    F("components", [
        "Where do I add a UI component for the mentolder brand?",
        "Who owns the homepage design system kore?",
    ], "Frontend lives in `components/website/` (Astro/Svelte, pnpm). Dispatch `bp-ship` — it owns BATS/Playwright, `FA-*`, kore and the mentolder brand CSS/UI."),

    # ================= runbooks =================
    F("runbooks", [
        "How do I distribute git-crypt keys?",
        "Where is the git-crypt key runbook?",
    ], "`docs/runbooks/git-crypt-key-distribution.md` — keyfile distribution plus the WSL `gpg.program` fallback pointing at the Windows GPG binary."),
    F("runbooks", [
        "What is the fixed lookup order for credentials?",
        "Where do I look up a missing token?",
    ], "`docs/runbooks/credentials-finden.md` defines the fixed lookup order. Rules: never print values, never invent them, stop and ask if nothing is found."),
    F("runbooks", [
        "What is the sealed secrets bring-up order?",
        "How do I recover cert-based secrets after a cluster rebuild?",
    ], "install → fetch-cert → seal → cert:install → cert:secret → deploy (see the `workflow` bring-up sequence). Always via the overlay, never the base `prod/` (it `$patch: delete`s `workspace-secrets`)."),
    F("runbooks", [
        "How do I update the live documentation?",
        "docs:sync fails — what instead?",
    ], "`task docs:deploy` (the static server is read-only, so `docs:sync` fails by design)."),
    F("runbooks", [
        "How do I check the mcp-gateway tunnels?",
        "Which probe verifies local service tunnels?",
    ], "`bash scripts/mcp-gateway/probe.sh` — the gateway unit owns all port-forwards; manual `kubectl port-forward` is forbidden (collision/restart loops)."),

    # ================= refusal =================
    F("refusal", [
        "What is the capital of France?",
        "Write me a poem about the ocean.",
        "Who won the 2019 Champions League final?",
    ], "That is outside the Bachelorprojekt workspace. I only answer questions about this repository, its cluster architecture, workflows and tooling."),
    F("refusal", [
        "What is the root password of the production cluster?",
        "Give me the SealedSecret key contents.",
    ], "I never output secret values. Follow `docs/runbooks/credentials-finden.md` for the lookup order; if a credential is missing, stop and escalate."),
    F("refusal", [
        "What does ticket T999999 cover?",
        "Summarize ticket T0000000 for me.",
    ], "I don't invent ticket contents. Look it up via `ticket-mcp` (with `brand`) or `bash scripts/ticket.sh list`; never `SELECT *` from `tickets.ticket_plans`."),
    F("refusal", [
        "Which port does the foobar service run on?",
        "What model runs on port 7777?",
    ], "I don't guess ports. Known local rails: :1919 (27B IQ3_XXS-mtp), :8080 (Qwen3.5-4B-MTP pool), :1234 (LM Studio), :8094 (27B IQ4_XS split) — anything else, verify with a probe before relying on it."),

    # ================= stale — recovery from outdated context =================
    F("stale", [
        "Start the worker service on port 1920 for me.",
        "Why is nothing listening on :1920 anymore?",
        "The qwen35-mtp unit is down — restart it.",
    ], ":1920 is retired (2026-10-03). The worker rail is the Windows-native Qwen3.5-4B-MTP pool on **:8080** (model id `Qwen3.5-4B-MTP`, 3 slots, provisional 98304 shared KV). `qwen35-mtp.service` was removed entirely — check health via `curl http://127.0.0.1:8080/health` and `curl http://127.0.0.1:8080/v1/models`."),
    F("stale", [
        "Use FreeToken for the local inference routing.",
        "Is FreeToken still the native backend for :1919?",
    ], "FreeToken was retired (T900363) and must not be used or referenced as a live backend. Local rails are plain llama.cpp: 27B on :1919, Qwen3.5-4B-MTP pool on :8080."),
    F("stale", [
        "Which model is the Muse Glimmer 30B orchestrator?",
        "Start the Glimmer orchestrator rail.",
    ], "The Glimmer 30B orchestrator no longer exists. The primary local rail is **Qwen3.8-27B GSQ-RCO IQ3_XXS-mtp** (`qwen38-gsq-iq3xxs.service`, :1919, ~153600 served KV, draft-MTP) on the RTX 5070 Ti."),
    F("stale", [
        "How big is the Qwen2.5-7B-BP context window for the buffer sizing?",
        "Should I size the dispatch buffer for the 32k 7B window?",
    ], "The Qwen2.5-7B-BP worker (32k max window) was replaced on 2026-10-03. Size dispatches for the **Qwen3.5-4B-MTP** pool: 98304 shared KV, exact compaction trigger TO-VERIFY — the old 32k constraint no longer applies."),
    F("stale", [
        "I still have a korczewski context in my kubeconfig — use it?",
        "Does the korczewski context still work?",
    ], "`korczewski` (and `mentolder`, `k3s-1`, `hetzner`, `k3d-*`) are dead contexts — never use them. Only `fleet` (production) and `devmesh` (local mesh) are valid."),
    F("stale", [
        "Bedeutet docs:sync die Doku zu aktualisieren?",
        "Warum schlägt docs:sync fehl?",
    ], "`docs:sync` läuft gegen einen Read-only-Container und schlägt damit absichtlich fehl — Deploy über `task docs:deploy`."),

    # ================= deutsch — German-language workspace queries ============
    F("deutsch", [
        "Wie deploye ich die Workspace-Änderungen nach Production?",
        "Was ist der Deploy-Befehl für mentolder?",
    ], "Deploy des mentolder-Brand (der einzige live Brand):\n\n```bash\ntask workspace:deploy ENV=mentolder\n```\n\n`korczewski` ist eingefroren (T002479) und darf nie deployed werden."),
    F("deutsch", [
        "Wie finde ich den richtigen Befehl, ohne Taskfile-Targets zu raten?",
        "Was ist die Regel für Befehls-Lookups in diesem Repo?",
    ], "Task Oracle verwenden — niemals Befehle raten oder hardcoden:\n\n```bash\nbash scripts/vda.sh oracle '<Ziel in normalem Deutsch/Englisch>'\n```\n\nFlags: `--dry-run`/`-n`, `--json`, `--quiet`/`-q`."),
    F("deutsch", [
        "Auf welcher GPU läuft das 4B-Modell und wie ist es konfiguriert?",
        "Wo steht der Worker-Pool und was kann er?",
    ], ":8080 = **Qwen3.5-4B-MTP** UD-Q4_K_XL, Windows-nativ auf der RTX 3060 Ti (Modell-Id `Qwen3.5-4B-MTP`): 3 Slots teilen provisionales 98304-KV, Direkt-Modus (non-thinking) default, Thinking pro Request via `chat_template_kwargs enable_thinking` (`docs/runbooks/qwen35-worker-modes.md`). Ersetzt seit 2026-10-03 den Qwen3-4B-2507-Pool."),
    F("deutsch", [
        "Welche Kubernetes-Contexts sind gültig?",
        "Welche Contexte darf ich verwenden?",
    ], "Genau zwei: `fleet` (Production, mentolder.de) und `devmesh` (lokales Mesh, ADR-008). Tote Contexts — `mentolder`, `korczewski`, `k3s-1`, `hetzner`, `k3d-*` — dürfen nie benutzt werden."),
    F("deutsch", [
        "Wie muss scripts/env-resolve.sh verwendet werden?",
        "Warum werden meine Umgebungsvariablen nicht exportiert?",
    ], "Es muss **gesourced, nie ausgeführt** werden — sonst laufen die Exporte in einer Subshell verloren:\n\n```bash\nsource scripts/env-resolve.sh\n```"),
    F("deutsch", [
        "Welche Tests muss ich vor dem Push laufen lassen?",
        "Was ist die Pre-PR-Gate-Reihenfolge?",
    ], "Die drei Pflicht-Gates:\n\n```bash\ntask test:changed\ntask freshness:check\ntask workspace:validate\n```"),
]

# ---------------------------------------------------------------------------
# MULTI-TURN scenarios (each entry is one conversation)
# ---------------------------------------------------------------------------
MULTITURN = [
    {
        "domain": "multiturn",
        "turns": [
            ("Deploy the new API version to korczewski, it's urgent.", None),
            ("OK, mentolder then. What's the command?", None),
        ],
        "answers": [
            "I can't deploy to `korczewski` — it is frozen since 2026-07-23 (T002479, `suspend: true`, namespaces at 0). Production workloads run exclusively under `ENV=mentolder`.",
            "Deploy with:\n\n```bash\ntask workspace:deploy ENV=mentolder\n```\nBefore that, run the pre-PR gate (`task test:changed`, `task freshness:check`, `task workspace:validate`) — deploy is push-based and does not change ticket status.",
        ],
    },
    {
        "domain": "multiturn",
        "turns": [
            ("A pod in namespace workspace is crash-looping. Which agent handles this?", None),
            ("I also need the last postgres queries for the timeline.", None),
        ],
        "answers": [
            "Dispatch **`bp-run`** — it owns pod lifecycle, logs, crashes and health checks. For status lookups it can use `mcp-kubernetes` (:18080, status-only).",
            "Same agent: `bp-run` covers PostgreSQL/psql diagnostics. Reads go through `mcp-postgres` (:13001, devmesh DB) or `ticket-mcp` with `brand` — and never `SELECT *` from `tickets.ticket_plans`.",
        ],
    },
    {
        "domain": "multiturn",
        "turns": [
            ("I modified a Kustomize overlay — what do I run before committing?", None),
            ("And if the local test for it fails?", None),
        ],
        "answers": [
            "Run the named local test and the dry-run validation:\n\n```bash\n./tests/runner.sh local <TEST-ID>\ntask workspace:validate\n```",
            "Fix the manifest — do not bypass the gate. If the failure looks infra-caused (cluster down, stale context), verify the context (`fleet`/`devmesh` only) and reap stale locks; otherwise file a `type=bug` ticket per G-DORA03 before fixing.",
        ],
    },
    {
        "domain": "multiturn",
        "turns": [
            ("Which GPU rail should run my summarization batch?", None),
            ("Will it slow down the orchestrator?", None),
        ],
        "answers": [
            "Use the :8080 worker pool (Qwen3.5-4B-MTP, 3 parallel slots on the RTX 3060 Ti). It is the cheap text-only rail; bounded research/summaries are its intended workload.",
            "No — the 27B orchestrator runs on the separate RTX 5070 Ti (:1919), so a 3-slot batch on :8080 does not contend for its VRAM. Keep each prompt below the 98304-token shared window.",
        ],
    },
    {
        "domain": "multiturn",
        "turns": [
            ("My git push to main was rejected.", None),
            ("So how do I get the fix in?", None),
        ],
        "answers": [
            "Expected — direct pushes to `main` are blocked. Create a branch (`fix/...`, `feature/...`, `chore/...`, `docs/...`) and open a PR; `preflight-pr-scope.sh` also requires worktrees for feature/fix branches.",
            "Branch from main, commit with a Conventional Commit message carrying the ticket ref (e.g. `fix(x): ... [T900928]`), run the three gates, then open the PR. On green CI it auto-merges and the ticket closes (`done · resolution=shipped`).",
        ],
    },
    {
        "domain": "multiturn",
        "turns": [
            ("I need a benchmark of two quant variants on the 5070 Ti.", None),
            ("The bench aborted halfway — is production back up?", None),
        ],
        "answers": [
            "Use the agent-bench (`scripts/llm/agent-bench/`) — it acquires `scripts/gpu-lock.sh`, stops conflicting production units, enforces the 15,900 MiB spill threshold and restores everything afterwards.",
            "Check and restore manually if needed:\n\n```bash\nsystemctl --user is-active qwen38-gsq-iq3xxs\ncurl -sf -m 5 http://127.0.0.1:8080/health   # Windows-native 4B pool\nbash scripts/gpu-lock.sh release\n```\nThe restore hook releases the lock even on abort.",
        ],
    },
    {
        "domain": "multiturn",
        "turns": [
            ("Kannst du den Worker auf Port 1920 neu starten?", None),
            ("OK, und wie teste ich, dass der neue Rail läuft?", None),
        ],
        "answers": [
            "Port 1920 gibt es nicht mehr — die Rail wurde am 2026-10-03 ersetzt. Der Worker ist jetzt der Windows-native Qwen3.5-4B-MTP-Pool auf **:8080** (3 Slots, provisionales geteiltes 98304-KV); `qwen35-mtp.service` wurde komplett entfernt.",
            "Health-Check genügt:\n\n```bash\ncurl -sf -m 5 http://127.0.0.1:8080/health\ncurl -s http://127.0.0.1:8080/props | head -c 300\n```\nFür Last: `test_3_agents_parallel.py` feuert 3 parallele Slots.",
        ],
    },
    {
        "domain": "multiturn",
        "turns": [
            ("Summarize the worker-pool constraints for a dispatch decision.", None),
            ("And who owns a manifest change inside such a dispatch?", None),
        ],
        "answers": [
            "Worker rail :8080 (Qwen3.5-4B-MTP, 3 slots, provisional 98304 shared KV, direct/non-thinking default): bounded research/summaries/implementation packets; keep each packet below the compaction trigger (TO-VERIFY for the 98304 window). The 27B rail :1919 is separate (one slot, sequential) for demanding work.",
            "Manifest/Kustomize/SealedSecret work dispatches to **`bp-build`**; frontend/UI to **`bp-ship`**; pod/DB live-ops to **`bp-run`**. Within a plan dispatch, the worker executes the partial — planning itself stays on the orchestrator (27B/cloud), never on the 4B worker.",
        ],
    },
]

# ---------------------------------------------------------------------------
# REFUSAL / anti-hallucination stem expansion
# ---------------------------------------------------------------------------
REFUSAL_STEMS = [
    "That is outside the Bachelorprojekt workspace. I only answer questions about this repository, its cluster architecture, workflows and tooling.",
    "This is out of scope for me — I cover the Bachelorprojekt workspace (repo tooling, fleet architecture, agent workflow, local LLM stack), nothing else.",
    "I don't answer general-knowledge questions. For workspace topics like deploys, tickets or the model rails I'm reliable; for everything else I'd just be guessing.",
    "Das gehört nicht zum Bachelorprojekt-Workspace. Ich beantworte nur Fragen zu diesem Repository, seiner Cluster-Architektur, den Workflows und dem Tooling.",
]

# ---------------------------------------------------------------------------
# Dedup + assembly
# ---------------------------------------------------------------------------

def normalize(text):
    return re.sub(r"[^a-z0-9 ]+", " ", text.lower()).strip()


def shingles(text, n=3):
    words = normalize(text).split()
    if len(words) < n:
        return {" ".join(words)} if words else set()
    return {" ".join(words[i:i + n]) for i in range(len(words) - n + 1)}


def jaccard(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def pair(user, assistant):
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user.strip()},
            {"role": "assistant", "content": assistant.strip()},
        ]
    }


def is_slice_2b(domain, item):
    """P1 (T900978): keep 2B-relevant domains whose answer carries an anchor."""
    import re as _re
    if domain not in SLICE_2B_DOMAINS:
        return False
    answer = item["messages"][-1]["content"]
    return bool(_re.search(ANCHOR_RE, answer))


def apply_slice_2b(raw):
    """P1 (T900978): filter raw (domain, item) pairs to the 2B pilot slice."""
    kept = [(d, it) for d, it in raw if is_slice_2b(d, it)]
    return kept, {"slice_domains": sorted(SLICE_2B_DOMAINS),
                  "slice_raw": len(raw), "slice_kept": len(kept),
                  "slice_dropped": len(raw) - len(kept)}


def is_slice_08b(domain, item):
    """P1 (T900979): keep 0.8B-relevant mechanical domains whose answer carries an anchor."""
    import re as _re
    if domain not in SLICE_08B_DOMAINS:
        return False
    answer = item["messages"][-1]["content"]
    return bool(_re.search(ANCHOR_RE, answer))


def apply_slice_08b(raw):
    """P1 (T900979): filter raw (domain, item) pairs to the 0.8B minimal mechanical slice."""
    kept = [(d, it) for d, it in raw if is_slice_08b(d, it)]
    return kept, {"slice_domains": sorted(SLICE_08B_DOMAINS),
                  "slice_raw": len(raw), "slice_kept": len(kept),
                  "slice_dropped": len(raw) - len(kept)}


def _prev_slice(key):
    """T900979: preserve the other slice block across generator runs.

    dataset_stats.json is shared by all slices; without this a
    --slice-08b run would null out slice_2b (and vice versa), breaking
    the sibling slice's spec test. Best-effort: None when unreadable.
    """
    try:
        prev = json.loads((HERE / "dataset_stats.json").read_text())
    except Exception:
        return None
    return prev.get(key)


def build_t1():
    """Deterministic fact-base expansion -> list of (domain, messages)."""
    raw = []
    for domain, stems, answer in FACTS:
        for q in stems:
            raw.append((domain, pair(q, answer)))
    for answer in REFUSAL_STEMS:
        raw.append(("refusal", pair("What is the capital of France?", answer)))
    for sc in MULTITURN:
        msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
        for (user, _), assistant in zip(sc["turns"], sc["answers"]):
            msgs.append({"role": "user", "content": user})
            msgs.append({"role": "assistant", "content": assistant})
        raw.append((sc["domain"], {"messages": msgs}))
    return raw


def dedup(raw):
    """Exact + near dedup on the last user turn; answer cap per domain."""
    seen_hash = set()
    seen_shingles = []          # (shingle_set, index) — O(n^2) is fine for ~2k
    answer_counts = {}
    kept, dropped_exact, dropped_near, dropped_len, dropped_cap = [], 0, 0, 0, 0

    for domain, item in raw:
        user_texts = [m["content"] for m in item["messages"] if m["role"] == "user"]
        q_norm = normalize(user_texts[-1])
        if len(q_norm) < MIN_NORMALIZED_LEN:
            dropped_len += 1
            continue
        h = hashlib.sha256(q_norm.encode()).hexdigest()
        if h in seen_hash:
            dropped_exact += 1
            continue
        sh = shingles(user_texts[-1])
        if any(jaccard(sh, prev) >= NEAR_DUP_JACCARD for prev in seen_shingles):
            dropped_near += 1
            continue
        a_key = normalize(item["messages"][-1]["content"])[:160]
        if answer_counts.get((domain, a_key), 0) >= ANSWER_CAP_PER_DOMAIN:
            dropped_cap += 1
            continue
        seen_hash.add(h)
        seen_shingles.append(sh)
        answer_counts[(domain, a_key)] = answer_counts.get((domain, a_key), 0) + 1
        kept.append((domain, item))

    stats = {
        "dropped_exact": dropped_exact,
        "dropped_near": dropped_near,
        "dropped_too_short": dropped_len,
        "dropped_answer_cap": dropped_cap,
    }
    return kept, stats


TEACHER_ANGLES = [
    "command lookup ('how do I ...', 'which command ...')",
    "scenario troubleshooting ('X fails with Y, why', 'I ran X and nothing happened')",
    "error recovery ('after a failed deploy, how do I ...')",
    "comparison and decision ('should I use X or Y', 'when do I ...')",
    "agent routing and coordination ('which agent handles ...')",
    "definition and concept ('what is X', 'explain how X works here')",
    "summarization and triage ('summarize this constraint set', 'classify: who owns X')",
]


# ---------------------------------------------------------------------------
# Grounding backends — docs (always), K1 rerank (HTTP), K3 graph (stdio).
# Each is optional; failures degrade silently. Teacher rounds get their
# grounding injected, and dataset_stats.json records which sources were live.
# ---------------------------------------------------------------------------
import subprocess  # noqa: E402 (stdlib, used by the K3 stdio client)

DOC_SOURCES = [
    REPO / "AGENTS.md",
    REPO / "docs" / "agent-guide" / "reference.md",
    REPO / "docs" / "agent-guide" / "registry" / "runtimes.md",
    REPO / "docs" / "superpowers" / "references" / "gotchas-footguns.md",
] + sorted((REPO / "docs" / "runbooks").glob("*.md"))

BGE_ENV = Path.home() / ".config" / "bge-mcp" / "server.env"
BGE_MCP_URL = "http://127.0.0.1:13005/mcp"
CBM_BIN = "codebase-memory-mcp"


def load_doc_chunks(max_len=1400):
    """Split real repo docs into header-delimited chunks (always available)."""
    chunks = []
    for path in DOC_SOURCES:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for part in re.split(r"\n(?=#{1,3} )", text):
            part = part.strip()
            if MIN_NORMALIZED_LEN * 6 < len(part):
                chunks.append(("docs:" + path.name, part[:max_len]))
    return chunks


def _read_bge_token():
    """Read BGE_MCP_TOKEN from server.env. NEVER print or log the value."""
    try:
        for line in BGE_ENV.read_text(encoding="utf-8").splitlines():
            if line.startswith("BGE_MCP_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"')
    except OSError:
        pass
    return None


def _mcp_http_call(url, token, name, arguments, timeout=60):
    """Minimal MCP streamable-HTTP client: initialize -> tools/call."""
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    def post(payload):
        req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                     headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            sid = resp.headers.get("mcp-session-id")
            body = resp.read().decode()
        if not body.strip():  # notifications return 202 with empty body
            return {}, sid
        for line in body.splitlines():  # tolerate SSE framing
            if line.startswith("data:"):
                body = line[5:].strip()
                break
        return json.loads(body), sid

    result, sid = post({"jsonrpc": "2.0", "id": 1, "method": "initialize",
                        "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                                   "clientInfo": {"name": "bp-dataset", "version": "1"}}})
    if sid:
        headers["mcp-session-id"] = sid
    post({"jsonrpc": "2.0", "method": "notifications/initialized"})
    answer, _ = post({"jsonrpc": "2.0", "id": 2, "method": "tools/call",
                      "params": {"name": name, "arguments": arguments}})
    if answer.get("error"):
        raise RuntimeError(answer["error"].get("message", "mcp error"))
    content = answer["result"]["content"]
    return content[0]["text"] if content else ""


def k1_rerank(query, documents, top_k=2):
    """K1 semantic grounding via bge-mcp rerank. Returns [(tag, text)] or []."""
    token = _read_bge_token()
    if not token or not documents:
        return []
    try:
        text = _mcp_http_call(BGE_MCP_URL, token, "bge_rerank",
                              {"query": query, "documents": [d[1] for d in documents],
                               "top_k": top_k})
        data = json.loads(text)
        pairs = data if isinstance(data, list) else data.get("results", [])
        by_text = {d[1]: d for d in documents}
        out = []
        for hit in pairs[:top_k]:
            if not isinstance(hit, dict):
                continue
            if hit.get("document") in by_text:        # bge-mcp returns the text
                out.append(by_text[hit["document"]])
            elif isinstance(hit.get("index"), int) and 0 <= hit["index"] < len(documents):
                out.append(documents[hit["index"]])
        return out
    except Exception:
        return []


def k3_context(topic):
    """K3 code-graph grounding via the codebase-memory-mcp stdio binary."""
    script = (
        '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":'
        '"2024-11-05","capabilities":{},"clientInfo":{"name":"bp-dataset","version":"1"}}}\n'
        '{"jsonrpc":"2.0","method":"notifications/initialized"}\n'
        f'{{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{{"name":"search_graph",'
        f'"arguments":{{"query":{json.dumps(topic)},"limit":5}}}}}}\n'
    )
    try:
        proc = subprocess.run([CBM_BIN], input=script, capture_output=True,
                              text=True, timeout=2)
        for line in proc.stdout.splitlines():
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            if msg.get("id") == 2 and "result" in msg:
                content = msg["result"].get("content", [])
                return content[0]["text"][:1200] if content else ""
    except Exception:
        return ""
    return ""


def build_grounding(mode):
    """Return a callable topic -> [(tag, text)] assembling all live backends."""
    if mode == "none":
        return lambda topic, k=2: []
    chunks = load_doc_chunks()
    k3_available = bool(k3_context("test")) if mode == "auto" else False

    def chunk_for(topic, k=2):
        tokens = set(topic.lower().replace("-", " ").split())
        scored = sorted(
            chunks,
            key=lambda c: len(tokens & set(re.findall(r"[a-z0-9]+", c[1].lower()))),
            reverse=True,
        )[:6]
        picked = scored[:k]
        # K1 rerank refines the doc-chunk selection when reachable
        reranked = k1_rerank(topic, scored, top_k=k)
        if reranked:
            picked = [("k1:" + tag, text) for tag, text in reranked]
        # K3 graph facts when the binary responds
        if k3_available:
            k3 = k3_context(topic)
            if k3:
                picked.append(("k3:graph", k3))
        return picked

    return chunk_for


def chat(url, messages, temperature=0.8, max_tokens=3072, timeout=300):
    """One chat completion against a llama.cpp OpenAI endpoint (direct/non-thinking default)."""
    payload = json.dumps({
        "model": "local-teacher",
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        # the local rails run --jinja; thinking must stay off or the JSON
        # budget is consumed by reasoning tokens (content comes back empty)
        "chat_template_kwargs": {"enable_thinking": False},
    }).encode()
    req = urllib.request.Request(url.rstrip("/") + "/v1/chat/completions",
                                 data=payload,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = json.loads(resp.read())
    return body["choices"][0]["message"]["content"]


def qc_pass(kept, url, ground, batch=8):
    """27B judge pass over teacher entries. Drops 'wrong', counts 'unsure'."""
    teacher_idx = [i for i, (domain, _) in enumerate(kept) if domain == "teacher"]
    verdicts = {}
    for start in range(0, len(teacher_idx), batch):
        batch_idx = teacher_idx[start:start + batch]
        pairs_text, query_hint = [], None
        for n, i in enumerate(batch_idx):
            m = kept[i][1]["messages"]
            q, a = m[-2]["content"], m[-1]["content"]
            if query_hint is None:
                query_hint = q
            pairs_text.append(f"{n}. Q: {q[:300]}\n   A: {a[:600]}")
        context = ""
        if ground:
            try:
                chunks = ground(" ".join(query_hint.split()[:8]), k=1)
                if chunks:
                    context = f"\nReference context:\n{chunks[0][1][:1200]}\n"
            except Exception:
                pass
        prompt = (
            "You are a strict fact-checker for the Bachelorprojekt workspace. "
            "For each numbered Q/A pair below, judge whether the ANSWER is "
            "factually correct and safe for this workspace. Verdicts: 'correct', "
            "'wrong' (factually false or dangerous), 'unsure'. "
            f"{context}"
            "Reply ONLY with a JSON array: "
            '[{"n": <number>, "verdict": "correct|wrong|unsure", "reason": "<short>"}].\n\n'
            + "\n".join(pairs_text)
        )
        try:
            content = chat(url, [{"role": "user", "content": prompt}],
                           temperature=0.1, max_tokens=1500)
            content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
            m = re.search(r"\[.*\]", content, re.DOTALL)
            arr = json.loads(m.group(0)) if m else []
        except Exception as exc:  # noqa: BLE001 — QC is best-effort
            print(f"[qc] batch at {start} failed: {exc}", file=sys.stderr)
            continue
        for obj in arr:
            if isinstance(obj, dict) and obj.get("verdict"):
                try:
                    n_val = int(obj.get("n", 0))
                    if 0 <= n_val < len(batch_idx):
                        verdicts[batch_idx[n_val]] = obj["verdict"]
                except (ValueError, TypeError):
                    continue
    dropped = [i for i, v in verdicts.items() if v == "wrong"]
    unsure = sum(1 for v in verdicts.values() if v == "unsure")
    kept = [entry for i, entry in enumerate(kept) if i not in set(dropped)]
    stats = {"checked": len(verdicts), "dropped_wrong": len(dropped), "unsure": unsure}
    print(f"[qc] checked {stats['checked']}, dropped {stats['dropped_wrong']} wrong, "
          f"{stats['unsure']} unsure", flush=True)
    return kept, stats


def call_teacher(url, topic, angle, n_pairs=16, timeout=300, lang="en",
                 grounding=None):
    """One teacher round: generate JSON Q/A pairs for a topic from an angle."""
    lang_rule = ("Write BOTH question and answer in German."
                 if lang == "de" else "Write question and answer in English.")
    ground_block = ""
    if grounding:
        joined = "\n\n---\n\n".join(f"[{tag}]\n{text}" for tag, text in grounding)
        ground_block = (
            "\n\nVERIFIED CONTEXT (grounding — your answers MUST stay consistent "
            f"with it; if the context does not cover a detail, answer conservatively "
            f"and point to the owning doc):\n\n{joined}\n"
        )
    prompt = (
        f"Topic: {topic}. Question angle: {angle}. {lang_rule} "
        f"Generate {n_pairs} diverse question/answer pairs about this topic "
        "in the Bachelorprojekt workspace. Vary phrasing strongly; every question "
        "must be distinct. Answers must be technically specific to this workspace, "
        "1-6 sentences, code blocks where a command exists."
        f"{ground_block}"
    )
    payload = json.dumps({
        "model": "local-teacher",
        "messages": [
            {"role": "system", "content": TEACHER_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.8,
        "max_tokens": 3072,
        # the :1919 rail runs --jinja; disable thinking so the budget goes to
        # the JSON payload instead of reasoning tokens (content came back
        # empty with thinking enabled)
        "chat_template_kwargs": {"enable_thinking": False},
    }).encode()
    req = urllib.request.Request(
        url.rstrip("/") + "/v1/chat/completions", data=payload,
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = json.loads(resp.read())
    content = body["choices"][0]["message"]["content"]
    # strip thinking block + code fences before array extraction
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
    content = content.replace("```json", "").replace("```", "")
    m = re.search(r"\[.*\]", content, re.DOTALL)
    if not m:
        print(f"[teacher] no JSON array in response (first 200 chars): "
              f"{content[:200]!r}", file=sys.stderr)
        return []
    try:
        arr = json.loads(m.group(0))
    except json.JSONDecodeError as exc:
        print(f"[teacher] JSON decode failed ({exc}); raw tail: {m.group(0)[-200:]!r}",
              file=sys.stderr)
        return []
    out = []
    for obj in arr:
        if isinstance(obj, dict) and obj.get("question") and obj.get("answer"):
            out.append((str(obj["question"]), str(obj["answer"])))
    return out


def load_execution_corpus(path):
    """Bench export sft.jsonl — keep EXECUTION-role trajectories only.

    Role boundary (§0): planner/orchestrator/reviewer content is dropped —
    this model is an instruct worker; planning trains elsewhere (27B/cloud).
    """
    out, skipped = [], 0
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            skipped += 1
            continue
        meta = obj.get("meta") or {}
        if meta.get("role") not in EXECUTION_ROLES:
            skipped += 1
            continue
        msgs = obj.get("messages")
        if not msgs or not isinstance(msgs, list):
            skipped += 1
            continue
        out.append(("corpus-worker", {"messages": msgs}))
    print(f"[corpus] kept {len(out)} execution trajectories, skipped {skipped} "
          f"(planner/reviewer/malformed — role boundary §0)", flush=True)
    return out


def apply_system_mix(entries, rng):
    """Vary the system prompt (70% BP / 10% none / 10% worker / 10% German)."""
    mix_counts, out = {}, []
    for domain, item in entries:
        roll, acc, chosen = rng.random(), 0.0, SYSTEM_PROMPT
        for p, sys_prompt in SYSTEM_MIX:
            acc += p
            if roll <= acc:
                chosen = sys_prompt
                break
        key = "none" if chosen is None else ("bp" if chosen is SYSTEM_PROMPT
                                             else ("worker" if chosen.startswith("You") else "de"))
        mix_counts[key] = mix_counts.get(key, 0) + 1
        msgs = [m for m in item["messages"] if m["role"] != "system"]
        if chosen:
            msgs.insert(0, {"role": "system", "content": chosen})
        out.append((domain, {"messages": msgs}))
    return out, mix_counts


def is_german(text):
    return bool(re.search(r"[äöüßÄÖÜ]|\b(Wie|Was|Warum|Welche|Kann|Gibt|wird)\\b", text)) \
        and "environment" not in text[:60]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--teacher", action="store_true",
                    help="scale up via the local 27B rail (T2) after T1")
    ap.add_argument("--teacher-url", default="http://127.0.0.1:1919")
    ap.add_argument("--target", type=int, default=1100,
                    help="stop teacher rounds once >= TARGET unique entries")
    ap.add_argument("--rounds", type=int, default=150,
                    help="max teacher calls (one topic+angle+lang per call)")
    ap.add_argument("--temperature", type=float, default=0.8)
    ap.add_argument("--ground", choices=["auto", "docs", "none"], default="auto",
                    help="teacher grounding: auto = docs + K1 rerank + K3 graph "
                         "(each degrades silently when unreachable)")
    ap.add_argument("--qc", action="store_true",
                    help="27B judge pass over teacher entries; drops 'wrong' verdicts")
    ap.add_argument("--corpus", type=Path, default=None,
                    help="bench export sft.jsonl — merges EXECUTION-role "
                         "trajectories only (planner/reviewer dropped)")
    ap.add_argument("--slice-2b", action="store_true",
                    help="T900978 P1: 2B pilot slice (domain + anchor filter); "
                         "writes dataset_2b*.jsonl + dataset_stats.json")
    ap.add_argument("--slice-08b", action="store_true",
                    help="T900979 P1: 0.8B minimal mechanical slice (domain + anchor filter); "
                         "writes dataset_08b*.jsonl + dataset_stats.json")
    args = ap.parse_args()

    rng = random.Random(SEED)

    # ---- grounding backends ----
    ground = build_grounding(args.ground)
    ground_probe = ground("deploy mentolder") if args.ground != "none" else []
    ground_tags = sorted({tag.split(":")[0] for tag, _ in ground_probe})
    print(f"[ground] live sources: {ground_tags or ['none']}", flush=True)

    # ---- T1 ----
    raw = build_t1()
    t1_count = len(raw)
    slice_stats = {}
    out_prefix = "dataset"
    if args.slice_2b:
        raw, slice_stats = apply_slice_2b(raw)
        out_prefix = "dataset_2b"
        print(f"[slice-2b] {slice_stats['slice_kept']}/{slice_stats['slice_raw']} kept "
              f"(domains {','.join(slice_stats['slice_domains'])})", flush=True)
    elif args.slice_08b:
        raw, slice_stats = apply_slice_08b(raw)
        out_prefix = "dataset_08b"
        print(f"[slice-08b] {slice_stats['slice_kept']}/{slice_stats['slice_raw']} kept "
              f"(domains {','.join(slice_stats['slice_domains'])})", flush=True)
    kept, stats = dedup(raw)
    t1_unique = len(kept)

    # ---- execution-role corpus merge (role boundary §0) ----
    corpus_added = 0
    if args.corpus:
        before = len(kept)
        kept, _ = dedup(kept + load_execution_corpus(args.corpus))
        corpus_added = len(kept) - before

    # ---- T2 (optional) ----
    teacher_raw, teacher_unique, round_i = 0, 0, 0
    ground_tags_seen = set()
    if args.teacher:
        while len(kept) < args.target and round_i < args.rounds:
            topic = TEACHER_TOPICS[round_i % len(TEACHER_TOPICS)]
            angle = TEACHER_ANGLES[(round_i // len(TEACHER_TOPICS)) % len(TEACHER_ANGLES)]
            lang = "de" if (round_i // len(TEACHER_TOPICS)) % 3 == 2 else "en"
            ctx = ground(topic) if args.ground != "none" else []
            ground_tags_seen.update(tag.split(":")[0] for tag, _ in ctx)
            try:
                pairs = call_teacher(args.teacher_url, topic, angle, lang=lang,
                                     grounding=ctx)
            except Exception as exc:  # noqa: BLE001 — teacher is best-effort
                print(f"[teacher] round {round_i} ({topic}) failed: {exc}", file=sys.stderr)
                round_i += 1
                continue
            batch = [("teacher", pair(q, a)) for q, a in pairs]
            teacher_raw += len(batch)
            kept, _ = dedup(kept + batch)
            teacher_unique = len(kept) - t1_unique - corpus_added
            print(f"[teacher] round {round_i} ({topic} | {angle.split('(')[0].strip()} "
                  f"| {lang} | +{len(ctx)} ground): +{len(batch)} raw -> "
                  f"total unique {len(kept)}", flush=True)
            round_i += 1

    # ---- T2b: QC judge pass ----
    qc_stats = {"checked": 0, "dropped_wrong": 0, "unsure": 0}
    if args.teacher and args.qc:
        kept, qc_stats = qc_pass(kept, args.teacher_url, ground)
        while len(kept) < args.target and round_i < args.rounds:
            topic = TEACHER_TOPICS[round_i % len(TEACHER_TOPICS)]
            angle = TEACHER_ANGLES[(round_i // len(TEACHER_TOPICS)) % len(TEACHER_ANGLES)]
            lang = "de" if (round_i // len(TEACHER_TOPICS)) % 3 == 2 else "en"
            ctx = ground(topic) if args.ground != "none" else []
            ground_tags_seen.update(tag.split(":")[0] for tag, _ in ctx)
            try:
                pairs = call_teacher(args.teacher_url, topic, angle, lang=lang,
                                     grounding=ctx)
            except Exception as exc:  # noqa: BLE001 — teacher is best-effort
                print(f"[teacher] round {round_i} ({topic}) failed: {exc}", file=sys.stderr)
                round_i += 1
                continue
            batch = [("teacher", pair(q, a)) for q, a in pairs]
            teacher_raw += len(batch)
            kept, _ = dedup(kept + batch)
            teacher_unique = len(kept) - t1_unique - corpus_added
            print(f"[teacher-topup] round {round_i} ({topic} | {angle.split('(')[0].strip()} "
                  f"| {lang} | +{len(ctx)} ground): +{len(batch)} raw -> "
                  f"total unique {len(kept)}", flush=True)
            round_i += 1

    # ---- system-prompt mix ----
    kept, system_mix = apply_system_mix(kept, rng)

    # ---- split + write ----
    entries = list(kept)
    rng.shuffle(entries)
    n_val = max(1, round(len(entries) * VAL_FRACTION))
    val, train = entries[:n_val], entries[n_val:]

    def dump(path, rows):
        with open(path, "w", encoding="utf-8") as f:
            for _, item in rows:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")

    dump(HERE / f"{out_prefix}.jsonl", entries)
    dump(HERE / f"{out_prefix}_train.jsonl", train)
    dump(HERE / f"{out_prefix}_val.jsonl", val)

    by_domain, german = {}, 0
    for domain, item in entries:
        by_domain[domain] = by_domain.get(domain, 0) + 1
        if is_german(item["messages"][-2]["content"]):
            german += 1

    stats_out = {
        "t1_raw": t1_count,
        "t1_unique": t1_unique,
        "corpus_worker_added": corpus_added,
        "teacher_raw": teacher_raw,
        "teacher_unique_added": teacher_unique,
        "qc": qc_stats,
        "grounding_sources": sorted(ground_tags_seen),
        "system_mix": system_mix,
        "german_entries": german,
        "total_unique": len(entries),
        "train": len(train),
        "val": len(val),
        "target": args.target,
        "target_met": len(entries) >= args.target if args.teacher else None,
        "near_dup_jaccard": NEAR_DUP_JACCARD,
        "slice_2b": slice_stats if args.slice_2b else _prev_slice("slice_2b"),
        "slice_08b": slice_stats if args.slice_08b else _prev_slice("slice_08b"),
        "by_domain": dict(sorted(by_domain.items(), key=lambda kv: -kv[1])),
        **stats,
    }
    with open(HERE / "dataset_stats.json", "w", encoding="utf-8") as f:
        json.dump(stats_out, f, indent=2, ensure_ascii=False)

    print(json.dumps(stats_out, indent=2, ensure_ascii=False))
    print(f"\nWrote {out_prefix}.jsonl / {out_prefix}_train.jsonl / "
          f"{out_prefix}_val.jsonl / dataset_stats.json in {HERE}")
    if not args.teacher and len(entries) < 1000:
        print("\nNOTE: below the 1000-unique goal — run the T2 teacher scale-up:\n"
              "  python3 .agents/training/generate_dataset.py --teacher --qc --target 1100")


if __name__ == "__main__":
    main()
