# openspec-retire-dir — Design (T900726)

Letzte Charge C7b aus Epic T900560 (ADR-010): `openspec/` löschen. Freigabe durch den Operator am
2026-09-28. Voraussetzung: `openspec-retire-prose` (T900724) und `openspec-retire-code` (T900725) sind
gemergt, sonst brechen Tests und Skripte, die noch auf `openspec/` zeigen.

Danach gilt ein repo-weiter Guard: `openspec` darf nur noch in der Allowlist vorkommen
(Historie und die Abriss-Guards selbst):
`docs/superpowers/`, `docs/adr/`, `.agents/docs/reorg-phase2/`, `.agents/plans/`, `.agents/memory/`,
`scripts/migrations/`, `CHANGELOG.md`, `docs/generated/`, `docs/code-quality/repo-index.json`,
`tests/spec/os-retirement-*.bats`, `tests/fixtures/os-retirement/`.

Erledigt T900695 (Validator rot wegen Change-Ordnern ohne `specs/`).
