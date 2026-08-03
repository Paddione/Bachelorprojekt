# Proposal: main-commit-guard

## Why

Der `.githooks/pre-commit` Hook lässt Commits auf `main` explizit durch (Zeile 124: `main|develop|master|release-please--*|dependabot/*|renovate/*` sind exempt vom Branch-Naming-Check). Ein Agent, der vergisst einen Worktree anzulegen, kann Changes direkt auf `main` committen — ohne Ticket, Branch, Worktree oder PR.

G-WT01 misst das zwar als Health-Metrik, aber erst nächtlich und nicht blockierend. Es gibt keinen Echtzeit-Guard, der den Agenten stoppt.

## What

1. **Pre-Commit-Guard**: Blockiert Commits auf `main` (außer im CI/Automation-Kontext), mit klarer Fehlermeldung die auf das Ticket→Branch→Worktree→PR-Workflow verweist.
2. **BATS-Test**: Verifiziert, dass der Guard auf `main` blockiert und mit `SKIP_MAIN_COMMIT_GUARD=1` bypassed werden kann.
3. **GitHub Branch Protection** (optional, benötigt `GH_PAT`): "Require a pull request before merging" auf `main` setzen, als zweite Verteidigungslinie.

_Ticket: T002631_
