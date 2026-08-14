# Proposal: main-staging-guard

## Why

Der Hauptcheckout trug 10 untracked `openspec/changes/*`-Verzeichnisse
(batch-* + fix-factory-lock-worktree-safety + fix-sdlc-*), byte-identisch mit
ihren Branches — die Fußangel „OpenSpec-Staging im Hauptcheckout statt
Worktree" (AGENTS.md) ist erneut aufgetreten. Die Orphans wurden entfernt
(Inhalt war auf den Branches gesichert), aber nichts hindert den Fehler daran,
beim nächsten Plan wieder zu entstehen: `openspec.sh propose` legt auf main an,
der Move ins Worktree (opencode-flow-plan B.2) ist ein manueller Schritt, der
vergessen werden kann — dann wird im Hauptcheckout committet und die
Plan-Artifakte werden Orphans oder landen nie auf dem richtigen Branch.

## What

**Pre-commit-Fail im Hauptcheckout** (Operator-Entscheid 2026-08-14):
Ein neues Guard-Skript `scripts/openspec-main-staging-guard.sh` wird in
`.githooks/pre-commit` verdrahtet. Es schlägt fehl, wenn im HAUPT-Checkout
(nicht in Worktrees) neue, in HEAD nicht getrackte `openspec/changes/<slug>/`-
Pfade gestaged werden. Der sanktionierte Flow bleibt unberührt: Propose
geschieht auf main (kein Commit dort), der Commit läuft im Worktree nach dem
Move (B.2/B.3) — dort greift der Guard nicht.

Notausgang: `SKIP_MAIN_STAGING_GUARD=1` (Konvention wie `SKIP_BRANCH_CHECK`,
nur für dokumentierte Notfälle).

_Ticket: T003980_
