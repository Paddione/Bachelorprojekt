# Proposal: agentic-skillmd-size

## Why

Health-Goal **G-AGENTIC09** (`.claude/lib/goals.md`, Priorität A) zählt `SKILL.md`-Dateien
über 500 Zeilen. Aktuell verstoßen zwei live Orchestrator-Skills:
`.claude/skills/dev-flow-plan/SKILL.md` (526 Zeilen) und
`.claude/skills/dev-flow-execute/SKILL.md` (568 Zeilen). Beide waren bereits einmal
unter der Schwelle (T001904: dev-flow-plan 508→479), sind aber seither wieder
gewachsen — Root-Cause ist fehlende Extraktions-Disziplin beim Ergänzen neuer
Schritte: neue Operativ-Blöcke werden inline in die SKILL.md geschrieben statt in
`.claude/skills/references/*.md` ausgelagert, obwohl das Repo dieses Muster bereits
etabliert hat (9 bestehende Reference-Dateien).

Konkret enthält `dev-flow-plan/SKILL.md` eine **wortwörtliche Duplikation** der
plan-lint Hard Rules (Zeilen 266–299), die bereits vollständig in
`.claude/skills/references/plan-quality-gates.md` §plan-lint als SSOT stehen — SSOT-Bruch,
Wartungsrisiko (zwei Stellen können auseinanderlaufen). `dev-flow-execute/SKILL.md`
enthält mehrere lange, aber thematisch abgeschlossene Bash-Blöcke (Pre-Flight-Ticket-Lock,
PR-Merge-Wait-Loop, Plan/OpenSpec-Archivierung), die wie die bereits ausgelagerten
Themen (`ci-fix-loop.md`, `verification-block.md`, `deploy-routing.md`) eigenständig
referenzierbar sind.

## What

- `dev-flow-plan/SKILL.md`: Duplizierte plan-lint-Kurzfassung entfernt (SSOT bleibt
  `plan-quality-gates.md` §plan-lint, nur noch per Pointer referenziert); die
  PRD-vs-Change-Proposal-Entscheidungstabelle nach neuer Referenz
  `plan-artifact-level.md` ausgelagert.
- `dev-flow-execute/SKILL.md`: Pre-Flight-Ticket-Lock-Mechanik (Schritt −1) nach neuer
  Referenz `ticket-preflight-lock.md` ausgelagert; PR-Merge-Wait-Loop (Schritt 6.4) in
  die bestehende `ci-fix-loop.md` verschoben; Plan-/OpenSpec-Archivierung (Schritt 7)
  nach neuer Referenz `plan-archive-steps.md` ausgelagert.
- Beide SKILL.md behalten alle operativen Anweisungen — nur als `file://`-Pointer statt
  Inline-Text. Kein Verhaltenswechsel für den Skill-Ablauf, nur Struktur.
- Neuer BATS-Test `G-AGENTIC09` in `tests/spec/agentic-tooling-quality-goals.bats`, der
  die exakte Measurement-Command aus `goals.md` ausführt und `0` erwartet (RED bereits
  committed — zeigt aktuell `2`).

_Ticket: T002094_
