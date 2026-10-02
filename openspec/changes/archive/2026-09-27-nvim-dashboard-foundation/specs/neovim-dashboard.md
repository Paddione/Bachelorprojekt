## ADDED Requirements

### Requirement: Repo-tracked Neovim foundation config

The system SHALL provide the Neovim foundation configuration as tracked repository files under `dotfiles/nvim/` (force-added per the repo's `git add -f` dotfiles convention), installable to `~/.config/nvim` via an idempotent `dotfiles/install.sh` step.

#### Scenario: Clean headless startup from the repo config

- **GIVEN** the repo config copied to an isolated `XDG_CONFIG_HOME`
- **WHEN** `nvim --headless -u <init.lua> -i NONE +qa` runs
- **THEN** the exit code is 0 and the log contains no error

#### Scenario: Install is idempotent and rollback is documented

- **GIVEN** a host with an existing `~/.config/nvim`
- **WHEN** the install step runs twice
- **THEN** the second run changes nothing and the README documents the `mv ~/.config/nvim.old-20260927 ~/.config/nvim` rollback

### Requirement: Buffer-based Git-root function

The system SHALL resolve the repository root of the currently opened file via `git rev-parse --show-toplevel`, covering worktrees, and SHALL gracefully handle unnamed buffers and files outside Git without silently falling back to another project.

#### Scenario: Nested file and worktree file resolve to their roots

- **GIVEN** an open file nested inside a repo or linked worktree
- **WHEN** the Git-root function runs for the current buffer
- **THEN** it returns that repo's or worktree's top-level directory

#### Scenario: Unnamed and out-of-repo buffers are contained

- **GIVEN** an unnamed buffer or a file outside any Git checkout
- **WHEN** the Git-root function runs
- **THEN** it reports "no project" instead of returning a stale or foreign directory

### Requirement: Dashboard shell with fixed chapter order

The system SHALL render a navigable dashboard (Home/Index, category pages, sub-pages, back navigation) on the kept snacks.nvim base, with exactly the ten surviving chapters in EPIC order and no Factory chapter.

#### Scenario: Home lists the chapters in fixed order

- **GIVEN** the dashboard Home page
- **WHEN** it renders
- **THEN** it lists Files & Search, JavaScript / Frontend, GitHub, SDLC, Repository & Code Knowledge, AI & Agents, Models & Inference, Infrastructure, ComfyUI & Images, Settings & Help in that order

#### Scenario: Navigation never executes on open

- **GIVEN** any dashboard page
- **WHEN** the user opens a menu or selects a search hit
- **THEN** the action is focused without executing; execution needs a separate explicit step

### Requirement: Runbook template, master index, and coverage

The system SHALL ship a runbook template (prerequisites, ordered steps, expected result, troubleshooting, recovery, machine-readable header), a master index with a fixed chapter order and per-chapter table of contents, and a coverage check asserting that every page and sub-page has a runbook whose action names and order match the dashboard.

#### Scenario: Coverage check passes for the foundation pages

- **GIVEN** the dashboard pages and the master index
- **WHEN** the coverage check runs
- **THEN** every foundation page has a runbook and action names plus order match between index and dashboard (chapter runbooks may be marked stub)
