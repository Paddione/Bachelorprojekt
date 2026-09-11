## Context

The current repository is midway through an SSOT flip: prose and existing BATS guards assume `.opencode/skills` is canonical, while most working skill bodies remain in `.claude/skills` and `.agents/skills` resolves there. OpenCode can discover all three project locations; Codex discovers `.agents/skills`; agy consumes the `.agents` convention; Claude Code consumes `.claude/skills`. A direct second flip between the existing two trees would repeat the same drift failure and still leave Codex implicit.

## Decision

Use a portable core plus explicit harness projections:

```
docs/agent-guide/registry/skills.yaml
          │ ownership, exposure, projection and exception rationale
          ▼
.agents/skills/<skill>/                 portable canonical bodies (Codex + agy)
          ├───────────────────────────── OpenCode shared projection
          └───────────────────────────── Claude Code adapter projection
.opencode/skills/<skill>/               native-only skills or intentional overrides
.claude/skills/<skill>/                 Claude-only skills or intentional adapters
```

The registry is the inventory authority, not a second copy of skill prose. Each record names a stable skill id, source/provenance, supported harnesses (`codex`, `agy`, `opencode`, `claude_code`), exposure (`portable`, `native`, or `adapter`), projection path(s), and a required reason when an otherwise shared skill has a non-identical override. The projection tool derives the expected catalog and reports missing, unexpected, dangling, or body-drifted entries. It must support a check-only mode for CI and a deliberate write mode for maintainers; CI never silently rewrites a worktree.

Portable bodies describe capabilities and repository commands, not raw harness tool identifiers or framework-private paths. A thin adapter is allowed only where invocation syntax, capability name, or runtime tool identifier genuinely differs (for example the ticket MCP identifier). It links to the portable body and declares the mapping in the registry, so the exception is visible to review and test coverage.

## Alternatives considered

1. **Complete the `.opencode/skills` SSOT flip.** Rejected: it preserves an implicit Codex/agy path, relies on platform-sensitive symlinks, and makes a Claude/OpenCode pair the accidental architecture for four harnesses.
2. **Keep two independent full corpora with a broader allowlist.** Rejected: it formalises drift instead of detecting it and cannot distinguish an intentional adapter from an omission.
3. **One generated full copy per harness.** Rejected for the first increment: generated copies conceal source review and make native vendor skills difficult to preserve. The chosen design generates/validates projections while keeping human-owned portable bodies reviewable.

## Migration and compatibility

The migration starts from the observed corpus, classifies every tracked skill before moving any body, and keeps existing public skill ids stable. Native OpenCode skills such as `sdlc-autopilot` remain native; vendor content retains its provenance and exclusion rationale. The old overview SSOT claims and pairwise `opencode_only` allowlist are removed only after the registry checker proves the expected catalog for all four harnesses. A compatibility adapter is retained when a harness needs a different path or tool syntax; it is not represented as a duplicate canonical body.

## Verification strategy

- Start with a failing BATS fixture that adds an unregistered or incorrectly projected skill; the registry checker must name the harness and skill.
- Assert registry-to-filesystem catalog parity for Codex, agy, OpenCode, and Claude Code; assert portable-body hash parity where a projection is declared identical.
- Lint portable bodies for forbidden harness-private tool syntax and direct `.claude`/`.opencode` path coupling, while allowing declared adapters.
- Retain dead-path checks, but scope discovery from the registry instead of scanning a platform-sensitive symlink twice.
- Validate agent-guide schema/maps and run the affected BATS suites plus the repository freshness and changed-test gates.

## Risks

The largest risk is misclassifying a vendor or native skill as portable and overwriting its runtime-specific instruction. Classification is explicit, requires a rationale for every exception, and is reviewed before projection writes. The second risk is a wide mechanical move obscuring content changes; the plan separates registry/projection machinery, corpus migration, and guard/docs work into dependent, disjoint partials.
