---
title: "agentic-skill-hygiene — Implementation Plan"
domains: [agentic-tooling, docs]
status: active
file_locks: []
shared_changes: false
batch_id: null
depends_on_plans: []
---

# agentic-skill-hygiene — Implementation Plan

## File Structure

```
.claude/skills/OVERVIEW.md                    (edit — counter + orphan refs + dead paths)
.claude/skills/dev-flow-plan/SKILL.md          (edit — trim from 523 → ≤495 lines)
.claude/skills/references/skill-hygiene-refs.md (new — extracted blocks from dev-flow-plan)
```

## Task 1 — Fix G-AGENTIC06: OVERVIEW.md Counter

**File:** `.claude/skills/OVERVIEW.md`, line 3

**Change:** Replace `36 project-local skills` with `39 project-local skills`

**Verify:**
```bash
claimed=$(grep -oE '[0-9]+ project-local skills' .claude/skills/OVERVIEW.md | grep -oE '^[0-9]+')
real=$(git ls-files -- .claude/skills | grep -c '/SKILL\.md$')
echo "claimed=$claimed real=$real"  # Expected: claimed=39 real=39
```

## Task 2 — Fix G-AGENTIC07: Add references to orphan GitOps skills

**Three orphan skills need at least ONE reference in CLAUDE.md, AGENTS.md, or OVERVIEW.md:**

1. `gitops-cluster-debug` — Debug Flux CD on live Kubernetes clusters
2. `gitops-knowledge` — Flux CD expert (concepts, manifests, YAML)
3. `gitops-repo-audit` — Audit and validate GitOps repos

**Best approach:** Add them as a new row in OVERVIEW.md under the "Infrastructure & Networking" section (between lines 101 and 103):

```markdown
| [`gitops-cluster-debug`](gitops-cluster-debug/SKILL.md), [`gitops-knowledge`](gitops-knowledge/SKILL.md), [`gitops-repo-audit`](gitops-repo-audit/SKILL.md) | Flux CD GitOps — debug live clusters, generate manifests, audit repos. Dispatched as subagents. |
```

Alternatively, add a new subsection "GitOps" after line 102.

**Verify:**
```bash
orphans=0
for f in $(git ls-files -- .claude/skills | grep '/SKILL\.md$'); do
  d=$(echo "$f" | sed 's#.claude/skills/##;s#/SKILL.md##'); base=$(basename "$d")
  awk 'BEGIN{f=0}/^---$/{f++;next} f==1&&/^description:/{print 1;exit}' "$f" | grep -q 1 || continue
  n=$( { grep -rl -- "$base" CLAUDE.md AGENTS.md .claude/skills/OVERVIEW.md 2>/dev/null
         grep -rl --include=SKILL.md -- "$base" .claude/skills 2>/dev/null | grep -v "$d/SKILL.md"; } | sort -u | wc -l)
  [ "$n" -eq 0 ] && orphans=$((orphans+1))
done
echo "Orphans: $orphans"  # Expected: 0
```

## Task 3 — Fix G-AGENTIC08: Fix dead script paths

Find which SKILL.md files reference the dead paths:

```bash
grep -rn 'scripts/check-deprecated.sh\|scripts/discover.sh\|scripts/validate.sh' .claude/skills --include=SKILL.md
```

For each dead path:

1. **If the referenced script exists under a different path** (e.g., `scripts/check-deprecated.sh` might be `scripts/code-quality/check-deprecated.sh`), update the reference.
2. **If the referenced script no longer exists**, remove the reference or replace with a working command.
3. **If the reference is to a generated/optional script**, wrap with `[ -f "scripts/..."] &&` guard.

**Verify:**
```bash
dead=0
for p in $(grep -rhoP '(?<![A-Za-z0-9_./-])scripts/[A-Za-z0-9_./-]+\.(sh|mjs|py)' .claude/skills --include=SKILL.md | sort -u); do
  [ -f "$p" ] || dead=$((dead+1))
done
echo "Dead paths: $dead"  # Expected: 0
```

## Task 4 — Fix G-AGENTIC09: Trim dev-flow-plan/SKILL.md

**Current:** 523 lines (target ≤495)

**Approach (following T001904/T002094 precedent):** Identify 2-3 largest bloated sections and extract them into `.claude/skills/references/` files, replacing with short `file://` pointers.

1. Read the current file: `wc -l .claude/skills/dev-flow-plan/SKILL.md`
2. Identify sections >30 lines that can be extracted
3. For each: create a new reference file, replace section with a 3-5 line pointer
4. Verify line count

**Target:** ≤495 lines, no content loss.

**Verify:**
```bash
find .claude/skills -name SKILL.md -exec wc -l {} + | awk '$2!="total"&&$1>500{c++} END{print c+0}'
# Expected: 0
```

## Final Verification

After all tasks:

```bash
bash scripts/health-goals-check.sh 2>&1 | grep -E 'G-AGENTIC0[6789]'
# Expected: all ✅ with value 0
```
