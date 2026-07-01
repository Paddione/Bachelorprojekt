# Proposal: t001385-openspec-delta-spec-dir

## Why

Zwei agentenseitig konsumierte Anleitungen für den `openspec propose`-Workflow beschreiben
nur den Default-Fall (Delta-Spec-Dateiname = Change-Slug) und verschweigen den
Sub-Feature-Fall (Delta-Spec-Dateiname = Parent-SSOT-Slug), obwohl letzterer bereits in
CLAUDE.md als "Delta-Spec-Konvention (T001304)" verbindlich dokumentiert ist und vom
Fallback-Skript `scripts/openspec.sh` (`--target-spec`) bereits korrekt implementiert wird:

1. `openspec/specs/openspec-workflow.md` (SSOT-Spec) — Requirement "Propose erstellt
   vollständiges Change-Skeleton" beschreibt ausschließlich `specs/<slug>.md` mit
   `<slug>` = Change-Slug.
2. `.claude/skills/openspec-propose/SKILL.md` (kanonischer `/opsx:propose`-Flow, gespiegelt
   in `.claude/commands/opsx/propose.md` und `.opencode/commands/opsx-propose.md`) —
   übernimmt den `outputPath` aus `openspec instructions specs --change "<name>" --json`
   unkritisch, ohne zu prüfen, ob der Change ein Sub-Feature einer bestehenden Capability
   ist.

Jeder Agent, der dem kanonischen `/opsx:propose`-Pfad folgt, legt Delta-Specs für
Sub-Features deshalb systematisch unter dem falschen Dateinamen an — das im Ticket T001385
beschriebene Symptom. Das bricht spätere `archive`-Merges (SSOT-Ziel nicht gefunden bzw.
falscher Dateiname wird neu angelegt statt in die bestehende Capability zu mergen).

## What

- SSOT-Spec `openspec/specs/openspec-workflow.md` um den Sub-Feature-Fall ergänzen
  (Requirement-Text + neues Scenario), mit Verweis auf CLAUDE.md T001304.
- `.claude/skills/openspec-propose/SKILL.md` (kanonisch) um einen Vor-Check vor dem
  Schreiben des `specs`-Artefakts ergänzen: prüfen, ob der Change ein Sub-Feature einer
  bestehenden Capability ist (`openspec/component-map.yaml` bzw. vorhandene
  `openspec/specs/*.md`); falls ja, den Delta-Spec-Dateinamen auf den Parent-SSOT-Slug
  umbiegen statt den von `outputPath` gelieferten Change-Slug-Namen zu verwenden.
- Die beiden Mirror-Dateien `.claude/commands/opsx/propose.md` und
  `.opencode/commands/opsx-propose.md` synchron nachziehen (gleicher Vor-Check-Text,
  Runtime-spezifische Slash-Command-Syntax beibehalten).
- Regressionstest in `tests/spec/openspec-workflow.bats`, der sicherstellt, dass sowohl die
  SSOT-Spec als auch alle drei Propose-Anleitungsdateien die Parent-SSOT-Slug-Konvention
  erwähnen.

_Ticket: T001385_
