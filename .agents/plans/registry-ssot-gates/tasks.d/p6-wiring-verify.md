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
