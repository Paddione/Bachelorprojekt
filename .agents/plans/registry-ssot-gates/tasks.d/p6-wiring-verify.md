# P6 — Task-Wiring + Verify

## Ziel

- [ ] Tasks `secrets:check/map`, `agents:check/map`, `skills:check/map`,
      `content:check/map`, `api:check/map` in passende Taskfiles verdrahten
      (bestehende `test:unit:agents`, `test:api-auth` referenzieren).
- [ ] Generierte Maps ins Freshness-System (`task freshness:regenerate` +
      `task freshness:check` grün).
- [ ] Gates: `task test:changed` + `task freshness:check` grün.
- [ ] Danach STOPP — kein Merge (dev-flow-execute / Review folgt).

## Abnahme

- Alle 5 Checks einzeln grün; Gesamt-Gates grün.

## Umsetzung (execute)

- Tasks in `taskfiles/Taskfile.platform.yml` (neben `networks:check`/`domains:check`):
  `secrets:check/map`, `agents:check/map`, `skills:check/map`,
  `content:check/map`, `api:check/map`. `agents:map` nutzt den bestehenden
  Emitter (`scripts/agent-guide/emit-maps.mjs`).
- `freshness:regenerate` um die 4 neuen `*:map`-Tasks erweitert
  (`agents-map.md` kam schon über `agent-guide:emit`); `freshness:check`-FILES,
  `.gitattributes` (merge=ours) und `.githooks/pre-commit` (Autostage) um die
  4 neuen Karten erweitert.
- `task test:changed` ruft die 5 Checks im Always-Block (wie `networks:check`).
- Bestehende `test:unit:agents` und `test:api-auth` unverändert referenziert.
