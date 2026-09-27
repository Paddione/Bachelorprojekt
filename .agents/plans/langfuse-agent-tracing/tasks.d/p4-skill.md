# p4 — Langfuse-Skill repo-weit

Target files: `skills-lock.json`, `.agents/skills/langfuse/`.

### Task 1: Skill installieren

```bash
npx skills add langfuse/skills --skill langfuse
```

Das CLI legt den Skill unter `.agents/skills/langfuse/` ab und trägt ihn in `skills-lock.json` ein
(Muster: bestehender Eintrag `vitest`, `sourceType: github`, `computedHash`). Weicht der Zielpfad
ab, den Skill nach `.agents/skills/langfuse/` verschieben und `skillPath` anpassen.

### Task 2: Sichtbarkeit prüfen

```bash
jq -r '.skills.langfuse.skillPath' skills-lock.json
head -3 .agents/skills/langfuse/SKILL.md
ls -l .claude/skills/langfuse 2>/dev/null || ls -ld .agents/skills
```

Erwartet: `skillPath` = `.agents/skills/langfuse/SKILL.md`, Frontmatter `name: langfuse`. Ist
`.claude/skills` kein Symlink auf `.agents/skills`, den Skill dort so verlinken wie die übrigen
geteilten Skills (`ls -l .claude/skills | head`).
