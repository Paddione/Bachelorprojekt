## RENAMED Requirements

### Requirement: Observable drift between hook and helper

**Renamed-to:** Shared source for the branch-naming rule

The branch-naming rule SHALL be implemented once and read by every guard that enforces it, rather
than duplicated across `.githooks/pre-commit`, `.githooks/pre-push` and
`scripts/worktree-create.sh` and reconciled by drift tests.

This replaces the earlier decision to duplicate the rule deliberately. That decision rested on
keeping the `pre-commit` hook free of repository file dependencies, so a missing library file could
not block every commit. Conditional sourcing preserves that property: when the shared file is
absent the exemption list is empty and each guard behaves exactly as it did before the file
existed, so a missing file can only reject an exempt branch, never admit an invalid one.

The drift tests did not hold in practice. They compared the ticket-ID pattern, the exemption list
and the allowed type prefixes — but not the `--unattended` allowlist added later, which is where
the rule actually diverged and left `chore/mishap-incident-rollup` creatable but uncommittable.
A duplication guarded by an enumerated test list is only as complete as that list.

#### Scenario: A guard reads the shared source

- **GIVEN** `scripts/lib/branch-allowlist.sh` defines `TICKETLESS_BRANCHES`
- **WHEN** `.githooks/pre-commit`, `.githooks/pre-push` or `scripts/worktree-create.sh` evaluates a
  branch name
- **THEN** the exemption decision comes from `branch_is_ticketless` in that file, and no guard
  carries its own copy of the list

#### Scenario: Adding an exemption takes one edit

- **GIVEN** a new ticketless persistent branch must be exempted
- **WHEN** its name is added to `TICKETLESS_BRANCHES`
- **THEN** all three guards honour it without further edits, and no drift test is needed to keep
  them aligned
