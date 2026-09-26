---
title: "autodocs-removal p2-manifests-tasks-docs — Implementation Plan"
ticket_id: T900452
domains: [docs, cleanup]
status: active
---

# autodocs-removal p2-manifests-tasks-docs — Implementation Plan

_Ticket: T900452. Scope: serving-path manifests, env + seed cleanup,
Taskfile surgery, docs sweep (design E2–E5, R1–R2). Disjoint from p1
(generator, scripts, workflows, hooks, package.json, commitlint,
gitignore — p1 owns ALL of those; this partial touches no script, no
hook, no ignore) and p-tests (tests/ plus STRUCT2)._

Measurement: `bash scripts/plan-intel-filter.sh autodocs-removal …`
reports `intel.json not found`, so every reference below was verified by
direct grep fallback. S1 per file: live `wc -l`; every `jq` baseline
lookup returned nicht-baselined; `gates.yaml` s1.limits covers code
extensions only (no yaml/yml/md); `residual_budget` returns empty
(ungated) for all edited files except the single numeric claim in the
table. The executor relocates every hunk by its anchor grep. Quoted
brand URLs below are deleted lines, never added (S3: authored snippets
carry no brand literals). No baseline additions.

## File Structure

| File | Change | S1 |
|------|--------|----|
| `k3d/kustomization.yaml` | edit: drop 2 refs (L26, L75-76), net -3 (Ist 143 after) | Ist 146, S1 n/a (.yaml ungated) |
| `k3d/ingress.yaml` | edit: drop docs rule L98-107, net -10 (Ist 187 after) | Ist 197, S1 n/a (.yaml ungated) |
| `k3d/configmap-domains.yaml` | edit: drop 2 keys (L15, L26), net -2 (Ist 48 after) | Ist 50, S1 n/a (.yaml ungated) |
| `environments/mentolder.yaml` | edit: drop DOCS_URL L42 + DOCS_IMAGE L23, net -2 | Ist 136, S1 n/a (.yaml ungated) |
| `environments/korczewski.yaml` | edit: drop DOCS_URL L43 + DOCS_IMAGE L23, net -2 | Ist 111, S1 n/a (.yaml ungated) |
| `environments/fleet-mentolder.yaml` | edit: drop DOCS_URL L51 + DOCS_IMAGE L31, net -2 | Ist 124, S1 n/a (.yaml ungated) |
| `environments/fleet-korczewski.yaml` | edit: drop DOCS_URL L51 + DOCS_IMAGE L31, net -2 | Ist 122, S1 n/a (.yaml ungated) |
| `environments/staging.yaml` | edit: drop DOCS_URL L52 + DOCS_IMAGE L32, net -2 (Ist 104 after) | Ist 106, S1 n/a (.yaml ungated) |
| `environments/dev.yaml` | edit: drop DOCS_IMAGE L19, net -1 (Ist 64 after) | Ist 65, S1 n/a (.yaml ungated) |
| `environments/schema.yaml` | edit: drop DOCS_IMAGE + DOCS_URL entries, net -8 (Ist 1718 after) | Ist 1726, S1 n/a (.yaml ungated) |
| `k3d/website.yaml` | edit: drop DOCS_URL injection L25, net -1 (Ist 852 after) | Ist 853, S1 n/a (.yaml ungated) |
| `docs/systemtest-fragebogen.md` | edit: drop FA-13 section, net -24 (Ist 1391 after) | Ist 1415, S1 n/a (.md ungated) |
| `k3d/vaultwarden-seed-job.yaml` | edit: drop alias+login+env (L70, L80, L118-123), net -8 (Ist 123 after) | Ist 131, S1 n/a (.yaml ungated) |
| `Taskfile.yml` | 4 task deletes + 3 task edits + envsubst token removal, net -57 (Ist 5446 after) | Ist 5503, S1 n/a (.yml ungated) |
| `scripts/datamodel/workflow-map.yaml` | edit: header L5-7 becomes 2-line .md contract, net -1 (Ist 335 after) | Ist 336, S1 n/a (.yaml ungated) |
| `docs/agent-guide/registry/tools.yaml` | edit: drop 2 links blocks (L142-143, L222-223), net -4 (Ist 236 after) | Ist 240, S1 n/a (.yaml ungated) |
| `docs/agent-guide/20-werkzeuge.md` | REGENERATE via keeper task agent-guide:docs (never hand-edit) | Ist 331, S1 n/a (.md ungated; regen-owned) |
| `docs/bereitstellungsdetails.md` | edit: drop section 4.12 L197-203, net -7 (Ist 285 after) | Ist 292, S1 n/a (.md ungated) |
| `CLAUDE.md` | edit: drop L128 + L147 list entry, net -1 (Ist 192 after) | Ist 193, S1 n/a (.md ungated) |
| `.github/workflows/build-website.yml` | edit: drop DOCS_URL L169 + L331, net -2 (Ist 451 after) | Ist 453, S1 n/a (.yml ungated) |
| `components/website/src/env.d.ts` | edit: drop DOCS_URL decl L34, net -1 (Ist 84 after) | Budget 815, Ist 85, Limit 900 (.ts) |
| `k3d/docs.yaml` | delete via git rm (66 lines, ls-verified) | S1 n/a (removed) |
| `k3d/oauth2-proxy-docs.yaml` | delete via git rm (142 lines, ls-verified) | S1 n/a (removed) |
| `k3d/docs-content-built/` | delete dir via git rm -r (244 tracked files, du 16M) | S1 n/a (removed) |
| `docs/brain/k4-brain-wiki.md` | delete via git rm (112 lines, ls-verified) | S1 n/a (removed) |
| `docs/DOCS-DESIGN-STANDARDS.md` | delete via git rm (26 lines, ls-verified) | S1 n/a (removed) |

S4: no manifest or script is added; each deletion removes its own
references (kustomization/ingress/configmap edits drop exactly the refs
to the deleted manifests), so S4 stays green in both directions.

## Task 1: Remove the serving path

Delete the deployment, proxy and built tree, then drop their refs.
Verified before deletion: both manifests exist per `ls`;
`git ls-files k3d/docs-content-built/ | wc -l` returns 244 and
`du -sh` reports 16M.

Steps:

```bash
git rm k3d/docs.yaml k3d/oauth2-proxy-docs.yaml
git rm -r k3d/docs-content-built
```

`k3d/kustomization.yaml` (net -3): delete L26 (anchor
`grep -n 'oauth2-proxy-docs' k3d/kustomization.yaml`):

```yaml
  - oauth2-proxy-docs.yaml
```

and L75-76, the label plus its sole entry (anchor
`grep -n 'docs.yaml' k3d/kustomization.yaml`):

```yaml
  # Dokumentation
  - docs.yaml
```

L25 `# Buchhaltung` stays (not docs-labeled). Rebase note: 4/6
(k4-surgery p2) removes the brain block L116-118 in this same file —
disjoint blocks; implement this partial after 4/6 merges, or relocate
by anchor grep.

`k3d/ingress.yaml` (net -10): delete the docs rule L98-107 — exact span
verified by reading (ten lines, ending at the `number: 4180` line).
Anchor `grep -n 'docs.localhost' k3d/ingress.yaml`:

```yaml
    - host: docs.localhost
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: oauth2-proxy-docs
                port:
                  number: 4180
```

Rebase note: the brain rule L108-117 belongs to 4/6 — disjoint,
directly below; same order rule as above. The L89 section header keeps
its wording (multi-service header, not a named hunk).

`k3d/configmap-domains.yaml` (net -2): delete L15 (anchor
`grep -n 'DOCS_DOMAIN'`) and L26 (anchor `grep -n 'DOCS_IMAGE'`):

```yaml
  DOCS_DOMAIN: "docs.localhost"
```

```yaml
  DOCS_IMAGE: "workspace-docs"
```

Verify:

```bash
test ! -e k3d/docs.yaml && test ! -e k3d/oauth2-proxy-docs.yaml && test ! -e k3d/docs-content-built
test -z "$(grep -n 'docs\.yaml\|oauth2-proxy-docs\|docs\.localhost\|DOCS_DOMAIN\|DOCS_IMAGE' k3d/kustomization.yaml k3d/ingress.yaml k3d/configmap-domains.yaml || true)"
yq eval '.' k3d/kustomization.yaml > /dev/null && yq eval '.' k3d/ingress.yaml > /dev/null && yq eval '.' k3d/configmap-domains.yaml > /dev/null
task workspace:validate
```

`task workspace:validate` must be green (kustomize dry-run over the
edited manifests).

## Task 2: Environment and seed cleanup

Drop the `DOCS_URL` + `DOCS_IMAGE` lines in each of the 6 environment
files, the 2 schema entries, plus the Vaultwarden seed entries (design
E4). Everything else stays byte-identical.

Encryption verdicts (all direct-edit, no secrets flow): each file shows
a plaintext header via `od`, `git check-attr` reports `text: set` with
no filter, and `.gitattributes` scopes git-crypt to
`environments/.secrets/**` only. Verdict per file: mentolder.yaml
plain, korczewski.yaml plain, fleet-mentolder.yaml plain,
fleet-korczewski.yaml plain, staging.yaml plain, dev.yaml plain.

Delete per file (anchor `grep -n 'DOCS_URL\|DOCS_IMAGE'` in each):

```yaml
  DOCS_URL: "https://docs.mentolder.de"
```

(mentolder.yaml L42; identical shape in fleet-mentolder.yaml L51)

```yaml
  DOCS_URL: "https://docs.korczewski.de"
```

(korczewski.yaml L43; identical shape in fleet-korczewski.yaml L51)

```yaml
  DOCS_URL: "https://docs.staging.korczewski.de"
```

(staging.yaml L52 only; dev.yaml carries no DOCS_URL)

```yaml
  DOCS_IMAGE: mentolder-docs
```

(mentolder.yaml L23; identical shape in fleet-mentolder.yaml L31)

```yaml
  DOCS_IMAGE: korczewski-docs
```

(korczewski.yaml L23; fleet-korczewski.yaml L31; staging.yaml L32;
dev.yaml L19)

`environments/schema.yaml`: delete the `DOCS_IMAGE` entry L138-140
(`required: true` — keeping it would fail validation once the keys are
gone) and the `DOCS_URL` entry L269-271 (anchor
`grep -n 'name: DOCS_' environments/schema.yaml` → exactly 2 hits):

```yaml
  - name: DOCS_IMAGE
    required: true
    default_dev: "workspace-website"
```

```yaml
  - name: DOCS_URL
    required: false
    default_dev: "http://docs.localhost"
```

`k3d/vaultwarden-seed-job.yaml` (net -8): delete the alias L70
(anchor `grep -n 'DOCS='`), the login L80 (anchor
`grep -n 'upsert_login "Docs"'`), and the env block L118-123 — six
lines verified by reading (ends at `optional: true`):

```sh
              DOCS="${DOCS_DOMAIN:-docs.localhost}"
```

```sh
              upsert_login "Docs"                           "https://${DOCS}"             "Dokumentation"
```

```yaml
            - name: DOCS_DOMAIN
              valueFrom:
                configMapKeyRef:
                  name: domain-config
                  key: DOCS_DOMAIN
                  optional: true
```

The L65 alias-list comment keeps its wording (not a named hunk).

Verify:

```bash
for f in environments/mentolder.yaml environments/korczewski.yaml environments/fleet-mentolder.yaml environments/fleet-korczewski.yaml environments/staging.yaml environments/dev.yaml environments/schema.yaml k3d/vaultwarden-seed-job.yaml; do yq eval '.' "$f" > /dev/null; done
test -z "$(grep -n 'DOCS_URL\|DOCS_IMAGE' environments/mentolder.yaml environments/korczewski.yaml environments/fleet-mentolder.yaml environments/fleet-korczewski.yaml environments/staging.yaml environments/dev.yaml || true)"
test -z "$(grep -n 'name: DOCS_' environments/schema.yaml || true)"
test -z "$(grep -n 'DOCS_DOMAIN' k3d/vaultwarden-seed-job.yaml k3d/configmap-domains.yaml || true)"
```

Known-remaining (consciously standing, excluded from asserts):
`POCKET_ID_DOCS_SECRET` seed/secret plumbing (identity infra, out of
scope — deleting the consumer is safe, the unused secret entry is
harmless); the `prod/` overlay check came back empty (no docs refs
there — earlier suspicion refuted).

## Task 3: Taskfile surgery

Delete 4 tasks, shrink 3 (design E2 keeps the markdown generation),
reword the workflow-map header. Keepers in this file: `graph:build-docs`
(L1227/1294, repo markdown despite the name), all freshness tasks,
`agent-guide:docs`.

Delete `test:docs-gen` L701-708 (anchor
`grep -n '^  test:docs-gen:' Taskfile.yml`):

```yaml
  test:docs-gen:
    desc: "Run the docs-site generator unit tests + full-build smoke test (node:test)"
    cmds:
      # Fresh worktrees (scripts/worktree-create.sh) ship no root node_modules;
      # install lazily before any node script. No-op in CI / installed trees. [T000427]
      - '[ -d node_modules ] || npm ci'
      - node --test scripts/docs-gen/*.test.mjs

```

Delete `docs:build` L3740-3744 and `docs:build:import` L3745-3753
(anchor `grep -n '^  docs:build' Taskfile.yml`):

```yaml
  docs:build:
    desc: Generate the full static docs site into k3d/docs-content-built/ (pages, assets, search.json)
    cmds:
      - node scripts/build-docs.mjs

  docs:build:import:
    desc: Build the docs image locally
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - node scripts/build-docs.mjs
      - docker build -t ghcr.io/paddione/workspace-docs:latest -f scripts/docs.Dockerfile .
      - echo "✓ docs image built locally"

```

Delete `docs:deploy` L3940-3963 (anchor
`grep -n '^  docs:deploy:' Taskfile.yml`); quoted exactly, deleted:

```yaml
  docs:deploy:
    desc: Build, push and deploy docs image to both production environments (korczewski + mentolder)
    cmds:
      - |
        # Build and push once — both clusters use the same image content
        node scripts/build-docs.mjs
        SHARED_IMAGE="ghcr.io/paddione/workspace-docs"
        docker build -t "${SHARED_IMAGE}:latest" -f scripts/docs.Dockerfile .
        docker push "${SHARED_IMAGE}:latest"

        # Roll out to each cluster
        for env in korczewski mentolder; do
          source scripts/env-resolve.sh "$env"
          NS="${WORKSPACE_NAMESPACE:-workspace}"
          echo "-> Rolling out docs on ${env} (ns=${NS})..."
          kubectl apply -f k3d/docs.yaml --context "${ENV_CONTEXT}" --server-side --force-conflicts
          kubectl --context "${ENV_CONTEXT}" rollout restart deployment/docs -n "${NS}"
          kubectl --context "${ENV_CONTEXT}" rollout status deployment/docs -n "${NS}" --timeout=120s
        done
        echo
        echo "✓ Docs deployed to both clusters via Docker image"
        echo "  https://docs.korczewski.de"
        echo "  https://docs.mentolder.de"

```

Edit `feature:promote` desc L128 (anchor
`grep -n 'SERVICE=website' Taskfile.yml`): drop `|docs` from the
SERVICE enum, keep the TARGET enum (existing content, unchanged):

```yaml
    desc: "Promote a service dev → prod with Playwright smoke gate (SERVICE=website|brett TARGET=mentolder|korczewski|both; prompts if unset)"
```

Edit `datamodel:build` (L2634-2652; anchor
`grep -n '^  datamodel:build:' Taskfile.yml`): reword the desc to
`Regenerate /tmp/datamodel-workflow.md from shared-db +
workflow-map.yaml`, keep the env-resolve + `build_datamodel.py`
generation, delete L2646-2652 (rebuild, IC-6 comment, mkdir, copy,
deploy hint):

```yaml
        node scripts/build-docs.mjs --rebuild-page datamodel-workflow /tmp/datamodel-workflow.md
        # IC-6: land the generated HTML in the committed source dir so a clean
        # full rebuild re-emits it via passthrough (no --out flag on the 2-arg
        # --rebuild-page contract; we copy the rendered file into docs/legacy-html/).
        mkdir -p docs/legacy-html
        cp k3d/docs-content-built/datamodel-workflow.html docs/legacy-html/datamodel-workflow.html
        echo "Written docs/legacy-html/datamodel-workflow.html (passthrough source). Commit it, then: task docs:build && task docs:deploy."
```

The cmds block then ends after the `--out /tmp/datamodel-workflow.md`
line (purely subtractive besides the desc).

Edit `docs:refresh-diagrams` (L3964-3980; anchor
`grep -n '^  docs:refresh-diagrams:' Taskfile.yml`): reword the desc to
`Regenerate all auto-generated diagrams (DB schema, …)`, keep the first
cmds block (`db-schema-diagram.py` into `docs/db-schema-diagram.md`)
and `silent: false`, delete L3976-3979 (rebuild block + redeploy
subtask):

```yaml
      - |
        echo "→ Rebuilding the docs site (db-schema.html comes from the regenerated MD)..."
        node scripts/build-docs.mjs
      - task: docs:deploy
```

Edit `scripts/datamodel/workflow-map.yaml` header L5-7 (anchor
`grep -n 'rebuild-page' scripts/datamodel/workflow-map.yaml`): drop the
rebuild-page/HTML/deploy sentences, keep the .md contract. Before:

```yaml
#   → node scripts/build-docs.mjs --rebuild-page datamodel-workflow …
#   → rendered HTML lands in docs/legacy-html/datamodel-workflow.html (committed,
#     served by the docs deployment). Regenerate after schema or step changes.
```

After:

```yaml
#   Contract: /tmp/datamodel-workflow.md is the deliverable — regenerate after
#   schema or step changes.
```

Boundary: `scripts/datamodel/build_datamodel.py` L2/L9 names the old
pipeline in its docstring (already stale: it says `build-docs.js`);
left untouched — cosmetic, already wrong before this change, no guard
reads it. No live caller invokes the deleted tasks (only keeper prose
and the deleted refresh subtask referenced them).

Envsubst lists: remove the `\$DOCS_URL ` token (with trailing space)
from the two website.yaml render lists L4306 + L4342 (anchor
`grep -n 'DOCS_URL' Taskfile.yml` → exactly these 2 hits in `envsubst`
context; single-token deletion, surrounding vars untouched). Order
note: 4/6 removes the `\$BRAIN_EXTERNAL_URL` token from these same two
lines first (epic order 4/6→5/6 + rebase) — relocate by anchor, do not
assume line numbers or neighbors.

Verify:

```bash
task --list > /tmp/task-list.txt
test -z "$(grep -n 'docs:build\|docs:deploy\|test:docs-gen' /tmp/task-list.txt || true)"
grep -n 'datamodel:build\|docs:refresh-diagrams' /tmp/task-list.txt
test -z "$(grep -n 'scripts/build-docs\.mjs\|scripts/docs\.Dockerfile\|docs-content-built\|docs:build\|docs:deploy\|test:docs-gen\|rebuild-page' Taskfile.yml || true)"
test -z "$(grep -n 'DOCS_URL' Taskfile.yml || true)"
test -z "$(grep -n 'rebuild-page\|build-docs\|docs-deploy' scripts/datamodel/workflow-map.yaml || true)"
grep -n 'build_datamodel.py' Taskfile.yml && grep -n 'db-schema-diagram.py' Taskfile.yml
```

The two positive greps must hit (generation kept); the negative greps
must be empty (`graph:build-docs` does not match these patterns).

## Task 4: Docs sweep

Delete the two site-only docs, clean the registry (plus regen), and
remove the remaining docs-URL passages.

```bash
git rm docs/brain/k4-brain-wiki.md docs/DOCS-DESIGN-STANDARDS.md
```

`docs/agent-guide/registry/tools.yaml` (net -4): delete L142-143 and
L222-223 — each `links:` key plus its sole docs-URL entry (anchor
`grep -n 'docs.mentolder.de' docs/agent-guide/registry/tools.yaml`):

```yaml
   links:
    - { label_de: "Claude-Code-Doku", url: "https://docs.mentolder.de/claude-code.html" }
```

```yaml
   links:
    - { label_de: "Begriffe & Glossar", url: "https://docs.mentolder.de/glossary.html" }
```

Absent `links` is safe: the emitter defaults it (`emit-docs.mjs`
`Array.isArray … ? … : []`, `validate.mjs` `?? []`). Then regenerate
(keeper task, never hand-edit the generated file; regen verified clean
before this change, so only `20-werkzeuge.md` should diff):

```bash
task agent-guide:docs
test -z "$(grep -n 'docs\.mentolder\.de\|docs\.korczewski\.de' docs/agent-guide/20-werkzeuge.md || true)"
git status --short docs/agent-guide/
```

`docs/bereitstellungsdetails.md` (net -7): delete section 4.12
L197-203, header plus 5 bullets plus trailing blank (anchor
`grep -n '4.12 Documentation' docs/bereitstellungsdetails.md`):

```md
### 4.12 Documentation (`docs`)
* **Beschreibung:** Eine statische Dokumentations-Webseite (Docsify), die das Admin- und Benutzerhandbuch bereitstellt.
* **K8s-Deployment-Name:** `docs`
* **K8s-Namespace:** `workspace` / `workspace-korczewski`
* **Image-Tag:** `:latest` (wird via `task docs:deploy` neu gebaut)
* **Produktions-URLs:** `docs.mentolder.de`, `docs.korczewski.de`

```

The 4.11→4.13 numbering gap stays (no renumber; surroundings intact).
L276-277 (`docs/`, `docs/agent-guide/` repo paths) stay.

`CLAUDE.md` (net -1): delete L128 (anchor
`grep -n 'docs-content-built' CLAUDE.md`):

```md
- **`k3d/docs-content-built/`** -- Pre-built HTML served by the `docs` Deployment. Source is compiled by `node scripts/build-docs.mjs` from `docs/` and skill HTML. Deploy via `task docs:deploy`.
```

and drop `` `build-docs.yml`, `` from the L147 workflow list (anchor
`grep -n 'build-docs.yml' CLAUDE.md`), leaving the remaining entries
untouched. The L151 exclusion-list prose stays (not a named hunk).
Rebase note: 6/6 also edits `CLAUDE.md` — epic order 5/6→6/6 plus
rebase.

`.github/workflows/build-website.yml` (net -2): delete L169 (anchor
`grep -n 'DOCS_URL'`, mentolder block, between
`NEXTCLOUD_EXTERNAL_URL` and `VAULT_EXTERNAL_URL`):

```yaml
          DOCS_URL: https://docs.mentolder.de
```

and L331 (korczewski block, same neighbors):

```yaml
          DOCS_URL: https://docs.korczewski.de
```

These are the only `docs` hits in that file (verified).

`components/website/src/env.d.ts` (net -1): delete L34 (anchor
`grep -n 'DOCS_URL'`):

```ts
  readonly DOCS_URL?: string;
```

Removal is safe: the decl is optional (`?`), and a repo-wide grep finds
zero other `DOCS_URL` uses in `components/website/`.

`k3d/website.yaml` (net -1): delete L25 (anchor
`grep -n 'DOCS_URL' k3d/website.yaml` → exactly 1 hit):

```yaml
  DOCS_URL: "${DOCS_URL}"
```

`docs/systemtest-fragebogen.md` (net -24): delete the FA-13 section
(`### FA-13: Dokumentations-Service` through the `---` rule preceding
`### FA-14`, plus the surrounding blank — anchor the range by headers,
do not assume line numbers):

```bash
python3 - <<'PY'
p = 'docs/systemtest-fragebogen.md'
lines = open(p).read().split('\n')
start = next(i for i, l in enumerate(lines) if l.startswith('### FA-13:'))
end = next(i for i, l in enumerate(lines) if l.startswith('### FA-14:'))
assert lines[end - 2] == '---', "separator rule expected before FA-14"
assert 'Docs-Deployment' in '\n'.join(lines[start:end]), "FA-13 body check"
del lines[start - 1:end - 1]
open(p, 'w').write('\n'.join(lines))
print("FA-13 section removed")
PY
grep -n 'FA-13' docs/systemtest-fragebogen.md || echo "0 FA-13 hits (erwartet)"
```

Verify:

```bash
test ! -e docs/brain/k4-brain-wiki.md && test ! -e docs/DOCS-DESIGN-STANDARDS.md
yq eval '.' docs/agent-guide/registry/tools.yaml > /dev/null
yq eval '.' .github/workflows/build-website.yml > /dev/null
test -z "$(grep -n 'docs\.mentolder\.de\|docs\.korczewski\.de' docs/agent-guide/registry/tools.yaml docs/agent-guide/20-werkzeuge.md || true)"
test -z "$(grep -n 'build-docs\.yml\|docs-content-built' CLAUDE.md || true)"
test -z "$(grep -n '4.12 Documentation\|task docs:deploy' docs/bereitstellungsdetails.md || true)"
test -z "$(git grep -n 'DOCS_URL' -- .github/workflows/build-website.yml components/website/ || true)"
```

## Task 5: Gate verification and absence re-asserts

Run the three mandatory gates from the worktree root:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Then close p1's boundary notes with repo-wide re-asserts over the
owned surface (p1 verified these absent; this re-asserts after the
manifest/task/docs edits):

```bash
test -z "$(git grep -n -i 'oracle' -- Taskfile.yml scripts/vda.sh | grep -i 'docs' || true)"
test -z "$(git grep -n -i 'connectivity' -- Taskfile.yml | grep -i 'docs' || true)"
test -z "$(git grep -n 'docs-content-built\|scripts/build-docs\.mjs\|scripts/docs\.Dockerfile' -- Taskfile.yml k3d/ environments/ .github/ scripts/ .githooks/ commitlint.config.cjs .gitignore package.json || true)"
test -z "$(git grep -n 'DOCS_DOMAIN' -- k3d/ || true)"
test -z "$(git grep -n 'DOCS_URL' -- k3d/ || true)"
test -z "$(git grep -n 'docs\.localhost\|oauth2-proxy-docs' -- k3d/ || true)"
```

Boundary (not touched here): p1-owned scripts/workflows/hooks, p-tests
owned tests/ tree, `docs/legacy-html/`, freshness keepers, ADR-009,
history mentions, DNS, the `prod/` overlay docs refs,
`environments/schema.yaml`, staging/dev env files, and SSOT spec prose
(merged at archive time).
