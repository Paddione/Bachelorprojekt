# Agent-Routing ↔ Frontmatter-Drift beheben (G-AGENTIC02)

**Ziel:** G-AGENTIC02 von 6 auf 0 senken.

## Problem

Der Check `scripts/health-goals-check.sh` vergleicht das `## Agent Routing`-Table in `AGENTS.md`
(Zeilen 11–16) mit den Frontmatter-Triggern aus `.claude/agents/*.md`. Das `## Agent Routing`-Table
listet aber **ausschließlich opencode lokale LLM-Agenten** (bonsai-8b-1..4, deepseek-helper, explore,
general) — während `.claude/agents/` die **Claude Code Domain-Agenten** enthält
(bachelorprojekt-website, -ops, -infra, -test, -db, -security). Das sind komplett verschiedene Mengen,
daher beträgt die symmetrische Differenz 6 (alle 6 Domain-Agenten haben keinen Eintrag im Routing-Table).

Die Domain-Agenten sind korrekt dokumentiert im `<details><summary>Claude Code Domain Agents</summary>`-Block
(Zeilen 86–99) mit eigenem Table.

## Lösung

**Option A (empfohlen):** Fix im Check-Script — statt `## Agent Routing` den
`<details>Claude Code Domain Agents</details>`-Abschnitt parsen. Das eliminiert den False-Positive-Mismatch.

**Option B (nicht empfohlen):** Domain-Agenten ins `## Agent Routing`-Table aufnehmen — vermischt
opencode lokale LLM-Agenten mit Claude Code Domain-Agenten, semantisch falsch.
