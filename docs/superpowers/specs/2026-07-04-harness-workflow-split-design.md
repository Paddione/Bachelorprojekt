---
ticket_id: T001611
plan_ref: openspec/changes/harness-workflow-split/tasks.md
status: active
date: 2026-07-04
---

# harness-workflow-split — Design

## Zweck

Zwei Coding-Harnesses arbeiten im selben Repo: Claude Code (voller Funktionsumfang,
Hauptentwickler-Werkzeug) und opencode (Zweit-Harness, eigene Orchestrierungs-Plugins).
Die Planungs-/Orchestrierungs-Skills (`dev-flow-plan`, `dev-flow-execute`, `dev-flow-chore`,
`git-workflow`) existieren aktuell ausschließlich Claude-seitig — obwohl `AGENTS.md`
(opencodes geladene `instructions`-Datei) opencode anweist, sie zu benutzen, ohne dass
opencode sie als Skill aufrufen kann. Die einzigen vier tatsächlich geteilten Skills
(`openspec-*`, per Symlink) enthalten mitten im Text Claude-only-Tool-Syntax (`Task`,
`AskUserQuestion`, `TodoWrite`), die opencode nicht greifen kann. opencode hat eigene,
bislang ungenutzte Orchestrierungs-Primitive (`background-agents.ts`, `worktree.ts`).

Ziel dieses Changes: jede Harness bekommt eine vollständige, in sich stimmige
Planungs-/Ausführungs-Kette aus eigenen Primitiven, ohne Fremd-Tool-Syntax, die sie nicht
ausführen kann — plus eine dauerhafte, generierte Karte, welcher Skill/Task/Agent zu
welcher Harness gehört.

Brainstorming-Session: Lavish-Board `.lavish/harness-workflow-split-brainstorm.html`
(Ist-/Soll-Diagramme, Trade-off-Vergleich), 2026-07-04, Entscheidungen unten fixiert.

## Fixierte Entscheidungen

| Thema | Entscheidung |
|---|---|
| Change-Größe | Ein OpenSpec-Change (kein PRD-Epic) |
| Kernrichtung dev-flow-* | Getrennte, harness-eigene Versionen — kein geteilter Kern mit Claude/opencode-Guards |
| `openspec-*`-Skills (propose/apply-change/archive-change/explore) | Bleiben geteilt (Symlink unverändert), aber von Claude-only-Tool-Syntax bereinigt — mechanische Skills ohne Claude-spezifische Logik |
| Ablage der neuen opencode-Pendants | `.opencode/skills/opencode-flow-plan/`, `-execute/`, `-chore/`, `-git-workflow/` (native opencode-Skills, kein Symlink) — nicht `.opencode/commands/`, weil dev-flow-* mehrstufige, auto-triggernde Workflows sind, keine Einzel-Befehle |
| Umfang der Nachbildung | `dev-flow-plan`/`-execute`/`-chore` **plus** `git-workflow` (harte Abhängigkeit — `dev-flow-execute`/`-chore` rufen es direkt auf, per grep bestätigt). `ticket-ops`/`repo-hygiene` bleiben vorerst Claude-only |
| AGENTS.md „Skill Dispatch Protocol" | Wird durch eine opencode-native Dispatch-Beschreibung (`background-agents.ts`) ersetzt statt nur markiert — Claude Code liest `AGENTS.md` ohnehin nicht (nur `CLAUDE.md`) und hat sein Rezept schon in `.claude/skills/references/subagent-provisioning.md`; die Agent-Routing-Tabelle selbst bleibt unverändert geteilt |
| Die „Karte" | `docs/agent-guide/registry/tools.yaml` bekommt ein `harness: [claude, opencode, both]`-Feld; `emit-maps.mjs` + `validate.mjs` erweitert; `tools-map.md` bekommt eine Harness-Spalte. Das Lavish-Board bleibt Brainstorming-Artefakt, nicht die dauerhafte Karte |
| Antigravity (`~/.gemini/antigravity-cli/`) | Kein Fork — technisch eine Claude-Code-Instanz (bestätigt in archiviertem T001274), erbt `.claude/skills/` direkt. Nur eine Verifikation/BATS-Guard, dass die Bereinigung der geteilten `openspec-*`-Skills die Antigravity-Nutzung nicht bricht |
| Hermes Agent (`~/.hermes/`, Nous Research) | Explizit **out of scope** — eigenes Fast-Follow-Ticket T001609. Grund: lebt komplett außerhalb des Repo-Git-Trackings, ist ein globaler Assistent über viele Lebensbereiche (nicht nur Code), aktuell nur als Kosten-Delegate (`scripts/hermes-delegate.sh`) angebunden, braucht eigene Sandbox-/Toolset-Scope-Entscheidung |
| Secret-Leak `.claude/settings.json` | Bewusst **nicht Teil dieses Changes** — User kümmert sich selbst darum (Rotation + History-Bereinigung) |

## Architektur

```
Claude Code (unveraendert)                    opencode (neu)
├── CLAUDE.md                                 ├── AGENTS.md
├── .claude/skills/                           │   └── Skill Dispatch Protocol (opencode,
│   ├── dev-flow-plan/                        │       via background-agents.ts) — NEU
│   ├── dev-flow-execute/                     ├── .opencode/skills/
│   ├── dev-flow-chore/                       │   ├── opencode-flow-plan/      — NEU
│   ├── git-workflow/                         │   ├── opencode-flow-execute/   — NEU
│   └── references/subagent-provisioning.md   │   ├── opencode-flow-chore/     — NEU
│       (Claude-Task-Tool-Rezept, unveraendert)│   └── opencode-git-workflow/   — NEU
│                                              └── .opencode/plugins/
Antigravity (~/.gemini/antigravity-cli/)           ├── background-agents.ts (bestehend)
└── ist Claude Code — erbt .claude/skills/           └── worktree.ts (bestehend)
    direkt mit, kein Fork noetig

Geteilt (Symlink .agents/, unveraendert im Mechanismus):
├── .claude/agents/*.md  (6 Subagent-Definitionen)
└── .claude/skills/openspec-{propose,apply-change,archive-change,explore}/
    (bereinigt: kein Task/AskUserQuestion/TodoWrite mehr im Text)

Dauerhafte Karte (neu, generiert):
docs/agent-guide/registry/tools.yaml (+ harness: Feld)
  → scripts/agent-guide/emit-maps.mjs → docs/agent-guide/maps/tools-map.md (+ Harness-Spalte)
```

Die vier neuen opencode-Skills folgen strukturell ihren Claude-Pendants (Pfad-Wahl,
Brainstorming-Aufruf, Spec/Plan-Schreiben, Commit→Push→PR→Merge), unterscheiden sich aber
in den Primitiven:

| Mechanismus | Claude Code | opencode |
|---|---|---|
| Subagent-Delegation | `Task`-Tool, `subagent_type` | `background-agents.ts`-Plugin |
| Worktree-Isolation | `scripts/worktree-create.sh` | `worktree.ts`-Plugin |
| Strukturierte Rückfrage | `AskUserQuestion` | Text-Rückfrage im Chat (kein Äquivalent-Tool) |
| Fortschritts-Tracking | `TodoWrite` | Text-Todo-Liste in der Antwort |
| Ticket-/DB-Zugriff | `mcp__ticket-mcp__*` / `mcp__mcp-postgres__*` | dieselben MCP-Server (in `opencode.jsonc` registriert), andere Aufruf-Syntax |

## Fehlerbehandlung

- **background-agents.ts nicht verfügbar/Fehler**: die opencode-nativen Skills degradieren
  nicht hart — das Plan-/Execute-Skript beschreibt einen Inline-Fallback (die Haupt-Session
  erledigt den Sub-Schritt selbst statt zu delegieren), analog zum bestehenden
  Lavish-Review-Gate-Muster (Change ② aus T001591: Delegation mit Fallback bei Fehlschlag).
- **git-crypt in `worktree.ts`**: muss beim Plan-Schreiben gegen die reale Plugin-API
  geprüft werden (`scripts/worktree-create.sh` hat git-crypt-Handling explizit eingebaut;
  `worktree.ts` wird dahingehend verifiziert, bevor der neue `opencode-git-workflow`-Skill
  sich darauf verlässt — Blocker-Risiko, siehe unten).
- **openspec-* Bereinigung bricht Claude-Pfad**: die Ersetzung von `Task`/`AskUserQuestion`/
  `TodoWrite` durch harness-neutrale Prosa darf die Funktionalität für Claude Code nicht
  verschlechtern — Claude erkennt aus Kontext weiterhin, dass es sein eigenes Task-Tool
  nutzen soll. Ein BATS-Guard stellt sicher, dass die vier Dateien weiterhin *irgendeine*
  Delegationsanweisung enthalten (nicht ersatzlos gestrichen).

## Tests

- BATS-Guards (Muster: `tests/spec/software-factory.bats` FA-SF-7x-Stil, neue Datei
  `tests/spec/harness-workflow-split.bats` oder Erweiterung des passenden Parent-Specs):
  - Die 4 neuen `.opencode/skills/opencode-flow-*`- und `opencode-git-workflow`-SKILL.md
    existieren, referenzieren `background-agents.ts`/`worktree.ts`, enthalten **nicht**
    `Task`/`subagent_type`/`AskUserQuestion`/`TodoWrite`.
  - Die 4 `openspec-*`-SKILL.md enthalten diese Claude-only-Tokens **nicht mehr**, aber
    weiterhin eine Delegationsanweisung (nicht ersatzlos gestrichen).
  - `docs/agent-guide/registry/tools.yaml`: jeder Eintrag hat ein gültiges `harness`-Feld
    (Schema-Erweiterung in `validate.mjs` + Fixture-Test).
  - `tools-map.md` hat die neue Harness-Spalte (deckt `freshness:check` zusätzlich ab).
  - Antigravity-Guard: kein neu eingeführter Claude-Tool-Aufruf in den geteilten
    `openspec-*`-Skills, der über den Antigravity-Pfad (= Claude-Code-Pfad) erreichbar wäre,
    aber die Bereinigung unterläuft.
  - `AGENTS.md` enthält keine Claude-Tool-Namen (`Task`, `subagent_type`, `AskUserQuestion`,
    `TodoWrite`) mehr im Dispatch-Abschnitt.

## Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| `worktree.ts` bildet git-crypt-Handling nicht 1:1 wie `scripts/worktree-create.sh` ab | Vor dem Bau von `opencode-git-workflow` die Plugin-API lesen (`.opencode/plugins/worktree.ts` + `worktree/`-Helper); falls Lücke: Wrapper-Skript statt direktem Plugin-Aufruf, oder Blocker im Plan vermerken |
| opencodes tatsächliche MCP-Tool-Aufruf-Syntax (statt `mcp__server__tool`) ist beim Plan-Schreiben noch nicht verifiziert | Plan-Subagent liest `.opencode/commands/opsx-*.md` (bereits funktionierende Referenz-Beispiele) und übernimmt die dort verwendete Syntax 1:1 |
| Bereinigung der `openspec-*`-Skills verschlechtert Claude Codes tatsächliches Verhalten (Regression) | BATS-Guard „weiterhin eine Delegationsanweisung vorhanden" + manueller Vorher/Nachher-Vergleich im PR |
| Scope-Kriechen auf weitere Harnesses (Hermes) während der Umsetzung | Explizit in „Out of Scope" fixiert, eigenes Ticket T001609 existiert bereits |

## Out of Scope

- `ticket-ops`, `repo-hygiene` opencode-Pendants (eigenes Ticket bei Bedarf).
- Hermes-Agent-Skillset (T001609).
- Secret-Rotation `.claude/settings.json` (User übernimmt selbst).
