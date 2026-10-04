---
title: "toolset-tool-level — Implementation Plan"
ticket_id: T900983
domains: [agent-skills, dev-tooling, scripts]
status: superseded
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

> **SUPERSEDED durch T900998** (`.agents/plans/knowledge-mcp-consol/`, 2026-10-04): Inhalte wanderten in den Konsolidierungs-Plan, hier nichts mehr pflegen.

# toolset-tool-level — Implementation Plan

Die Toolset-Kette bekommt eine Tool-Ebene: `probe.mjs` misst `tools/list` je Server aus
`mcp.yaml` und schreibt `toolset.lock.yaml`, `capabilities.yaml` stuft einzelne Tools per
`tool_tiers` ein, `check.mjs` meldet Tool-Drift, `toolset-context.sh` rendert riskante Tools
je Rolle. Messung, Entscheidungen D1–D7 und Erstkuration: `design.md`.

_Ticket: T900983_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/toolset/lib/mcp-client.mjs` | 157 (neu) | 643 |
| `scripts/toolset/lib/tools.mjs` | 0 (neu) | 800 |
| `scripts/toolset/probe.mjs` | 22 | 778 |
| `scripts/toolset/probe.test.mjs` | 33 | 767 |
| `scripts/toolset/check.mjs` | 240 | 560 |
| `scripts/toolset-context.sh` | 131 | 669 |
| `scripts/toolset/emit-map.mjs` | 63 | 737 |
| `docs/agent-guide/registry/toolset.lock.yaml` | 2 | n/a (S1-ungated) |
| `docs/agent-guide/registry/capabilities.yaml` | 958 | n/a (S1-ungated) |
| `.opencode/skills/toolset-curate/SKILL.md` | 153 | n/a (S1-ungated) |
| `tests/spec/toolset-registry/tool-level.bats` | 170 (neu, Failing Test) | n/a (S1-ungated) |
| `tests/spec/toolset-registry/fixtures/fake-mcp.mjs` | 30 (neu) | n/a (S1-ungated) |

Budget geprüft mit `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget <datei>`.

<!-- vitest: kein neuer Test nötig, weil keine Website-Datei berührt wird; die Regression deckt tests/spec/toolset-registry/tool-level.bats über Probe-, Gate- und Render-Ausgabe ab -->

## Task 1: Failing Test bestätigen

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/toolset-registry/tool-level.bats
```

expected: FAIL. Alle 9 Tests schlagen fehl: `probe.mjs` schreibt keine Tools, `check.mjs` kennt
`tool_tiers` nicht, `toolset-context.sh` rendert keine Tools.

## Task 2: Gemeinsame Tool-Logik

- [x] `scripts/toolset/lib/tools.mjs`: `defaultLockPath(registryPath)` (D6), `loadLock`,
      `toolHash`, `globMatch`, `resolveToolTier(name, instCfg)` (D3),
      `toolDrift(serverEntry)` → `{ added, removed, changed }`.
- [x] `scripts/toolset/lib/mcp-client.mjs` bleibt wie im Branch (http + stdio, Paginierung).

## Task 3: Probe

- [x] `probe.mjs`: Clients aus `TOOLSET_MCP_REGISTRY` (Default `docs/agent-guide/registry/mcp.yaml`);
      http über `endpoint` + `headers` (`${VAR}` aus der Umgebung), stdio über
      `harness.claude_code` (Fallback Top-Level `command`/`args`), `cwd` = Repo-Root.
- [x] Lock nach D1/D2 schreiben; `--server <name>` begrenzt, `--ack <name>` übernimmt
      `tools` → `reviewed`, `--dry-run` schreibt nicht. Exit 0 auch bei unerreichbaren Servern.
- [x] `probe.test.mjs` an das neue Lock-Format anpassen (Merge-Verhalten bleibt geprüft).

## Task 4: Gate und Rendering

- [x] `check.mjs`: D4 umsetzen (fail-closed-Regeln + fail-open-Report, offline).
- [x] `toolset-context.sh`: D5 umsetzen; Lock-Pfad nach D6.
- [x] `emit-map.mjs`: Tool-Zahl und riskante Tools je Instanz in die Karte.

## Task 5: Erstkuration und Lock

- [x] `node scripts/toolset/probe.mjs` auf dem Host; erreichbare Server mit `--ack` übernehmen.
- [x] `tool_tiers` in `capabilities.yaml` nach der Tabelle in `design.md`.
- [x] `toolset-curate/SKILL.md`: Abschnitt „Tool-Ebene" (Probe, `--ack`, `tool_tiers`, Drift-Report);
      Kommentar in `toolset.lock.yaml` aktualisieren.

## Task 6: Finale Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/toolset-registry/
node --test scripts/toolset/*.test.mjs
node scripts/toolset/check.mjs
bash scripts/toolset-context.sh bp-run
task test:changed
task freshness:regenerate
task freshness:check
```
