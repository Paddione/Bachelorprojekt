## Task 3: SDLC runbook and master-index entry

Context. This partial writes the SDLC chapter runbook and flips the master
index entry from stub to complete for ticket T900660 (EPIC T900654). It owns
one new file and one shared file and depends on p1 and p2 (action names,
order, and keys must match the registered page exactly). Template is
`dotfiles/nvim/runbooks/_template.md`; style reference is
`dotfiles/nvim/runbooks/files-search.md` (frontmatter with actions[], five
fixed sections, numbered `**name**` steps, Quellen note). The runbook is the
place where the documented processes become visible: it names the four skill
files, states the no-OpenSpec boundary, and keeps production actions manual.
Before reusing any process wording, the executor greps the skill sources for
OpenSpec references and reconciles them (dashboard stays OpenSpec-free even
where the repo docs mention OpenSpec). Rebase onto latest `origin/main`
before touching the shared index and keep every other index line
byte-identical.

Target files:

- `dotfiles/nvim/runbooks/sdlc.md` (sdlc.md): NEW chapter runbook, status complete.
- `dotfiles/nvim/runbooks/README.md` (README.md): CHANGED — SDLC line stub to complete (anchor-based one-line edit).

### Steps

1. Reconcile reused process wording against the skill sources. Run
   `grep -rn -i "openspec" .agents/skills/ticket-triage/
   .agents/skills/ticket-dispatch/ .agents/skills/dev-flow-plan/
   .agents/skills/dev-flow-execute/` and record which files mention OpenSpec.
   Whatever the result, the runbook and module wording uses only the
   ticket/SDLC process terms (Triage, Readiness, Abhaengigkeiten, Planung,
   Umsetzung, Verifikation, Abschluss) and never instructs an OpenSpec
   command or path. Note the grep outcome in the runbook Quellen section.

2. Create `dotfiles/nvim/runbooks/sdlc.md` (sdlc.md) from `_template.md`:
   frontmatter `page: sdlc`, `ticket: T900660`, `status: complete`,
   `actions[]` with the nine names in dashboard order (tickets-list,
   triage-show, readiness-show, deps-show, plan-open, exec-status,
   verify-gates, close-check, process-docs). The five sections follow the
   template: Voraussetzungen (foundation T900655 plus p1/p2 of this ticket,
   `ticket.sh`/`git`/`task` on PATH, git-rooted buffer, the four skill
   paths, no network needed); Geordnete Schritte (nine numbered `**name**`
   steps in dashboard order, each stating focus-versus-execute, the key, and
   the read-only outcome; mutating follow-ups shown as copy-paste commands);
   Erwartetes Ergebnis (nine rows in order, scratch-buffer display, manual
   production actions); Troubleshooting (no git root WARN, no ticket id in
   branch, missing plan_ref, missing skill file, empty ticket list); Recovery
   (nothing persistent to roll back; page removal = delete module plus
   registration block). Add a Quellen note with the step-1 grep outcome and
   the verified command set. The file contains no OpenSpec command or path.

3. Flip the master-index SDLC line (currently `4. **SDLC** — T900660 —
   status: stub`) to `4. **SDLC** — T900660 — [`sdlc.md`](sdlc.md) — status:
   complete`, mirroring the home.md entry style. Rebase onto latest
   `origin/main` first; the diff must touch exactly this one line.

4. Run the guards from the worktree root:
   ```bash
   for s in Voraussetzungen "Geordnete Schritte" "Erwartetes Ergebnis" Troubleshooting Recovery; do
     grep -q "^## $s" dotfiles/nvim/runbooks/sdlc.md || { echo "missing section: $s"; exit 1; }
   done
   awk '/^actions:/{f=1; next} f && /^  - /{sub(/^  - /,""); print; next} f && !/^  - /{exit}' dotfiles/nvim/runbooks/sdlc.md > /tmp/sdlc-actions.txt
   printf 'tickets-list\ntriage-show\nreadiness-show\ndeps-show\nplan-open\nexec-status\nverify-gates\nclose-check\nprocess-docs\n' | diff - /tmp/sdlc-actions.txt
   if grep -rn -i "openspec" dotfiles/nvim/runbooks/sdlc.md dotfiles/nvim/runbooks/README.md; then exit 1; fi
   git diff --stat -- dotfiles/nvim/runbooks/README.md
   ```
   All five sections present, actions[] diff empty, OpenSpec grep silent,
   index diff limited to the README file.

5. Commit both files with explicit pathspecs:
   ```bash
   git add -f dotfiles/nvim/runbooks/sdlc.md dotfiles/nvim/runbooks/README.md
   git commit -m "docs(T900660): neovim sdlc runbook and index entry [T900660]"
   ```
   The commit keeps the `<type>(T900660): <subject> [T900660]` shape and
   contains only the two runbook files.

### Acceptance criteria

- `sdlc.md` exists with complete frontmatter, nine actions[] in dashboard
  order, all five template sections, nine ordered `**name**` steps, and a
  Quellen note recording the OpenSpec-reconciliation grep outcome.
- The master index shows the SDLC line as complete with the file link; its
  diff touches exactly that line.
- Guards pass: sections present, actions[] diff empty, no OpenSpec match in
  either file.
- The commit uses the ticket-scope shape and tracks only the two runbook
  files.
