# Proposal: agents-yaml-freetoken-drift

## Why

`tests/spec/agent-roster.bats` (P4.3, P4.3b) und `tests/spec/agent-skills.bats`
(T002305: "AGENTS.md runtime table covers every registry runtime") schlagen fehl:
`docs/agent-guide/registry/agents.yaml` fuehrt die fuenf Rollen `freetoken-primary`,
`freetoken-thinking`, `freetoken-fast-1`, `freetoken-fast-2`, `freetoken-fast-3` mit
`model: llamacpp-local/qwen38-220k`, aber `.opencode/agent-models.jsonc` — die
tatsaechliche opencode-Laufzeitkonfiguration — hat fuer diese fuenf Rollen keinen
Eintrag mehr.

Root-Cause-Verifikation (T002448-M5): T900163 (`feat(agents): remove FreeToken,
prune stale assets and consolidate SSOT specs`, Commit `978181233`) hat diese fuenf
Rollen bewusst aus `agent-models.jsonc` entfernt und durch die bereits vorhandene
Rolle `qwen38` ersetzt (identisches Modell `llamacpp-local/qwen38-220k`) — auch die
Task-Dispatch-Permissions (`freetoken-thinking: allow` etc.) wurden dabei aus allen
Rollen entfernt. `docs/agent-guide/registry/agents.yaml` (der Registry-Spiegel) wurde
bei dieser Konsolidierung nicht nachgezogen: die fuenf Rollen blieben dort stehen,
lediglich ihr `model:`-Feld wurde in T900164 kosmetisch von `freetoken-local/active*`
auf `llamacpp-local/qwen38-220k` aktualisiert, ohne den eigentlichen Wegfall der
Rollen aus `agent-models.jsonc` zu spiegeln. `qwen38` existiert bereits als
Eintrag in `agents.yaml` (Zeile 74) — die fuenf Eintraege sind reine Karteileichen.

Vorbestehend bereits auf `main` vor T900164 (bestaetigt per
`git show main:docs/agent-guide/registry/agents.yaml` vs.
`git show main:.opencode/agent-models.jsonc`). Sichtbar auf GitHub PR #5618 als
nicht-blockierender Check (`Factory OpenSpec + Guards` / `shard 1` / `shard 4`
FAILURE), waehrend `BATS Unit + Quality Gates` (SUCCESS) den Merge nicht verhinderte.

## What

- Die fuenf Rollen `freetoken-primary`, `freetoken-thinking`, `freetoken-fast-1`,
  `freetoken-fast-2`, `freetoken-fast-3` aus `docs/agent-guide/registry/agents.yaml`
  entfernen — Registry an den bereits vollzogenen T900163-Konsolidierungszustand
  angleichen. `qwen38` bleibt einzige Rolle fuer dieses Modell.
- `docs/agent-guide/maps/agents-map.md` per `task agent-guide:maps` neu generieren,
  damit die fuenf Zeilen dort ebenfalls verschwinden.
- Keine Aenderung an `.opencode/agent-models.jsonc`, `AGENTS.md` oder
  `CLAUDE.md` noetig — die Rollen fehlen dort bereits korrekt.

_Ticket: T900167_
