### Requirement: task-oracle SHALL materialize the task's own ENV/BRAND var, not assume ENV=

`scripts/vda/oracle.sh` (both the structured fast-path and the
natural-language/LLM-inference path) SHALL resolve which variable name a
selected Taskfile.yml task actually declares — via its own `requires:
vars:` block or a direct `vars:` default-value block — and materialize
`ENV=<token>` or `BRAND=fleet-<token>` accordingly, instead of always
appending `ENV=<token>`. The resolution SHALL only consider the task's own
var declaration, not `vars:` values passed to sub-task calls inside its
`cmds:` list (which would misattribute an orchestrator task like
`fleet:deploy` as requiring the same var as the sub-tasks it dispatches).

#### Scenario: BRAND-only task via natural-language dispatch

- **GIVEN** the goal `"deploy full workspace to mentolder brand on fleet"`
  resolves to the task `fleet:deploy:brand`, which declares
  `requires: { vars: [BRAND] }` in `Taskfile.yml`
- **WHEN** `bash scripts/vda.sh oracle --json '<goal>'` runs
- **THEN** the emitted `cmd` field is
  `task fleet:deploy:brand BRAND=fleet-mentolder`, not
  `task fleet:deploy:brand ENV=mentolder`

#### Scenario: BRAND-only task via structured fast-path syntax

- **GIVEN** the user types `fleet:deploy:brand ENV=mentolder` (fast-path's
  `ENV=<token>` DSL is a token carrier, not a literal var-name pass-through)
- **WHEN** the fast-path resolves and executes the task
- **THEN** it runs `task fleet:deploy:brand BRAND=fleet-mentolder`

#### Scenario: orchestrator task with no own var is not given a spurious var

- **GIVEN** a task like `fleet:deploy` has no `requires:`/`vars:` block of
  its own, only sub-task calls with `vars: { BRAND: ... }` inside `cmds:`
- **WHEN** the var-resolution helper inspects it
- **THEN** it returns no var, and no `ENV=`/`BRAND=` argument is appended
