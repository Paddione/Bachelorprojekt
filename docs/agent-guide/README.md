# AI-Agent Operating Guide — Registry (SSOT)

This directory is the **single source of truth** for the beginner-facing operating guide.
The YAML files here feed: the platform hub DB (component descriptions), the future docs-site /
in-app-help / repo-map surfaces, and the future enforcement layer. Edit the YAML, run the
validator, commit. Narrative teaching prose lives in the surfaces, not here.

## Files
- `taxonomy.yaml` — the 4 danger tiers. The `id` of each tier is the value other files put in
  their `danger` / `sensitivity` field, and the contract the enforcement layer consumes.
- `guardrails.yaml` — reusable named guardrails. Tools/goals reference these by `id`.
- `tools.yaml` — the beginner-spine skills + the 6 routing agents.
- `goals.yaml` — the "Ich will …" intent catalog; each goal's `flow` references tool `id`s.
- `components.yaml` — every platform component (matches `platform.software_assets` /
  `hardware_assets` by `slug`). `summary_de` is written into the hub `description` column.

## Validate
```bash
node scripts/agent-guide/validate.mjs      # validates the real registry, exit 1 on error
task test:agent-guide                      # validator unit tests + real-registry validation + gen check
```

## Field contracts
All `*_de` fields are German, Du-form, plain & friendly, every technical term explained in
parentheses on first use. Ids are kebab-case and stable.

- **taxonomy entry:** `id`, `label_de`, `emoji`, `meaning_de`, `doc_treatment`, `enforcement_default`
- **guardrail entry:** `id`, `name_de`, `rule_de`, `why_de`, `enforced_by`
- **tool entry:** `id`, `name_de`, `kind` (`skill|agent|task`), `summary_de`, `what_for_de`,
  `how_to_start_de`, `what_could_go_wrong_de`, `danger` (taxonomy id), `guardrails` (ids),
  `related` (tool ids), `links`
- **goal entry:** `id`, `title_de`, `when_de`, `flow` (list of `{tool, note_de}`),
  `example_prompt_de`, `danger` (taxonomy id), `guardrails` (ids), `related` (goal ids)
- **component entry:** `slug` (= DB slug), `kind` (`software|hardware`), `name`, `emoji`,
  `summary_de` (≤140 chars; → hub `description`), `what_for_de`, `placeholder_en` (verbatim
  current English DB value we are replacing), `sensitivity` (taxonomy id), `url`, `links`
