# Latest stable Vitest, with version-aware execution

Resolve `https://registry.npmjs.org/vitest/latest` (or the equivalent npm view operation) at the start of a version-sensitive task. Record version and lookup date; use the official release and migration docs. `next`, `beta` and `rc` are not substitutes for `latest`. If the registry is unavailable, report that the current stable version could not be verified; never call a remembered version current.

Checked 2026-10-08: the official npm latest endpoint returned Vitest **5.0.3**. This is a dated observation, not a permanent pin. The package metadata requires Node `^22.12.0 || ^24.0.0 || >=26.0.0` and Vite `^6.4.0 || ^7.0.0 || ^8.0.0`. Resolve these requirements again for the next release.

Determine the installed version from the package's lockfile/runtime as well as the manifest range. For new configuration and authorized upgrades, target newest stable Vitest and matching versions of official coverage/UI/browser companions. Root uses npm; `components/website` uses pnpm. Respect each package's lockfile and runtime constraints.

An audit evaluates the installed release against its own official docs and reports the stable-version gap. Editing a skill is not a dependency-upgrade instruction. When an upgrade is requested, perform the migration with the repository dependency workflow and validate every affected package; do not only change package.json or silently run a different major through npx.

## Upstream baseline is historical

The imported axross references were written for 4.1.10. They remain useful for operational review but their version-specific assertions require verification. Current official docs override stale defaults and option names. Do not label the complete imported reference set as verified for 5.x.

Official 5.0 migration examples checked on 2026-10-08:

- `clearMocks` defaults to `true`; this clears call history, not implementation.
- Inline projects inherit root configuration by default (`extends: true`); referenced config files/directories still do not.
- Hoisted `vi.mock`, `vi.unmock` and `vi.hoisted` calls inside functions/blocks now throw; place them at module top level, or use supported non-hoisted APIs where appropriate.
- `testNamePattern` uses the `>`-joined full test name; revisit filters spanning suite/test boundaries.

Verify all other proposed CLI flags, configuration keys, reporting, coverage and browser APIs against the installed/latest target docs before use. Always run non-interactively and assess collected-test counts, assertions, cleanup and included coverage scope.

Sources: https://registry.npmjs.org/vitest/latest and https://vitest.dev/guide/migration/
