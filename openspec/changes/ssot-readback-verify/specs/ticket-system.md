## ADDED Requirements

### Requirement: Kritische Ticket-DB-Writes verifizieren ihren Effekt gegen die SSOT

After every critical write verb (`update-status`, `enqueue`, `stage-plan`, `archive-plan`) the
ticket CLI SHALL re-read the affected row through a second, independent `_exec_sql` round-trip
against the verified pod and abort loudly (non-zero exit, remediation hint) when the read-back
does not match the intended effect. The verification runs against `_pgpod` output — the
Identity-Guard-verified pod from T015168 — so ghost instances behind the same context are
excluded.

#### Scenario: Read-back confirms the write

- **GIVEN** a critical write verb has issued its UPDATE against the verified pod
- **WHEN** `_verify_write_effect` re-reads the row and all intended field values match
- **THEN** the verb completes normally with no additional output

#### Scenario: Read-back detects a divergence

- **GIVEN** a critical write verb reports success but the row on the verified pod does not
  reflect the intended effect (e.g. status unchanged)
- **WHEN** `_verify_write_effect` compares expected versus actual field values
- **THEN** the CLI exits non-zero with an error naming ticket id, expected and actual values,
  and the remediation path (`TICKET_CTX` / Identity-Guard)

### Requirement: Offline-Modus überspringt die Rücklesung

Under `TICKET_OFFLINE=1` (dev-flow-execute best-effort writes) the read-back SHALL be skipped
with the existing offline notice, mirroring how the write itself is skipped.

#### Scenario: Offline run stays silent about verification

- **GIVEN** `TICKET_OFFLINE=1`
- **WHEN** a critical write verb is invoked
- **THEN** no kubectl call for verification is attempted and no verification error can occur
