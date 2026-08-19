---
title: "brain-knowledge-lifecycle — Implementation Plan"
ticket_id: T012913
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# brain-knowledge-lifecycle — Implementation Plan

_Ticket: T012913_

## File Structure

```
scripts/brain-page-metadata.py
scripts/brain-lifecycle-audit.py
scripts/brain-ingest.sh
templates/brain/SCHEMA.md
scripts/brain-index.py
scripts/brain-mcp-server.py
scripts/brain-expertise.py
scripts/brain/ingest-sources.yaml
docs/brain-expertise/approved/source-policy.md
scripts/brain-retrieval-eval.py
taskfiles/Taskfile.brain.yaml
tests/fixtures/brain/retrieval-eval.jsonl
tests/spec/brain-foundation/knowledge-lifecycle.bats
tests/spec/brain-k4-brain-wiki/brain-mcp-server.bats
tests/spec/brain-k4-brain-wiki/retrieval-eval.bats
components/website/src/data/test-inventory.json
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the BATS test that reproduces the
      bug. The test must FAIL on the current branch. Use the phrase
      `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
# Example: run the BATS test the author will add in their first task
# (eigene Datei unter tests/spec/<spec-slug>/<kurz-slug>.bats, T002416)
tests/unit/lib/bats-core/bin/bats tests/spec/brain-foundation/
# expected: FAIL (red — the fix is not yet implemented)
```

- [ ] **Fix-Step (GREEN).** Implement the fix. The BATS test from the
      previous step must now pass.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
