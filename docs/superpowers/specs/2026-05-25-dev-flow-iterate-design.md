# dev-flow-iterate — Design Spec

**Date:** 2026-05-25
**Status:** approved
**Slug:** dev-flow-iterate

---

## Goal

Add a full-loop local dev iteration skill that deploys to a dev k3d cluster, browses
with Playwright MCP, tails pod logs, synthesizes issues, applies code fixes, and
redeploys — repeating until the user says done or a cycle cap is hit.

Two entry points:
- **Standalone** — invoke `dev-flow-iterate` from any branch at any time
- **Embedded** — `dev-flow-execute` Step 4 calls it instead of its current ad-hoc snippet

---

## Clusters

| Env | Cluster context | Dev URL | Accessibility |
|-----|----------------|---------|---------------|
| `mentolder` | `k3d-mentolder-dev` | `https://dev.mentolder.de` | Public |
| `korczewski` | `k3d-korczewski-dev` | resolved via `env-resolve.sh korczewski` → DEV_DOMAIN | wg-mesh only (10.10.0.3) — Playwright MCP on WSL host reaches it directly |

Connection details are always sourced via `scripts/env-resolve.sh <env>` — never hardcoded.

---

## Entry Points

### Standalone

User or Claude invokes `dev-flow-iterate` directly. Skill asks:
1. Which cluster? (`mentolder` / `korczewski`)
2. Which surface? (`website` / `brett` / `full`) — or auto-detect from `git diff --name-only origin/main`

### Embedded (dev-flow-execute Step 4)

Caller passes ENV and surface (auto-detected from changed files on the branch).
Skill skips the two startup questions and goes straight to Cycle 1.
After the last cycle the skill returns control to Step 5 (PR).

If `task dev:cluster:status` shows the cluster is unreachable, the skill exits
immediately and `dev-flow-execute` skips to Step 5.

---

## Surface → Task Mapping

| Changed files | Redeploy task | Pods watched |
|---------------|--------------|--------------|
| `website/src/**`, `website/public/**` | `task dev:redeploy:website ENV=<env>` | `app=website` |
| `brett/**` | `task dev:redeploy:brett ENV=<env>` | `app=brett` |
| `k3d/**` or multiple surfaces | `task dev:deploy ENV=<env>` | `app=website`, `app=brett` |

Auto-detection logic (run when surface not provided by caller):

```bash
CHANGED=$(git diff --name-only origin/main)
if echo "$CHANGED" | grep -q '^brett/'; then
  SURFACE=brett
elif echo "$CHANGED" | grep -q '^k3d/\|^prod'; then
  SURFACE=full
else
  SURFACE=website   # default — website/src/** or anything else
fi
```

---

## The Iteration Loop

### One cycle

```
CYCLE N:
  1. Run redeploy task for SURFACE + ENV
  2. kubectl rollout status -n $NS_DEV -l app=<surface> --context $CTX_DEV --timeout=90s
  3. kubectl logs -l app=<surface> -n $NS_DEV --context $CTX_DEV --tail=50
  4. Playwright MCP:
       browser_navigate    → $DEV_URL/<inferred-route> (derived from changed file paths, defaults to /)
       browser_snapshot    → accessibility tree
       browser_take_screenshot → /tmp/dev-iterate-<N>.png
       browser_console_messages → JS console errors
  5. Synthesize: Claude reads logs + snapshot + console errors
       → lists issues found (numbered), or declares "no issues visible"
  6a. Issues found:
       - Claude proposes fix per issue
       - Applies via Edit tool (or asks user to confirm if destructive)
       - Reports: "Fixed <N> issue(s). Run cycle <N+1>? (yes / stop)"
  6b. No issues found:
       - Reports: "Cycle <N>: no issues visible. Keep checking or stop? (stop / continue)"
```

### Termination conditions

| Condition | Action |
|-----------|--------|
| User says `done` / `stop` / `looks good` | Exit skill, return to caller |
| Clean cycle (no issues) + user says stop | Exit skill |
| Cycle cap reached (8 cycles) | Summarize remaining open issues, exit skill |

The cycle cap prevents runaway loops. When hit, the summary lists all unfixed issues
so the user can decide to open the PR anyway or continue iterating manually.

---

## dev-flow-execute Step 4 (replacement)

Old Step 4 (ad-hoc snippet):
```
> optional ... task dev:cluster:status / dev:deploy / dev:redeploy:website / dev:redeploy:brett
```

New Step 4:
```markdown
## Schritt 4: Dev-Iteration (optional)

Prüfe ob der dev-Stack erreichbar ist:

```bash
task dev:cluster:status ENV=<env>
```

Falls erreichbar: Rufe `dev-flow-iterate` auf. Übergib:
- ENV: aus dem Branch-Kontext (`mentolder` oder `korczewski`)
- SURFACE: auto-detect aus `git diff --name-only origin/main`

Der Skill übernimmt Deploy, Browser, Logs, Fix-Loop vollständig.
Nach dem letzten Cycle übergibt er die Kontrolle zurück an Schritt 5 (PR).

Falls nicht erreichbar: Schritt 4 überspringen, direkt zu Schritt 5.
```

---

## Artifacts

| Artifact | Action |
|----------|--------|
| `.claude/skills/dev-flow-iterate/SKILL.md` | Create new |
| `.claude/skills/dev-flow-execute/SKILL.md` | Edit Step 4 (replace ad-hoc snippet) |

No new Taskfile tasks, no new scripts — reuses existing `task dev:redeploy:*`,
`kubectl`, and Playwright MCP tools.

---

## Out of scope

- Astro hot-reload dev server (`task website:dev` / localhost:4321) — a different surface,
  not part of this skill
- Auto-opening a PR after iteration completes — that stays in `dev-flow-execute` Step 5
- Korczewski tunnel setup — wg-mesh is assumed to be up; skill fails fast with a clear
  message if `DEV_DOMAIN` is unreachable
