---
name: references
description: Use when a dev-flow skill or subagent needs a shared cross-cutting reference — subagent provisioning (model/effort/context), plan quality gates (S1–S4 CI ratchet + plan-lint hard rules), plan-review UI, dev-flow gotchas and known issues (T000xxx), deploy routing (path→task), the MCP tool guide (mcp-postgres/mcp-kubernetes vs kubectl fallback, psql helper), verification block (freshness/S1), session coordination (agent-lock lifecycle), repo hygiene ops, the CI fix loop, grilling-to-ticket, or the gh-axi GitHub CLI wrapper.
---

# Skill References — Shared Hub

SSOT-Referenzbibliothek für `dev-flow`-Skills und Subagenten. Jede Referenz ist eine **eigene,
on-demand ladbare Datei** in diesem Verzeichnis — Skill- und Subagent-Prompts verlinken gezielt
auf die passende Datei (nicht den ganzen Hub laden, nicht die Inhalte duplizieren).

> Früher ein 500-Zeilen-Monolith (`references.md`) mit Section-Ankern. In Pro-Thema-Dateien
> aufgeteilt (Chore T001199), damit ein Verweis nur seinen Abschnitt in den Kontext zieht.

## Inhalt

| Referenz | Datei | Wann |
|---|---|---|
| Subagent-Provisioning | [`subagent-provisioning.md`](subagent-provisioning.md) | Arbeit an einen frischen Subagenten delegieren — Modell · Effort · Kontext wählen |
| Plan-Quality-Gates | [`plan-quality-gates.md`](plan-quality-gates.md) | Implementierungsplan gegen die CI-Gates (S1–S4-Ratchet) schreiben/prüfen |
| Plan-Review-UI | [`plan-review-ui.md`](plan-review-ui.md) | Plan im Browser line-by-line reviewen + Verdict einholen |
| dev-flow Gotchas | [`dev-flow-gotchas.md`](dev-flow-gotchas.md) | Bekannte Footguns der dev-flow-Pipeline (T000xxx-Knowledge-Base) |
| Deploy-Routing | [`deploy-routing.md`](deploy-routing.md) | Welcher Deploy-Task zu welchen geänderten Pfaden gehört (SSOT) |
| MCP-Tool-Guide | [`mcp-tool-guide.md`](mcp-tool-guide.md) | MCP bevorzugen vs. kubectl-Fallback; Server/Port/Tool-Tabelle; `psql()`-Helper |
| Grilling → Ticket | [`grilling-to-ticket.md`](grilling-to-ticket.md) | Q/A-Session an ein bestehendes Ticket senden |
| gh-axi | [`gh-axi.md`](gh-axi.md) | GitHub-CLI-Wrapper — bevorzugt statt `gh` für read/view-Flows |
| Verifikationsblock | [`verification-block.md`](verification-block.md) | Lokale CI-äquivalente Verifikation: die vier Befehle, S1-Ratchet, Freshness-Artefakt-Liste |
| Session-Koordination | [`session-coordination.md`](session-coordination.md) | agent-lock-Lebenszyklus: reap/claim/release, Registry-Overlap, agent-msg |
| Repo-Hygiene-Mechanik | [`repo-hygiene-ops.md`](repo-hygiene-ops.md) | Stale Worktrees/Branches, PR-Triage→Ticket-Close, Issue-Intake, Factory-Queue |
| CI-Fix-Schleife | [`ci-fix-loop.md`](ci-fix-loop.md) | PR-CI überwachen und fixen: devflow-ci-watch, Required Checks, Fix-Routine |
