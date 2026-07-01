## Why

`.claude/lib/goals.md` misst bisher nur die Produktseite des Repos (Website-Code, K8s-Manifeste,
Deps, Docs, DORA-Metriken) — aber nicht das Agentic-Tooling selbst: Custom-Subagents
(`.claude/agents/*.md`), Skills (`.claude/skills/*/SKILL.md`), MCP-Server-Konfiguration
(`.mcp.json` / `.opencode/opencode.jsonc`) und agentische Slash-Commands
(`.claude/commands/`, `.opencode/commands/`). Genau diese Artefakte bestimmen den Blast-Radius
jedes Subagenten-Dispatches (Tool-Scope, Routing-Korrektheit, MCP-Verfügbarkeit,
Command-Existenz), sind aber komplett ungemessen.

Eine Explorations-Runde hat 17 konkret messbare Kandidaten-Ziele gefunden — mit einem
wiederkehrenden Muster: mehrere Artefakte behaupten "authoritative"/"SSOT" zu sein, sind es
aber nachweislich nicht mehr (z. B. `AGENTS.md` behauptet 1:1-Match mit dem echten
Agenten-Frontmatter, weicht bei `bachelorprojekt-website` aber ab; `CLAUDE.md` behauptet eine
opencode-MCP-Serverliste, die 3 Phantom-Server nennt und den real registrierten
`codebase-memory-mcp` auslässt). Das ist exakt die Silent-Failure-Klasse, die `goals.md` für
Produktcode bereits systematisch fängt (G-DOC01, G-RH04 etc.) — jetzt auch für das
Agentic-Tooling selbst.

## What Changes

- Neue Kategorie **"Agentic Tooling"** in `.claude/lib/goals.md`: 17 neue Ziele
  `G-AGENTIC01`–`G-AGENTIC17` über 4 Domänen (Subagents, Skills, MCP-Server, Commands), je mit
  reproduzierbarem Mess-Befehl, Baseline, Target und Klasse (Gate/Target).
- 14 der 17 Ziele werden als **Gates** in `scripts/health-goals-check.sh` verdrahtet (CI-fähig),
  3 als **Targets** (dokumentiert, kein Zwangs-Fix — echtes Tool-Scoping und SKILL.md-Splitting
  sind eigenständige Folgearbeiten).
- **10 heute aktive Verstöße werden in diesem Change direkt gefixt**, damit alle 17 Ziele grün
  starten (kein neuer Prio-A-Eintrag): u. a. ein Routing-Tabellen-Typo in `AGENTS.md`
  (`korczewski` statt `kore`), ein falscher Skill-Inventar-Zähler in `OVERVIEW.md` (behauptet 12,
  real 27), ein toter Skript-Verweis in `infra-ops/SKILL.md` (Keycloak→pocket-id-Migration nicht
  nachgezogen), eine falsche MCP-Serverliste in `CLAUDE.md`, ein fehlender
  `codebase-memory-mcp`-Abschnitt in `mcp-tool-guide.md`, ein toter `mcp-browser`-Tool-Verweis in
  `dev-flow-e2e/SKILL.md`, und ein Phantom-Command-Verweis (`/opsx:continue`) in `apply.md`
  (beide Runtimes) + dem zugehörigen SSOT-Skill.
- `docs/code-quality/gates.yaml`: S4-Orphan-Gate-Scope um `.claude/commands/**/*.md` /
  `.opencode/commands/**/*.md` erweitert (deckte agentische Commands bisher gar nicht ab).
- `Taskfile.yml`: `test:changed`-Smart-Selection-Regex um einen Bucket für `.claude/agents/**/*.md`
  + `AGENTS.md` erweitert, damit `tests/spec/agent-library.bats` bei Änderungen an diesen Dateien
  tatsächlich in CI läuft (war bisher nicht erreichbar).

## Capabilities

### New Capabilities
- `agentic-tooling-quality-goals`: quantifizierbare, reproduzierbar gemessene Qualitätsziele für
  die Agentic-Tooling-Artefakte des Repos selbst (Subagents, Skills, MCP-Server-Konfiguration,
  agentische Slash-Commands) — Mess-Infrastruktur, Baselines, Gate/Target-Klassifizierung.

### Modified Capabilities
(keine — es gibt keinen bestehenden SSOT-Spec für die generische `goals.md`/
`health-goals-check.sh`-Infrastruktur; `t001358-sec05-health-goals` deckt nur die enge
G-SEC05-Metrik ab und wird durch diesen Change nicht verändert.)

## Impact

- `.claude/lib/goals.md`, `.claude/lib/README.md` (Ziel-/Kategorien-Zähler)
- `scripts/health-goals-check.sh` (17 neue `row gate|target`-Zeilen)
- `docs/code-quality/gates.yaml` (S4-Scope-Erweiterung)
- `Taskfile.yml` (test:changed Smart-Selection-Regex)
- `AGENTS.md`, `CLAUDE.md` (Korrektur der jeweils falschen Routing-/MCP-Serverliste)
- `.claude/skills/OVERVIEW.md`, `.claude/skills/infra-ops/SKILL.md`,
  `.claude/skills/dev-flow-e2e/SKILL.md`, `.claude/skills/references/mcp-tool-guide.md`
- `.claude/commands/opsx/apply.md`, `.opencode/commands/opsx-apply.md`,
  `.claude/skills/openspec-apply-change/SKILL.md`
- Kein Einfluss auf Prod-Deploy, Datenbank oder Laufzeitverhalten der Website/K8s-Services.
