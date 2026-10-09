# p3 — Inventory guards (tests)

Files: `tests/py/spec/design_assets/test_inventory.py` (new pytest spec;
red before p1/p2 land, green after).

## Task 1: RED — write the failing guard spec

Create `tests/py/spec/design_assets/test_inventory.py` following the repo
pytest-spec conventions. The spec asserts:

1. `docs/design-assets/manifest.json` exists and parses; every entry carries
   a stable ID, a 64-hex SHA-256, a non-negative size and a format string.
2. Reproducibility: running `scripts/design-assets-inventory.sh --out` to a
   temp path yields bytes identical to the committed manifest (compare
   SHA-256 via subprocess, no network, no DB).
3. Hygiene: no manifest ID contains an absolute WSL path (`/home/`) and no
   ID matches secret-adjacent name patterns.
4. Coverage: the consumer map names the known couplings (token CSS
   extraction, SVG snapshots, the three sync mappings) and the catalog
   marks every scope root as source or derived.

Run the spec now, before p1 and p2 are implemented:

```bash
bash scripts/pytest-run.sh tests/py/spec/design_assets/test_inventory.py
```

Result at this stage — expected: FAIL (manifest and maps do not exist
yet, so assertions 1–4 fail at the first missing file). A bare `pytest`
run of the same module fails identically. If the run passes instead, the
spec is vacuous and must be fixed before proceeding.

## Task 2: GREEN — verify guards pass after implementation

After p1 and p2 have landed on this branch, re-run the spec:

```bash
bash scripts/pytest-run.sh tests/py/spec/design_assets/test_inventory.py
```

All assertions must pass. Then refresh the test inventory with
`task test:inventory` so CI sees the new spec, and commit the spec as
`docs(T901038): add pytest guards for design-asset inventory` (plus the
regenerated inventory file if the command updated it), then push.

Acceptance for p3: RED observed first with the pytest runner failing on
the missing manifest, then GREEN on the implemented tree with no test
skipped.
