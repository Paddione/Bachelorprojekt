# Proposal: mishap-t002284

## Why

Drei unabhängige Mishaps aus einem dev-flow-execute-Lauf: `vda.sh ticket get` unterschlägt
`resolution`/`severity`/`description` im JSON (zweimal reproduziert, verifiziert die
Domänenkonvention T001092 falsch), ein Implementer-Subagent hat entgegen der Ein-Ebenen-Regel
selbst einen Sub-Implementer gespawnt (die Regel stand nur in Skill-Prosa, nicht im
Implementer-Prompt), und `.githooks/pre-commit` hat eine gestagte Änderung lautlos zu einem
Leer-Diff neutralisiert (grüner `git commit`, fehlende Datei im Commit).

## What

- `scripts/vda/ticket/get.sh`: `resolution`, `severity`, `description` in die JSON-Projektion
  aufnehmen.
- `.claude/skills/dev-flow-execute/SKILL.md`: Ein-Ebenen-Regel wörtlich in den
  Implementer-Auftrags-Prompt aufnehmen, Agent-ID-Logging beim Dispatch ergänzen.
- `.githooks/pre-commit` + `.claude/skills/references/verification-block.md`: Warnung, wenn die
  Freshness-Regeneration eine bereits gestagte Datei zum Leer-Diff neutralisiert, plus
  `git show --stat HEAD` als Pflicht-Verifikationsschritt.

_Ticket: T002284_
