# T-1 — Major Dependency Audit (T001360, dep02)

_Branch HEAD audit, generated 2026-07-01. Tool: `npm outdated` per workspace._

## Scope

The repo is a multi-package workspace. This plan (dep02) covers the **remaining
G-DEP02 slot** — the other two slots are already occupied by sibling tickets.
To keep the update conflict-free and independently verifiable, dep02 targets the
**root tooling package** (`/package.json`, npm), whose devDependencies gate the
CI offline-test + vitest-based checks. The website package (a separate `pnpm`
lockfile ecosystem with its own CI job) is audited below but its major bumps are
**deferred** — see the "Deferred" section for rationale.

## Root package (`/package.json`, npm) — IN SCOPE

| Dependency  | Current | Latest  | Jump      | Status | Breaking-change summary |
|-------------|---------|---------|-----------|--------|-------------------------|
| vitest      | 3.2.6   | 4.1.9   | major 3→4 | **shipped** | Vitest 4 switches the default transformer to **oxc** (esbuild transform options ignored with an informational log). `test:openspec` (12 tests) passes unchanged. |
| typescript  | 5.9.3   | 6.0.3   | major 5→6 | **deferred** | `npm ci` (strict, used by CI) fails ERESOLVE: `madge@8.0.0` declares `peerOptional typescript@^5.4.4` and no madge release yet supports TS 6. Local lenient `npm install` masked it. Root `typecheck` script isn't CI-gated anyway. Blocked until madge widens its TS peer range. |

Non-major (excluded from this major-update plan): `@mermaid-js/mermaid-cli`
11.15→11.16 (minor); `gray-matter` shows an installed-tree artifact (declared
`^4.0.3`, satisfied) — no manifest change needed.

## Website package (`website/package.json`, pnpm) — DEFERRED

| Dependency          | Current | Latest | Jump      | Note |
|---------------------|---------|--------|-----------|------|
| eslint-plugin-astro | 1.7.0   | 2.1.1  | major 1→2 | Website CI runs `pnpm lint` **fail-closed** (`--max-warnings 0`). A flat-config/rule-set major carries high regression risk; belongs in a website-domain change. |
| knip                | 5.88.1  | 6.23.0 | major 5→6 | Website CI runs `knip --no-exit-code` (advisory only). Low value for this slot; defer to website domain. |

Other website entries in `npm outdated` are minor/patch or `0.x` bumps
(pdfkit 0.18→0.19, rrweb 2.0→2.1, astro 7.0.3→7.0.4, etc.) — not major-level,
handled by Renovate's minor/patch groups.

## Conclusion

dep02 ships **vitest 3.2.6 → 4.1.9** in the root tooling package. **typescript
6** is deferred (blocked by `madge@8`'s `peerOptional typescript@^5.4.4` — fails
strict `npm ci`). Website majors (`eslint-plugin-astro`, `knip`) are deferred to
a website-domain change to avoid cross-ecosystem lockfile churn and the
fail-closed lint risk in a single PR.
