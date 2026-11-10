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

## Gegenbeleg-Entscheidung (execute)

- `scripts/agent-guide/validate.mjs` (Zeilen 46-62) prüft `agents.yaml` intern
  (Harness-Keys je Rolle, mode/Modell je Runtime) — eingebunden, nicht dupliziert.
- `task test:unit:agents` (`taskfiles/Taskfile.test.yml:98`) prüft nur
  Output-Trust-Prosa in `.claude/agents/bp-run.md`, kein Modell-Mapping —
  referenziert, keine Überlappung mit `scripts/agents-check.mjs`.
- `docs/agent-guide/maps/agents-map.md` wird bereits von
  `scripts/agent-guide/emit-maps.mjs` (`task agent-guide:maps`) generiert —
  kein zweiter Emitter; `task agents:map` verdrahtet den bestehenden.
  Abnahme erfüllt (grün; Fixture mit Rolle ohne Runtime rot).
