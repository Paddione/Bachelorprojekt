# Design: t001404-workspace-deploy-secrets-scope

> **Note:** Full design rationale lives in
> `docs/superpowers/specs/2026-07-01-t001404-workspace-deploy-secrets-scope-design.md`
> (the brainstorming + spec-frontmatter file). This `design.md` exists only to
> satisfy the OpenSpec `spec-driven` schema's `design` artifact slot — the
> upstream `openspec` CLI marks `tasks.md` as blocked until `design.md` is
> present, even though `applyRequires` is only `["tasks"]`.

## Goal

Make `task workspace:deploy ENV=<brand>` safe to run for any brand on the
shared fleet cluster without overwriting brand-owned SealedSecrets in shared
namespaces (`rustdesk`, `coturn`).

## Non-Goals

See `docs/superpowers/specs/2026-07-01-t001404-workspace-deploy-secrets-scope-design.md`
§"Out of scope" for the full list. Highlights:

- No migration of legacy `sealed-secrets/{mentolder,korczewski}.yaml` to
  `fleet-*` topology (separate SSOT `secrets-deploy-automation.md`).
- No rotation of already-overwritten live keypairs (post-merge operational
  follow-up).
- No atomic `seal-and-deploy` task (open in `secret-rotation`-Spec).

## Approach (high-level)

Three layers of defence:

1. **Schema (SSOT for ownership)** — `environments/schema.yaml` gets an
   optional `owner_brand: [<brand>, ...]` field on each `extra_namespaces`
   entry. Shared-namespace entries get `owner_brand: [mentolder]`.
2. **env-seal (emission gate)** — `scripts/lib/seal-extra-namespaces.sh`
   filters by `owner_brand` against `ENV_NAME`; the produced SealedSecret
   documents carry an annotation `secrets.bachelorprojekt/owner-brand: <env>`.
3. **Taskfile (defence-in-depth)** — `Taskfile.yml` production branch
   filters the SealedSecret file with `yq` before `kubectl apply`, removing
   shared-namespace documents whose annotation does not match the current
   ENV.

Implementation details (file-level diffs, exact lines, helpers) live in
`openspec/changes/t001404-workspace-deploy-secrets-scope/tasks.md`.

## Open questions

None — the bug analysis, the coturn-shared verification, and the three-layer
fix approach are settled. See the brainstorm board
`.lavish/t001404-secrets-scope-brainstorm.html` for the full decision log.
