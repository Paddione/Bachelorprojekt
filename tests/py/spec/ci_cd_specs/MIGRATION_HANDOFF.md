# T901213 native CI-CD migration handoff

44 of the 69 sources listed in `tests/py/spec/test_ci_cd_specs.py` now have native modules. All 155 original cases in these 44 sources are represented (count verified by AST inspection of test functions and parametrize lists). `parity_inventory.json` gives the exact per-source mapping and the remaining 25 sources / 139 original cases.

Verification: `uv run --with pytest --with pyyaml --with jinja2 pytest tests/py/spec/ci_cd_specs --tb=short -q` -> 155 passed, 0 skipped, 8.28s.

No original source BATS, wrapper, production files, commits, PRs, or ticket writes were changed. Each module names the exact original source in its docstring. The only bash -c usage sources production functions (`branch_is_ticketless`, `ci_checks_verdict`); no BATS execution or generic shell assertion harness.

Continue with the unimplemented inventory entries. Most are Git/Branch-Reaper/CI-watch sandbox integration fixtures and require source-specific translation. Preserve production invocation, command output, cleanup and prerequisite semantics.

Remaining meta-tests `spec-tracked-file-guard.bats` and `spec-tracked-file-guard-isolation.bats` invoke BATS internally in the original. Translate their inner mcp-tooling behavior natively rather than invoking BATS or skipping. The already ported `spec-test-no-tracked-file-mutation` executes the actual P4.5 production emitter in a temp directory, compares generated agents-map bytes, and checks original map mtime_ns.

Config guards intentionally retain original BATS job/check conventions (test-bats required check name, tests/bats interpreter wrapper, BATS test corpus scan). Coordinate semantic updates of these guards with root's runner-removal work; do not silently remove cases.

Fixture notes: PyYAML safe_load resolves GitHub Actions `on` as True (YAML 1.1), so `test_self_hosted_fork_guard.py` explicitly handles both. Parametrized cases remain individually collected. Shell syntax/schema output assertions are native Python or real subprocess calls. Original prerequisite skips are retained for missing actionlint, missing shared branch-allowlist, unavailable task summary, and ticketless/detached live branch in mishap test. All prerequisites were present in this run.
