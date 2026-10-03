# Partial p2: HANDLED_BY Mapping (gate G1)

Depends on the p1 freeze snapshot. Maps every frozen slice to the handler that
serves it and records the evidence in the handled-by map.

## Task 1: Extract HANDLED_BY edges

**Files:** `docs/brain/handled-by-map.json`

- Derive `slice`, `layer`, and `public_api` props from the `-db.ts` and
  `questionnaire-db/index.ts` barrels plus the `export *` barrels.
- Read the Route-HANDLED_BY edge from the router code, keeping chains at most
  2 hops, and write the full map to `handled-by-map.json`.

```bash
ls components/website/src/**/questionnaire-db/index.ts components/website/src/**/*-db.ts 2>/dev/null | head -20
python3 -c "import json; print(len(json.load(open('docs/brain/handled-by-map.json'))))"
```

## Task 2: Precision sample

**Files:** `docs/brain/route-handledby-sample.md`

- Draw a 50-sample, check precision at or above 95 percent, unhandled below
  15 percent, and record the sample with verdicts in `route-handledby-sample.md`.

```bash
python3 -c "import json; d=json.load(open('docs/brain/handled-by-map.json')); print('unhandled:', sum(1 for r in d if not r.get('handled_by')))"
bash scripts/plan-lint.sh .agents/plans/p0min-freeze-embed/tasks.md
```

## Verify

```bash
python3 -c "import json; d=json.load(open('docs/brain/handled-by-map.json')); assert all(r.get('handled_by') for r in d), 'unhandled rows remain'"
bash scripts/plan-lint.sh .agents/plans/p0min-freeze-embed/tasks.md
```
