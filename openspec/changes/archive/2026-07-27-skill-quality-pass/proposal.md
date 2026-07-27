# Proposal: skill-quality-pass

## Why

K3 (T002302) hat das Skill-Inventar von 39 auf 28 getrackte `SKILL.md` reduziert. Was übrig
bleibt, ist qualitativ ungeprüft: Die `description`-Frontmatter entscheidet, ob ein Skill in
einer Session überhaupt feuert, und die Body-Länge entscheidet, wie viel Kontext das Laden
kostet — beides wurde in den 20 projekteigenen Skills nie gegen den `skill-creator`-Standard
geprüft.

Der Befund ist konkret: **sechs Bodies liegen über 250 Zeilen** (`dev-flow-execute` 486,
`infra-ops` 476, `dev-flow-plan` 460, `ticket-ops` 334, `openspec-explore` 298, `git-workflow`
283), und `brain-ingest` hat **überhaupt kein YAML-Frontmatter** — der Harness fällt auf die
H1-Überschrift zurück, die keinen einzigen Trigger-Begriff enthält.

`.claude/skills/OVERVIEW.md` liefert den Beleg, warum ein einmaliger Pass nicht reicht: Die dort
behauptete Skill-**Zahl** stimmt, weil `G-AGENTIC06` sie misst. Die Skill-**Liste** daneben führt
fünf Skills, die es nicht mehr gibt, und verlinkt auf Docs-Container-Build-Artefakte statt auf
die Quelldateien — weil das kein Gate misst. Ohne maschinelle Verankerung verrottet K4 auf
demselben Weg.

`SKILL.md` ist zudem nicht vom S1-Zeilen-Ratchet erfasst: Skill-Bodies wachsen bislang gegen
keinerlei Widerstand.

## What

Qualitäts-Pass über die 20 projekteigenen Skills plus die maschinelle Verankerung des Ergebnisses:

- **Frontmatter:** Jeder aktive projekteigene Skill bekommt eine Trigger-taugliche `description`.
  `brain-ingest` bekommt erstmals überhaupt Frontmatter. Das von keinem Gate gelesene
  `category:`-Feld entfällt. Die vier `openspec-*`-Skills tauschen ihr Upstream-Frontmatter
  gegen einen expliziten Fork-Hinweis — sie wurden seit T001263 nie re-synct, aber projektseitig
  verändert.
- **Progressive Disclosure:** Die sechs Übergrößen werden auf ≤ 250 Zeilen gebracht, indem
  Prozedur-Details nach `.claude/skills/references/` ausgelagert werden — das dort erprobte
  Muster (19 Referenzdateien à 18–189 Zeilen). Entscheidungslogik und Guards bleiben im Body.
- **`OVERVIEW.md`:** tote Einträge raus, Links auf die Quelldateien statt auf
  `k3d/docs-content-built/`, und die Sektion „Third-party / UI-Referenz-Skills" wird
  **vollständig** — sie wird damit zur maschinenlesbaren Quelle dafür, welcher Skill projekteigen
  ist.
- **Gate:** `G-AGENTIC09` (heute: `> 500 Zeilen`, alle Skills, `Ticket: TBD`) wird verschärft auf
  `> 250 Zeilen`, Scope projekteigen — statt ein zweites Gate zum selben Thema anzulegen. Dazu
  ein BATS-Test, der die `description`-Präsenz je aktivem projekteigenem Skill fail-closed prüft.

Nicht im Scope: die 8 Vendor-Skills, inhaltliche Workflow-Änderungen, `CLAUDE.md`/`AGENTS.md`/
`GEMINI.md` (K6) und `.claude/agents/` (K5).

_Ticket: T002303_
