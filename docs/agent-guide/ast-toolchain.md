# AST-Toolchain (C9, T900560)

Structural code introspection for agents: precise AST queries instead of
textual grep where structure matters. Advisory — BATS guards stay authoritative.

## ast-grep (wired)

- Config: [`sgconfig.yml`](../../sgconfig.yml), rules in [`ast-rules/`](../../ast-rules/).
- Scan: `task quality:ast` (pinned `@ast-grep/cli@0.45.3` via npx; no install needed).
- Rules mirror EXISTING conventions — never invent policy in a rule:
  - `no-explicit-any` mirrors G-CQ02 (`tests/spec/g-cq02-any-types.bats`).
- Ad-hoc queries without writing a rule:
  `npx --yes -p @ast-grep/cli@0.45.3 ast-grep run -p '<pattern>' -l typescript <file>`
  (the `-p` form is required — the package ships two bins, bare `npx @ast-grep/cli`
  cannot pick one; the `sg` bin is deprecated, use `ast-grep`).
- Prefer kind-based rules (`kind: predefined_type`) over enumerating syntactic
  patterns — one node kind covers all contexts (verified 5/5 on the `any` probe).
- `/usr/bin/sg` on dev machines is the Unix set-group tool, NOT ast-grep.

## Curated plugin tools (already canonical)

`code-struktur-suche` / `code-struktur-ersetzen` via
`plugin:oh-my-opencode-slim:ast_grep_*` (`capabilities.yaml`, roles
orchestrator/big-pickle). No registry changes in C9.

## Explicitly NOT wired (C9 decisions)

- **RepoMapper-MCP**: no such server exists (npm 404 for `repomapper`;
  `agentic-lookup.mjs find repomapper` empty). Structural search stays with
  the curated ast-grep tools above. Recorded as dossier deviation 8.
- **Tach** (Python import boundaries): the Python surface is 96 scattered
  skill scripts with no package structure to bound — wiring boundaries would
  invent architecture. Recorded as dossier deviation 7.
- **dependency-cruiser**: deferred, not rejected. Root-run cruises ~nothing
  (no TS transpiler at root); package-run rejects an external `--validate`
  path. Proper wiring needs a config inside `components/website/` + a pnpm
  script — a website-package change, out of chore scope. Recorded as
  dossier deviation 9.
