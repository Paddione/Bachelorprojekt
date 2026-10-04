# Partial p1: Corpus Freeze (gate G0)

Derives route truth from Astro file-routing under `components/website/src/pages/api/`
(one file equals one route, verb from exported `GET`/`POST`), slices each route from
its `pages/api/<domain>` segment plus `components/*` usage, and freezes the corpus.

## Task 1: Enumerate routes and slice taxonomy

**Files:** `docs/brain/slice-taxonomy.md`

- Walk `components/website/src/pages/api/**/*.ts`, record one row per file with verb
  taken from the exported handler name, and assign each row a slice from its
  `pages/api/<domain>` prefix plus the `components/*` it renders.
- Write the taxonomy table to `slice-taxonomy.md`.

```bash
ls components/website/src/pages/api/**/*.ts | head -20
grep -rn "export async function GET\|export async function POST" components/website/src/pages/api/ | head -20
```

## Task 2: Freeze corpus snapshot

**Files:** `docs/brain/corpus-freeze.json`

- Assign every route the ID `repo@commit:path:symbol`, freeze the corpus field set,
  and write the snapshot to `corpus-freeze.json`.
- Denylist generated artefacts (`docs/code-quality/repo-index.json`,
  `components/website/src/data/openspec-status.json`) so they never enter the corpus.

```bash
git rev-parse HEAD
git check-ignore docs/code-quality/repo-index.json components/website/src/data/openspec-status.json
python3 -c "import json; print(json.load(open('docs/brain/corpus-freeze.json'))['route_count'])"
```

## Verify

```bash
python3 -c "import json; d=json.load(open('docs/brain/corpus-freeze.json')); assert d['route_count']==462, d"
bash scripts/plan-lint.sh .agents/plans/p0min-freeze-embed/tasks.md
```
