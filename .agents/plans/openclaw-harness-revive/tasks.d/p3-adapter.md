# p3 — Adapter: User-Scope-Adapter für OpenClaw

Ziel: D3 bauen. Kein Schreiben unter `~/.openclaw` in CI-Läufen.

## Tasks

- [ ] `scripts/toolset/lib/adapters/openclaw.mjs` (neu, unter dem `.mjs`-Limit
  schneiden): User-Scope lesen/validieren plus `doctor --probe` nach dem
  p1-Vertrag; `sync.mjs --harness openclaw --dry-run` bleibt offline-fähig.
- [ ] `scripts/toolset/lib/adapters/index.mjs` um den Adapter ergänzen.
  (`scripts/toolset/lib/adapters/index.mjs` Ist 5, Restbudget siehe Plantabelle.)
- [ ] `scripts/toolset/lib/adapters/adapters.test.mjs` um Adapter-Fälle erweitern.
  (`scripts/toolset/lib/adapters/adapters.test.mjs` Ist 77, Restbudget siehe
  Plantabelle.)

## Verify

- [ ] `node --test scripts/toolset/lib/adapters/adapters.test.mjs`
- [ ] `node scripts/toolset/check.mjs`
