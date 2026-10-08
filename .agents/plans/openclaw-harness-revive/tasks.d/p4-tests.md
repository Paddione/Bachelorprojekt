# p4 — Runbook und Tests

Ziel: D5 plus Absicherung. Neovim nur über CLI/Gateway, nie über Terminal.

## Tasks

- [ ] `docs/runbooks/openclaw-ops-bot.md`: Abschnitt Neovim-Anbindung ergänzen —
  ausschließlich `scripts/openclaw-ask.sh` und Gateway-HTTP (`/healthz`,
  Agent-Aufrufe); Terminal-Multiplexing ist explizit ausgeschlossen.
- [ ] `docs/agent-guide/registry/harness-config-targets.md`: OpenClaw-Abschnitt
  auf den neuen Stand bringen (Adapter da, Rolle da, `config:`-Wert aus p2/p3).
- [ ] `tests/spec/openclaw-harness.bats` (neu): RED zuerst — Registry enthält
  `harnesses.openclaw` mit Rolle `openclaw-ops`, `check.mjs` grün,
  `toolset-context.sh openclaw-ops` enthält K8s-Lesen und Broker:
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/openclaw-harness.bats
  ```
  Beim ersten Lauf ist `expected: FAIL` (Registry und Adapter fehlen noch);
  nach p2/p3 ist der Lauf grün.
- [ ] `task test:inventory` regenerieren
  (`components/website/src/data/test-inventory.json` mitcommitten).

## Verify

- [ ] `tests/unit/lib/bats-core/bin/bats tests/spec/openclaw-harness.bats tests/spec/openclaw-ops-bot.bats`
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
