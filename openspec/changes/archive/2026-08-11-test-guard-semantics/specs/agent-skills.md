## ADDED Requirements

### Requirement: Guards assert semantics, not presentation

A guard SHALL assert the outcome it means to protect, not an incidental representation of that
outcome. `CLAUDE.md` documents this as T002716 for one variant — the output format of a tool — and
SHALL be extended to cover the following variants, each of which has produced a false verdict in
this repository:

1. **Document position.** A guard SHALL NOT establish a positional or ordering claim by taking the
   first document-wide match (`grep -n … | head -1`). It SHALL restrict the search to the relevant
   section first (awk range, sed range), so that an unrelated insertion above the intended location
   cannot change the verdict.

2. **Option parsing.** A guard searching for a token that begins with `-` SHALL pass it as an
   explicit pattern (`grep -qF -e '--flag'` or `--`). `-F` alone makes the pattern literal but does
   not stop the argument from being parsed as an option; the resulting exit status is 2, which an
   `if` condition cannot distinguish from "not found".

3. **Source text versus behaviour.** A guard SHALL exercise the behaviour it asserts rather than
   grepping the implementation for a string, except where the assertion is genuinely about the text
   (documentation conventions, CI configuration). This restates T002448-M4 and SHALL be cross-
   referenced from it.

4. **Configuration versus runtime.** Where a defect lives in runtime state, a guard SHALL NOT
   substitute a configuration value as its proxy. A RED run that comes out green is a finding about
   the test, not evidence that the requirement is already met, and SHALL be treated as such before
   the step is marked done.

5. **Process-list formats.** A test parsing process output SHALL force the format it needs rather
   than accept what the machine happens to produce, so the verdict does not depend on the executing
   host.

#### Scenario: Positional guard survives an unrelated insertion above the target section

- **GIVEN** a guard asserting that a rule appears under heading `## 4.` of a reference document
- **WHEN** an unrelated paragraph containing the same search term is added under heading `## 3.`
- **THEN** the guard still passes
- **AND** the guard fails only if the rule under `## 4.` is actually removed or moved

#### Scenario: Guard finds a flag-shaped token in a document

- **GIVEN** a document containing the text `--draft`
- **WHEN** a guard checks for that token
- **THEN** the check reports the token as present
- **AND** the check does not terminate with a tool usage error

#### Scenario: RED run that passes is treated as a finding

- **GIVEN** a newly written guard for a known defect
- **WHEN** the guard passes during the mandatory RED run, before the fix exists
- **THEN** the step is not marked complete
- **AND** the guard is revised until it fails for the defect it targets

### Requirement: Inventory-wide guards scope to the changed subset on pull requests

A guard that validates an inventory SHALL, when running against a pull request, restrict itself to
the inventory entries the pull request changes, determined by diff against `origin/main`. The
full-inventory check SHALL remain in force on `main` itself, preserving its value as a merge gate.

Without this scoping a single defective entry on `main` fails every concurrently open pull request,
including those that do not touch the inventory at all, and each affected pull request must then be
updated individually after the fix merges.

#### Scenario: A missing entry on main does not fail an unrelated pull request

- **GIVEN** one change directory on `main` lacks its `.ticket` file
- **AND** an open pull request that touches no change directory
- **WHEN** the guard runs on that pull request
- **THEN** the guard passes

#### Scenario: The full inventory is still enforced on main

- **GIVEN** one change directory on `main` lacks its `.ticket` file
- **WHEN** the guard runs against `main`
- **THEN** the guard fails and names the offending directory
