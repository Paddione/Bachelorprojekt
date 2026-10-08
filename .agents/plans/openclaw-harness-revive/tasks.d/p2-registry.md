# p2 — Registry: eigene Rolle und schmaler Werkzeugsatz

Ziel: D1/D2 umsetzen. Die Datei .opencode/agent-models.jsonc wird nicht angefasst
(Konflikt T900792/T900793).

## Tasks

- [ ] `scripts/toolset/lib/roles.mjs`: Rolle `openclaw-ops` in `ROLES` aufnehmen,
  NICHT in `WILDCARD_ROLES` (schmaler Satz per Konstruktion, wie `pi`).
  (`scripts/toolset/lib/roles.mjs` Ist 42, Restbudget siehe Plantabelle.)
- [ ] `docs/agent-guide/registry/capabilities.yaml`: `harnesses.openclaw` auf
  `roles: [openclaw-ops]` stellen; `job` auf Always-on-GPU-Host mit schmalem
  Satz nachziehen; `mcp:mcp-kubernetes`, LLM-Capability aus p1 und
  `cli:openclaw-ask` um die neue Rolle ergänzen.
- [ ] `scripts/plan-context.sh`: `_role_allowlist` prüfen; neue Rolle mappen oder
  begründen warum kein Mapping nötig ist.
  (`scripts/plan-context.sh` Ist 200, Restbudget siehe Plantabelle.)
- [ ] `node scripts/toolset/check.mjs` muss grün sein.

## Verify

- [ ] `node scripts/toolset/check.mjs`
- [ ] `bash scripts/toolset-context.sh openclaw-ops` zeigt nur den schmalen Satz.
