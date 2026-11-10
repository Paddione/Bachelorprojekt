# P3 — Skill-Inventar-Check

## Ausgang (verifiziert)

- `docs/agent-guide/registry/skills.yaml:1,7,9` (Zielzustand, Projektion
  `scripts/agent-skills/project.mjs`, Lock `vendor-lock.json` via
  `scripts/vendor-sync.py`), `capabilities.yaml:17`.

## Ziel

- [ ] `scripts/skills-check.mjs`: fail-closed — Symlink-Ist
      (`.agents/skills`, `.claude/skills/*`, `.opencode/skills`) vs. Soll aus
      `skills.yaml` + `vendor-lock.json`-Commit; falsches `sync: identical` → rot.
- [ ] `docs/agent-guide/maps/skills-map.md`: generiert.

## Abnahme

- Check grün; Fixture (extra/fehlender Symlink) → rot.

## Gegenbeleg-Entscheidung (execute)

- `scripts/agent-skills/project.mjs --check` (T900151) ist der bestehende
  fail-closed Check (Soll aus `skills.yaml` vs. Symlink-Ist, inkl.
  `sync: identical`-Gleichheit) — `scripts/skills-check.mjs` ruft ihn als
  Subprozess auf und failt mit, statt die Logik zu kopieren. Ergänzt wird nur,
  was die Engine nicht sieht: `vendor-lock.json`-Parsbarkeit und `source`-Existenz.
  Abnahme erfüllt (grün; Fixture mit falschem Harness-Pfad rot).
