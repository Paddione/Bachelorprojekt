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

## Spike-Befund (p1, Worktree-Verifikation 2026-10-08)

Gemessen im Execute-Worktree (Gateway-Host nicht erreichbar, read-only):

```bash
task openclaw:status
# → unit: inactive; keine Antwort auf http://127.0.0.1:18789/healthz;
#   lokales Modell nicht erreichbar (127.0.0.1:1919); TELEGRAM_*-Hinweise
scripts/openclaw-ask.sh --timeout 60 "Welche Pods laufen nicht?"
# → FEHLER: OPENCLAW_GATEWAY_TOKEN fehlt — Abhilfe: task openclaw:configure
```

Konsequenz: Der Adapter darf zur Sync-/Check-Zeit keine Gateway-Erreichbarkeit
voraussetzen. `sync.mjs --harness openclaw --dry-run` bleibt offline-fähig, weil
das Adapter-Ziel (`~/.openclaw/openclaw.json`, User-Scope) im Repo-Checkout nie
existiert und sync/check fehlende Ziele per `SKIP` überspringen. `doctor --probe`
läuft nur dort, wo Gateway plus Token vorhanden sind (GPU-Host), nie in CI.

## Verträge

- Rolle `openclaw-ops`: neu in `ROLES`, nicht in `WILDCARD_ROLES`.
- Werkzeugsatz: `mcp:mcp-kubernetes` (lesen), Logs (Teil davon),
  LLM-Capability: `mcp:mcp-task-runner` (`repo-task-ausfuehrung` — Taskfile-Ziele,
  inkl. `llm:*`, auflösen und ausführen; Inspektion safe, Ausführen caution),
  `cli:openclaw-ask`. Direkte Treffer only.
- Adapter: `scripts/toolset/lib/adapters/openclaw.mjs`, User-Scope
  lesen/validieren/`doctor --probe`, kein Schreiben in CI.
  `config:` wird `~/.openclaw/openclaw.json` (User-Scope als String — kein
  Projekt-Ziel, sync/check springen über das fehlende Ziel).
- Neovim: nur CLI/Gateway, dokumentiert im Runbook.
