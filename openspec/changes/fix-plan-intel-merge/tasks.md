# Tasks: plan-intel.sh --out Merge-Fix

| id | file | role | target_files | depends_on |
|----|------|------|-------------|------------|
| 1 | scripts/plan-intel.sh | fix | scripts/plan-intel.sh | — |
| 2 | tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats | test | tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats | 1 |

## Partials

### 1 — Zeile 46: EXISTING_INTEL aus --out lesen

**target_files:** `scripts/plan-intel.sh`

Zeile 46 ersetzen: `EXISTING_INTEL="$CHANGE_DIR/intel.json"` → wenn `--out` vom Default abweicht, `$OUT_PATH` verwenden; sonst Fallback `$CHANGE_DIR/intel.json`.

### 2 — Zeile 183: .ticket aus --out lesen + BATS-Test

**target_files:** `scripts/plan-intel.sh`, `tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats`

- Zeile 183: `.ticket` aus `$(dirname "$OUT_PATH")/.ticket` lesen wenn `--out` gesetzt, Fallback `$CHANGE_DIR/.ticket`
- BATS: `--out`-Merge-Test (intel.json-Übernahme), `--out`-Ticket-Test (.ticket-Lesung)
