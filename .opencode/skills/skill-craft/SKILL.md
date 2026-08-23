---
name: skill-craft
description: Unified skill lifecycle for this repo - discover and install existing skills, then author or improve skills following official best practices. Use when the user wants to find a skill, install a skill, check whether a skill exists for a task, create a new skill, write a SKILL.md, fix a skill that does not trigger, or improve an existing skill.
---

# Skill Craft

Single entry point for the full skill lifecycle: **find → install → build → improve**.
Two specialist skills sit next to this one; route to them instead of duplicating their content:

| Phase | Skill | What it owns |
|---|---|---|
| Discover & evaluate | `find-skills` | `npx skills find/add`, skills.sh leaderboard, quality gates |
| Author & improve | `skill-creator` | SKILL.md anatomy, progressive disclosure, eval loop, description optimization |

## 1. Find (route to `find-skills`)

Search before building anything:

```bash
npx skills find <query>          # or browse https://skills.sh/
```

Quality gate before recommending: prefer 1K+ installs, trusted sources
(`anthropics`, `vercel-labs`, `microsoft`), sanity-check the source repo's stars.

## 2. Install into THIS repo (local recipe, overrides CLI defaults)

The `npx skills add` CLI targets Claude-style global paths. In this repo,
opencode skills are plain directories:

1. Shallow-clone the source repo to `/tmp/opencode/`.
2. `cp -r <repo>/skills/<name> .opencode/skills/`
3. Normalize line endings — upstream files sometimes ship CRLF, which breaks
   YAML frontmatter parsing:
   `grep -rlI $'\r' .opencode/skills/<name> | xargs sed -i 's/\r$//'`
4. Validate: `name:` in frontmatter equals the directory name; description is
   third-person with concrete trigger phrases.

Locations in this repo:

| Path | Purpose |
|---|---|
| `.opencode/skills/<name>/SKILL.md` | opencode skills (auto-discovered) |
| `.claude/skills/<name>/` | shared sources; `.opencode/skills` symlinks dev-flow/openspec skills here |
| `.agents/skills/<name>/` | Claude Code-only skills |

## 3. Build (route to `skill-creator`)

When no good skill exists, author one via `skill-creator`'s process:
capture intent → interview → write SKILL.md → eval → iterate.
Non-negotiables from the best-practice guide:

- **Progressive disclosure**: keep SKILL.md lean; push detail into `references/`, `scripts/`.
- **Description decides triggering**: third person, explicit "Use when..." triggers.
- **One skill = one capability**; do not overlap the trigger space of existing skills
  (check `.opencode/skills/*/SKILL.md` descriptions first).

## 4. Improve

Existing skill misfiring, stale, or too broad? Route to `skill-creator`
(§ Improving the skill, § Description Optimization).

## Guardrails

- Link to `find-skills` / `skill-creator`; never copy their content into new skills.
- New skills stay untracked until the user asks for a branch/PR (`chore/*` flow).
