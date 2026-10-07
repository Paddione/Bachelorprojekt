# Design: openclaw-harness-revive (T900794)

Bindender Vertrag für alle Partials. Feinschliff durch den p1-Spike; die
Richtung steht fest und wird hier nicht mehr geöffnet.

## Stand (Phase A, Haupt-Checkout)

- Gateway: `openclaw-gateway.service` auf dem GPU-Host, Runbook
  `docs/runbooks/openclaw-ops-bot.md`, Broker `scripts/openclaw-ask.sh`,
  Tasks `taskfiles/Taskfile.openclaw.yml`. Keine Neuinstallation.
- Registry: `harnesses.openclaw` vorhanden (`provider: local`,
  `default_model: lmstudio`, `roles: [bp-run]`, `config: null`), kein Adapter
  (`scripts/toolset/lib/adapters/` kennt nur `claude`, `opencode`).
- P1-Befund: OpenClaw kennt nur User-Scope (`~/.openclaw/openclaw.json`).
- Guard: `tests/spec/openclaw-ops-bot.bats` sichert den bestehenden Bot ab.
- Konflikt: die Datei .opencode/agent-models.jsonc ist tabu (T900792/T900793).

## Verträge

- Rolle `openclaw-ops`: neu in `ROLES`, nicht in `WILDCARD_ROLES`.
- Werkzeugsatz: `mcp:mcp-kubernetes` (lesen), Logs (Teil davon),
  LLM-Capability aus p1, `cli:openclaw-ask`. Direkte Treffer only.
- Adapter: `scripts/toolset/lib/adapters/openclaw.mjs`, User-Scope
  lesen/validieren/`doctor --probe`, kein Schreiben in CI.
- Neovim: nur CLI/Gateway, dokumentiert im Runbook.
