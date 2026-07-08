# Proposal: harness-workflow-split

## Why

Claude Code und opencode arbeiten im selben Repo, aber die Planungs-/Orchestrierungs-Skills
(`dev-flow-plan`, `dev-flow-execute`, `dev-flow-chore`, `git-workflow`) existieren nur
Claude-seitig — obwohl `AGENTS.md` (opencodes geladene `instructions`-Datei) opencode
anweist, sie zu benutzen, ohne dass opencode sie als Skill aufrufen kann. Die einzigen vier
geteilten Skills (`openspec-*`, per Symlink) enthalten mitten im Text Claude-only-Tool-Syntax
(`Task`, `AskUserQuestion`, `TodoWrite`), die opencode nicht greifen kann. opencode hat eigene,
bislang ungenutzte Orchestrierungs-Primitive (`background-agents.ts`, `worktree.ts`). Es gibt
außerdem keine dauerhafte, generierte Übersicht, welcher Skill/Task/Agent zu welcher Harness
gehört.

## What

- **Vier neue opencode-native Skills** unter `.opencode/skills/`: `opencode-flow-plan`,
  `opencode-flow-execute`, `opencode-flow-chore`, `opencode-git-workflow` (harte Abhängigkeit,
  von `-execute`/`-chore` direkt aufgerufen) — gebaut auf `background-agents.ts` (statt
  `Task`-Tool) und `worktree.ts` (statt `scripts/worktree-create.sh`).
- **Bereinigung der vier `openspec-*`-Skills** (`propose`/`apply-change`/`archive-change`/
  `explore`): Claude-only-Tool-Aufrufe (`Task`, `AskUserQuestion`, `TodoWrite`) werden durch
  harness-neutrale Prosa ersetzt. Symlink-Mechanismus (`.opencode/skills/openspec-*` →
  `.claude/skills/openspec-*`) bleibt unverändert.
- **`AGENTS.md`-Umbau**: der „Skill Dispatch Protocol"-Abschnitt (bisher Claude-Task-Tool-Prosa
  in einer Datei, die nur opencode lädt) wird durch eine opencode-native Dispatch-Beschreibung
  (`background-agents.ts`) ersetzt; Verweis auf `.claude/skills/references/subagent-provisioning.md`
  für Claude Code/Antigravity. Die Agent-Routing-Tabelle bleibt unverändert geteilt.
- **Dauerhafte Karte**: `docs/agent-guide/registry/tools.yaml` bekommt ein
  `harness: [claude, opencode, both]`-Feld; `scripts/agent-guide/validate.mjs` +
  `scripts/agent-guide/emit-maps.mjs` erweitert; `docs/agent-guide/maps/tools-map.md` bekommt
  eine Harness-Spalte (via `task agent-guide:maps` regeneriert).
- **Antigravity-Verifikation** (kein Fork): BATS-Guard, dass die `openspec-*`-Bereinigung die
  Antigravity-Nutzung (technisch eine Claude-Code-Instanz, erbt `.claude/skills/` direkt,
  bestätigt in archiviertem T001274) nicht bricht.
- **Out of scope**: `ticket-ops`/`repo-hygiene`-Pendants (eigenes Ticket bei Bedarf),
  Hermes-Agent-Skillset (Fast-Follow T001609), Secret-Rotation `.claude/settings.json`
  (User übernimmt selbst).

_Ticket: T001611 · Design-SSOT: `docs/superpowers/specs/2026-07-04-harness-workflow-split-design.md`._
