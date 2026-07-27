---
title: "K4 — Skill-Qualitäts-Pass nach skill-creator-Standard (projekteigene Skills)"
ticket_id: "T002303"
plan_ref: "openspec/changes/skill-quality-pass/tasks.md"
domains:
  - "agent-config"
  - "docs"
status: active
date: 2026-07-27
---

# K4 — Skill-Qualitäts-Pass

**Epic:** T002299 · **Ticket:** T002303 · **Vorgänger:** K3 (T002302, PR #3361, `SHIPPED`)

---

## Purpose

K3 hat das Skill-**Inventar** von 39 auf 28 getrackte `SKILL.md` reduziert — Stubs, Grabsteine
und fachfremde Importe sind weg. Was bleibt, ist ungeprüft: die `description`-Frontmatter
entscheiden, ob ein Skill in einer Session überhaupt feuert, und der Body-Umfang entscheidet, wie
viel Kontext das Laden kostet. Beides ist in den 20 projekteigenen Skills nie systematisch gegen
den `skill-creator`-Standard geprüft worden.

K4 holt das nach und verankert das Ergebnis maschinell, damit es nicht wieder verrottet — der
Zustand von `OVERVIEW.md` (siehe B3) zeigt, was ohne Gate passiert.

## Befund (Bestandsaufnahme 2026-07-27, nach K3-Merge)

### B1 — Der Scope ist rechnerisch exakt, aber inhaltlich unscharf

28 getrackte `SKILL.md` minus 8 Vendor-Skills ergibt genau die 20 Namen der Ticket-Liste. Die
Trennung existiert bisher jedoch nur in Prosa: kein Register sagt maschinell, welcher Skill
projekteigen ist. `OVERVIEW.md` hat eine Sektion „Third-party / UI-Referenz-Skills", die aber
nur **einen** der acht Vendor-Skills nennt (`ui-ux-pro-max`).

Vendor-Satz (bleibt unberührt): `gitops-cluster-debug`, `gitops-knowledge`, `gitops-repo-audit`,
`ui-ux-pro-max`, `lavish`, `vitest`, `superpowers/using-git-worktrees`.

Sonderfall `update-dependencies`: projekteigen, aber `archived: true` **ohne** `description` —
läuft als biweekly Cloud-Routine und wird deshalb bewusst nicht in Sessions gelistet. K3 hat den
Grabstein `llm-ops` gelöscht, diesen aber behalten, weil er einen echten Runbook-Body statt eines
Redirects trägt.

### B2 — Sechs Bodies über der Zielgrenze, einer ohne Frontmatter

| Skill | Zeilen | Befund |
|---|---:|---|
| `dev-flow-execute` | 486 | Orchestrator; Implementer-/Verify-/PR-Phasen inline |
| `infra-ops` | 476 | Runbook mit 7 Sektionen, explicit-invoke-only |
| `dev-flow-plan` | 460 | Orchestrator; Feature-/Fix-/Chore-Pfade inline |
| `ticket-ops` | 334 | Triage + Parallelplanung + PR-Merge in einem Body |
| `openspec-explore` | 298 | Vendor-Herkunft, projektseitig geforkt (siehe B4) |
| `git-workflow` | 283 | vollständiger Git-Lifecycle inline |

`brain-ingest` (68 Zeilen) hat **kein YAML-Frontmatter** — die Datei beginnt direkt mit
`# brain-ingest — Brain-Wiki Kompilierung`. Der Harness fällt auf die H1-Überschrift als
`description` zurück; diese enthält keinen einzigen Trigger-Begriff. Der Skill ist damit
faktisch nur per Namensnennung erreichbar, nie über Intent-Matching.

Die Framework-Mapping-Tabelle (Claude Code / opencode / agy) liegt bereits in **allen** 20
projekteigenen Skills vor — PR #2702 hat das flächig erledigt. Hier ist nichts nachzuholen,
nur konsistent zu halten.

Inkonsistent ist das `category:`-Feld: es existiert nur bei den drei `*-specialist`-Skills
(`category: devflow`) und sonst nirgends. Es wird von keinem Gate und keinem Emitter gelesen.

### B3 — `OVERVIEW.md` ist verrottet und zeigt, was ohne Gate passiert

`OVERVIEW.md` listet fünf Skills, die es nicht mehr gibt: `host-node-networking`,
`cluster-deployment`, `secret-rotation`, `workspace-deploy` und `database-ops` — alle in
`infra-ops` konsolidiert, ihre Zeilen aber stehen geblieben. Zusätzlich steht `/feature-intake`
als Zeile, obwohl es ein opencode-Command und kein Skill ist.

Die Einträge verlinken überwiegend auf `k3d/docs-content-built/skills/<name>.html` — also auf
**Build-Artefakte des Docs-Containers**, nicht auf die Quelldatei. Diese Links überleben eine
Skill-Umbenennung nicht und sind für einen Agenten im Repo wertlos.

Die Zahl selbst stimmt: `OVERVIEW.md` behauptet 28, real sind es 28 — weil **G-AGENTIC06 genau
diese Zahl misst**. Alles, was kein Gate misst, ist gedriftet. Das ist der empirische Beleg
dafür, dass K4 ohne maschinelle Verankerung folgenlos bleibt.

### B4 — Der openspec-Fork ist bereits vollzogen

Die vier `openspec-*`-Skills tragen Upstream-Frontmatter (`license: MIT`, `metadata.author:
openspec`, `generatedBy: "1.3.1"`). Sie wurden mit T001263 / PR #2188 installiert und seitdem
**nie** gegen Upstream re-synct — dafür projektseitig verändert (Framework-Mapping-Tabelle,
PR #2702). Die Merge-Konflikt-Sorge, mit der die Ticket-Beschreibung den Scope begrenzt, ist
für diese vier bereits eingetreten.

### B5 — Ein Größen-Gate existiert bereits, ohne Owner

`G-AGENTIC09` (`scripts/health-goals-check.sh:377`) zählt `SKILL.md`-Dateien über 500 Zeilen
über **alle** Skills, Baseline 2, Target 0. In `.claude/lib/goals.md` steht bei ihm
`Ticket: TBD` — es hat keinen Eigentümer. Die Schwelle 500 ist zudem weit über dem, was der
`skill-creator`-Standard als Progressive Disclosure versteht.

`SKILL.md` ist **nicht** vom S1-Zeilen-Ratchet erfasst (`docs/code-quality/baseline.json` führt
keine SKILL.md-Einträge). Skill-Bodies wachsen also gegen keinerlei Widerstand — was B2 und B3
erklärt.

## Entscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| **E1** | Die vier `openspec-*`-Skills bleiben **voll im Scope**; ihr Vendor-Frontmatter wird durch einen expliziten Fork-Hinweis ersetzt. | Der Fork ist laut B4 faktisch vollzogen. Ein Frontmatter, das Upstream-Herkunft behauptet, während der Body projektspezifisch ist, ist die schlechtere Lüge. |
| **E2** | `G-AGENTIC09` wird **verschärft** statt dupliziert: Schwelle 500 → 250, Scope auf projekteigene Skills. | Ein Gate pro Thema. Das Gate hat keinen Owner (B5) und ist damit frei erbbar. Ein zweites Gate zum selben Thema würde die Baseline-Pflege verdoppeln. |
| **E3** | „Projekteigen" wird aus `OVERVIEW.md` abgeleitet: **getrackt minus Vendor-Sektion**. | Nutzt die vorhandene Sektion statt ein weiteres driftendes Register anzulegen. Koppelt das Größen-Gate an dieselbe Datei, die G-AGENTIC06 schon zur Wahrheit erklärt — eine Datei, ein Ort für Skill-Metawissen. |
| **E4** | Die `description`-Regel gilt nur für Skills **mit** `description`; `archived: true` ist die explizite Ausnahme. | Deckt sich mit der bestehenden G-AGENTIC07-Logik und hält `update-dependencies` (B1) korrekt außen vor, ohne eine Sonderregel zu erfinden. |
| **E5** | Body-Kürzung erfolgt durch **Auslagern nach `.claude/skills/references/`**, nicht durch Weglassen. | Das Muster ist erprobt: 19 Referenzdateien à 18–189 Zeilen werden von den dev-flow-Skills bereits per Link gezogen. Inhaltsverlust wäre eine Verhaltensänderung, die K4 nicht mandatiert ist. |
| **E6** | `category:` wird **entfernt** statt vervollständigt. | Es wird von keinem Gate, Emitter oder Harness gelesen (B2). Ein Feld, das nichts liest, ist Drift-Fläche ohne Nutzen. |

## Zielzustand

```
.claude/skills/
├── OVERVIEW.md                    ← SSOT: Vendor-Sektion vollständig, tote Einträge weg,
│                                     Links auf Quelle statt Build-Artefakt
├── references/                    ← Ziel der Auslagerung aus den 6 Übergrößen
│   └── <neue Referenzdateien>
└── <20 projekteigene>/SKILL.md    ← jede ≤ 250 Zeilen, jede mit Trigger-tauglicher description

scripts/health-goals-check.sh :: G-AGENTIC09
   └─► misst: projekteigene SKILL.md > 250 Zeilen  →  Target 0, fail-closed
       Scope-Quelle: OVERVIEW.md Vendor-Sektion

tests/spec/agent-skills.bats
   └─► description-Präsenz je aktivem projekteigenem Skill
```

### Was eine „Trigger-taugliche description" heißt

Nachprüfbar ist nur die Präsenz, nicht die Qualität. Der Plan hält die Qualitätskriterien
deshalb als Review-Checkliste, nicht als Gate:

1. Nennt die konkreten Begriffe, auf die der Skill feuern soll (Pfade, Kommandos, Fachbegriffe) —
   nicht nur die Kategorie.
2. Sagt, **wann nicht** — bei Routing-Hubs und explicit-invoke-only Runbooks ist das der
   wichtigere Teil (`infra-ops` macht es bereits vorbildlich mit „DO NOT auto-trigger").
3. Grenzt gegen Nachbarskills ab, wo Verwechslungsgefahr besteht (`ticket-ops` ↔ `repo-hygiene`,
   `dev-flow-plan` ↔ `dev-flow-chore`).

## Abgrenzung

**Nicht in K4:**

- Die 8 Vendor-Skills — weder description noch Body noch Frontmatter.
- Inhaltliche Änderungen an den Workflows, die die Skills beschreiben. K4 verschiebt und
  formuliert um; wer eine Prozedur ändern will, braucht ein eigenes Ticket.
- `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` — das ist K6 (T002305) und hängt bewusst hinter K4.
- Die Agent-Definitionen unter `.claude/agents/` — das ist K5 (T002304).
- Ungetrackte, lokal installierte Skills — `OVERVIEW.md` benennt sie bereits; ihre Entfernung
  bleibt ein manueller Operator-Schritt (SSOT-Requirement aus K3).

## Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Auslagerung verschlechtert die Nutzbarkeit, wenn ein Agent die Referenz nicht liest. | Nur **Prozedur-Details** auslagern (Befehlsfolgen, Tabellen, Sonderfälle), niemals Entscheidungslogik oder Guards. Jeder Verweis nennt explizit, was in der Zieldatei steht. |
| `G-AGENTIC09`-Verschärfung kippt das Gate rot, bevor die Kürzungen fertig sind. | Gate-Änderung ist der **letzte** Implementierungsschritt, nach allen Kürzungen. Der Verify-Task prüft grün. |
| Ein Skill verliert seinen Trigger, weil die description umformuliert wurde. | Alte description bleibt im PR-Diff sichtbar; die Review-Checkliste verlangt, dass jeder entfernte Begriff entweder wiederkehrt oder als bewusst gestrichen benannt wird. |
| `OVERVIEW.md`-Umbau kippt G-AGENTIC06/07. | Beide Gates laufen in `task freshness:check`; der Verify-Task führt sie aus. Die Zahl 28 bleibt unverändert — K4 fügt keine Skills hinzu und entfernt keine. |
