# Partial p3 — Council contract tests and inventory

> **Role:** tests  
> **Depends on:** `p1-engine`, `p2-surface`  
> **Owned files only:** `tests/unit/council-decision.test.mjs`, `tests/unit/vda-council.bats`, `components/website/src/data/test-inventory.json`

This partial starts only after p1 and p2 are present. It tests their public contracts without
adding another runtime/model map: BATS uses the real
`docs/agent-guide/registry/agents.yaml` and puts a deterministic recording `opencode` shim first
on `PATH`. The shim must never contact a provider and must keep all fixtures in
`$BATS_TEST_TMPDIR`.

## File Structure

| Path | Change |
|---|---|
| `tests/unit/council-decision.test.mjs` | Add `node:test` coverage for strict ballot parsing and every deterministic decision state |
| `tests/unit/vda-council.bats` | Add offline VDA/CLI, registry-SSOT, read-only process, scheduling, failure, and stdout-contract coverage |
| `components/website/src/data/test-inventory.json` | Regenerate from the authoritative inventory task after both test files exist |

S1 notes: both test sources are new and must retain comfortable growth reserve below their
applicable limits (`.mjs`: 800; BATS is measured as shell: 500). Split reusable BATS setup into
small helper functions inside the owned BATS file if its projected size approaches 80% of 500.
The inventory is generated and is not hand-edited; its current 6026 lines are not a useful manual
line budget.

## Task List

### 1. Add the RED contract tests before relying on the implementation

- [ ] Create both test files first and run the focused suites against the p1/p2 implementation.
  The initial run must expose any missing contract rather than weakening assertions to match the
  implementation:

```bash
node --test tests/unit/council-decision.test.mjs
tests/unit/lib/bats-core/bin/bats tests/unit/vda-council.bats
# expected: FAIL (red — the complete Council parser, state, SSOT, process, and VDA contracts are not yet covered/fulfilled)
```

- [ ] Keep at least one positive anchor in each suite so a broken fixture or shim cannot make a
  purely negative run look meaningful: a valid `ACCEPT` ballot parses in the node suite, and
  `bash scripts/vda.sh council --help` succeeds in BATS while the no-call shim remains untouched.

### 2. Cover strict ballot parsing and deterministic decision outcomes

- [ ] In `tests/unit/council-decision.test.mjs`, import only the public pure exports delivered by
  p1 from `scripts/council/decision.mjs`; do not spawn the CLI or duplicate production decision
  logic in the test.
- [ ] Table-test one valid payload for each exact ballot value: `ACCEPT`,
  `ACCEPT_WITH_CONDITION`, and `OBJECT`. Assert that member identity, reasons/evidence,
  conditions, objections, and unresolved question text survive parsing without being silently
  discarded or relabelled.
- [ ] Assert fail-closed parse behavior for malformed JSON, prose/ACK wrapped around JSON,
  an unknown verdict, missing required evidence/reason fields, and structurally wrong
  conditions/objections. An absent or unparseable ballot must never become acceptance.
- [ ] Table-test the deterministic state reducer, including:
  - all surviving distinct identities accept -> `CONSENSUS`;
  - accepted candidate plus disclosed non-material/member failure while quorum survives ->
    `QUALIFIED_CONSENSUS`, with the qualification retained;
  - any `OBJECT`, or a member's still-open `ACCEPT_WITH_CONDITION` after the bounded revision
    limit -> `HUMAN_REQUIRED`, preserving the exact objection/condition and unresolved question;
  - fewer than two successful distinct resolved model identities (including two runtime aliases
    of one model) -> `INSUFFICIENT_EVIDENCE` before synthesis;
  - no viable successful members or unrecoverable protocol/parse failure -> `FAILED`.
- [ ] Exercise revision transitions explicitly: a condition remains owned by its originating
  member, can become resolved only through that member's later ballot, and cannot exceed two
  revisions. Assert an `OBJECT` is always material and majority support never converts it into
  consensus.

### 3. Build an offline recording process harness in BATS

- [ ] In `tests/unit/vda-council.bats`, use `setup` to create a temporary `bin/opencode` shim,
  call log, counter, and artifact root. Configure the shim per test to emit the JSON event/output
  shape expected by p1, fail with a chosen exit code, emit invalid output, or block until the
  configured timeout. Never add fixture files outside the owned BATS file.
- [ ] Make the shim record argv, start/end timestamps, PID, stdout, and stderr separately. Its
  canned sequence must support openings, cross-examination, chair synthesis, ballots, and a
  revision so tests verify orchestration rather than succeeding after one mocked response.
- [ ] Ensure teardown terminates any shim child still alive. Timeout coverage must assert the
  process group is gone, preventing a passing suite from leaking sleepers.

### 4. Prove registry SSOT validation and read-only resolved dispatch

- [ ] Invoke valid members that exist in
  `docs/agent-guide/registry/agents.yaml` and assert every recorded member/chair process uses the
  literal shape `opencode run --agent explore --model <registry-resolved-model> --format json`.
  Assert the assigned runtime ID is never used as `--agent`, including for a normally
  write-capable runtime.
- [ ] Assert an unknown runtime and a raw provider/model string passed as a member are rejected
  with a non-zero status, a diagnostic containing valid runtime IDs, no run of the shim, and no
  partially successful decision. This is the paid-call safety boundary.
- [ ] Assert no Council-owned model-map file is consulted or produced: the resolved model in the
  call log and run provenance must match the existing registry mirror, and changing mandates or
  chair assignment must not change model resolution.
- [ ] Assign two registered runtimes that resolve to the same model identity plus one independent
  runtime. Make the shim detect overlap for the duplicate identity and assert those calls are
  serialized, the run record reports the alias group, and distinct-evidence counting uses two
  identities rather than three. Add the two-alias-only case and assert
  `INSUFFICIENT_EVIDENCE` without synthesis.

### 5. Cover process failures, timeouts, artifacts, and JSON stdout hygiene

- [ ] Simulate one member exiting non-zero while two distinct models survive. Assert the run
  continues, the final status is not falsely unanimous, and the failed member, stage, exit
  status, and stderr are disclosed in the structured artifacts.
- [ ] Simulate a timeout and separately an unparseable model/ballot response. Assert neither is
  counted as acceptance; quorum loss produces `INSUFFICIENT_EVIDENCE` or `FAILED` as appropriate,
  while surviving quorum follows the documented qualified/human path. Assert timeout and failure
  details agree between summary and final decision.
- [ ] For a successful `--json` invocation, capture stdout and stderr separately. Validate stdout
  with `jq -e`, assert it contains exactly one final decision JSON document with the final status
  and unresolved objections, and assert progress/diagnostics appear only on stderr. Compare the
  stdout decision with the final JSON artifact's status and objections.
- [ ] Assert the temporary run tree contains input, resolved roster/provenance, per-round outputs,
  synthesis/revisions, ballots, failures, and final decision; do not assert unstable run IDs or
  timestamps beyond schema/type and cross-file consistency.

### 6. Prove the VDA surface is validation-only when requested

- [ ] Run top-level `bash scripts/vda.sh --help`, `bash scripts/vda.sh council --help`, and invalid
  argument/missing-question cases with an `opencode` shim that would fail and write a sentinel if
  executed. Assert help succeeds, invalid input fails clearly, the sentinel is absent, and no paid
  model process or Council run is started.
- [ ] Verify repeatable `--member`, optional `runtime=mandate`, `--chair`, `--question`,
  `--prompt-file`, bounded revision options, and `--json` route through `scripts/vda.sh` to the
  Council CLI without the shell wrapper rewriting arguments.

### 7. Turn the focused suites GREEN and regenerate the inventory

- [ ] Run the exact focused suites until all parser/state and CLI/process cases pass offline:

```bash
node --test tests/unit/council-decision.test.mjs
tests/unit/lib/bats-core/bin/bats tests/unit/vda-council.bats
```

- [ ] Regenerate, never manually edit, the test inventory and confirm both new suites appear:

```bash
task test:inventory
git diff -- components/website/src/data/test-inventory.json
```

### 8. Final verification

- [ ] Run the mandatory repository gates after p1, p2, and this partial are complete. Commit the
  regenerated inventory with the tests; do not add or grow `docs/code-quality/baseline.json`.

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

