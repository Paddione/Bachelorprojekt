# T002772: Tote SSOT-Referenz in dead-path-references.bats

## Problem
`tests/spec/repo-hygiene/dead-path-references.bats` Zeile 3: `SSOT: openspec/specs/repo-hygiene.md`.
Diese Datei existiert nicht.

## Fix
`openspec/specs/repo-hygiene.md` → `openspec/specs/agent-skills.md` (dort steht die repo-hygiene-Requirement).
