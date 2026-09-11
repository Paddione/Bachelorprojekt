## ADDED Requirements

### Requirement: Each developer machine holds its own clone

Every developer machine (PK-Desktop, PK-L-1, PK-Tablet) SHALL hold its own clone of the
repository inside its WSL distribution. No clone SHALL be shared between users or machines.

#### Scenario: Two machines work independently

- **GIVEN** PK-Desktop and PK-L-1 each hold an onboarded clone
- **WHEN** a commit is made on PK-L-1 and not pushed
- **THEN** the working tree on PK-Desktop does not contain that commit

### Requirement: Onboarding script prepares and verifies a machine

`scripts/devmesh/onboard-machine.sh` SHALL clone the repository, install the toolchain for the
invoking user, install the repository hooks and the `merge.ours` driver, set the git identity
from its parameters, check `gh` authentication and unlock git-crypt with a given key file. It
SHALL exit `0` when the machine is ready, `1` when a check fails and `2` when a precondition is
missing. With `--verify` it SHALL only check and SHALL NOT modify the machine. A repeated run
on a ready machine SHALL make no change.

#### Scenario: Verify mode leaves the machine untouched

- **GIVEN** an onboarded machine
- **WHEN** `bash scripts/devmesh/onboard-machine.sh --verify` runs
- **THEN** it exits 0
- **AND** no file in the clone or in `~/.config/git-crypt/` changes its modification time

#### Scenario: Key file is missing

- **GIVEN** the key file path passed to the script does not exist
- **WHEN** the script runs
- **THEN** it exits 2 and names the missing key file

### Requirement: Decryption is verified after unlock

After unlocking, the onboarding script SHALL check a tracked file under
`environments/.secrets/` with `scripts/git-crypt-guard.sh is-encrypted` and SHALL treat a still
encrypted file as a failed check.

#### Scenario: Unlock reports success but the file stays encrypted

- **GIVEN** `git-crypt unlock` exits 0 and the checked file still starts with the git-crypt header
- **WHEN** the onboarding script evaluates the result
- **THEN** it exits 1 and names the decryption check

### Requirement: The git-crypt key file is stored with owner-only permissions

The key file SHALL be stored at `~/.config/git-crypt/bachelorprojekt.key` with mode `600` and
owned by the invoking user. The script SHALL correct a wider mode and SHALL fail when the file
belongs to another user.

#### Scenario: Key file with a wide mode

- **GIVEN** the key file has mode `644` and belongs to the invoking user
- **WHEN** the script runs
- **THEN** the key file mode is `600` afterwards and the correction is reported

#### Scenario: Key file owned by another user

- **GIVEN** the key file belongs to a different user
- **WHEN** the script runs
- **THEN** it exits 1 without changing the file

### Requirement: Key holders are registered and revocation means rotation

`devmesh/key-holders.yaml` SHALL list every machine holding the git-crypt key with `machine`,
`person` and `since`. The runbook `docs/runbooks/git-crypt-key-distribution.md` SHALL describe
the transport through a single-use, expiring Vaultwarden Send and SHALL state that revoking any
holder requires a new key, re-encryption and rotation of every secret under
`environments/.secrets/`.

#### Scenario: Register entries are complete

- **GIVEN** `devmesh/key-holders.yaml`
- **WHEN** the register guard parses it
- **THEN** every entry has non-empty `machine`, `person` and `since`

#### Scenario: Runbook names the revocation consequence

- **GIVEN** the runbook
- **WHEN** its revocation section is read
- **THEN** it names key replacement, re-encryption and secret rotation as mandatory steps
