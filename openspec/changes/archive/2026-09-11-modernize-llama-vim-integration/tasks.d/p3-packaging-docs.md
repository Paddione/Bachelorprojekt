---
title: "p3 — Reversible packaging, provenance and documentation"
ticket_id: T900141
domains: [vim, llm-local-dev, openspec-workflow]
status: pending
role: impl
depends_on: [p1, p2]
target_files:
  - editor/llama-vim/README.md
  - editor/llama-vim/UPSTREAM.md
  - scripts/vim/install-llama.sh
  - docs/dev/llama-vim.md
  - openspec/component-map.yaml
---

# p3-packaging-docs — Implementation Plan

_Reversible packaging, provenance and documentation_

## File Structure

```text
editor/llama-vim/README.md           # NEW: concise user-facing package/install/configuration guide
editor/llama-vim/UPSTREAM.md         # NEW: imported-source identity, hash and reviewed sync procedure
scripts/vim/install-llama.sh         # NEW: explicit dry-run/install/remove lifecycle
docs/dev/llama-vim.md                # NEW: detailed operation, diagnostics, verification and rollback guide
openspec/component-map.yaml          # MODIFIED: route editor package and installer to vim-ai-completion
```

This partial begins only after p1 and p2 have fixed the actual command, configuration, status and
adapter surfaces. Documentation must derive examples from those implemented interfaces rather than
reintroducing names from the superseded external example. Tests and fixtures belong to the final
test partial; this partial may run them but must not edit them.

## S1 current, baseline and effective budget

Measurements come from the requested `intel.json`, `wc -l`,
`docs/code-quality/gates.yaml` and `docs/code-quality/baseline.json`. A zero `s1_limit` in Intel for
an unconfigured extension is not a zero-line allowance.

| File | Current | Baseline | Effective threshold | Effective budget |
|---|---:|---|---|---:|
| `editor/llama-vim/README.md` | 0 (new) | absent | not applicable: `.md` is not scoped by S1 | N/A |
| `editor/llama-vim/UPSTREAM.md` | 0 (new) | absent | not applicable: `.md` is not scoped by S1 | N/A |
| `scripts/vim/install-llama.sh` | 0 (new) | absent | 800 lines: configured `.sh` limit | 800 |
| `docs/dev/llama-vim.md` | 0 (new) | absent | not applicable: `.md` is not scoped by S1 | N/A |
| `openspec/component-map.yaml` | 218 | absent | not applicable: `.yaml` is not scoped by S1 | N/A |

Keep the installer below 500 lines so the new `.sh` file retains at least 300 lines of growth
reserve. Do not add baseline/ignore entries. Preserve the component map's established compact
two-line mapping shape and prefix-ordering rule; its lack of a numeric S1 budget is not permission
for unrelated reformatting.

## Installer contract

The new script exposes explicit actions; running it without one prints usage and exits non-zero:

```text
bash scripts/vim/install-llama.sh --install [--mode copy|link] [--dry-run]
bash scripts/vim/install-llama.sh --remove [--dry-run]
```

- `--install` defaults to `copy`; `link` is opt-in and records the resolved repository source.
- `--dry-run` is a modifier for either action and performs no filesystem write while reporting the
  exact source, package target, configuration target, backup decision and owned removals.
- The Vim 9.1 default target is the native optional package directory
  `$HOME/.vim/pack/bachelorprojekt/opt/llama-vim`, loaded from `$HOME/.vimrc` by one uniquely marked
  managed block. Tests set `HOME` to an isolated directory; the script must honor that value without
  consulting the real account database or touching the caller's actual home.
- Neovim remains an optional runtime path documented separately. This installer does not install
  Neovim, an LSP, llama.cpp or a plugin manager and does not mutate Neovim configuration implicitly.
- The script never reads, writes or removes the external examples below `.unsloth/llama.cpp` or
  `opt/llama.cpp-src`, and never starts/stops/switches an LLM server.

The managed block contains only the opt-in loader and documented repository-profile configuration.
Its begin/end markers are stable and unique to this package. Installer state records the action,
mode, canonical source/target, whether the config originally existed, backup path, and pre/post
configuration checksums; it contains no credentials or source text.

## Task 1 — Implement CLI parsing and path-safety preflight (1.5 hours)

- Resolve the repository root from the script location, then require the complete p1/p2 package
  tree before planning either install mode. Missing runtime files fail before any user path changes.
- Parse exactly one of `--install` or `--remove`, optional `--dry-run`, and for install only
  `--mode copy|link`. Reject duplicates, unknown flags, incompatible combinations, unset/empty
  `HOME`, and non-directory or non-owned package targets with actionable diagnostics.
- Construct the two explicit destinations above from the captured `HOME`; canonicalize and validate
  them before mutations. Never pass `$HOME`, `.vim`, a glob or an unresolved variable as a recursive
  delete target.
- Refuse to replace a package directory/symlink that lacks the plugin's ownership marker/state.
  Reject malformed managed blocks (only one marker, nesting, duplicates) rather than guessing which
  user content to remove.
- Establish `set -euo pipefail`, a cleanup trap for script-created temporary paths, and restrictive
  permissions for state/temporary files. Diagnostics must not print the content of personal config.

Acceptance:

- No action is implicit; invalid input exits non-zero without creating directories or backups.
- All mutation targets are resolved descendants of the isolated Vim package/config locations.
- An unrelated directory named `llama-vim` or malformed loader block is preserved and causes a
  clear refusal.

## Task 2 — Implement a truthful, zero-write dry run (1.5 hours)

- Reuse the same preflight and decision functions as the mutating paths. Dry run must calculate
  whether the package is absent/current/stale, whether config needs a managed block, whether a
  backup would be created, and what remove would restore or strip.
- Emit a stable ordered plan with action, mode, canonical source/target, config target, prospective
  backup/state path and `create`, `replace`, `unchanged`, `restore`, `strip-managed-block` or
  `remove-owned-target` decisions.
- Ensure every filesystem-mutating helper respects dry-run centrally; no helper may independently
  forget the guard. Reading metadata/checksums is allowed, but no directory, tempfile, state file,
  backup, symlink or config file may be created.
- Return success for a valid no-op install/remove preview and non-zero for the same unsafe states
  that a real run rejects.

Acceptance:

- A before/after tree and checksum comparison under an isolated `HOME` is byte-identical after both
  install and remove dry runs.
- Dry-run output predicts the corresponding real action, including the backup decision, without
  exposing personal configuration text.

## Task 3 — Implement transactional, idempotent install/update (2 hours)

- Before changing an existing `$HOME/.vimrc`, create a collision-safe timestamped backup with
  preserved mode and record its checksum. If no config exists, record that fact instead of creating
  a fake pre-install backup.
- Stage the package in a temporary sibling path. Copy mode snapshots only the repository-owned
  runtime/docs needed for the Vim package; link mode creates an atomic symlink to the canonical
  repository package directory. Add the ownership/state marker before publishing the target.
- Construct the new config in a temporary sibling file: preserve all user bytes outside the managed
  region and append exactly one complete marked loader/config block when absent. Publish package and
  config atomically where possible; on any later failure restore the backed-up config and previous
  owned package, then report the rollback.
- Treat repeated same-source/same-mode installation as success with no duplicate block and no
  unnecessary backup. A later install in copy mode updates stale owned package contents atomically;
  a mode/source change is reported and replaces only a target proven owned.
- Record pre/post config checksums and backup path only after a successful commit of both package and
  config. Preserve an existing user's permissions; do not source/evaluate their Vim configuration.

Acceptance:

- First install preserves the original config backup before adding one managed block and makes the
  package loadable via native `packadd` semantics.
- Two identical installs produce one block and one package, leave the second-run filesystem
  unchanged, and do not create a redundant backup.
- An injected failure between staging and publish restores the pre-run package/config state.

## Task 4 — Implement ownership-safe remove and rollback (2 hours)

- Read and validate recorded state before removal. Remove a package directory only when its marker
  and canonical target match; unlink a link without traversing its target. Never recursively remove
  the repository source or either external llama.cpp example.
- If current config still matches the recorded post-install checksum, restore the exact pre-install
  backup atomically (or remove the installer-created config when none originally existed).
- If the user edited config after installation, remove only the one complete marked block, preserve
  all other bytes, retain the backup, and explain why wholesale restoration was skipped.
- Make remove idempotent: an already absent owned package/block succeeds as a reported no-op. A
  partial/ambiguous state, mismatched ownership marker or malformed block fails closed and preserves
  files for manual review.
- Remove installer state only after config and package cleanup have succeeded. Any failure reports
  the remaining owned paths and backup location without deleting recovery evidence.

Acceptance:

- Normal remove restores the original config byte-for-byte and deletes only repository-managed
  installation artifacts.
- Post-install user edits survive surgical block removal; the original backup remains available.
- Repeated remove succeeds without changes, and both external example trees remain untouched.

## Task 5 — Record concrete upstream provenance and sync procedure (1.5 hours)

- In `UPSTREAM.md`, record the actual upstream repository URL, exact source revision, imported
  `examples/llama.vim` path, SHA-256 of the inspected source and date of import. Obtain values from
  the inspected llama.cpp checkout during implementation; do not substitute a model-generated or
  display-name guess.
- Verify the two observed external examples are identical before naming either as the import input.
  At planning time (2026-09-11) they matched: `sha256sum ~/.unsloth/llama.cpp/examples/llama.vim
  ~/opt/llama.cpp-src/examples/llama.vim` returned
  `85c627410e04cfdaa0ae6886214dfa98e976244be914fcf9ab5719360594439d` for both (783 lines each).
  If they differ, record both hashes and choose one explicitly with a reason. Never modify either
  source tree during this check.
- State which repository modules replace upstream responsibilities and summarize intentional
  divergence: streaming parser, per-buffer lifecycle, configuration schema, context providers,
  Neovim adapter, status/discovery and repository profile.
- Define the sync contract: fetch/review an upstream revision in its own checkout, verify the source
  identity, produce a reviewed diff against the recorded revision, port changes into this
  repository-owned package, run all offline Vim/optional-Neovim tests, then update revision/hash and
  divergence notes in the same commit. Do not copy over local modules blindly.
- Explicitly state that upstream submission is outside this change and that installed/update flows
  never mutate upstream checkouts.

Acceptance:

- Every provenance identifier is concrete and independently reproducible with documented read-only
  commands.
- A future maintainer can tell which upstream version was imported, what changed locally and which
  checks must pass before advancing the recorded revision.

## Task 6 — Write the package README quick path (1.5 hours)

- Document prerequisites and compatibility: Vim 9.1 jobs/timers/text properties plus `curl`, with
  Neovim 0.10+ behavior optional. State that installation does not install an editor or manage the
  server/GPU loadout.
- Lead with explicit copyable commands for install preview, install, link-mode opt-in, remove preview
  and remove. Explain the exact package/config/backup targets and the isolated-`HOME` verification
  pattern before asking a user to mutate personal configuration.
- Show the p1-defined safe repository defaults (`127.0.0.1:8094`, `qwen38-220k`, prefix 512,
  suffix 64, ring 32), configuration override shape, manual FIM/accept/cancel, auto-FIM enable,
  filetype exclusion, `:LlamaReloadConfig`, `:LlamaStatus` and `llama#statusline()` using the final
  implemented command names.
- Explain that offline startup is normal and non-blocking. Link to `UPSTREAM.md` for provenance and
  `docs/dev/llama-vim.md` for detailed operation/troubleshooting rather than duplicating them.
- Include an ownership warning: never edit the external example copies as the installed plugin and
  never hand-delete a broad `.vim` directory; use the installer removal path.

Acceptance:

- A Vim user can preview, install, verify, configure and remove the package using only the README,
  and every command names an explicit safe target/action.
- The README directly references `scripts/vim/install-llama.sh`, satisfying one S4 reachability
  edge for the new script.

## Task 7 — Write the detailed developer/operator guide (2 hours)

- Describe the repository-owned layout and p1/p2 ownership boundaries: portable Vim core,
  E746-correct public facade, context/status modules, optional Neovim adapters, installer and tests.
- Document request lifecycle/cancellation ordering, streaming SSE/NDJSON behavior, bounded retries,
  context/LSP fallback, cross-file sensitivity filters, discovery precedence and side-effect-free
  statusline at an operational level without promising internal symbols that differ from p1/p2.
- Give a safe staged migration: isolated-`HOME` dry run, isolated install and headless Vim check,
  real dry run, explicit real install, manual FIM/cancellation/status check, then optional auto-FIM.
- Document copy versus link update behavior, backup naming, remove behavior with and without later
  user edits, recovery after an interrupted run, and how to inspect ownership state before manual
  intervention.
- Provide offline troubleshooting for unsupported Vim capabilities, missing curl, unreachable port,
  permanent vs transient errors, ambiguous FIM discovery, missing/late LSP and excluded/sensitive
  buffers. Server startup and `/infill` smoke commands are explicitly manual and never a prerequisite
  for offline verification.
- Include optional Neovim 0.10+ runtime configuration without installing Neovim or changing its
  configuration automatically. Link back to the package README and provenance record.

Acceptance:

- The guide separates editor/plugin actions from server-management actions and never implies an
  automatic deployment, model switch, GPU mutation or external-tree edit.
- All recovery/removal guidance is ownership-scoped and preserves user changes and backups.
- The guide directly references the installer, providing the second S4 reachability edge.

## Task 8 — Register the new capability routing (1 hour)

- Add mappings in `openspec/component-map.yaml` for prefixes `editor/llama-vim` and `scripts/vim`,
  both targeting the new flat capability slug `vim-ai-completion`.
- Preserve the file's longest-prefix-first convention and existing entries; do not route this
  editor integration to `llm-local-dev` and do not reformat unrelated mappings.
- Verify both representative paths resolve through the component-map entry:

```bash
bash scripts/openspec-context.sh editor/llama-vim/plugin/llama.vim
bash scripts/openspec-context.sh scripts/vim/install-llama.sh
```

Acceptance:

- Each command selects `vim-ai-completion`, and existing `openclaw`/LLM routing remains unchanged.
- The two documentation links plus these routing checks make the new installer discoverable; the
  S4 orphan-script gate reports no violation.

## Task 9 — Focused packaging and documentation verification (1.5 hours)

- Run syntax/static checks without mutating a real home:

```bash
bash -n scripts/vim/install-llama.sh
command -v shellcheck >/dev/null 2>&1 && shellcheck scripts/vim/install-llama.sh
```

- With a fresh temporary directory exported as `HOME`, capture its tree and checksums, run install
  and remove dry runs, and prove the capture is unchanged. Then perform two real installs and two
  removals, asserting one managed block, preserved backup semantics, idempotent second runs and no
  access to the real home or external llama.cpp trees.
- After the test partial supplies the focused tests, run:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/vim-ai-completion/install-config.bats
```

- Validate documentation links/commands and both component-map resolutions, then run:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- Inspect generated changes and keep only expected artifacts owned by the overall change. Confirm
  the installer remains below 500 lines, no baseline key was added, and no file outside this
  partial's five `target_files` was modified by p3.

Completion requires evidence for zero-write dry-run, idempotent install/update/remove, backup and
post-install-edit preservation, ownership-safe rollback, concrete provenance, copyable docs,
component routing and S4 reachability.
