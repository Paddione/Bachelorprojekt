---
name: vitest
description: Vitest fast unit testing framework powered by Vite with Jest-compatible API. Use when writing tests, mocking, configuring coverage, or working with test filtering and fixtures.
metadata:
  author: Anthony Fu
  version: "2026.9.25"
  source: Generated from https://github.com/vitest-dev/vitest, scripts located at https://github.com/antfu/skills
---

## Stable-version and audit routing

Always resolve the latest stable Vitest release and follow [the stable-version policy](../vitest-testing/references/stable-version-policy.md). The generated version below is a reference snapshot, not a version ceiling. Use [vitest-testing](../vitest-testing/SKILL.md) for runner configuration, environment and CI review, and [sota-testing](../sota-testing/SKILL.md) for a combined quality audit across all test frameworks.


Vitest is a next-generation testing framework powered by Vite. It provides a Jest-compatible API with native ESM, TypeScript, and JSX support out of the box. Vitest shares the same config, transformers, resolvers, and plugins with your Vite app.

**Key Features:**
- Vite-native: Uses Vite's transformation pipeline for fast HMR-like test updates
- Jest-compatible: Drop-in replacement for most Jest test suites
- Smart watch mode: Only reruns affected tests based on module graph
- Native ESM, TypeScript, JSX support without configuration
- Multi-threaded workers for parallel test execution
- Built-in coverage via V8 or Istanbul
- Snapshot testing, mocking, and spy utilities

> The skill is based on Vitest 5.0.1, generated at 2026-09-25.

## Core

| Topic | Description | Reference |
|-------|-------------|-----------|
| Configuration | Vitest and Vite config integration, defineConfig usage | [core-config](references/core-config.md) |
| CLI | Command line interface, commands and options | [core-cli](references/core-cli.md) |
| Test API | test/it function, modifiers like skip, only, concurrent | [core-test-api](references/core-test-api.md) |
| Describe API | describe/suite for grouping tests and nested suites | [core-describe](references/core-describe.md) |
| Expect API | Assertions with toBe, toEqual, matchers and asymmetric matchers | [core-expect](references/core-expect.md) |
| Hooks | beforeEach, afterEach, beforeAll, afterAll, aroundEach | [core-hooks](references/core-hooks.md) |

## Features

| Topic | Description | Reference |
|-------|-------------|-----------|
| Mocking | Mock functions, modules, timers, dates with vi utilities | [features-mocking](references/features-mocking.md) |
| Snapshots | Snapshot testing with toMatchSnapshot and inline snapshots | [features-snapshots](references/features-snapshots.md) |
| Coverage | Code coverage with V8 or Istanbul providers | [features-coverage](references/features-coverage.md) |
| Test Context | Test fixtures, context.expect, test.extend for custom fixtures | [features-context](references/features-context.md) |
| Concurrency | Concurrent tests, parallel execution, sharding | [features-concurrency](references/features-concurrency.md) |
| Filtering | Filter tests by name, file patterns, tags | [features-filtering](references/features-filtering.md) |
| Test Tags | Label tests with tags to filter runs and apply shared options | [features-test-tags](references/features-test-tags.md) |
| Reporters | Built-in reporters, default selection, CI/output config | [features-reporters](references/features-reporters.md) |
| Benchmarking | Write benchmarks with the bench fixture (Tinybench) | [features-benchmarking](references/features-benchmarking.md) |

## Advanced

| Topic | Description | Reference |
|-------|-------------|-----------|
| Vi Utilities | vi helper: mock, spyOn, fake timers, hoisted, waitFor | [advanced-vi](references/advanced-vi.md) |
| Environments | Test environments: node, jsdom, happy-dom, custom | [advanced-environments](references/advanced-environments.md) |
| Type Testing | Type-level testing with expectTypeOf and assertType | [advanced-type-testing](references/advanced-type-testing.md) |
| Projects | Multi-project workspaces, different configs per project | [advanced-projects](references/advanced-projects.md) |

## Repo & Code Graph Integration

In this repository (Bachelorprojekt), Vitest tests integrate with the K3 codebase memory graph:
- **Test Impact Analysis**: Use [`code-graph-interpretation`](../code-graph-interpretation/SKILL.md) (`trace_path --include-tests true` or `MATCH (t:File)-[:TESTS_FILE]->(f:File)`) to find affected Vitest specs before running test suites. See [test-impact-analysis](../code-graph-interpretation/references/test-impact-analysis.md).
- **Config locations**: Root [`vitest.config.ts`](../../../vitest.config.ts) (scripts, unit) and [`components/website/vitest.config.ts`](../../../components/website/vitest.config.ts) (website unit/component tests).

## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |

