---
title: "k4-surgery/p-tests — Partial Plan"
ticket_id: T900451
domains: [tests, scripts]
status: active
---

# k4-surgery/p-tests — Implementation Plan

_Ticket: T900451 · Change: k4-surgery (4/6) · Partial p-tests (tests role, disjoint — only files under `tests/`)._

Design anchors: R2 (keeper `brain-verify-refs.sh` stays runnable — its unit guard stays green), delta specs `brain-k4-brain-wiki` (REQ-k4-10 absence scenarios), `brain-foundation` (REQ-BRAIN-FOUNDATION-009 manifest absence), `sdlc-cockpit` (no brain wiring). Deletion inventory mirrors p1 (18 pipeline paths + skill dir, keepers) and p2 (brain-mcp + cockpit wiring edits). Measurement: `bash scripts/plan-intel-filter.sh k4-surgery <targets>` reported `intel.json not found` — grep fallback, every path below `ls`-verified with `wc -l`, every baseline via `jq` (`nicht-baselined` throughout), `s1.limits` in `gates.yaml` holds no `.bats` entry — `.bats` is S1-ungated (verified, not assumed), so no S1 number is claimed. No baseline entries are added. S2/S3/CQ02: no new code, no hostname literals, no typings — nothing to plan.

## File Structure

### New (1 file, 61 lines, cap 120)

| path | act | lines |
| `tests/spec/k4-surgery-guard.bats` | NEW | 61 (planned-absence verified) |

### Deleted (DEL — all `ls`-verified, instruction: `git rm`)

| path | act | lines |
| `tests/spec/brain-ingest.bats` | DEL | 514 |
| `tests/spec/brain-initial-ingest.bats` | DEL | 214 |
| `tests/spec/brain-ingest-task-defaults.bats` | DEL | 123 |
| `tests/spec/brain-ingest/delivery-rebase-before-push.bats` | DEL | 39 |
| `tests/spec/brain-k4-brain-wiki/coverage-gate.bats` | DEL | 108 |
| `tests/spec/brain-k4-brain-wiki/delivery-branch-staleness.bats` | DEL | 197 |
| `tests/spec/brain-k4-brain-wiki/mcp-registry.bats` | DEL | 152 |
| `tests/spec/brain-k4-brain-wiki/max-source-chars-guard.bats` | DEL | 148 |
| `tests/spec/brain-k4-brain-wiki/brain-mcp-server.bats` | DEL | 463 |
| `tests/spec/brain-k4-brain-wiki/node-parity.bats` | DEL | 181 |
| `tests/spec/sdlc-cockpit/brain-link-derivation.bats` | DEL | 68 |
| `tests/spec/local-llm-proxy/brain-ingest-swap.bats` | DEL | 254 |
| `tests/spec/brain-foundation/state-file-type-repair.bats` | DEL | 63 |
| `tests/spec/brain-foundation/from-scratch-rebuild.bats` | DEL | 118 |
| `tests/spec/brain-foundation/ingest-llm-endpoint.bats` | DEL | 279 |
| `tests/spec/brain-foundation/knowledge-lifecycle.bats` | DEL | 233 |
| `tests/spec/brain-merge-hook.bats` | DEL | 62 |
| `tests/unit/brain-ingest-moc.bats` | DEL | 61 |
| `tests/unit/brain-ingest-prune.bats` | DEL | 43 |
| `tests/unit/brain-ingest-restamp.bats` | DEL | 75 |
| `tests/unit/brain-lifecycle-audit.bats` | DEL | 26 |
| `tests/unit/brain-ingest-group.bats` | DEL | 30 |

### Edited (only the named hunks, rest byte-identical)

| path | act | ist | rest |
| `tests/spec/brain-foundation.bats` | EDIT | 284 | n/a (.bats ungated; shrinks to ~90) |
| `tests/spec/local-llm-proxy/brain-ingest-port.bats` | EDIT | 168 | n/a (.bats ungated; shrinks to ~82) |
| `tests/spec/local-dev-mesh/llm-services.bats` | EDIT | 123 | n/a (.bats ungated; 1-line hunk) |
| `tests/spec/health-goals/goal-integrity.bats` | EDIT | 128 | n/a (.bats ungated; shrinks to ~62) |
| `tests/spec/mcp-gateway/node-mcp-server-startup.bats` | EDIT | 108 | n/a (.bats ungated; shrinks to ~91) |
| `tests/spec/brain-quality-goals.bats` | EDIT | 150 | n/a (.bats ungated; shrinks to ~144) |
| `tests/spec/llm-local-dev/glimmer-serving-profile.bats` | EDIT | 63 | n/a (.bats ungated; 1-line hunk) |

### NOT touched (read-verified, explicit)

- `tests/spec/mcp-gateway.bats` (503) — `grep -i brain` returns 0 hits; no brain assertions exist.
- `tests/spec/ci-cd/workflow-self-trigger.bats` (80) — generic (every workflow lists its own file), 0 brain refs.
- `tests/spec/brain-k4-brain-wiki/retrieval-eval.bats` (137) — owned by 1/6, fixture-based, drives only the keeper `brain-retrieval-eval.py` (0 node-server refs, verified) — stays green, NOT touched. Its sibling `node-parity.bats` is DELETED in Task 2 instead: it drives the p2-retired `scripts/brain-mcp-node/server.mjs` + `index.mjs`, and the MCP requirements it guarded (REQ-k4-08/09, retrieval tools) are REMOVED by this change's delta — leaving it would turn main red after the merge.
- `scripts/brain-index.py` (shared index, pre-existing T012913) is an additional KEEPER (used by `brain-retrieval-eval.py`) — asserted present in block (f), never deleted.
- `tests/spec/brain-k4-brain-wiki/chunking.bats` (216) + `tests/spec/brain-k4-brain-wiki/parent-moc.bats` (129) — pure keeper coverage (`brain-chunk.sh` incl. `--moc`).

### Task 1: New absence guard (STRUCT2 red/green carrier)

**Files:** `tests/spec/k4-surgery-guard.bats` (NEW).

Failing-test step FIRST — run the guard BEFORE p1/p2 implementation:

```bash
bats tests/spec/k4-surgery-guard.bats  # expected: FAIL — exit 1, all absence blocks red (files still present)
```

Red mechanism: blocks (a)–(e) assert absence of files p1/p2 delete, so pre-implementation `bats` exits 1; post-implementation all 7 blocks pass and `bats` exits 0. The deletions in Task 2 are green-by-removal; the red/green proof rides on this guard. Spec mapping: block (a)+(b) cover REQ-k4-10 scenario 1 and REQ-BRAIN-FOUNDATION-009, block (c) covers REQ-k4-10 scenario 2, block (d) covers the cockpit scenario.

Exact file content (61 lines, house style per `max-source-chars-guard.bats`: header with SSOT + Ticket lines, `setup()` with `REPO_ROOT`):

```bats
#!/usr/bin/env bats
# tests/spec/k4-surgery-guard.bats
# SSOT: openspec/specs/brain-k4-brain-wiki.md (REQ-k4-10), openspec/specs/brain-foundation.md (REQ-BRAIN-FOUNDATION-009), openspec/specs/sdlc-cockpit.md
# Ticket: T900451
# k4-surgery absence guard: pipeline/MCP/cockpit gone (p1/p2), keepers present.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
}

@test "k4(a): pipeline scripts and ingest skill are absent" {
  local rest=0 f
  for f in scripts/brain-ingest.sh scripts/brain-ingest-worklist.sh scripts/brain-ingest-transform.sh scripts/brain-ingest-moc.sh scripts/brain-ingest-prune.sh scripts/brain-ingest-restamp.sh scripts/brain-ingest-swap.sh scripts/brain-ingest-reset.sh scripts/brain-ingest-coverage.sh scripts/brain-group-match.sh scripts/brain-source-provenance.sh scripts/brain-page-metadata.py scripts/brain-lifecycle-audit.py scripts/brain-expertise.py scripts/brain-bootstrap.sh scripts/brain-merge-hook.sh; do
    [ ! -e "$REPO_ROOT/$f" ] || { echo "DEL-REST: $f"; rest=1; }
  done
  [ ! -d "$REPO_ROOT/.agents/skills/brain-ingest" ] || { echo "DEL-REST: skill dir"; rest=1; }
  [ "$rest" -eq 0 ]
}

@test "k4(b): ingest manifest and merge-hook workflow are absent" {
  [ ! -e "$REPO_ROOT/scripts/brain/ingest-sources.yaml" ]
  [ ! -e "$REPO_ROOT/.github/workflows/brain-merge-hook.yml" ]
  [ "$(grep -rln 'ssot-specs' "$REPO_ROOT/scripts" "$REPO_ROOT/taskfiles" 2>/dev/null | wc -l)" -eq 0 ]
}

@test "k4(c): brain-mcp server and registry wiring are absent" {
  [ ! -e "$REPO_ROOT/scripts/brain-mcp-server.py" ]
  [ ! -d "$REPO_ROOT/scripts/brain-mcp-node" ]
  [ "$(grep -rn 'brain-mcp-node' "$REPO_ROOT/.mcp.json" "$REPO_ROOT/.opencode/opencode.jsonc" "$REPO_ROOT/docs/agent-guide/registry/mcp.yaml" "$REPO_ROOT/docs/agent-guide/registry/capabilities.yaml" "$REPO_ROOT/docs/agent-guide/maps/toolset-map.md" 2>/dev/null | wc -l)" -eq 0 ]
  [ "$(grep -rn 'brain_search\|brain_read' "$REPO_ROOT/docs/agent-guide/registry/capabilities.yaml" "$REPO_ROOT/docs/agent-guide/maps/toolset-map.md" 2>/dev/null | wc -l)" -eq 0 ]
}

@test "k4(d): cockpit brain wiring and brain manifests are absent" {
  [ ! -e "$REPO_ROOT/components/website/src/lib/sdlc/brain-links.ts" ]
  [ ! -e "$REPO_ROOT/components/website/src/pages/sdlc/api/cockpit/brain.ts" ]
  [ ! -e "$REPO_ROOT/k3d/brain.yaml" ]
  [ ! -e "$REPO_ROOT/k3d/oauth2-proxy-brain.yaml" ]
  [ "$(grep -n 'brain' "$REPO_ROOT/k3d/ingress.yaml" "$REPO_ROOT/k3d/kustomization.yaml" 2>/dev/null | wc -l)" -eq 0 ]
}

@test "k4(e): G-BRAIN12/13/14 are retired except two history lines" {
  [ "$(grep -c 'G-BRAIN1[234]' "$REPO_ROOT/scripts/health-goals-check.sh")" -eq 0 ]
  [ "$(grep -c 'G-BRAIN1[234]' "$REPO_ROOT/.claude/lib/goals.md")" -eq 2 ]
  grep -q 'Nummerierung ab `G-BRAIN12`' "$REPO_ROOT/.claude/lib/goals.md"
  grep -q 'G-BRAIN13 (`.github/`-Pfade' "$REPO_ROOT/.claude/lib/goals.md"
}

@test "k4(f): pipeline keepers are present" {
  [ -f "$REPO_ROOT/scripts/brain-chunk.sh" ]
  [ -f "$REPO_ROOT/scripts/brain-verify-refs.sh" ]
  [ -f "$REPO_ROOT/scripts/brain-verify-claims.sh" ]
  [ -f "$REPO_ROOT/scripts/brain-retrieval-eval.py" ]
  [ -f "$REPO_ROOT/scripts/brain-index.py" ]
}

@test "k4(g): G-BRAIN15 and the brain seed templates are present" {
  [ "$(grep -c 'G-BRAIN15' "$REPO_ROOT/scripts/health-goals-check.sh")" -ge 1 ]
  [ "$(grep -c 'G-BRAIN15' "$REPO_ROOT/.claude/lib/goals.md")" -ge 1 ]
  [ -d "$REPO_ROOT/templates/brain" ]
  [ -f "$REPO_ROOT/templates/brain/site.Dockerfile" ]
}
```

Block notes: (b) `ssot-specs` grep is safe — current hits live only in p1-deleted files, keepers are clean (verified). (d) plain `brain` grep on the two k3d files is safe — `brainstorm` wiring lives under `k3d/dev-stack/`, not in these files (verified). (e) asserts the 2 history lines by content anchor (pre-surgery lines 25/771), not by number — p1 row deletions shift line numbers.

A new test file requires the inventory step:

```bash
task test:inventory
git add tests/spec/k4-surgery-guard.bats components/website/src/data/test-inventory.json
```

Must show: inventory contains the new guard path.

### Task 2: Obsolete-guard deletions

**Files:** the 22 DEL paths from `## File Structure`.

Per-file read verdict (each file read; chunker mentions are fixture-copy loops or error-text on deleted scripts, never keeper coverage):

- `brain-ingest.bats` (26 tests): all manifest/orchestrator/transform/MOC/worklist — DELETE. `brain-chunk.sh` at line 296 is a fixture-copy loop for an ingest run.
- `brain-initial-ingest.bats` (12 tests): all worklist/manifest — DELETE.
- `brain-ingest-task-defaults.bats` (4 tests): all `ingest:run`/`ingest:pilot` tasks p1 deletes — DELETE.
- `brain-ingest/delivery-rebase-before-push.bats` (3 tests): all `brain-ingest.sh` push/upstream — DELETE.
- `coverage-gate.bats` (3 tests): all `brain-ingest-coverage.sh` — DELETE.
- `delivery-branch-staleness.bats` (4 tests): all ingest delivery runs — DELETE. `brain-chunk.sh` at line 60 is a fixture-copy loop.
- `mcp-registry.bats` (4 tests): 3 assert brain presence; the generic `task mcp:check reports no drift` stays covered by `mcp-gateway.bats` (`mcp-sync.sh check` tests) — DELETE.
- `max-source-chars-guard.bats` (2 tests): both execute deleted `brain-ingest-transform.sh` — DELETE. The `brain-chunk.sh` mention asserts transform error text, not the chunker.
- `brain-mcp-server.bats` (9 tests): all `brain_search`/`brain_read` on the retired server — DELETE.
- `node-parity.bats` (1/6-owned, merged): drives p2-deleted `scripts/brain-mcp-node/server.mjs` + `index.mjs` (setup lines 8–9, JSON-RPC run line 152) — DELETE with justification (its guarded REQs are REMOVED by this change's delta; the sibling `retrieval-eval.bats` keeps eval coverage via the keeper runner).
- `sdlc-cockpit/brain-link-derivation.bats` (2 tests): both import deleted `brain-links.ts` — DELETE.
- `local-llm-proxy/brain-ingest-swap.bats` (9 tests): all execute deleted `brain-ingest-swap.sh` — DELETE.
- `brain-foundation/state-file-type-repair.bats` (6/6 tests source deleted `brain-ingest-reset.sh`) — DELETE, nothing to keep.
- `brain-foundation/from-scratch-rebuild.bats` (8/8 via deleted `brain-ingest.sh`/`reset.sh`; the chunker call builds a reset fixture) — DELETE, nothing to keep.
- `brain-foundation/ingest-llm-endpoint.bats` (10/10 execute deleted transform) — DELETE, nothing to keep.
- `brain-foundation/knowledge-lifecycle.bats` (5/5 via deleted `.py` trio + worklist + `brain-mcp-server.py`) — DELETE, nothing to keep.
- `brain-merge-hook.bats` (7/7 on deleted hook script + workflow; grep-found) — DELETE.
- `tests/unit/brain-ingest-moc.bats`, `brain-ingest-prune.bats`, `brain-ingest-restamp.bats`, `brain-lifecycle-audit.bats`, `brain-ingest-group.bats` (grep-found; every test executes a p1-deleted script) — DELETE.

```bash
git rm tests/spec/brain-ingest.bats tests/spec/brain-initial-ingest.bats \
  tests/spec/brain-ingest-task-defaults.bats tests/spec/brain-ingest/delivery-rebase-before-push.bats \
  tests/spec/brain-k4-brain-wiki/coverage-gate.bats tests/spec/brain-k4-brain-wiki/delivery-branch-staleness.bats \
  tests/spec/brain-k4-brain-wiki/mcp-registry.bats tests/spec/brain-k4-brain-wiki/max-source-chars-guard.bats \
  tests/spec/brain-k4-brain-wiki/brain-mcp-server.bats tests/spec/brain-k4-brain-wiki/node-parity.bats \
  tests/spec/sdlc-cockpit/brain-link-derivation.bats \
  tests/spec/local-llm-proxy/brain-ingest-swap.bats tests/spec/brain-foundation/state-file-type-repair.bats \
  tests/spec/brain-foundation/from-scratch-rebuild.bats tests/spec/brain-foundation/ingest-llm-endpoint.bats \
  tests/spec/brain-foundation/knowledge-lifecycle.bats tests/spec/brain-merge-hook.bats \
  tests/unit/brain-ingest-moc.bats tests/unit/brain-ingest-prune.bats \
  tests/unit/brain-ingest-restamp.bats tests/unit/brain-lifecycle-audit.bats \
  tests/unit/brain-ingest-group.bats
for f in $(git diff --cached --name-only --diff-filter=D); do test ! -e "$f" || { echo "DEL-REST: $f"; exit 1; }; done
task test:inventory
git add components/website/src/data/test-inventory.json
```

Must show: 22 paths staged deleted, none exists on disk, inventory no longer lists them.

### Task 3: Guard shrinks

**Files:** the 7 EDIT paths from `## File Structure`.

1. `tests/spec/brain-foundation.bats` — remove `BOOTSTRAP=` (setup line 6), the 3 bootstrap tests (lines 13–38), `seeded example pages` (71–75), `ci.yml wires both linters` (77–85), `bootstrap reads collaborator` (87–89), `bootstrap seed contains site.Dockerfile` (115–119), the SKILL.md section comment + test (151–159), the prune section comment + `make_prune_fixture` + 4 prune tests (161–217), `start_mock_llm`/`stop_mock_llm` + 3 transform tests (219–284). Kept (all read-verified against keeper `templates/brain/` and surviving `build-graph-docs.mjs`): `lint-frontmatter flags a missing mandatory field`, `lint-frontmatter passes a well-formed page`, `lint-wikilinks flags a dead link`, `lint-wikilinks passes when every link resolves`, `site.Dockerfile pins quartz v4.5.2 via tagged clone`, `site.Dockerfile runtime stage uses the official static-web-server image`, `site.Dockerfile has no npm ci against a nonexistent package.json`, `build-site.yml workflow template exists and pushes brain-site:latest`, `build-graph-docs.mjs emits docs/diagrams/architecture.md with mermaid fences, not HTML`, `docs/diagrams/architecture.md is byte-identical across two consecutive generator runs (no embedded timestamp)`.
2. `tests/spec/local-llm-proxy/brain-ingest-port.bats` — EDIT, not wholesale delete: tests 1–2 guard a generic loadout-vs-forward invariant with no other coverage (verified: `forward_ports` is unique to this file). Remove `INGEST_SH`/`MIGRATION`/`SLUG`/`BACKEND` setup vars, tests 3–5 (lines 83–132, 146–168) and the T013593 comment (134–145); reword the file header to the surviving generic invariant (T003203 ref stays). Kept: `T003203: Extraktion liefert ueberhaupt Ports (Anker fuer beide Invarianten)`, `T003203: kein Loadout-Port ist zugleich lokale Seite eines Port-Forwards`.
3. `tests/spec/local-dev-mesh/llm-services.bats` — line 109 only: drop `brain-mcp|` from the refused pattern, keep `codebase-memory` (K3, never touched). Kept test: `Requirement 'Only the three services start in the component': Supervisor startet genau llm-proxy, postgres, bge-mcp`.
4. `tests/spec/health-goals/goal-integrity.bats` — remove `WORKLIST=` (setup line 11), the `G-BRAIN14` line inside the anchor test (line 19, file asserts stay), the section comment (line 28) and the 6 worklist/`--pending`/G-BRAIN14 tests (lines 22–26, 30–33, 35–39, 41–69, 71–74, 122–128). The removed `--pending` test calls `brain-chunk.sh` only as fixture setup — chunker coverage lives in `chunking.bats`/`parent-moc.bats`. Kept: `Anker: die Ziel-Definitionen und das Messskript existieren` (shrunk), `G-DORA01 vergleicht gegen eine zum Messfenster passende Schwelle`, `G-SIZE03 misst kein God-File mehr, das keines ist`, `G-SPEC03 erlaubt keine 41 Regressionen mehr`, `G-CQ02 erlaubt keine 280 any-Verwendungen mehr`, `G-CQ09 erlaubt keine 10 hartkodierten Hostnames mehr`, `G-RH01 erlaubt keine 30 Gate-Violations mehr`.
5. `tests/spec/mcp-gateway/node-mcp-server-startup.bats` — remove the `brain-mcp-node` section comment (76) + test `brain-mcp-node ueberlebt mehr als ein JSON-RPC-Frame` (78–91). This is the startup file the brief pointed at; `mcp-gateway.bats` itself holds 0 brain refs. Kept: all 6 `ticket-mcp-node` tests.
6. `tests/spec/brain-quality-goals.bats` — remove `BOOTSTRAP=` (setup line 6) + test `self-conformity: full seed passes both repaired linters` (146–150). Kept: all 13 template-linter tests (G-BRAIN01–06 + seed/template asserts via keeper `templates/brain/`).
7. `tests/spec/llm-local-dev/glimmer-serving-profile.bats` — remove `scripts/brain-ingest-transform.sh` from the caller loop (line 50), keep the 4 surviving callers and both anchors. Kept: all 3 `T900365` tests.

Asserts after all shrinks:

```bash
bats tests/spec/brain-foundation.bats tests/spec/brain-quality-goals.bats \
  tests/spec/mcp-gateway/node-mcp-server-startup.bats tests/spec/health-goals/goal-integrity.bats \
  tests/spec/local-llm-proxy/brain-ingest-port.bats tests/spec/local-dev-mesh/llm-services.bats \
  tests/spec/llm-local-dev/glimmer-serving-profile.bats
grep -rn 'brain-ingest-transform\|brain-ingest-worklist\|brain-ingest-moc\|brain-ingest-prune\|brain-ingest-reset\|brain-ingest-coverage\|brain-ingest-swap\|brain-bootstrap\|brain-merge-hook\|brain-mcp-node\|brain-links\|ingest-sources\.yaml' tests/spec/brain-foundation.bats tests/spec/brain-quality-goals.bats tests/spec/mcp-gateway/node-mcp-server-startup.bats tests/spec/health-goals/goal-integrity.bats tests/spec/local-llm-proxy/brain-ingest-port.bats tests/spec/local-dev-mesh/llm-services.bats tests/spec/llm-local-dev/glimmer-serving-profile.bats && exit 1 || echo "OK: shrunk guards reference no deleted script"
```

Must show: `bats` exit 0 on all 7 files, second grep 0 hits.

### Task 4: Verification — gates + red-to-green proof

**Files:** none (verify task).

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Must show: all three green. Then the red-to-green proof for the new guard (run in an executor that applies p1/p2 after this partial — order: guard-first red, implement, guard green):

```bash
bats tests/spec/k4-surgery-guard.bats; echo "pre-p1/p2 exit: $? (wanted 1)"
# ... p1 + p2 implementation runs here ...
bats tests/spec/k4-surgery-guard.bats; echo "post-p1/p2 exit: $? (wanted 0)"
grep -rln 'brain-ingest-worklist\|brain-ingest-transform\|brain-mcp-node\|brain-links\|brain_search' tests/ | grep -v k4-surgery-guard && exit 1 || echo "OK: no stray deleted-script refs in tests/"
```

Must show: guard exit 1 before p1/p2, exit 0 after; the stray sweep lists nothing (node-parity is deleted in Task 2, its absence is covered by the inventory regen).
