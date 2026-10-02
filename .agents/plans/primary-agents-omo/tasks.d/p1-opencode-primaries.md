# p1 — opencode primaries

Adds the three thin domain primaries to the opencode runtime. Design §4 is the
source for prompt contents (each prompt at most 60 lines: role + signals, SSOT
references, `vda.sh oracle`, plan-context injection, escalation, scope).

## Tasks

- [ ] Write `.opencode/prompts/bp-build.md` — build role: manifests,
  overlays, Taskfile, secrets handling (no plaintext credential output);
  references AGENTS.md routing, `docs/agent-guide/reference.md`,
  `docs/agent-guide/registry/runtimes.md`, recall-routing.
- [ ] Write `.opencode/prompts/bp-run.md` — run role: live ops via
  `task workspace:*` and kubectl, postgres reads; read-only for manifests;
  first step is the session-integrity probe from the ops runbook.
- [ ] Write `.opencode/prompts/bp-ship.md` — ship role: BATS/Playwright,
  Astro/Svelte under `components/website/` (pnpm only), test inventory duty.
- [ ] Edit `.opencode/agent-models.jsonc` `agent`: add `bp-build` + `bp-run`
  (`mode: primary`, model `llamacpp-local/Qwen3.8-27B`, `steps: 150`) and
  `bp-ship` (`mode: primary`, model
  `opencode-go-oai/muse-spark-1.3-contributor`, `variant: low`, `steps: 150`);
  remove the `glimmer-primary`, `big-pickle`, `ox-alpha`, `ox-alpha-free`
  blocks in the same edit (single owner of this file). Keep `local`,
  `qwen35-mtp`, `exe-muse`, `reviewer`, `plan-worker-*` untouched.
- [ ] Edit `.opencode/opencode.jsonc` `permission.task`: each new primary gets
  its worker set plus the OMO plugin agents — `bp-build`:
  local/qwen35-mtp/reviewer/fixer/oracle; `bp-run`:
  local/qwen35-mtp/exe-muse/oracle; `bp-ship`:
  local/qwen35-mtp/reviewer/designer/librarian.

## Acceptance

- [ ] `task mcp:sync` regenerates without drift after the config edits.
- [ ] `node -e` JSONC parse check passes on both edited config files
  (strip comments before parsing, or use the repo's existing config reader).
