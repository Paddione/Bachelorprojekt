## Task p2: AI und Agents runbook chapter

Context. Zweck dieses Partials: das Runbook-Kapitel mit Voraussetzungen, Schritten, Workflow-Zuordnung und Blink-Abgrenzung schreiben. This partial runs after p1 has landed, because the runbook documents the implemented module and dashboard page. It owns exactly one NEW runbook file and creates no other file. The runbook file `ai-agents.md` is Markdown and carries no S1 limit entry, so no line budget applies to it; this is stated in words on purpose and no numeric budget is claimed. Verified facts reused here: the five p1 action names in dashboard order, the opencode.nvim README contents (context placeholders, built-in prompts, session commands, `:checkhealth opencode`, `opencode --port` server discovery), `muse skills list --source all` as the live skills source, and `setup_blink()` in `lua/config/editor-capabilities.lua` as human-only completion with no agent wiring.

Target files:

- `dotfiles/nvim/runbooks/ai-agents.md` (NEW runbook chapter: prerequisites, ordered steps, workflow mapping, Blink delineation, troubleshooting, recovery)

### Steps

- [ ] Step 1 — Create `dotfiles/nvim/runbooks/ai-agents.md` following `runbooks/_template.md` with frontmatter `page: ai-agents`, `ticket: T900662`, `status: complete`, and `actions` in dashboard order: `ask`, `select`, `send-context`, `list-skills`, `session-new`. Gate: frontmatter parses and the actions list matches the dashboard page order from p1 exactly.
- [ ] Step 2 — Write the `Voraussetzungen` section: Neovim v0.12.5 with the dashboard foundation, `opencode.nvim` present in `plugins/core.lua` (verify via `:checkhealth opencode`), `opencode` CLI on `PATH` (verified v2.0.18) started with server discovery (`opencode --port`), `muse` CLI on `PATH` for the skills action, and a git-rooted current buffer since every action resolves its working directory through `config.gitroot` at execution time. Gate: every named prerequisite carries its verify command.
- [ ] Step 3 — Write the `Geordnete Schritte` section with the five actions in dashboard order, each stating focus-versus-execute behavior (moving the cursor runs nothing; the key or Enter runs the action): `ask` opens prompt input with `@this` context; `select` opens the picker over prompts, commands and servers; `send-context` appends `@buffer @diagnostics` context to OpenCode; `list-skills` shows the live `muse skills list --source all` output in a read-only scratch buffer; `session-new` starts a new OpenCode session. Include the category-workflow mapping table that connects each workflow to its matching agent capability: review to the `review` prompt on `@this`, fix to the `fix` prompt on `@diagnostics`, explain to the `explain` prompt, implement to the `implement` prompt, test to the `test` prompt, document to the `document` prompt, session lifecycle to `session.new`/`session.select`/`session.compact`/`session.interrupt`, and skill discovery to `list-skills`. Gate: step headers match the five action names in order and the table covers every row above.
- [ ] Step 4 — Write the Blink delineation inside `Geordnete Schritte` (or as its own subsection before `Erwartetes Ergebnis`): Blink (`blink.cmp`, wired by `setup_blink()` in `editor-capabilities.lua`) is human typing completion only — LSP, path, snippet and buffer sources with the default keymap preset and no agent or LLM wiring; agents never complete through Blink, they navigate through their own tools (OpenCode context placeholders, prompts, and commands). State explicitly that this separation is intentional and must stay that way. Gate: the runbook names both sides of the separation and the no-agent-wiring rule.
- [ ] Step 5 — Write `Erwartetes Ergebnis` (page renders the five actions in order; each action's observable outcome), `Troubleshooting` (server not found — start `opencode --port` and re-run `:checkhealth opencode`; permission request flow; `muse` CLI missing — install or fix `PATH`; no-git-root warning — open a git-rooted buffer), and `Recovery` (session lifecycle commands `session.new`/`session.compact`/`session.interrupt` for a stuck session; actions write no files so nothing persistent needs rollback; full removal means deleting the module plus the dashboard page entry, after which the auto-stub returns). Gate: all five template sections exist with concrete commands.
- [ ] Step 6 — Stage exactly the one touched path and commit (dotfiles/ is gitignored, force-add per repo convention):
  ```bash
  git add -f dotfiles/nvim/runbooks/ai-agents.md
  git commit -m "feat(T900662): ai agents runbook chapter [T900662]"
  ```

### Acceptance criteria

- [ ] `dotfiles/nvim/runbooks/ai-agents.md` exists with complete frontmatter, the five named steps in order, prerequisites with verify commands, troubleshooting, and recovery.
- [ ] The category-workflow mapping table connects every listed workflow to its matching agent capability.
- [ ] The Blink delineation (human typing completion versus agent tool navigation, no agent wiring in Blink) is documented.
- [ ] Commit uses the exact subject above with an explicit pathspec and touches no other file.
