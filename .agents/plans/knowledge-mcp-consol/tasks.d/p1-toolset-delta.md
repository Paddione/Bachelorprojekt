---
id: P1
title: "S1 Toolset-Delta (T900983-Basis)"
role: bp-build
ticket: T900998
depends_on: keine
target_files:
  - scripts/toolset/
  - docs/agent-guide/registry/
---

# P1 — S1 Toolset-Delta

## Ziel

- Toolset-Delta aus staged Plan T900983 uebernehmen: Probes, `tool_tiers`, Drift-Check, Rendering je Rolle.

## Betroffene Dateien (nur)

- `scripts/toolset/lib/tools.mjs`
- `scripts/toolset/lib/mcp-client.mjs`
- `scripts/toolset/probe.mjs`
- `scripts/toolset/check.mjs`
- `scripts/toolset/emit-map.mjs`
- `scripts/toolset-context.sh`
- `docs/agent-guide/registry/capabilities.yaml`
- `docs/agent-guide/registry/toolset.lock.yaml`

## Concrete-Steps

- [ ] `scripts/toolset/lib/tools.mjs` anlegen: `loadLock`, `toolHash`, `globMatch`, `resolveToolTier`, `toolDrift`
- [ ] `probe.mjs`: `tools/list` je Server aus `mcp.yaml` messen, Lock schreiben (`--server`, `--ack`, `--dry-run`)
- [ ] `check.mjs`: Tool-Drift melden (fail-closed-Regeln, offline faehig)
- [ ] `toolset-context.sh`: riskante Tools je Rolle rendern
- [ ] `emit-map.mjs`: Tool-Zahl + riskante Tools je Instanz in Karte schreiben
- [ ] `capabilities.yaml`: `tool_tiers` nach Design-Tabelle erstkuratieren
- [ ] `probe.mjs` auf Host laufen lassen, erreichbare Server per `--ack` uebernehmen

## Gate

- [ ] `bash scripts/plan-lint.sh .agents/plans/knowledge-mcp-consol` gruen
- [ ] `tests/unit/lib/bats-core/bin/bats tests/spec/toolset-registry/` gruen
- [ ] `node scripts/toolset/check.mjs && bash scripts/toolset-context.sh bp-run` gruen
