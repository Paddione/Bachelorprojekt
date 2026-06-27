---
name: ticket-ops
description: Use for non-incident operational ticket work — triaging open tickets for completeness/missing info, asking the user for info that needs human input, planning parallel work across tickets, repository hygiene (stale worktrees/branches), and GitHub PR merge-and-close. Triggers — "triage tickets", "what can I work on", "plan parallel work", "what's missing on these tickets", stale branches, merge PRs.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# ticket-ops

Day-to-day ticket management, repository hygiene, and PR lifecycle. For time-critical production incidents, use `incident-response` instead.

## Workflow at a glance

A full ticket-ops pass runs four phases in order. Phases 1–3 are the **triage → clarify → parallel-plan** pipeline; Phase 4 is housekeeping.

1. **Completeness triage** — fetch every open ticket, compute *what each is missing*, classify.
2. **Human clarification** — for the filtered subset that needs human input, ask the user the missing questions (batched), write answers back to the DB.
3. **Parallelization masterplan** — build the dependency graph over the now-ready tickets, sort into waves, surface conflicts, and (on approval) dispatch wave 1 in parallel.
4. **Repository hygiene & PR triage** — stale worktrees/branches, merge green PRs, close linked tickets.

For a narrow request ("just merge the green PRs"), jump straight to the relevant phase. For "triage everything / what can I work on in parallel", run 1 → 2 → 3 in sequence.

---

## Ticket model & GitHub linkage (read first)

The internal Postgres tracker — `tickets.tickets` on `mentolder` (`website` DB) — is the **single source of truth for issues**. This repo does **not** use GitHub Issues (`gh issue`); the website admin at `https://web.mentolder.de/admin/bugs` is the UI over the same table. If a GitHub issue ever does appear, treat it as intake (see GitHub Issue Intake): copy it into a `tickets.tickets` row, then close the GitHub issue referencing the new `external_id`.

GitHub **PRs are the CI/CD merge mechanism** and link back to a ticket by convention — there is **no `ticket_id` FK on PRs**. The link lives in three soft channels:
- the `[T000XXX]` tag in the PR/commit title and the `fix/tNNNN-…` / `feature/…` branch name,
- `tickets.ticket_plans.pr_number` (written when a plan is archived by `dev-flow-execute`),
- a closing row in `tickets.ticket_comments` (`PR #N merged …`).

**Ticket-to-ticket dependencies** live in two places — read **both** in Phase 3:
- `tickets.tickets.depends_on` — a `text[]` of blocking `external_id`s on the row itself.
- `tickets.ticket_links` — normalised edges (`to_id` is `NOT NULL`, `kind ∈ blocks|blocked_by|duplicate_of|relates_to|fixes|fixed_by`). Never use `ticket_links` for PR references — it is ticket→ticket only.

**Enum reference** (closing/updating a ticket with an out-of-set value fails the CHECK constraint):
`priority ∈ {hoch,mittel,niedrig}` · `severity ∈ {critical,major,minor,trivial}` · `status ∈ {triage,planning,plan_staged,backlog,in_progress,in_review,blocked,qa_review,done,archived}` · `resolution ∈ {fixed,shipped,obsolete}` · `attention_mode ∈ {auto,ai_ready,needs_human}` (default `auto`).

**Definition of Readiness (DoR)** — the completeness model for `type='feature'` ideas, stored in the `readiness` JSONB column. Four boolean flags; all four true = "ready" (`dorScore = 4`):
`spec_skizziert` (spec sketched) · `offene_fragen_geklaert` (open questions clarified) · `abhaengigkeiten_klar` (dependencies clear) · `aufwand_geschaetzt` (effort estimated).
This mirrors `website/src/lib/planning-office.ts` (`DOR_KEYS`, `dorScore`) and the admin "Planungsbüro" UI — keep the two consistent; the skill is the SQL view of the same model.

**DB-Zugriff — MCP-Postgres für Reads bevorzugen.** Das `mcp-postgres` MCP-Tool (`mcp__mcp-postgres__query`)
ist read-only und direkt verfügbar, wenn der MCP-Server läuft (einfach mit `SELECT 1` testen).
Die `psql()`-Bash-Hilfsfunktion unten ist der **Fallback** für Reads bei fehlendem MCP-Zugriff
und der **Pflichtweg für schreibende** Statements (INSERT/UPDATE/DELETE) — das MCP-Query-Tool ist
read-only. Siehe [`MCP-Tool-Guide`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md).

All SQL below assumes:
```bash
PGPOD=$(kubectl get pod -n workspace --context fleet -l app=shared-db -o name | head -1)
psql() { kubectl exec "$PGPOD" -n workspace --context fleet -c postgres -- psql -U website -d website "$@"; }
```

> ⚠️ **Warning on tickets.ticket_plans**: When querying this table, never run `SELECT *` or retrieve the `content` column without filtering by a specific ticket/slug. The `content` column stores large plan markdown files, and querying the entire table will transfer megabytes over `kubectl exec`, causing connection timeouts. Always query metadata columns (e.g. `id`, `ticket_id`, `slug`, `branch`, `pr_number`, `archived_at`) or filter explicitly.

---

## Phase 1 — Completeness Triage

Fetch every open ticket and compute, per ticket, **what is missing** before it can be worked. This is a two-tier rubric: a lightweight field check for *all* tickets, plus the DoR check for planning-stage features.

### Step 1.1: Fetch open tickets (enriched)

**MCP-first** (`mcp-postgres`, read-only): pass the query below to `mcp__mcp-postgres__query({ sql: "…" })`. Fallback: `psql -c "<query>"` via the `psql()` helper above.

```sql
SELECT external_id, title, type, status, priority, severity, component, areas,
       depends_on, attention_mode, planning_rank, readiness,
       COALESCE(length(trim(description)),0) AS desc_len, created_at::date
FROM tickets.tickets
WHERE status NOT IN ('done','archived')
ORDER BY CASE priority WHEN 'hoch' THEN 1 WHEN 'mittel' THEN 2 WHEN 'niedrig' THEN 3 ELSE 4 END,
         created_at ASC;
```

### Step 1.2: Compute the `missing[]` list per ticket

**Tier A — every ticket** (a NULL/empty here is a gap):
- `priority IS NULL` → `priority`
- `type = 'bug' AND severity IS NULL` → `severity`
- `desc_len < 30` → `description` (too thin to act on)
- `component IS NULL AND (areas IS NULL OR areas = '{}')` → `area/component`

**Tier B — only `type='feature' AND status='planning'`** — for each DoR flag not `true` in `readiness`, add `dor:<flag>`. `dorScore < 4` ⇒ incomplete. (A feature can also still hit Tier-A gaps.)

A ticket with an empty `missing[]` is **ready**. *Do not touch `in_progress` tickets referencing a live plan branch.*

### Step 1.3: Load OpenSpec status & render the triage table

```bash
OMAP_FILE="$REPO/website/src/data/openspec-status.json"
[[ -f "$OMAP_FILE" ]] || bash "$REPO/scripts/openspec-status-map.sh"   # regen if missing
get_openspec_status() { jq -r --arg id "$1" '.[$id] // [] | map("\(.status):\(.slug)") | join(", ")' "$OMAP_FILE" 2>/dev/null || echo ""; }
```

Render one row per ticket with a `missing[]` column (use `get_openspec_status "$ext_id"`, `—` when empty):
```
T000953 | Cockpit Fullscreen   | plan_staged | hoch    | DoR 4/4 | —              | READY
T000959 | Status-Badge         | planning    | mittel  | DoR 2/4 | spec, aufwand  | READY (openspec…)
T000738 | Unbekanntes Feature  | backlog     | niedrig | —       | description    | needs_human?
```

### Step 1.4: Classify (resolution × completeness)
- **Already resolved** (PR merged, work shipped): mark `done` + `fixed` (or `shipped` for features), cite the PR.
- **Obsolete** (e.g. decommissioned service): mark `done` + `obsolete`.
- **Ready** (`missing[]` empty): eligible for the Phase 3 masterplan. If it is an AI-fixable feature/bug with no human decisions left, set `attention_mode='ai_ready'`.
- **Incomplete** (`missing[]` non-empty): if the gaps are AI-fillable (e.g. auto-triage can guess priority/severity/component), fill them and re-check. If a gap genuinely needs your judgement, set `attention_mode='needs_human'` — it becomes a candidate for Phase 2.

*Phase-1 writes are bookkeeping only* — `attention_mode`, and `done`/`obsolete` for tickets with **cited** merge/decommission evidence. Anything ambiguous is left untouched and surfaces as a Phase-2 question. The only approval-gated action in this whole skill is the wave-1 dispatch in Step 3.5.

---

## Phase 2 — Human Clarification Round

Ask the user for the missing info that only a human can supply, **batched** and **filtered** so the session stays focused.

### Step 2.1: Select the ask-set (filtered, capped)
Eligible = `missing[]` non-empty **AND** ( `attention_mode = 'needs_human'` **OR** `priority = 'hoch'` **OR** `planning_rank = 0` ).
(`planning_rank = 0` is the explicitly **promoted next-candidate** — `planning-office.ts::promoteItem` sets it; `NULL`/large ranks mean *not* promoted.)
Process at most **~6 tickets per round**, highest priority first. Any eligible ticket beyond the cap is listed explicitly as **DEFERRED** in your summary — never silently dropped.

### Step 2.2: Derive the questions

Mirror `website/src/lib/clarification-questions.ts` (`deriveSections`) — the source of truth. Map each gap to a concrete question:

| Gap | Question(s) |
|---|---|
| `dor:abhaengigkeiten_klar` | Welche Tickets müssen vorher fertig sein? Externe Dienste nötig (DB-Schema / Sealed-Secret / OIDC-Client)? |
| `dor:spec_skizziert` | Kern-Flow / Hauptablauf? Was ist explizit NICHT im Scope? |
| `dor:offene_fragen_geklaert` | Bereichsspezifisch nach `areas` — brett (Rollen/Mobile/Disconnect), website (Routen/Auth), chat (Realtime/Scope), infra (Brands/Deploy), auth (Flow/Claims), ai (Modell-Klasse/Fallback). Keine `areas` → generisch: offene Fragen + Akzeptanzkriterium. |
| `dor:aufwand_geschaetzt` | Aufwand: klein / mittel / gross? |
| `priority` / `severity` | Priorität (hoch/mittel/niedrig)? Severity (critical/major/minor/trivial)? |
| `area/component` | Welcher Bereich/Component ist betroffen? |

### Step 2.3: Ask via `AskUserQuestion`
One `AskUserQuestion` round per ticket (≤4 questions per call — split into multiple calls if a ticket has more), in priority order. Use the radio/checkbox option sets from `clarification-questions.ts` where they exist; free-text otherwise. If you are running without the `AskUserQuestion` tool (e.g. dispatched as a subagent), fall back to one consolidated plain-text question per ticket.

### Step 2.4: Write answers back to the DB

**MCP-first** (`ticket-mcp` lifecycle, where a wrapper exists — these shell out to `ticket.sh`, the sanctioned write path, NOT via the read-only `mcp-postgres`): set DoR flags via `set_readiness_flag` (one per flag) or `prepare_feature`; set effort/areas/depends_on via `set_plan_meta`; append the clarification comment via `add_comment`.

> `mcp__ticket-mcp__set_readiness_flag({ id: "T000XXX", flag: "spec_skizziert", value: true })`
> `mcp__ticket-mcp__set_plan_meta({ id: "T000XXX", effort: "mittel", depends_on: "T000YYY" })`
> `mcp__ticket-mcp__add_comment({ id: "T000XXX", body: "## Klärungsrunde …" })`

Fallback / bulk path (ticket-mcp nicht erreichbar, oder für Felder ohne Wrapper wie ein direkter `priority`-Set + eine einzelne JSONB-Readiness-Merge): Writes go through `psql()` (the MCP query tool is read-only). Per ticket, set the now-satisfied DoR flags via a JSONB merge (never clobber other flags), update the answered fields, and append a clarification comment:

```bash
psql -c "
UPDATE tickets.tickets
   SET readiness   = COALESCE(readiness,'{}'::jsonb) || '{\"spec_skizziert\":true,\"aufwand_geschaetzt\":true}'::jsonb,
       effort      = 'mittel',
       depends_on  = ARRAY['T000YYY'],
       priority    = 'hoch',
       updated_at  = now()
 WHERE external_id = 'T000XXX';
INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
SELECT id, 'claude-code',
       E'## Klärungsrunde $(date +%F)\n| Frage | Antwort |\n|---|---|\n| Kern-Flow | … |\n| Aufwand | mittel |',
       'internal'
  FROM tickets.tickets WHERE external_id = 'T000XXX';"
```
After write-back, re-run the Tier-A/Tier-B check on those tickets — the ones now at `missing[] = []` join the ready set for Phase 3.

---

## Phase 3 — Parallelization Masterplan

Take the **ready** tickets (empty `missing[]`, AI-actionable) and plan the maximum safe parallelism.

### Step 3.1: Build the dependency graph
Edges come from two sources — merge both:
- `depends_on` array (already fetched in 1.1): `B.depends_on = [A]` ⇒ edge `A → B`.
- `ticket_links`:
  ```sql
  SELECT f.external_id AS a, t.external_id AS b, l.kind
  FROM tickets.ticket_links l
  JOIN tickets.tickets f ON f.id = l.from_id
  JOIN tickets.tickets t ON t.id = l.to_id
  WHERE l.kind IN ('blocks','blocked_by');
  ```
  `kind='blocks'` ⇒ `a → b` (a must finish first). `kind='blocked_by'` ⇒ `b → a`.

**Soft conflict edges:** two ready tickets that share any `areas` entry have a file-collision risk → they may not sit in the **same** wave (serialise them). This is conservative by design (the approved heuristic); flag it rather than hide it.

### Step 3.2: Topologically sort into waves
- **Wave N** = every ready ticket whose hard dependencies are all satisfied by waves `< N` **and** which has no `areas` conflict with another ticket already placed in wave N.
- **Maximise wave width** (the goal is "as much in parallel as possible") subject to those two constraints.
- Order ties by `priority` (hoch > mittel > niedrig), then smaller `effort` first (quick wins).

### Step 3.3: Route each ticket (plan vs. execute)
The dev-flow contract splits the parallel unit:
- `status = 'plan_staged'` (a plan already exists) → **execution wave**: dispatch `dev-flow-execute`.
- `attention_mode = 'ai_ready'` / DoR-complete feature **without** a staged plan → **planning wave**: dispatch `dev-flow-plan` (creates + pushes the plan, then stops). These feed future execution waves; do not pretend they execute now.
- **Any other ready ticket** (e.g. `backlog`/`triage`, no plan, `ai_ready` not yet set) → also a **planning wave** (`dev-flow-plan`). No ready ticket is left without a route.

### Step 3.4: Present the masterplan
```
WELLE 1  (parallel · keine offenen Abh.)
  T000953  Cockpit Fullscreen   hoch   area:website  plan_staged → execute (wt-A)
  T000801  DB-Index Backfill    hoch   area:db       plan_staged → execute (wt-B)
WELLE 2  (nach T000953)
  T000959  Status-Badge         mittel area:website  ai_ready    → plan    (wt-C)  ⊳ depends T000953
⚠ KONFLIKT: T000953 & T000961 beide area:website/admin → seriell (T000961 → Welle 2)
DEFERRED (needs_human, ungeklärt): T000738
```

### Step 3.5: Dispatch wave 1 (after the user approves)
For each wave-1 ticket, in parallel (use `dispatching-parallel-agents`):
1. `bash scripts/agent-lock.sh claim ticket <ext-id> --branch <b> --worktree <wt> --label ticket-ops` (skip/coordinate on exit 1 — a live session already owns it).
2. Create the worktree: `bash scripts/worktree-create.sh <branch> tmp/wt-<slug>`.
3. Hand to `dev-flow-execute` (plan_staged) or `dev-flow-plan` (unplanned) inside that worktree.

Merge = Abschluss: each ticket closes on its own green auto-merge; the masterplan tracks dispatch, not prod-live.

---

## Phase 4 — Repository Hygiene & PR Triage

### Step 4.1: Stale Git Worktrees
List worktrees: `git worktree list`.
Verify if the branch is merged: `git log main..<branch> --oneline` (empty means fully merged).
Remove stale worktrees:
```bash
git worktree remove <path> --force
```

### Step 4.2: Stale Branches
Prune local and remote branches:
```bash
# Safe batch-delete merged local branches
git branch --merged main | grep -v 'main' | xargs git branch -d

# Prune gone remote-tracking branches
git fetch --prune
```

> **`--merged` misses squash-merged branches.** This repo merges via **squash-and-merge** (Dev Rule 3), which rewrites a branch's commits into one new commit on `main`. The original branch tip is therefore NOT an ancestor of `main`, so `git branch --merged` never lists it and `git branch -d` refuses to delete it. Reclaim these branches by detecting that their remote is **[gone]** (deleted by `gh pr merge --delete-branch`) and confirming the PR actually merged, then force-deleting:
> ```bash
> # After `git fetch --prune`, list local branches whose upstream is gone
> git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads \
>   | awk '$2 == "[gone]" {print $1}' \
>   | while read -r b; do
>       # Verify the PR for this branch is merged before destroying local work
>       merged=$(gh pr list --head "$b" --state merged --json number -q '.[0].number')
>       if [ -n "$merged" ]; then
>         git branch -D "$b"   # safe: PR #$merged merged, remote gone
>       else
>         echo "SKIP $b — upstream gone but no merged PR found; inspect manually"
>       fi
>     done
> ```
> Only `-D` (force) works here — `-d` will refuse because git does not see the squash-merged history.

### Step 4.3: GitHub PR Triage → close the linked ticket
List open PRs:
```bash
gh pr list --state open --json number,title,headRefName,statusCheckRollup,reviewDecision,isDraft,mergeStateStatus
```

For each PR, first recover the ticket it resolves (soft link — see preamble). Title tag wins; branch name is the fallback:
```bash
TITLE=$(gh pr view <number> --json title -q '.title')
BRANCH=$(gh pr view <number> --json headRefName -q '.headRefName')
TICKET_ID=$(printf '%s %s' "$TITLE" "$BRANCH" | grep -oiE 'T[0-9]{6}' | head -1 | tr a-z A-Z)
```

* **Merge (mergeable, CI green, not draft):**
  ```bash
  gh pr merge <number> --squash --delete-branch
  ```
  > **Expected exit 1 after a squash-merge is NOT a failure.** A squash-merge makes the local branch diverge from `main`, so `gh pr merge` exits 1 with `not possible to fast-forward` even though the PR merged. **Always verify by timestamp, never by exit code:**
  > ```bash
  > gh pr view <number> --json mergedAt -q '.mergedAt'   # empty = still open; timestamp = merged
  > ```
  Use `--auto` instead when CI is still running — GitHub merges once checks pass.

* **Close the ticket once `mergedAt` is set** (only if `$TICKET_ID` was found; `resolution`: `fixed` for `fix/*`, `shipped` for `feature/*`) — **MCP-first** (`ticket-mcp` lifecycle; the wrappers write via `ticket.sh`, not via the read-only `mcp-postgres`):
  > `mcp__ticket-mcp__transition_status({ id: "$TICKET_ID", status: "done", resolution: "<fixed|shipped>" })`
  > `mcp__ticket-mcp__add_comment({ id: "$TICKET_ID", body: "PR #<number> merged." })`

  Fallback (ticket-mcp nicht erreichbar — direkte Writes über `psql`):
  ```bash
  psql -c \
    "UPDATE tickets.tickets SET status='done', resolution='fixed', done_at=now()
     WHERE external_id='$TICKET_ID' AND status <> 'done';
     INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
     SELECT id, 'claude-code', 'PR #<number> merged.', 'internal'
     FROM tickets.tickets WHERE external_id='$TICKET_ID';"
  ```
  If no `T000XXX` is recoverable, the PR is unlinked — note it and leave any ticket untouched.

* **CI Failures:** Diagnose failed checks with `gh pr checks <number>`. Do not merge red PRs. If the failure is a known flake, re-run; otherwise leave the PR open and (if it has a ticket) leave the ticket `in_progress`.

### Step 4.4: GitHub Issue Intake (rare)
This repo tracks issues in Postgres, not GitHub. If `gh issue list --state open` returns anything, funnel it in rather than working it on GitHub:
1. Create a `tickets.tickets` row from the issue (`type`, `brand`, `title`, `description`, `status='triage'`).
2. `gh issue close <n> --comment "Tracked internally as <external_id>."`

---

## Software-Factory-Queue (MCP-first)

Für Factory-Queue-Status und manuelles Anstoßen die `factory-mcp`-Tools bevorzugen (HTTP-Daemon auf `127.0.0.1:13003`). **Verfügbarkeits-Guard zuerst:** `curl -sf --max-time 2 http://127.0.0.1:13003/health` — bei Erfolg MCP, sonst Skript-Fallback.

**MCP-first** (`factory-mcp`):

> `mcp__factory-mcp__factory_status()` — Queue-Tiefe + ob gerade ein Tick läuft
> `mcp__factory-mcp__factory_queue()` — wartende Tickets (backlog + plan_staged)
> `mcp__factory-mcp__factory_trigger()` — sofortigen Factory-Tick auslösen
> `mcp__factory-mcp__factory_enqueue({ ticket_id: "T000XXX" })` · `mcp__factory-mcp__factory_recent({ limit: 10 })`

Fallback (Daemon `:13003` nicht erreichbar):
- Status/Queue → `mcp__mcp-postgres__query` bzw. `psql` SELECT auf `tickets.tickets WHERE status IN ('backlog','plan_staged')`.
- Tick auslösen → `bash scripts/factory/wakeup.sh`.

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits cleanly.

## Related Skills

| Skill | Relationship |
|-------|--------------|
| `incident-response` | Time-critical incidents — different workflow |
| `dispatching-parallel-agents` | Phase 3 wave-1 fan-out across ready tickets |
| `using-git-worktrees` | Isolated worktrees for parallel dispatch |
| `dev-flow-plan` | Planning-wave tickets (ai_ready, no staged plan) |
| `dev-flow-execute` | Execution-wave tickets (plan_staged) |
| `mishap-tracker` | Converts execution mishaps to tickets |
| `database-ops` | DB-related tickets |
