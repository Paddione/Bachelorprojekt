---
title: "agentic-routing-frontmatter-drift — Implementation Plan"
domains: [agentic-tooling, docs]
status: active
file_locks: []
shared_changes: false
batch_id: null
depends_on_plans: []
---

# agentic-routing-frontmatter-drift — Implementation Plan

## File Structure

```
scripts/health-goals-check.sh     (edit — fix section parsing from ## Agent Routing → <details>Claude Code Domain Agents</details>)
AGENTS.md                          (edit — sync Signal-Spalte im Domain-Agenten-Table mit Frontmatter falls nötig)
```

## Task 1 — Fix the check script section parsing

In `scripts/health-goals-check.sh` (line 216), the section marker is:

```python
if re.match(r'^## Agent Routing',line): seg=True; continue
```

This needs to be expanded to ALSO detect the `<details><summary>Claude Code Domain Agents</summary>` section and parse the table inside it (lines 89-96 of `AGENTS.md`).

**Implementation approach:**

Replace the section-detection logic to search for BOTH tables:

1. First try `## Agent Routing` (for opencode local LLM agents) → already works
2. ALSO parse the `<details><summary>Claude Code Domain Agents</summary>` block, looking for the markdown table starting at `| Signals | Agent |` and ending at the `</details>` or next heading

The comparison logic remains the same: compare first column (triggers/signals) against frontmatter `triggers on:` field.

**Verification:**

```bash
python3 - <<'PY'
import re,glob,os
def norm(t):
    t=re.sub(r'\([^)]*\)','',t); t=t.replace('`','').replace('"','').replace("'","")
    return t.strip().rstrip('.').strip().lower()
def toks(s): return {norm(x) for x in s.split(',') if norm(x)}
def fm(p):
    f=re.search(r'^---\n(.*?)\n---',open(p).read(),re.S).group(1)
    d=re.search(r'description:\s*>?\s*(.*?)(?:\n[a-z_]+:|\Z)',f,re.S).group(1)
    d=' '.join(l.strip() for l in d.splitlines())
    m=re.search(r'[Tt]riggers on:\s*(.*)',d); return toks(m.group(1)) if m else set()
# Parse the CORRECT section
rows={}; seg=False; in_details=False
for line in open('AGENTS.md').read().splitlines():
    if re.match(r'<details><summary>Claude Code Domain Agents', line.replace(' ','')): in_details=True; continue
    if in_details and '</details>' in line: break
    if in_details:
        m=re.match(r'\|(.*?)\|\s*`(bachelorprojekt-[a-z]+)`\s*\|\s*$',line)
        if m: rows[m.group(2)]=toks(m.group(1))
# Compare
drift=sum(1 for p in glob.glob('.claude/agents/*.md')
          if fm(p).symmetric_difference(rows.get(os.path.basename(p)[:-3],set())))
print(f"Drift count: {drift}")
PY
```

Expected result after the fix: drift should be 0 or very small (only real differences).

## Task 2 — Sync Signal-Spalte mit Frontmatter (falls nötig)

If after Task 1 any drift remains between the Claude Code Domain Agents table's Signal column and the agent frontmatter `triggers on:` field, update the Signal column in `AGENTS.md` to match.

Example: If frontmatter says `website/, Astro, Svelte, CSS, UI, frontend` and the table says `website/, Astro, Svelte, CSS, UI, frontend, homepage, kore`, update the table to match the frontmatter.

## Verification

```bash
bash scripts/health-goals-check.sh 2>&1 | grep G-AGENTIC02
# Expected: ✅ G-AGENTIC02 0 (Ziel =0)
```
