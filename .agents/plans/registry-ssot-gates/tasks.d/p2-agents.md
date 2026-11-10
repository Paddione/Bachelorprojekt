# P2 — Agent-Rollen/Modelle-Check

## Ausgang (verifiziert)

- `docs/agent-guide/registry/agents.yaml:2,15,35` (Rollen + Runtimes aus
  `.opencode/agent-models.jsonc`), `scripts/toolset/lib/roles.mjs`,
  `scripts/toolset/check.mjs:109` (nur `forbiddenProviders`).

## Ziel

- [ ] `scripts/agents-check.mjs`: fail-closed — Rolle ohne Runtime-Gegenstück /
      unbekannte Rolle in `roles.mjs` → Exit ≠ 0. Prüft `agents.yaml` ↔
      `agent-models.jsonc` ↔ `.claude/agents/*.md`-Frontmatter (Modell, tools).
- [ ] `docs/agent-guide/maps/agents-map.md`: generiert.
- [ ] Bestehendes `test:unit:agents` (`taskfiles/Taskfile.test.yml:98`)
      referenzieren, nicht duplizieren; Unsicherheit im Plan vermerken falls
      es Teile abdeckt.

## Abnahme

- Check grün; Fixture (Rolle ohne Runtime) → rot.
