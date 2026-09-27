# p4 — Langfuse-Skill repo-weit

Target files: `skills-lock.json`, `.opencode/skills/langfuse/`, `.claude/skills/langfuse`,
`docs/agent-guide/registry/{skills.yaml,vendor-lock.json}`, `.opencode/skills/OVERVIEW.md`.

### Task 1: Skill installieren

```bash
npx skills add langfuse/skills --skill langfuse
```

Das CLI legt den Skill unter `.agents/skills/langfuse/` ab und trägt ihn in `skills-lock.json` ein
(Muster: bestehender Eintrag `vitest`, `sourceType: github`, `computedHash`). Weicht der Zielpfad
ab, den Skill nach `.agents/skills/langfuse/` verschieben und `skillPath` anpassen.

### Task 2: Repo-Katalog registrieren

Den externen Skill in `docs/agent-guide/registry/vendor-lock.json` (Upstream-Commit),
`docs/agent-guide/registry/skills.yaml` (alle Harness-Projektionen) und dem Vendor-Block von
`.opencode/skills/OVERVIEW.md` eintragen. Danach `node scripts/agent-skills/project.mjs --write`
ausführen und `.claude/skills/langfuse` als Symlink auf `.opencode/skills/langfuse` sicherstellen.

### Task 3: Sichtbarkeit prüfen

```bash
jq -r '.skills.langfuse.skillPath' skills-lock.json
head -3 .agents/skills/langfuse/SKILL.md
ls -l .claude/skills/langfuse 2>/dev/null || ls -ld .agents/skills
```

Erwartet: `skillPath` = `.agents/skills/langfuse/SKILL.md`, Frontmatter `name: langfuse`, Eintrag
in der Harness-Registry und ein passender Claude-Code-Symlink.
