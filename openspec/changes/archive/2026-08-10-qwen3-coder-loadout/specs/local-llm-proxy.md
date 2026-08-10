## ADDED Requirements

### Requirement: Qwen3-Coder is available as an additive chat loadout

`scripts/llm/loadouts.json` SHALL declare a loadout `qwen3-coder` serving
Qwen3-Coder-30B-A3B-Instruct (UD-Q4_K_XL) on port 8097 within `exclusiveGroup: "chat-gpu"`, and
`tickets.llm_proxy_backends` SHALL carry a matching enabled entry for that port on both brands.

Adding this loadout SHALL NOT change model routing: no row in `tickets.provider_config` and no
row in `tickets.factory_model_slots` may be modified by this change. The loadout is started on
demand; the default path remains whichever backend the routing tables already name.

The loadout SHALL rely on `--fit` for layer placement and MUST NOT pin `ctx` or `ngl`, because the
model (17 GB) exceeds available VRAM (16 GB) and depends on automatic MoE offload. Its `notes`
SHALL record that `fit.targetMarginMib` is carried over from the reference run and is **not** a
measured value, so a later reader does not mistake it for one.

#### Scenario: Loadout is declared in canonical form

- **GIVEN** the repository checkout with the `qwen3-coder` loadout present
- **WHEN** `task llm:loadouts:check` runs in CI
- **THEN** the command exits 0, confirming the entry matches the canonical `writeLoadouts()` form

#### Scenario: Port does not collide with an existing loadout

- **GIVEN** `scripts/llm/loadouts.json` containing all declared loadouts
- **WHEN** the ports of every entry are collected
- **THEN** port 8097 belongs to `qwen3-coder` alone, and the ports already taken by other
  loadouts (8091, 8092, 8095, 8096, 8098, 8099) are not reassigned to it

#### Scenario: Backend registration leaves routing untouched

- **GIVEN** the migration registering `llamacpp-qwen3coder` has been applied to a brand database
- **WHEN** `tickets.provider_config` and `tickets.factory_model_slots` are read back
- **THEN** no row references `qwen3-coder`, and the previously configured model ids for every
  tier are unchanged

#### Scenario: Loadout declares no pinned context or layer count

- **GIVEN** the `qwen3-coder` entry with `fit.enabled` set to true
- **WHEN** its `args.ctx` and `args.ngl` are read
- **THEN** both are null, satisfying the existing guard that no loadout using `--fit` pins either
  value
