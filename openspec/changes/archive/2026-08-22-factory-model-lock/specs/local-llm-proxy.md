## ADDED Requirements

### Requirement: The factory default model is chosen and locked in the proxy web UI

`scripts/llm/loadouts.json` SHALL support an optional top-level `factory` block that names the
model the Software Factory uses, and whether that choice is locked:

```json
"factory": { "model": "gemma26-throughput", "locked": true }
```

The block SHALL be validated fail-closed by `scripts/llm-proxy/loadouts.mjs`, in the same pass
that already validates `roles`: `factory` SHALL be an object, its only permitted keys SHALL be
`model` and `locked`, `model` SHALL be a non-empty string that matches the `slug` of an entry in
`loadouts`, and `locked` SHALL be a boolean. A `factory.model` naming a slug that `loadouts` does
not carry SHALL fail the parse.

That existence check is the point of the requirement, not a side condition. Until now a retired
model id reached the routing surfaces without any error, because `resolveModel()` reroutes an
unknown id to the first healthy backend — observed twice, T002582 (`gemma-4-12b`) and T003538
(`gemma26-factory`). A name that cannot be written cannot be silently rerouted.

The proxy SHALL expose the block over its admin API: `GET /admin/factory` returns the current
`model`, `locked`, the file `mtimeMs`, and the selectable loadouts; `PUT /admin/factory` writes a
new `model`/`locked` pair through `writeLoadouts`, honouring the same `mtimeMs` conflict guard as
`PUT /admin/loadouts` so a concurrent hand edit is never overwritten.

The admin web UI at `/admin` SHALL render the choice as a select over the selectable loadouts plus
a lock toggle, and SHALL show each option's running state, so a lock is not set blind on a backend
that is not loaded.

#### Scenario: A factory model that no loadout serves cannot be stored

- **GIVEN** `loadouts.json` carries loadouts `gemma26-throughput` and `gemma12-vision`
- **WHEN** a document with `factory.model = "gemma-4-12b"` is parsed
- **THEN** the parse fails naming the unknown slug, and `PUT /admin/factory` answers HTTP 400
  without writing the file

#### Scenario: An unknown key in the factory block fails the parse

- **GIVEN** a document whose `factory` block carries `{"model": "gemma26-throughput", "tier": "flash"}`
- **WHEN** it is parsed
- **THEN** the parse fails on the unknown field `tier`, the same way an unknown loadout field does

#### Scenario: The block is optional

- **GIVEN** a `loadouts.json` with no `factory` key at all
- **WHEN** it is parsed
- **THEN** the parse succeeds and `GET /admin/factory` reports `model: null, locked: false`

#### Scenario: A concurrent hand edit is not overwritten

- **GIVEN** the UI read `mtimeMs` and the file changed on disk afterwards
- **WHEN** `PUT /admin/factory` is called with the stale `mtimeMs`
- **THEN** the proxy answers HTTP 409 `stale_write` and leaves the file untouched

#### Scenario: The selection lists only loadouts, never free text

- **GIVEN** the admin UI renders the factory section
- **WHEN** the user opens the model selection
- **THEN** the options are exactly the loadout slugs from `loadouts.json`, each with its running
  state, and there is no free-text input for a model id

#### Scenario: Writing the block keeps the canonical file form

- **GIVEN** `PUT /admin/factory` wrote a new selection
- **WHEN** `task llm:loadouts:check` runs
- **THEN** the file still matches `serializeLoadouts` — two-space indent, unescaped non-ASCII,
  trailing newline — because the write goes through `writeLoadouts` and not through a separate
  serializer
