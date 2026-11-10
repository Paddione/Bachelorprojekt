# P1 — Secrets-Seal-Kette

## Ausgang (verifiziert)

- `taskfiles/Taskfile.platform.yml:56` (`secrets:sync`), `CONTRIBUTING.md:95`
  (`environments/sealed-secrets/<env>.yaml`, `task env:seal`),
  `taskfiles/Taskfile.workspace.yml:711` (`task env:validate`).
- `guardrails.yaml:21` verweist nur auf Skill-Prosa, kein Soll-Ist-Abgleich.

## Ziel

- [ ] `docs/agent-guide/registry/secrets.yaml`: Key, ENV, sealed-source, consumer.
- [ ] `scripts/secrets-check.mjs`: fail-closed — unbekannter/fehlender Key → Exit ≠ 0.
- [ ] `docs/agent-guide/maps/secrets-map.md`: generiert aus YAML (Generator im Check `--map` oder Mini-Skript).
- [ ] Gegenbeleg-Regel: existiert bereits ein Check (Secrets-Soll in
      `environments/.secrets/` + `env:validate`), diesen einbinden statt duplizieren.

## Abnahme

- `node scripts/secrets-check.mjs` grün; Fixture mit unbekanntem Key → rot.
- `task test:changed`-Ausschnitt für `scripts/secrets-check.mjs` grün.
