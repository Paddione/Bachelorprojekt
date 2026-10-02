## Task 3: Models and Inference runbook plus master-index flip

Context. This partial delivers the chapter runbook for ticket T900663 and flips the master-index line for this chapter from stub to complete. It owns exactly one new file plus one existing shared file, creates no other file, and runs after p1 so the documented action names, keys, and behavior match the implemented module. Verified anchor facts (2026-09-28): `dotfiles/nvim/runbooks/README.md` is 43 lines and line 21 reads `7. **Models & Inference** — T900663 — status: stub`; the runbook template `dotfiles/nvim/runbooks/_template.md` requires the header keys `page`, `ticket`, `status`, ordered `actions`, plus the five H2 sections `Voraussetzungen`, `Geordnete Schritte`, `Erwartetes Ergebnis`, `Troubleshooting`, `Recovery` in that order; the worked example `dotfiles/nvim/runbooks/files-search.md` shows the expected depth. Sibling chapter workers flip their own index lines in parallel, so the rebase discipline in step 1 is mandatory.

Target files (one NEW, one CHANGED shared):

- `dotfiles/nvim/runbooks/models-inference.md` (models-inference.md): chapter runbook with real content verified against the live setup.
- `dotfiles/nvim/runbooks/README.md` (README.md): line 21 only, flipped to `status: complete` with a link to the new runbook; .md not S1-gated.

### Steps

1. Rebase onto latest `origin/main` before touching the shared index, then confirm the anchor still matches:
   ```bash
   git fetch origin main && git rebase origin/main
   grep -n "Models & Inference" dotfiles/nvim/runbooks/README.md
   ```
   Proceed only when the T900663 line still reads `status: stub`; keep every other index line byte-identical.
2. Create `dotfiles/nvim/runbooks/models-inference.md` (models-inference.md) with header `page: models-inference`, `ticket: T900663`, `status: complete`, and `actions` listing the six dashboard action names in exact dashboard order: `models-status`, `server-config`, `server-logs`, `gpu-resources`, `server-start`, `server-stop`. `Voraussetzungen` states the live-verified prerequisites: Neovim v0.12.5 with the repo config installed, `llama-server` at `~/opt/llama-current/bin/llama-server`, systemd user units `qwen38-gsq-iq2s` (`:1919`) and `qwen35-mtp` (`:1920`), LM Studio on `:1234`, `nvidia-smi` on `PATH`, ToggleTerm available for the log view — and states explicitly that FreeToken is retired (T900363) and that any older reference calling `:1919` FreeToken-native is stale and must not be followed.
3. Write the `Geordnete Schritte` section as six numbered steps with the exact action names and keys from p2 (`models-status` s, `server-config` c, `server-logs` l, `gpu-resources` g, `server-start` b, `server-stop` x), each describing reach-focus-execute (cursor movement never executes; only the keypress runs the action). The `server-start` step documents the explicit start procedure: pick the unit, type `yes`, then `systemctl --user start <unit>` runs and the resulting state is shown; it also documents the tuning procedure with the live flag vocabulary from the repo service files (`-c` context size, `-ngl` GPU layers, `-fa` flash attention, `-ctk`/`-ctv` KV quant types, `-np` parallel slots, `--spec-type` draft type), the copy-not-symlink unit install rule, and the measured VRAM ceilings from the service headers (3060 Ti desktop limit 7600 MiB, 5070 Ti WSL spill ceiling near 15.9 GB). The `server-stop` step documents the explicit stop procedure with the same two confirmations. `Erwartetes Ergebnis` describes the rendered six-row page and the observable outcome of each action.
4. Write `Troubleshooting` (backend unreachable on `:1919`/`:1920`/`:1234` with the `curl -m 5 /v1/models` probe per port, unit inactive with the `systemctl --user is-active` check, `glimmer` inactive despite its stale header claim, llm-proxy `:18235` answering with an auth error, `nvidia-smi` missing, log view empty because no unit is active, start/stop refused without typed `yes`) and `Recovery` (stop leaves no persistent state; remove the page by deleting the p1 module plus the p2 page block so the auto-stub takes over; full config rollback via the timestamped `~/.config/nvim-backup-*` directory). Every failure mode names the concrete command that recognizes it.
5. Flip line 21 of `dotfiles/nvim/runbooks/README.md` (README.md) to the complete form with a link to the new runbook, changing no other line:
   ```bash
   grep -n "T900663" dotfiles/nvim/runbooks/README.md
   git diff --stat dotfiles/nvim/runbooks/README.md
   ```
   The diff must show exactly one changed line.
6. Self-check the runbook against the template and the dashboard order:
   ```bash
   grep -n "^## " dotfiles/nvim/runbooks/models-inference.md
   grep -n "^status:" dotfiles/nvim/runbooks/models-inference.md
   awk '/^actions:/{f=1; next} f && /^  - /{sub(/^  - /,""); print; next} f && !/^  - /{exit}' dotfiles/nvim/runbooks/models-inference.md
   awk '/^## Geordnete Schritte/{f=1; next} f && /^## /{exit} f && /^[0-9]+\. \*\*/{line=$0; sub(/^[0-9]+\. \*\*/, "", line); sub(/\*\*.*/, "", line); print line}' dotfiles/nvim/runbooks/models-inference.md
   ```
   Confirm by reading the output: five H2 sections in template order, `status: complete`, six actions and six numbered steps both in dashboard order with identical names.
7. Commit the two files. `dotfiles/` is gitignored, so force-add the explicit paths and never stage the whole tree:
   ```bash
   git add -f dotfiles/nvim/runbooks/models-inference.md dotfiles/nvim/runbooks/README.md
   git commit -m "feat(T900663): models-inference runbook and index flip [T900663]"
   ```
   Do not use a blanket stage command.

### Acceptance criteria

- `dotfiles/nvim/runbooks/models-inference.md` (models-inference.md) exists with the machine-readable header (`page`, `ticket`, `status: complete`, six ordered `actions`) and the five H2 sections in template order, with real content covering status, config, logs, resources, explicit start/stop, tuning, troubleshooting, and recovery.
- Step names, action names, and keys in the runbook match the p1 module and p2 dashboard registration exactly and in the same order.
- `dotfiles/nvim/runbooks/README.md` (README.md) differs from the rebased base by exactly one line: the T900663 entry flipped to complete with a runbook link.
- The step 6 self-check was executed and confirms template order, complete status, and matching action/step order.
- The implementation commit uses the `feat(T900663): <subject> [T900663]` shape and stages exactly the two force-added dotfiles paths, with no blanket staging.
