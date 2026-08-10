## ADDED Requirements

### Requirement: routes:manifest suppresses raw Node stderr from the failed primary attempt

`scripts/build-route-manifest.mjs` SHALL not leak the raw stderr of a failed primary manifest
build — such as the Node stacktrace of a missing `tsx/dist/cli.mjs` behind a present
`website/node_modules/.bin/tsx` shim — into the task output. When the primary attempt fails and
the documented `extractSlugsFromSource` fallback takes over, the run SHALL print at most a
one-line notice that the fallback was used, SHALL exit with code 0, and SHALL produce a
byte-identical manifest.

#### Scenario: tsx shim exists but its cli module is missing

- **GIVEN** `website/node_modules/.bin/tsx` exists while `tsx/dist/cli.mjs` does not
- **WHEN** `task freshness:regenerate` runs the `routes:manifest` step
- **THEN** no raw Node stacktrace appears in the output
- **AND** a one-line notice states that the fallback was used
- **AND** the step exits with code 0 and the generated manifest is unchanged
