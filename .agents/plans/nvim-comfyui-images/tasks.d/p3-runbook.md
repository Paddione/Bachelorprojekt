## Task p3: ComfyUI & Images runbook chapter

Context. This partial writes the chapter runbook from `dotfiles/nvim/runbooks/_template.md` after p1 fixed the module behavior. It owns exactly one NEW file and touches nothing else. Page actions and runbook steps carry the same names in the same order; every fact in the runbook was verified live during scouting or is marked with the hand-verification command that proves it. The dashboard must not integrate OpenSpec.

Target files:

- `dotfiles/nvim/runbooks/comfyui-images.md` (NEW runbook chapter; .md not S1-gated)

### Steps

1. Create `dotfiles/nvim/runbooks/comfyui-images.md` from `_template.md` with frontmatter `page: comfyui-images`, `ticket: T900666`, `status: complete`, and `actions:` listing exactly `status`, `queue`, `logs`, `start`, `use`, `troubleshoot`, `unload`, `stop` in dashboard order.
2. Write the five sections with verified facts only:
   - Voraussetzungen: Neovim with the dashboard foundation; `curl` on PATH; ComfyUI reachable at `COMFY_HOST_IP:COMFY_PORT` (default port 8189, never 8188); start script `scripts/start-comfyui.sh` at the git root of the current buffer; current buffer inside a git repository (nil-guard warns otherwise); no network needed beyond the ComfyUI host.
   - Geordnete Schritte: eight numbered steps, each headed `**<action-name>**` in dashboard order, describing focus-versus-execute (moving the cursor runs nothing; Enter or the row key runs the action), what each action shows or starts, and the queue-guard refusal the operator sees on `unload`/`stop` while jobs are active.
   - Erwartetes Ergebnis: the page shows exactly the eight actions in order; status/queue/logs render read-only views; start shows both screen sessions coming up; unload/stop either refuse (active jobs) or confirm completion.
   - Troubleshooting: concrete failure modes — server unreachable (curl probe to retry), port 8188 conflict, missing screen sessions, missing log files, mixamo 501 is expected behavior, stale weights path.
   - Recovery: nothing persistent to roll back except screen sessions (`screen -S comfyui -X quit`, `screen -S rigger -X quit`); page removal equals deleting the module plus the registration block (auto-stub takes over); full config rollback path from `dotfiles/nvim/README.md`.
3. Cross-check: every action name and the step order match the p1 module function order and the p2 dashboard order exactly; the WSL note records that ComfyUI runs Windows-native per ADR-007 while the dashboard curls it over the mesh IP.
4. Stage exactly the one touched path and commit:
   ```bash
   git add -f dotfiles/nvim/runbooks/comfyui-images.md
   git commit -m "feat(T900666): comfyui images runbook chapter [T900666]"
   ```

### Acceptance criteria

- `comfyui-images.md` exists with correct frontmatter, all five template sections, and eight steps whose bold-headed names match the dashboard order exactly.
- Every technical claim traces to a scouted source or names its hand-verification command; no unverified endpoint is stated as fact.
- Commit uses the exact subject above with the explicit force-added pathspec and touches no other file.
